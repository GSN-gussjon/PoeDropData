import type { BrainBlastConfig } from '../../../../shared/mechanics'
import type { Vec } from './triBeam'
import type { ArenaPlatforms } from './platforms'

/** Brain Blast: platformy zatrzymują się, wybuch z centrum, 3 s na powrót. */
export class BrainBlastController {
  private phase: 'preparation' | 'blast' | 'aftermath' | 'done' = 'preparation'
  private elapsed = 0
  private blast = 0
  private voiceText = 'Pain will be returned tenfold.'
  private exploded = false

  constructor(
    private readonly config: BrainBlastConfig,
    private readonly platforms: ArenaPlatforms
  ) {}

  get active(): boolean { return this.phase !== 'done' }
  get voice(): string { return this.voiceText }

  start(now: number): void {
    void now
    this.elapsed = 0
    this.blast = 0
    this.exploded = false
    this.phase = 'preparation'
    this.voiceText = 'Pain will be returned tenfold.'
  }

  update(dt: number, player: Vec, onDamage: (damage: number) => void): void {
    if (!this.active) return
    this.elapsed += dt

    if (this.phase === 'preparation') {
      this.platforms.setSpeedFactor(1 - Math.min(1, this.elapsed / this.config.preparation))
      if (this.elapsed >= this.config.preparation) {
        this.platforms.setSpeedFactor(0)
        this.platforms.enterable = true
        this.phase = 'blast'
        this.elapsed = 0
        this.voiceText = 'Space aligns.'
      }
      return
    }

    if (this.phase === 'blast') {
      this.blast += (this.platforms.arena.radius / this.config.blastDuration) * dt
      if (this.blast >= this.platforms.arena.radius) {
        if (!this.platforms.contains(player)) onDamage(this.config.damage)
        this.exploded = true
        this.phase = 'aftermath'
        this.elapsed = 0
        this.voiceText = ''
      }
      return
    }

    if (this.phase === 'aftermath') {
      if (this.elapsed >= this.config.aftermath) {
        if (this.platforms.contains(player)) {
          const pushed = this.platforms.pushInside(player)
          player.x = pushed.x
          player.y = pushed.y
        }
        this.platforms.enterable = false
        this.platforms.setSpeedFactor(1)
        this.blast = 0
        this.phase = 'done'
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.exploded && this.blast > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(this.platforms.arena.x, this.platforms.arena.y, this.blast, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,90,60,0.1)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,110,70,0.9)'
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.restore()
    }
  }
}
