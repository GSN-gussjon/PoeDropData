import type { TriBeamConfig } from '../../../../shared/mechanics'

export type Vec = { x: number; y: number }
export type Arena = { x: number; y: number; radius: number }

type Segment = { a: Vec; b: Vec }

function normalize(v: Vec): Vec {
  const length = Math.hypot(v.x, v.y) || 1
  return { x: v.x / length, y: v.y / length }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function pointSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Jedna nić energetyczna. Jej początek jest trwale zakotwiczony w dłoni Maven —
 * wiązka nie przesuwa się, tylko rotuje wokół tego punktu.
 */
export class LaserBeam {
  readonly origin: Vec
  angle: number
  previousAngle: number
  readonly color: string
  readonly glow: string
  readonly arena: Arena
  hit = false

  constructor(origin: Vec, startAngle: number, color: string, glow: string, arena: Arena) {
    this.origin = { ...origin }
    this.angle = startAngle
    this.previousAngle = startAngle
    this.color = color
    this.glow = glow
    this.arena = arena
  }

  setAngle(angle: number): void {
    this.previousAngle = this.angle
    this.angle = angle
  }

  segmentAt(angle: number, length: number): Segment {
    const direction = normalize({ x: Math.cos(angle), y: Math.sin(angle) })
    const oc = { x: this.origin.x - this.arena.x, y: this.origin.y - this.arena.y }
    const dot = oc.x * direction.x + oc.y * direction.y
    const discriminant =
      dot * dot - (oc.x * oc.x + oc.y * oc.y - this.arena.radius * this.arena.radius)
    let reach = length
    if (discriminant >= 0) {
      const edge = -dot + Math.sqrt(discriminant)
      if (edge > 0) reach = Math.min(length, edge)
    }
    return {
      a: { ...this.origin },
      b: {
        x: this.origin.x + direction.x * reach,
        y: this.origin.y + direction.y * reach
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, config: TriBeamConfig, alpha: number): void {
    const segment = this.segmentAt(this.angle, config.beamLength)
    ctx.save()
    ctx.lineCap = 'round'

    ctx.globalAlpha = alpha * 0.16
    ctx.strokeStyle = this.glow
    ctx.lineWidth = config.width * 4
    ctx.beginPath()
    ctx.moveTo(segment.a.x, segment.a.y)
    ctx.lineTo(segment.b.x, segment.b.y)
    ctx.stroke()

    ctx.globalAlpha = alpha * 0.5
    ctx.strokeStyle = this.color
    ctx.lineWidth = config.width * 1.7
    ctx.beginPath()
    ctx.moveTo(segment.a.x, segment.a.y)
    ctx.lineTo(segment.b.x, segment.b.y)
    ctx.stroke()

    ctx.globalAlpha = alpha
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = config.width * 0.4
    ctx.beginPath()
    ctx.moveTo(segment.a.x, segment.a.y)
    ctx.lineTo(segment.b.x, segment.b.y)
    ctx.stroke()

    // Źródło przy palcach Maven — nieruchome.
    ctx.fillStyle = this.color
    ctx.beginPath()
    ctx.arc(this.origin.x, this.origin.y, config.width * 0.9, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /**
   * Swept collision: sprawdzamy pozycję wiązki i gracza w kilku podkrokach
   * między poprzednią a bieżącą klatką (rotacja + ruch gracza).
   */
  sweepHit(
    playerFrom: Vec,
    playerTo: Vec,
    config: TriBeamConfig,
    samples = 6
  ): boolean {
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const angle = lerp(this.previousAngle, this.angle, t)
      const segment = this.segmentAt(angle, config.beamLength)
      const player = {
        x: lerp(playerFrom.x, playerTo.x, t),
        y: lerp(playerFrom.y, playerTo.y, t)
      }
      if (pointSegmentDistance(player, segment.a, segment.b) <= config.hitWidth) return true
    }
    return false
  }
}

/** Zestaw trzech nici wychodzących z jednej dłoni. */
export class LaserGroup {
  readonly beams: LaserBeam[] = []

  constructor(
    hand: Vec,
    startAngle: number,
    color: string,
    glow: string,
    config: TriBeamConfig,
    arena: Arena
  ) {
    for (let i = 0; i < config.beamCount; i++) {
      const offset = (i - (config.beamCount - 1) / 2) * config.spread
      this.beams.push(new LaserBeam(hand, startAngle + offset, color, glow, arena))
    }
  }

  setProgress(progress: number, startAngle: number, endAngle: number, config: TriBeamConfig): void {
    for (let i = 0; i < this.beams.length; i++) {
      const offset = (i - (config.beamCount - 1) / 2) * config.spread
      this.beams[i].setAngle(lerp(startAngle, endAngle, progress) + offset)
    }
  }

  render(ctx: CanvasRenderingContext2D, config: TriBeamConfig, alpha: number): void {
    for (const beam of this.beams) beam.render(ctx, config, alpha)
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

/**
 * Cykl ataku „Stand still!" (Tri-Beam Claws).
 * Prawa grupa rotuje w lewo, lewa w prawo — w połowie się krzyżują,
 * potem rotują dalej aż do granic areny i znikają.
 */
export class MavenAttackController {
  private phase: 'preparation' | 'telegraph' | 'active' | 'done' = 'preparation'
  private elapsed = 0
  private leftGroup: LaserGroup | null = null
  private rightGroup: LaserGroup | null = null
  private damageHandler = new DamageHandler()
  private origin: Vec = { x: 0, y: 0 }

  constructor(private readonly config: TriBeamConfig) {}

  get active(): boolean { return this.phase !== 'done' }
  get phaseName(): string { return this.phase }

  start(now: number, origin: Vec, arena: Arena): void {
    this.elapsed = 0
    this.phase = 'preparation'
    this.origin = { ...origin }
    this.damageHandler = new DamageHandler()
    void now

    const handOffset = this.config.handOffset
    const leftHand = { x: origin.x - handOffset, y: origin.y + 6 }
    const rightHand = { x: origin.x + handOffset, y: origin.y + 6 }

    this.leftGroup = new LaserGroup(leftHand, this.config.leftStartAngle, '#7fd8ff', '#3a86ff', this.config, arena)
    this.rightGroup = new LaserGroup(rightHand, this.config.rightStartAngle, '#d99cff', '#8b4dff', this.config, arena)
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
    this.leftGroup.setProgress(progress, this.config.leftStartAngle, this.config.leftEndAngle, this.config)
    this.rightGroup.setProgress(progress, this.config.rightStartAngle, this.config.rightEndAngle, this.config)

    for (const group of [this.leftGroup, this.rightGroup]) {
      for (const beam of group.beams) {
        if (!beam.hit && beam.sweepHit(playerFrom, playerTo, this.config)) {
          beam.hit = true
          if (this.damageHandler.canHit(now)) {
            this.damageHandler.register(now)
            onHit(this.config.damage)
          }
        }
      }
    }

    // Końcówki wiązek dosięgły przeciwległych granic areny — znikają.
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
