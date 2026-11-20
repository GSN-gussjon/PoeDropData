import type { TriBeamConfig } from '../../../../shared/mechanics'

export type Vec = { x: number; y: number }
export type Arena = { x: number; y: number; radius: number }

type Segment = { a: Vec; b: Vec }

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

function normalize(v: Vec): Vec {
  const length = Math.hypot(v.x, v.y) || 1
  return { x: v.x / length, y: v.y / length }
}

function pointSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  from: Vec,
  to: Vec,
  color: string,
  width: number,
  alpha: number
): void {
  ctx.save()
  ctx.globalAlpha = alpha * 0.18
  ctx.strokeStyle = color
  ctx.lineWidth = width * 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()

  ctx.globalAlpha = alpha * 0.55
  ctx.lineWidth = width * 1.8
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()

  ctx.globalAlpha = alpha
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = width * 0.45
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()
}

/** Pojedyncza nić: zaczyna się w dłoni Maven, kończy na kresce łączącej. */
export class LaserBeam {
  endPoint: Vec
  previousEndPoint: Vec

  constructor(
    readonly origin: Vec,
    readonly color: string,
    readonly glow: string,
    endPoint: Vec
  ) {
    this.endPoint = { ...endPoint }
    this.previousEndPoint = { ...endPoint }
  }

  setEndPoint(point: Vec): void {
    this.previousEndPoint = this.endPoint
    this.endPoint = { ...point }
  }

  render(ctx: CanvasRenderingContext2D, config: TriBeamConfig, alpha: number): void {
    strokeLine(ctx, this.origin, this.endPoint, this.glow, config.width, alpha * 0.9)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = this.color
    ctx.beginPath()
    ctx.arc(this.origin.x, this.origin.y, config.width * 0.9, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/** Trzy nici z jednej dłoni + kreska łącząca ich końce. */
export class LaserGroup {
  readonly beams: LaserBeam[] = []
  connector: Segment = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }
  previousConnector: Segment = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }

  constructor(
    readonly hand: Vec,
    readonly side: -1 | 1,
    readonly direction: Vec,
    readonly focus: Vec,
    readonly config: TriBeamConfig,
    readonly color: string,
    readonly glow: string
  ) {
    for (let i = 0; i < config.beamCount; i++) {
      this.beams.push(new LaserBeam(hand, color, glow, { ...focus }))
    }
    this.update(0)
    this.previousConnector = {
      a: { ...this.connector.a },
      b: { ...this.connector.b }
    }
  }

  update(progress: number): void {
    this.previousConnector = {
      a: { ...this.connector.a },
      b: { ...this.connector.b }
    }

    // Kierunek ruchu to `direction`; kreska jest mu prostopadła („w szerz").
    const cross = { x: -this.direction.y, y: this.direction.x }
    const amplitude = this.config.lineLength * 1.6
    const offset = this.side * amplitude * (2 * progress - 1)
    // Przesunięcie wzdłuż kreski: przy spotkaniu końce obu kresek
    // zchodzą się w jednym punkcie (pozycji gracza), nie nakładają się.
    const crossOffset = this.side * this.config.lineLength / 2
    const center = {
      x: this.focus.x + this.direction.x * offset + cross.x * crossOffset,
      y: this.focus.y + this.direction.y * offset + cross.y * crossOffset
    }
    const half = this.config.lineLength / 2
    const start = {
      x: center.x - cross.x * half,
      y: center.y - cross.y * half
    }
    const end = {
      x: center.x + cross.x * half,
      y: center.y + cross.y * half
    }
    this.connector = { a: start, b: end }

    const count = this.beams.length
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1)
      this.beams[i].setEndPoint(lerpVec(start, end, t))
    }
  }

  render(ctx: CanvasRenderingContext2D, config: TriBeamConfig, alpha: number): void {
    for (const beam of this.beams) beam.render(ctx, config, alpha)
    strokeLine(ctx, this.connector.a, this.connector.b, this.glow, config.connectorWidth, alpha)
  }

  /** Swept collision tylko na kresce łączącej końce wiązek. */
  sweepConnectorHit(
    playerFrom: Vec,
    playerTo: Vec,
    config: TriBeamConfig,
    samples = 6
  ): boolean {
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const a = lerpVec(this.previousConnector.a, this.connector.a, t)
      const b = lerpVec(this.previousConnector.b, this.connector.b, t)
      const player = lerpVec(playerFrom, playerTo, t)
      if (pointSegmentDistance(player, a, b) <= config.connectorHitWidth) return true
    }
    return false
  }
}

