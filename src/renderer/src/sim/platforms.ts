import type { PlatformsConfig } from '../../../../shared/mechanics'
import type { Arena, Vec } from './triBeam'

/** Dwie platformy na obwodzie areny, połączone jednym układem obrotowym. */
export class ArenaPlatforms {
  angle = 0
  private speedFactor = 1
  enterable = false

  constructor(
    readonly arena: Arena,
    readonly config: PlatformsConfig
  ) {}

  get orbitRadius(): number {
    return this.arena.radius + this.config.orbitOffset
  }

  update(dt: number): void {
    this.angle += this.config.speed * this.speedFactor * dt
  }

  setSpeedFactor(factor: number): void {
    this.speedFactor = Math.max(0, Math.min(1, factor))
  }

  positions(): [Vec, Vec] {
    const other = this.angle + Math.PI
    return [
      {
        x: this.arena.x + Math.cos(this.angle) * this.orbitRadius,
        y: this.arena.y + Math.sin(this.angle) * this.orbitRadius
      },
      {
        x: this.arena.x + Math.cos(other) * this.orbitRadius,
        y: this.arena.y + Math.sin(other) * this.orbitRadius
      }
    ]
  }

  /** Wydłużony kształt styczny do okręgu areny. */
  private localCoords(point: Vec, angle: number): { along: number; across: number } {
    const platform = {
      x: this.arena.x + Math.cos(angle) * this.orbitRadius,
      y: this.arena.y + Math.sin(angle) * this.orbitRadius
    }
    const dx = point.x - platform.x
    const dy = point.y - platform.y
    return {
      along: -Math.sin(angle) * dx + Math.cos(angle) * dy,
      across: Math.cos(angle) * dx + Math.sin(angle) * dy
    }
  }

  contains(point: Vec): boolean {
    return [this.angle, this.angle + Math.PI].some((angle) => {
      const { along, across } = this.localCoords(point, angle)
      const a = along / (this.config.length / 2)
      const b = across / this.config.radius
      return a * a + b * b <= 1
    })
  }

  /** Wypchnięcie gracza z platformy z powrotem w stronę areny. */
  pushInside(point: Vec): Vec {
    const dx = point.x - this.arena.x
    const dy = point.y - this.arena.y
    const distance = Math.hypot(dx, dy) || 1
    const radius = this.arena.radius - 14
    return {
      x: this.arena.x + (dx / distance) * radius,
      y: this.arena.y + (dy / distance) * radius
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const angle of [this.angle, this.angle + Math.PI]) {
      const platform = {
        x: this.arena.x + Math.cos(angle) * this.orbitRadius,
        y: this.arena.y + Math.sin(angle) * this.orbitRadius
      }
      ctx.save()
      ctx.translate(platform.x, platform.y)
      ctx.rotate(angle + Math.PI / 2)
      ctx.beginPath()
      ctx.ellipse(0, 0, this.config.length / 2, this.config.radius, 0, 0, Math.PI * 2)
      ctx.fillStyle = this.enterable ? 'rgba(120,230,160,0.28)' : 'rgba(110,120,140,0.22)'
      ctx.fill()
      ctx.strokeStyle = this.enterable ? '#8fe0aa' : '#7d8795'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    }
  }
}
