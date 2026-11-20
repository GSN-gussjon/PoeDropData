import type { DecelConfig } from '../../../../shared/mechanics'
import type { Arena, Vec } from './triBeam'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

/** Kałuża po wybuchu: zimny DOT i spowolnienie akcji. */
export class GravityWell {
  age = 0

  constructor(readonly x: number, readonly y: number) {}

  update(dt: number): void {
    this.age += dt
  }

  get expired(): boolean {
    return false // usuwanie odbywa się przez `duration` w kontrolerze
  }

  contains(point: Vec, radius: number): boolean {
    return Math.hypot(point.x - this.x, point.y - this.y) <= radius
  }

  render(ctx: CanvasRenderingContext2D, config: DecelConfig): void {
    const fade = Math.max(0, 1 - this.age / config.wellDuration)
    ctx.save()
    ctx.globalAlpha = 0.28 * fade
    const gradient = ctx.createRadialGradient(
      this.x, this.y, 0,
      this.x, this.y, config.wellRadius
    )
    gradient.addColorStop(0, 'rgba(120,200,255,0.75)')
    gradient.addColorStop(1, 'rgba(80,140,220,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(this.x, this.y, config.wellRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(150,215,255,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(this.x, this.y, config.wellRadius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

type OrbState = 'decel' | 'chase' | 'exploding'

/** Kula, która zwalnia, potem zaczyna gonić gracza i wybucha kałużą. */
export class CelestialOrb {
  x: number
  y: number
  previous: Vec
  velocity: Vec
  age = 0
  state: OrbState = 'decel'
  fuse = 0
  alive = true
  detonated = false

  constructor(origin: Vec, angle: number, config: DecelConfig) {
    this.x = origin.x
    this.y = origin.y
    this.previous = { ...origin }
    this.velocity = {
      x: Math.cos(angle) * config.initialSpeed,
      y: Math.sin(angle) * config.initialSpeed
    }
  }

  update(dt: number, player: Vec, arena: Arena, config: DecelConfig): void {
    this.previous = { x: this.x, y: this.y }
    this.age += dt

    if (this.state === 'exploding') {
      this.fuse -= dt
      if (this.fuse <= 0) {
        this.alive = false
        this.detonated = true
      }
      return
    }

    if (this.state === 'decel') {
      const speed = Math.max(config.chaseSpeed, config.initialSpeed - config.deceleration * this.age)
      const length = Math.hypot(this.velocity.x, this.velocity.y) || 1
      this.velocity.x = (this.velocity.x / length) * speed
      this.velocity.y = (this.velocity.y / length) * speed
      if (speed <= config.chaseSpeed) this.state = 'chase'
    } else {
      const angle = Math.atan2(player.y - this.y, player.x - this.x)
      const speed = config.chaseSpeed + config.chaseAcceleration * (this.age - config.initialSpeed / config.deceleration)
      this.velocity.x = Math.cos(angle) * speed
      this.velocity.y = Math.sin(angle) * speed
    }

    this.x += this.velocity.x * dt
    this.y += this.velocity.y * dt

    const outside = Math.hypot(this.x - arena.x, this.y - arena.y) > arena.radius
    const touching = Math.hypot(player.x - this.x, player.y - this.y) <= config.hitRadius
    if (outside || touching) {
      this.state = 'exploding'
      this.fuse = config.fuse
    }
  }

  sweepHit(playerFrom: Vec, playerTo: Vec, config: DecelConfig): boolean {
    for (let i = 0; i <= 5; i++) {
      const t = i / 5
      const orb = lerpVec(this.previous, { x: this.x, y: this.y }, t)
      const player = lerpVec(playerFrom, playerTo, t)
      if (Math.hypot(orb.x - player.x, orb.y - player.y) <= config.hitRadius) return true
    }
    return false
  }

  render(ctx: CanvasRenderingContext2D, config: DecelConfig): void {
    const tail = 22
    const angle = Math.atan2(this.velocity.y, this.velocity.x)
    const from = { x: this.x - Math.cos(angle) * tail, y: this.y - Math.sin(angle) * tail }
    ctx.save()
    ctx.lineCap = 'round'
    ctx.globalAlpha = this.state === 'exploding' ? 0.4 : 0.25
    ctx.strokeStyle = '#b98cff'
    ctx.lineWidth = config.radius * 2.4
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(this.x, this.y); ctx.stroke()
    ctx.globalAlpha = 0.7
    ctx.strokeStyle = '#d8bcff'
    ctx.lineWidth = config.radius
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(this.x, this.y); ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#f0e2ff'
    ctx.beginPath(); ctx.arc(this.x, this.y, config.radius, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
}

/** Cykl ataku „Decelerating Projectiles". */
export class DecelAttackController {
  private phase: 'preparation' | 'telegraph' | 'active' | 'done' = 'preparation'
  private elapsed = 0
  private spawned = 0
  private orbs: CelestialOrb[] = []
  private wells: GravityWell[] = []
  private origin: Vec = { x: 0, y: 0 }
  private lastHitAt = -Infinity

  constructor(private readonly config: DecelConfig) {}

  get active(): boolean { return this.phase !== 'done' }
  get phaseName(): string { return this.phase }

  start(now: number, origin: Vec): void {
    void now
    this.elapsed = 0
    this.spawned = 0
    this.orbs = []
    this.wells = []
    this.origin = { ...origin }
    this.lastHitAt = -Infinity
    this.phase = 'preparation'
  }

  update(
    dt: number,
    now: number,
    playerFrom: Vec,
    playerTo: Vec,
    player: Vec,
    arena: Arena,
    onExplosion: (damage: number, x: number, y: number) => void,
    onDot: (damage: number) => void
  ): void {
    if (!this.active) return
    this.elapsed += dt

    if (this.phase === 'preparation' && this.elapsed >= this.config.preparation) {
      this.phase = 'telegraph'; this.elapsed = 0
    }
    if (this.phase === 'telegraph' && this.elapsed >= this.config.telegraph) {
      this.phase = 'active'; this.elapsed = 0
    }

    if (this.phase === 'active') {
      while (
        this.spawned < this.config.orbCount &&
        this.elapsed >= this.spawned * this.config.interval
      ) {
        const base = Math.atan2(player.y - this.origin.y, player.x - this.origin.x)
        const offset = (this.spawned - (this.config.orbCount - 1) / 2) * 0.18
        this.orbs.push(new CelestialOrb(this.origin, base + offset, this.config))
        this.spawned++
      }

      for (const orb of this.orbs) {
        if (!orb.alive) continue
        orb.update(dt, player, arena, this.config)
        if (
          orb.state !== 'exploding' &&
          orb.sweepHit(playerFrom, playerTo, this.config) &&
          now - this.lastHitAt > 0.7
        ) {
          orb.state = 'exploding'
          orb.fuse = this.config.fuse
        }
        if (orb.detonated) {
          this.wells.push(new GravityWell(orb.x, orb.y))
          if (Math.hypot(player.x - orb.x, player.y - orb.y) <= this.config.explosionRadius) {
            this.lastHitAt = now
            onExplosion(this.config.explosionDamage, orb.x, orb.y)
          }
        }
      }
      this.orbs = this.orbs.filter((orb) => orb.alive)
    }

    for (const well of this.wells) {
      well.update(dt)
      if (well.contains(player, this.config.wellRadius)) {
        onDot(this.config.wellDps * dt)
      }
    }
    this.wells = this.wells.filter((well) => well.age < this.config.wellDuration)

    if (this.phase === 'active' && this.spawned >= this.config.orbCount && this.orbs.length === 0 && this.wells.length === 0) {
      this.phase = 'done'
    }
  }

  slowFactorAt(point: Vec): number {
    for (const well of this.wells) {
      if (well.contains(point, this.config.wellRadius)) return this.config.slowFactor
    }
    return 1
  }

  render(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.phase === 'preparation') {
      ctx.save()
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(now * 9))
      ctx.fillStyle = '#d8bcff'
      ctx.beginPath(); ctx.arc(this.origin.x, this.origin.y, 8, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
      return
    }
    for (const well of this.wells) well.render(ctx, this.config)
    for (const orb of this.orbs) orb.render(ctx, this.config)
  }
}
