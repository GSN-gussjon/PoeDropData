import type { CascadeConfig } from '../../../../shared/mechanics'
import type { Arena, Vec } from './triBeam'

type Segment = { a: Vec; b: Vec }

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

function pointSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Jedna lodowa kula: leci prosto, przebija się przez cel i znika poza areną. */
export class IceBall {
  x: number
  y: number
  previous: Vec
  readonly velocity: Vec
  readonly angle: number
  hit = false
  alive = true
  age = 0

  constructor(origin: Vec, angle: number, speed: number) {
    this.x = origin.x
    this.y = origin.y
    this.previous = { ...origin }
    this.angle = angle
    this.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
  }

  update(dt: number, arena: Arena): void {
    this.previous = { x: this.x, y: this.y }
    this.x += this.velocity.x * dt
    this.y += this.velocity.y * dt
    this.age += dt
    if (Math.hypot(this.x - arena.x, this.y - arena.y) > arena.radius + 40) {
      this.alive = false
    }
  }

  render(ctx: CanvasRenderingContext2D, config: CascadeConfig): void {
    const tail = 26
    const from = {
      x: this.x - Math.cos(this.angle) * tail,
      y: this.y - Math.sin(this.angle) * tail
    }
    ctx.save()
    ctx.lineCap = 'round'

    ctx.globalAlpha = 0.22
    ctx.strokeStyle = '#6cc8ff'
    ctx.lineWidth = config.radius * 2.2
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(this.x, this.y)
    ctx.stroke()

    ctx.globalAlpha = 0.55
    ctx.strokeStyle = '#9fe4ff'
    ctx.lineWidth = config.radius
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(this.x, this.y)
    ctx.stroke()

    ctx.globalAlpha = 1
    ctx.fillStyle = '#d9f5ff'
    ctx.beginPath()
    ctx.arc(this.x, this.y, config.radius * 0.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(this.x, this.y, config.radius * 0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /** Sprawdzenie trafienia z uwzględnieniem ruchu kuli i gracza w klatce. */
  sweepHit(playerFrom: Vec, playerTo: Vec, config: CascadeConfig): boolean {
    const ballPath: Segment = { a: this.previous, b: { x: this.x, y: this.y } }
    const playerPath: Segment = { a: playerFrom, b: playerTo }
    for (let i = 0; i <= 5; i++) {
      const t = i / 5
      const ball = lerpVec(ballPath.a, ballPath.b, t)
      const player = lerpVec(playerPath.a, playerPath.b, t)
      if (Math.hypot(ball.x - player.x, ball.y - player.y) <= config.hitRadius) return true
    }
    // Dodatkowo: najkrótsza odległość między odcinkami ruchu.
    return (
      pointSegmentDistance(playerPath.a, ballPath.a, ballPath.b) <= config.hitRadius ||
      pointSegmentDistance(playerPath.b, ballPath.a, ballPath.b) <= config.hitRadius
    )
  }
}

/** Cykl ataku „A cascade of pain!" — pięć kolejnych, przebijających kul lodu. */
export class CascadeAttackController {
  private phase: 'preparation' | 'telegraph' | 'active' | 'done' = 'preparation'
  private elapsed = 0
  private spawned = 0
  private balls: IceBall[] = []
  private lastHitAt = -Infinity
  private origin: Vec = { x: 0, y: 0 }

  constructor(private readonly config: CascadeConfig) {}

  get active(): boolean { return this.phase !== 'done' }
  get phaseName(): string { return this.phase }
  get ballCount(): number { return this.balls.length }

  start(now: number, origin: Vec): void {
    void now
    this.elapsed = 0
    this.spawned = 0
    this.balls = []
    this.lastHitAt = -Infinity
    this.origin = { ...origin }
    this.phase = 'preparation'
  }

  update(
    dt: number,
    now: number,
    playerFrom: Vec,
    playerTo: Vec,
    currentPlayer: Vec,
    arena: Arena,
    onHit: (damage: number) => void
  ): void {
    if (!this.active) return
    this.elapsed += dt

    if (this.phase === 'preparation' && this.elapsed >= this.config.preparation) {
      this.phase = 'telegraph'
      this.elapsed = 0
    }
    if (this.phase === 'telegraph' && this.elapsed >= this.config.telegraph) {
      this.phase = 'active'
      this.elapsed = 0
    }
    if (this.phase !== 'active') return

    while (
      this.spawned < this.config.ballCount &&
      this.elapsed >= this.spawned * this.config.interval
    ) {
      const base = Math.atan2(currentPlayer.y - this.origin.y, currentPlayer.x - this.origin.x)
      const offset = (this.spawned - (this.config.ballCount - 1) / 2) * this.config.spread
      this.balls.push(new IceBall(this.origin, base + offset, this.config.speed))
      this.spawned++
    }

    for (const ball of this.balls) {
      if (!ball.alive) continue
      ball.update(dt, arena)
      if (
        !ball.hit &&
        ball.sweepHit(playerFrom, playerTo, this.config) &&
        now - this.lastHitAt >= 0.7
      ) {
        ball.hit = true
        this.lastHitAt = now
        onHit(this.config.damage)
      }
    }
    this.balls = this.balls.filter((ball) => ball.alive)

    if (this.spawned >= this.config.ballCount && this.balls.length === 0) {
      this.phase = 'done'
    }
  }

  render(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.phase === 'preparation') {
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(now * 9))
      ctx.save()
      ctx.globalAlpha = pulse
      ctx.fillStyle = '#9fe4ff'
      ctx.beginPath()
      ctx.arc(this.origin.x, this.origin.y, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      return
    }
    for (const ball of this.balls) ball.render(ctx, this.config)
  }
}