export class DamageHandler {
  private lastHitAt = -Infinity

  canHit(now: number, cooldown = 0.7): boolean {
    return now - this.lastHitAt >= cooldown
  }

  register(now: number): void {
    this.lastHitAt = now
  }
}

/** Cykl ataku „Stand still!" (Tri-Beam Claws). */
export class MavenAttackController {
  private phase: 'preparation' | 'telegraph' | 'active' | 'done' = 'preparation'
  private elapsed = 0
  private leftGroup: LaserGroup | null = null
  private rightGroup: LaserGroup | null = null
  private damageHandler = new DamageHandler()
  private origin: Vec = { x: 0, y: 0 }
  private focus: Vec = { x: 0, y: 0 }

  constructor(private readonly config: TriBeamConfig) {}

  get active(): boolean { return this.phase !== 'done' }
  get phaseName(): string { return this.phase }

  start(now: number, origin: Vec, arena: Arena, focus: Vec): void {
    void arena
    void now
    this.elapsed = 0
    this.phase = 'preparation'
    this.origin = { ...origin }
    this.focus = { ...focus }
    this.damageHandler = new DamageHandler()

    // Kierunek przesuwu obu kresek: prostopadły do linii Maven → gracz.
    // Same kreski są mu prostopadłe, więc zbliżają się „w szerz".
    const towardFocus = normalize({ x: focus.x - origin.x, y: focus.y - origin.y })
    const direction = normalize({ x: -towardFocus.y, y: towardFocus.x })

    const handOffset = this.config.handOffset
    const leftHand = { x: origin.x - handOffset, y: origin.y + 6 }
    const rightHand = { x: origin.x + handOffset, y: origin.y + 6 }

    this.leftGroup = new LaserGroup(leftHand, -1, direction, focus, this.config, '#7fd8ff', '#3a86ff')
    this.rightGroup = new LaserGroup(rightHand, 1, direction, focus, this.config, '#d99cff', '#8b4dff')
  }

  update(
    dt: number,
    now: number,
    playerFrom: Vec,
    playerTo: Vec,
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
    if (this.phase !== 'active' || !this.leftGroup || !this.rightGroup) return

    const progress = Math.min(1, this.elapsed / this.config.active)
    this.leftGroup.update(progress)
    this.rightGroup.update(progress)

    for (const group of [this.leftGroup, this.rightGroup]) {
      if (
        group.sweepConnectorHit(playerFrom, playerTo, this.config) &&
        this.damageHandler.canHit(now)
      ) {
        this.damageHandler.register(now)
        onHit(this.config.damage)
      }
    }

    if (progress >= 1) this.phase = 'done'
  }

  render(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.phase === 'preparation') {
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(now * 9))
      for (const side of [-1, 1]) {
        const x = this.origin.x + side * this.config.handOffset
        const y = this.origin.y + 6
        ctx.save()
        ctx.globalAlpha = pulse
        ctx.fillStyle = '#cfe9ff'
        ctx.beginPath()
        ctx.arc(x, y, 7, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      return
    }

    const alpha = this.phase === 'telegraph' ? 0.35 + 0.25 * Math.sin(now * 12) : 1
    this.leftGroup?.render(ctx, this.config, alpha)
    this.rightGroup?.render(ctx, this.config, alpha)
  }
}
