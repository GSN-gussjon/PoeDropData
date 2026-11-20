import type { MemoryConfig } from '../../../../shared/mechanics'
import type { Arena, Vec } from './triBeam'

export type Zone = 'left' | 'top' | 'right'

const ZONE_LABEL: Record<Zone, string> = {
  left: 'lewo',
  top: 'góra',
  right: 'prawo'
}

// Trzy sektory po 120°, obrócone zgodnie ze schematem:
// granice w okolicach -14°, 106° i 226° (strefa 1: góra, 2: prawo, 3: lewo).
const ROTATION = (46 * Math.PI) / 180

const SECTOR: Record<Zone, { start: number; end: number }> = {
  right: { start: -Math.PI / 3 + ROTATION, end: Math.PI / 3 + ROTATION },
  left: { start: Math.PI / 3 + ROTATION, end: Math.PI + ROTATION },
  top: { start: Math.PI + ROTATION, end: (5 * Math.PI) / 3 + ROTATION }
}

function normalizeAngle(angle: number): number {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
}

function zoneAt(point: Vec, arena: Arena): Zone | null {
  const dx = point.x - arena.x
  const dy = point.y - arena.y
  if (Math.hypot(dx, dy) < 12) return null
  const angle = normalizeAngle(Math.atan2(dy, dx))
  const a = normalizeAngle(SECTOR.right.start) // ~340°
  const b = normalizeAngle(SECTOR.right.end)   // ~100°
  const c = normalizeAngle(SECTOR.left.end)    // ~220°
  if (angle >= a || angle < b) return 'right'
  if (angle < c) return 'left'
  return 'top'
}

function drawZone(
  ctx: CanvasRenderingContext2D,
  arena: Arena,
  zone: Zone,
  fill: string
): void {
  const sector = SECTOR[zone]
  ctx.beginPath()
  ctx.moveTo(arena.x, arena.y)
  ctx.arc(arena.x, arena.y, arena.radius, sector.start, sector.end)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

/** Memory Game: pokaz sekwencji stref, powtórzenie i wybuch z centrum areny. */
export class MemoryAttackController {
  private phase: 'preparation' | 'show' | 'repeat' | 'done' = 'preparation'
  private elapsed = 0
  private flashTimer = 0
  private showIndex = 0
  private repeatIndex = 0
  private steps: Zone[] = []
  private lastZone: Zone | null = null
  private blast = 0
  private origin: Vec = { x: 0, y: 0 }
  private voiceText = 'Death will not be an escape.'
  private feedback: { zone: Zone; correct: boolean; timer: number } | null = null

  constructor(
    private readonly config: MemoryConfig,
    private readonly arena: Arena,
    private readonly stepCount: number
  ) {}

  get active(): boolean { return this.phase !== 'done' }
  get voice(): string { return this.voiceText }
  get invulnerable(): boolean { return this.active }

  start(now: number, origin: Vec): void {
    void now
    this.elapsed = 0
    this.flashTimer = 0
    this.showIndex = 0
    this.repeatIndex = 0
    this.blast = 0
    this.lastZone = null
    this.feedback = null
    this.origin = { ...origin }
    this.phase = 'preparation'
    this.voiceText = 'Death will not be an escape.'

    const pool: Zone[] = ['left', 'top', 'right']
    const count = this.stepCount
    this.steps = []
    for (let i = 0; i < count; i++) {
      const previous = this.steps[i - 1]
      const choices = pool.filter((zone) => {
        if (zone === previous) return false
        // Wiki: sekwencja nigdy nie idzie z prawego dolnego do lewego dolnego,
        // ale przejście w przeciwnym kierunku jest dozwolone.
        if (previous === 'right' && zone === 'left') return false
        return true
      })
      this.steps.push(choices[Math.floor(Math.random() * choices.length)])
    }
  }

  update(
    dt: number,
    player: Vec,
    onDamage: (damage: number) => void,
    onSlow: (seconds: number) => void
  ): void {
    if (!this.active) return
    this.elapsed += dt
    this.flashTimer += dt

    if (this.feedback) {
      this.feedback.timer -= dt
      if (this.feedback.timer <= 0) this.feedback = null
    }

    if (this.phase === 'preparation' && this.elapsed >= this.config.preparation) {
      this.phase = 'show'
      this.elapsed = 0
      this.flashTimer = 0
      this.voiceText = `Zapamiętaj: ${ZONE_LABEL[this.steps[0]]} (1/${this.steps.length})`
    }

    if (this.phase === 'show' && this.flashTimer >= this.config.flashInterval) {
      this.flashTimer = 0
      this.showIndex++
      if (this.showIndex >= this.steps.length) {
        this.phase = 'repeat'
        this.elapsed = 0
        this.voiceText = 'Scurry, scurry!'
      } else {
        this.voiceText = `Zapamiętaj: ${ZONE_LABEL[this.steps[this.showIndex]]} (${this.showIndex + 1}/${this.steps.length})`
      }
    }

    if (this.phase !== 'repeat') return

    this.blast += (this.arena.radius / this.config.repeatWindow) * dt

    const zone = zoneAt(player, this.arena)
    if (zone !== this.lastZone) {
      this.lastZone = zone
      if (zone && zone === this.steps[this.repeatIndex]) {
        this.repeatIndex++
        this.feedback = { zone, correct: true, timer: this.config.feedbackDuration }
        this.voiceText = `Dobrze! ${this.repeatIndex}/${this.steps.length}`
        if (this.repeatIndex >= this.steps.length) {
          this.voiceText = 'Pamięć ukończona!'
          this.phase = 'done'
          return
        }
      } else if (zone) {
        this.feedback = { zone, correct: false, timer: this.config.feedbackDuration }
        this.voiceText = 'Źle! Spowolnienie'
        this.blast += this.config.blastBoostOnError
        onSlow(this.config.slowOnError)
      }
    }

    const radial = Math.hypot(player.x - this.arena.x, player.y - this.arena.y)
    if (radial <= this.blast || this.blast >= this.arena.radius) {
      onDamage(this.config.damage)
      this.voiceText = 'Memory Game — eksplozja!'
      this.phase = 'done'
    }
  }

  render(ctx: CanvasRenderingContext2D, now: number): void {
    const zones: Zone[] = ['left', 'top', 'right']
    for (const zone of zones) {
      const expected = this.steps[this.showIndex] === zone && this.phase === 'show'
      let fill: string | null = expected
        ? `rgba(190,90,255,${0.22 + 0.12 * Math.sin(now * 8)})`
        : null

      if (this.feedback?.zone === zone) {
        const alpha = Math.min(0.45, (this.feedback.timer / this.config.feedbackDuration) * 0.45)
        fill = this.feedback.correct
          ? `rgba(90,230,120,${alpha})`
          : `rgba(240,70,70,${alpha})`
      }
      if (fill) drawZone(ctx, this.arena, zone, fill)
    }

    if (this.blast > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(this.arena.x, this.arena.y, this.blast, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,70,60,0.12)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,90,60,0.9)'
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.strokeStyle = this.invulnerable ? '#c9a3ff' : '#b26ad6'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(this.origin.x, this.origin.y, 30, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}
