import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Boss, DropRow } from '../../../../shared/schema'
import type { BossAttack, BossMechanics, MechanicKind } from '../../../../shared/mechanics'
import { MavenAttackController } from '../sim/triBeam'

const W = 1024
const H = 576
const CX = W / 2
const CY = 300
const ARENA_R = 235
const MAVEN_POS = { x: CX, y: 142 }
const NUCLEUS_POS = { x: CX, y: CY }

type Stage = 'setup' | 'playing' | 'won' | 'lost'
type Settings = { dps: number; hp: number; regen: number }

type Hazard = {
  kind: MechanicKind
  stage: 'telegraph' | 'active'
  t: number
  telegraph: number
  active: number
  damage: number
  hit: boolean
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  angle: number
  spin: number
  delay: number
  zone?: string
  steps?: string[]
  step?: number
  flash?: number
  safe?: { x: number; y: number; radius: number }[]
  gap?: number
  gapStart?: number
  gapLen?: number
  gapDrift?: number
  blast?: number
  lastZone?: string | null
  slow?: boolean
}

type Bolt = { x: number; y: number; vx: number; vy: number; life: number; damage: number }

type Game = {
  stageIndex: number
  mavenHp: number
  mavenMaxHp: number
  nucleusDamage: number
  player: {
    x: number; y: number; hp: number; maxHp: number; regen: number; dps: number
    target: { x: number; y: number }; facing: number
  }
  hazards: Hazard[]
  ambient: Hazard[]
  ambientStageId: string | null
  ambientHitAt: number
  bolts: Bolt[]
  currentAttack: BossAttack | null
  triBeam: MavenAttackController | null
  attackEnd: number
  attackHit: boolean
  nextAt: Record<string, number>
  time: number
  lastFrame: number
  invulnUntil: number
  noRegenUntil: number
  dashUntil: number
  dashCd: number
  attackCd: number
  voice: string
  dodged: number
  hits: number
  result: Stage
  drop: string | null
}

type Hud = {
  stageLabel: string
  stageNumber: string
  hp: number
  maxHp: number
  bossHp: number
  bossMaxHp: number
  time: number
  voice: string
  dodged: number
  hits: number
  dashCd: number
}

const PRESETS: Record<string, Settings> = {
  jugg: { dps: 2_000_000, hp: 7000, regen: 2000 },
  meta: { dps: 8_000_000, hp: 5000, regen: 500 },
  glass: { dps: 20_000_000, hp: 2500, regen: 0 }
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)) }
function insideArena(x: number, y: number) {
  const dx = x - CX, dy = y - CY
  const d = Math.hypot(dx, dy)
  return d <= ARENA_R - 12 ? { x, y } : { x: CX + (dx / d) * (ARENA_R - 12), y: CY + (dy / d) * (ARENA_R - 12) }
}
function distToLine(x: number, y: number, angle: number, ox: number, oy: number) {
  return Math.abs(-Math.sin(angle) * (x - ox) + Math.cos(angle) * (y - oy))
}
function zoneOf(x: number, y: number): string | null {
  if (y < CY - 70) return 'top'
  if (x < CX - 70) return 'left'
  if (x > CX + 70) return 'right'
  return null
}

function createGame(settings: Settings, mechanics: BossMechanics): Game {
  const nextAt: Record<string, number> = {}
  for (const [index, attack] of mechanics.attacks.entries()) nextAt[attack.id] = 2 + index * 1.2
  nextAt['memory'] = 8
  return {
    stageIndex: 0,
    mavenHp: mechanics.mavenHp,
    mavenMaxHp: mechanics.mavenHp,
    nucleusDamage: 0,
    player: {
      x: CX, y: CY + 150, hp: settings.hp, maxHp: settings.hp, regen: settings.regen,
      dps: settings.dps, target: { x: CX, y: CY + 150 }, facing: -Math.PI / 2
    },
    hazards: [], ambient: [], ambientStageId: null, ambientHitAt: 0,
    bolts: [], currentAttack: null, triBeam: null, attackEnd: 0, attackHit: false, nextAt,
    time: 0, lastFrame: 0, invulnUntil: 0, noRegenUntil: 0, dashUntil: 0, dashCd: 0, attackCd: 0,
    voice: '', dodged: 0, hits: 0, result: 'playing', drop: null
  }
}

function activeStage(mechanics: BossMechanics, game: Game) {
  return mechanics.stages[game.stageIndex]
}

function activeTarget(mechanics: BossMechanics, game: Game) {
  return activeStage(mechanics, game).target === 'maven' ? MAVEN_POS : NUCLEUS_POS
}

function makeHazard(def: BossAttack, game: Game, mechanics: BossMechanics): Hazard[] {
  const target = activeTarget(mechanics, game)
  const p = game.player
  const base: Hazard = {
    kind: def.kind, stage: 'telegraph', t: 0, telegraph: def.telegraph, active: def.active,
    damage: def.damage, hit: false, x: target.x, y: target.y, vx: 0, vy: 0,
    radius: 20, angle: Math.random() * Math.PI * 2, spin: 0, delay: 0
  }
  const toPlayer = Math.atan2(p.y - target.y, p.x - target.x)

  switch (def.kind) {
    case 'beams':
      return [0, 1, 2].flatMap((i) => [
        { ...base, angle: Math.random() * Math.PI + i * 0.25, spin: 0.35 },
        { ...base, angle: Math.random() * Math.PI - i * 0.25, spin: -0.35 }
      ])
    case 'orbs':
      return [0, 1, 2, 3, 4].map((i) => ({
        ...base, x: target.x, y: target.y, vx: Math.cos(toPlayer) * 150, vy: Math.sin(toPlayer) * 150,
        radius: 17, delay: i * 0.28
      }))
    case 'orbit':
      return [0, 1, 2, 3, 4].map((i) => ({
        ...base, x: CX + Math.cos((i * Math.PI * 2) / 5) * 150, y: CY + Math.sin((i * Math.PI * 2) / 5) * 150,
        radius: 22, spin: 0.9, angle: (i * Math.PI * 2) / 5, delay: 0
      }))
    case 'chase':
      return [0, 1, 2].map((i) => ({
        ...base, x: target.x, y: target.y, vx: Math.cos(toPlayer + i * 0.25) * 210, vy: Math.sin(toPlayer + i * 0.25) * 210,
        radius: 16, delay: i * 0.2
      }))
    case 'well':
      return [{ ...base, x: p.x, y: p.y, radius: 78, slow: true }]
    case 'circle':
      return [{ ...base, x: p.x, y: p.y, radius: 72 }]
    case 'beam':
      return [{ ...base, angle: toPlayer, radius: 46 }]
    case 'memory': {
      const stageId = activeStage(mechanics, game).id
      const count = stageId === 'maven2' ? 3 : 6
      const pool = ['left', 'top', 'right']
      const offset = Math.floor(Math.random() * 3)
      const steps = Array.from({ length: count }, (_, i) => pool[(i + offset) % 3])
      return [{ ...base, steps, step: 0, flash: 0, lastZone: null, blast: 0 }]
    }
    case 'safe':
      return [{
        ...base,
        safe: [
          { x: CX - ARENA_R + 26, y: CY, radius: 46 },
          { x: CX + ARENA_R - 26, y: CY, radius: 46 }
        ]
      }]
    case 'rotating':
      // Promienie zaczynają się przy dwóch zewnętrznych platformach.
      return [
        { ...base, angle: 0, spin: 0.75 },
        { ...base, angle: Math.PI, spin: 0.75 }
      ]
    case 'chasers':
      return [0, 1, 2].map((i) => ({
        ...base, x: CX + (i - 1) * 120, y: CY - 120, radius: 14, vx: 0, vy: 0, delay: i * 0.3
      }))
    case 'gapped':
      return [0, 1, 2, 3, 4].map((i) => ({
        ...base,
        angle: (i * Math.PI * 2) / 5,
        spin: 0.65,
        gapStart: 60 + Math.random() * 70,
        gapLen: 54,
        gapDrift: 30 + Math.random() * 30
      }))
    case 'sun':
      return [{
        ...base, x: target.x, y: target.y, vx: Math.cos(toPlayer) * 170, vy: Math.sin(toPlayer) * 170,
        radius: 38
      }]
  }
}

function hazardHits(hazard: Hazard, game: Game, mechanics: BossMechanics): boolean {
  const p = game.player
  switch (hazard.kind) {
    case 'gapped': {
      const radial = Math.hypot(p.x - CX, p.y - CY)
      const gapStart = hazard.gapStart ?? 0
      const inGap = radial >= gapStart && radial <= gapStart + (hazard.gapLen ?? 54)
      return distToLine(p.x, p.y, hazard.angle, CX, CY) < 16 && !inGap
    }
    case 'beams':
    case 'rotating':
      return distToLine(p.x, p.y, hazard.angle, CX, CY) < 20
    case 'beam':
      return distToLine(p.x, p.y, hazard.angle, hazard.x, hazard.y) < hazard.radius
    case 'orbs':
    case 'chase':
    case 'chasers':
    case 'orbit':
    case 'sun':
      return Math.hypot(p.x - hazard.x, p.y - hazard.y) < hazard.radius + 10
    case 'circle':
    case 'well':
      return Math.hypot(p.x - hazard.x, p.y - hazard.y) < hazard.radius
    case 'safe':
      return !(hazard.safe || []).some((s) => Math.hypot(p.x - s.x, p.y - s.y) < s.radius)
    case 'memory':
      return false
  }
}

function updateHazards(game: Game, mechanics: BossMechanics, dt: number) {
  const p = game.player
  for (const hazard of game.hazards) {
    hazard.t += dt
    if (hazard.delay > 0) { hazard.delay -= dt; continue }

    if (hazard.stage === 'telegraph' && hazard.t >= hazard.telegraph) {
      hazard.stage = 'active'
      hazard.t = 0
    }

    if (hazard.spin) hazard.angle += hazard.spin * dt

    if (hazard.kind === 'orbs' || hazard.kind === 'chase') {
      hazard.x += hazard.vx * dt
      hazard.y += hazard.vy * dt
      if (hazard.kind === 'chase' && hazard.t > 0.8) {
        const a = Math.atan2(p.y - hazard.y, p.x - hazard.x)
        hazard.vx += Math.cos(a) * 160 * dt
        hazard.vy += Math.sin(a) * 160 * dt
      }
      const d = Math.hypot(hazard.x - CX, hazard.y - CY)
      if (d > ARENA_R) {
        const nx = hazard.x - CX, ny = hazard.y - CY
        hazard.x = CX + (nx / d) * ARENA_R
        hazard.y = CY + (ny / d) * ARENA_R
        hazard.vx *= -0.6
        hazard.vy *= -0.6
      }
    }

    if (hazard.kind === 'chasers') {
      const a = Math.atan2(p.y - hazard.y, p.x - hazard.x)
      hazard.x += Math.cos(a) * 105 * dt
      hazard.y += Math.sin(a) * 105 * dt
    }

    if (hazard.kind === 'gapped') {
      const drift = hazard.gapDrift ?? 30
      const next = (hazard.gapStart ?? 60) + drift * dt
      if (next < 35 || next + (hazard.gapLen ?? 54) > ARENA_R - 20) hazard.gapDrift = -drift
      hazard.gapStart = clamp(next, 35, ARENA_R - 80)
    }

    if (hazard.kind === 'sun') {
      hazard.x += hazard.vx * dt
      hazard.y += hazard.vy * dt
      if (Math.hypot(hazard.x - CX, hazard.y - CY) > ARENA_R) {
        hazard.x = CX + ((hazard.x - CX) / Math.hypot(hazard.x - CX, hazard.y - CY)) * ARENA_R
        hazard.y = CY + ((hazard.y - CY) / Math.hypot(hazard.x - CX, hazard.y - CY)) * ARENA_R
        hazard.vx *= -0.5; hazard.vy *= -0.5
      }
    }

    if (hazard.kind === 'memory') {
      hazard.flash = (hazard.flash ?? 0) + dt
      if (hazard.stage === 'telegraph') {
        // Wiki: najpierw pokazuje sekwencję 3 (lub 6) stref, ~1,2 s każda.
        if (hazard.flash > 1.2) {
          hazard.flash = 0
          hazard.step = (hazard.step ?? 0) + 1
          if (hazard.steps && (hazard.step ?? 0) >= hazard.steps.length) {
            hazard.stage = 'active'
            hazard.t = 0
            hazard.step = 0
            hazard.lastZone = null
            game.voice = 'Scurry, scurry!'
          } else {
            game.voice = `Zapamiętaj: ${hazard.steps?.[hazard.step ?? 0]} (${(hazard.step ?? 0) + 1}/${hazard.steps?.length})`
          }
        }
        continue
      }

      // Faza powtarzania: wybuch woli powoli rośnie od środka areny.
      hazard.blast = (hazard.blast ?? 0) + (ARENA_R / hazard.active) * dt
      const zone = zoneOf(p.x, p.y)
      if (zone !== hazard.lastZone) {
        hazard.lastZone = zone
        if (zone && hazard.steps) {
          if (zone === hazard.steps[hazard.step ?? 0]) {
            hazard.step = (hazard.step ?? 0) + 1
            game.voice = `Dobrze! ${hazard.step}/${hazard.steps.length}`
            if ((hazard.step ?? 0) >= hazard.steps.length) {
              hazard.t = hazard.active + 1
              game.voice = 'Pamięć ukończona!'
              continue
            }
          } else {
            game.voice = 'Źle! Spowolnienie'
            game.dashUntil = game.time + 3
            hazard.blast = (hazard.blast ?? 0) + 16
          }
        }
      }
      const playerRadial = Math.hypot(p.x - CX, p.y - CY)
      if (playerRadial <= (hazard.blast ?? 0) && game.time >= game.invulnUntil) {
        game.hits++
        game.attackHit = true
        game.player.hp -= hazard.damage
        game.invulnUntil = game.time + 1.2
      }
      continue
    }

    if (hazard.stage !== 'active') continue

    if (hazard.kind === 'well') {
      if (hazardHits(hazard, game, mechanics)) {
        game.player.hp -= hazard.damage * dt
        game.noRegenUntil = Math.max(game.noRegenUntil, game.time + 0.2)
        game.dashUntil = Math.max(game.dashUntil, game.time + 0.2)
      }
      continue
    }

    if (!hazard.hit && hazardHits(hazard, game, mechanics) && game.time >= game.invulnUntil) {
      hazard.hit = true
      game.attackHit = true
      game.hits++
      game.player.hp -= hazard.damage
      game.invulnUntil = game.time + 0.7
      if (hazard.kind === 'rotating' || hazard.kind === 'gapped') {
        game.noRegenUntil = game.time + 10
      }
    }
  }
  game.hazards = game.hazards.filter((hazard) => hazard.stage === 'telegraph' || hazard.t < hazard.active)
}

function makeAmbient(game: Game, mechanics: BossMechanics): Hazard[] {
  const stage = activeStage(mechanics, game)
  const base: Hazard = {
    kind: 'rotating', stage: 'active', t: 0, telegraph: 0, active: 99999, damage: 600,
    hit: false, x: CX, y: CY, vx: 0, vy: 0, radius: 20, angle: 0, spin: 0, delay: 0
  }
  if (stage.target === 'nucleus') {
    return [
      { ...base, angle: 0, spin: 0.7 },
      { ...base, angle: Math.PI, spin: 0.7 }
    ]
  }
  if (stage.id === 'final') {
    return [0, 1, 2, 3, 4].map((i) => ({
      ...base, kind: 'gapped', damage: 800, angle: (i * Math.PI * 2) / 5, spin: 0.65,
      gapStart: 60 + i * 18, gapLen: 54, gapDrift: i % 2 === 0 ? 35 : -35
    }))
  }
  return []
}

function updateAmbient(game: Game, dt: number) {
  if (game.ambient.length === 0) return
  const p = game.player
  for (const hazard of game.ambient) {
    hazard.angle += hazard.spin * dt
    if (hazard.kind === 'gapped') {
      const drift = hazard.gapDrift ?? 30
      const next = (hazard.gapStart ?? 60) + drift * dt
      if (next < 35 || next + (hazard.gapLen ?? 54) > ARENA_R - 20) hazard.gapDrift = -drift
      hazard.gapStart = clamp(next, 35, ARENA_R - 80)
    }
    const radial = Math.hypot(p.x - CX, p.y - CY)
    const inGap = hazard.kind === 'gapped' &&
      radial >= (hazard.gapStart ?? 0) && radial <= (hazard.gapStart ?? 0) + (hazard.gapLen ?? 54)
    if (distToLine(p.x, p.y, hazard.angle, CX, CY) < 16 && !inGap && game.time > game.ambientHitAt + 1.5) {
      game.ambientHitAt = game.time
      game.player.hp -= hazard.damage
      game.hits++
      game.attackHit = true
      game.noRegenUntil = game.time + 10
    }
  }
}

function draw(ctx: CanvasRenderingContext2D, game: Game, mechanics: BossMechanics) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0d0c0b'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#2a251d'
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

  ctx.beginPath(); ctx.arc(CX, CY, ARENA_R, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(40,34,26,0.55)'; ctx.fill()
  ctx.strokeStyle = '#6a5738'; ctx.lineWidth = 2; ctx.stroke()

  const stage = activeStage(mechanics, game)
  const target = activeTarget(mechanics, game)

  for (const h of [...game.ambient, ...game.hazards]) {
    const active = h.stage === 'active'
    ctx.save()
    ctx.globalAlpha = active ? 0.8 : 0.28 + 0.2 * Math.sin(game.time * 12)
    if (h.kind === 'gapped') {
      const gapStart = h.gapStart ?? 60
      const gapEnd = gapStart + (h.gapLen ?? 54)
      ctx.strokeStyle = active ? '#ff5a4a' : '#ff9a4a'
      ctx.lineWidth = 26
      for (const [from, to] of [[0, gapStart], [gapEnd, 600]]) {
        ctx.beginPath()
        ctx.moveTo(CX + Math.cos(h.angle) * from, CY + Math.sin(h.angle) * from)
        ctx.lineTo(CX + Math.cos(h.angle) * to, CY + Math.sin(h.angle) * to)
        ctx.stroke()
      }
    } else if (h.kind === 'beams' || h.kind === 'rotating' || h.kind === 'beam') {
      ctx.strokeStyle = active ? '#ff5a4a' : '#ff9a4a'
      ctx.lineWidth = h.kind === 'beam' ? h.radius * 2 : 28
      ctx.beginPath()
      const ox = h.kind === 'beam' ? h.x : CX
      const oy = h.kind === 'beam' ? h.y : CY
      ctx.moveTo(ox - Math.cos(h.angle) * 600, oy - Math.sin(h.angle) * 600)
      ctx.lineTo(ox + Math.cos(h.angle) * 600, oy + Math.sin(h.angle) * 600)
      ctx.stroke()
    } else if (h.kind === 'safe') {
      for (const s of h.safe || []) {
        ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
        ctx.fillStyle = active ? 'rgba(120,255,150,0.45)' : 'rgba(120,255,150,0.2)'; ctx.fill()
      }
      if (active) {
        ctx.fillStyle = 'rgba(255,70,50,0.18)'; ctx.fillRect(CX - ARENA_R, CY - ARENA_R, ARENA_R * 2, ARENA_R * 2)
      }
    } else if (h.kind === 'memory') {
      const zones = ['left', 'right', 'top']
      const flash = h.steps?.[h.step ?? 0]
      for (const zone of zones) {
        let x = CX - ARENA_R, y = CY - ARENA_R, w = ARENA_R, hh = ARENA_R
        if (zone === 'right') { x = CX; w = ARENA_R }
        if (zone === 'top') { y = CY - ARENA_R; hh = ARENA_R; x = CX - ARENA_R; w = ARENA_R * 2 }
        ctx.fillStyle = zone === flash
          ? (h.stage === 'active' ? 'rgba(120,255,150,0.28)' : 'rgba(190,90,255,0.3)')
          : 'rgba(255,255,255,0.03)'
        ctx.fillRect(x, y, w, hh)
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1
        ctx.strokeRect(x, y, w, hh)
      }
      if (active && (h.blast ?? 0) > 0) {
        ctx.beginPath(); ctx.arc(CX, CY, h.blast ?? 0, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,80,60,0.9)'; ctx.lineWidth = 6; ctx.stroke()
        ctx.fillStyle = 'rgba(255,60,50,0.12)'; ctx.fill()
      }
    } else {
      ctx.beginPath(); ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2)
      ctx.fillStyle = h.kind === 'well' ? 'rgba(80,180,255,0.28)'
        : h.kind === 'chasers' ? 'rgba(255,140,80,0.4)'
        : active ? 'rgba(255,70,50,0.5)' : 'rgba(255,170,60,0.3)'
      ctx.fill()
    }
    ctx.restore()
  }

  if (game.triBeam) game.triBeam.render(ctx, game.time)

  for (const bolt of game.bolts) {
    ctx.beginPath(); ctx.arc(bolt.x, bolt.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#9fe9ff'; ctx.fill()
  }

  ctx.beginPath(); ctx.arc(target.x, target.y, 24, 0, Math.PI * 2)
  ctx.fillStyle = stage.target === 'maven' ? '#b26ad6' : '#6ad6c0'; ctx.fill()
  ctx.strokeStyle = '#f0d6ff'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = '#e8e0d0'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
  ctx.fillText(stage.target === 'maven' ? 'THE MAVEN' : 'NUCLEUS', target.x, target.y - 34)

  ctx.beginPath(); ctx.arc(game.player.x, game.player.y, 10, 0, Math.PI * 2)
  ctx.fillStyle = '#6fd6ff'; ctx.fill()
  ctx.strokeStyle = '#dff6ff'; ctx.lineWidth = 2; ctx.stroke()

  if (Math.hypot(game.player.target.x - game.player.x, game.player.target.y - game.player.y) > 8) {
    ctx.strokeStyle = 'rgba(111,214,255,0.6)'
    ctx.beginPath(); ctx.arc(game.player.target.x, game.player.target.y, 6, 0, Math.PI * 2); ctx.stroke()
  }
}

function rollDrop(boss: Boss): string | null {
  const rows: DropRow[] = boss.variants.flatMap((v) => v.sections.flatMap((s) => s.rows.flatMap((r) => [r, ...r.children])))
  const weighted = rows.map((r) => ({ name: r.name, w: Number.parseFloat((r.chance || '').replace(/[^\d.]/g, '')) || 0 })).filter((r) => r.w > 0)
  if (!weighted.length) return rows[0]?.name ?? null
  const total = weighted.reduce((s, r) => s + r.w, 0)
  let roll = Math.random() * total
  for (const r of weighted) { roll -= r.w; if (roll <= 0) return r.name }
  return weighted[weighted.length - 1].name
}

export function BossSimulator({ bossId, boss, mechanics, onClose }: {
  bossId: string; boss: Boss; mechanics: BossMechanics; onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [stage, setStage] = useState<Stage>('setup')
  const [settings, setSettings] = useState<Settings>(PRESETS.meta)
  const [hud, setHud] = useState<Hud>({
    stageLabel: mechanics.stages[0].label, stageNumber: `1/${mechanics.stages.length}`, hp: PRESETS.meta.hp, maxHp: PRESETS.meta.hp,
    bossHp: mechanics.mavenHp, bossMaxHp: mechanics.mavenHp, time: 0, voice: '', dodged: 0, hits: 0, dashCd: 0
  })
  const [drop, setDrop] = useState<string | null>(null)
  const [best, setBest] = useState<number | null>(() => {
    try { const raw = localStorage.getItem(`poe-sim-best-${bossId}`); return raw ? Number(raw) : null } catch { return null }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (stage !== 'playing' || !gameRef.current) {
      draw(ctx, gameRef.current ?? createGame(settings, mechanics), mechanics)
      return
    }

    const game = gameRef.current
    let frame = 0
    let hudTimer = 0

    const loop = (timestamp: number) => {
      if (game.lastFrame === 0) game.lastFrame = timestamp
      const dt = Math.min((timestamp - game.lastFrame) / 1000, 0.05)
      game.lastFrame = timestamp
      game.time += dt

      const stageNow = activeStage(mechanics, game)
      const playerFrom = { x: game.player.x, y: game.player.y }
      const slowed = game.time < game.dashUntil
      const speed = slowed ? 90 : 205
      const dx = game.player.target.x - game.player.x
      const dy = game.player.target.y - game.player.y
      const distance = Math.hypot(dx, dy)
      if (distance > 4) {
        const step = Math.min(distance, speed * dt)
        const next = insideArena(game.player.x + (dx / distance) * step, game.player.y + (dy / distance) * step)
        game.player.x = next.x; game.player.y = next.y
        game.player.facing = Math.atan2(dy, dx)
      }

      if (game.time >= game.invulnUntil && game.time >= game.noRegenUntil) {
        game.player.hp = Math.min(game.player.maxHp, game.player.hp + game.player.regen * dt)
      }

      // Pociski gracza
      const target = activeTarget(mechanics, game)
      for (const bolt of game.bolts) {
        bolt.x += bolt.vx * dt; bolt.y += bolt.vy * dt; bolt.life -= dt
        if (Math.hypot(bolt.x - target.x, bolt.y - target.y) < 32) {
          if (stageNow.target === 'maven') game.mavenHp -= bolt.damage
          else game.nucleusDamage += bolt.damage
          bolt.life = 0
        }
      }
      game.bolts = game.bolts.filter((b) => b.life > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20)

      if (game.currentAttack) {
        updateHazards(game, mechanics, dt)
        if (game.triBeam) {
          game.triBeam.update(
            dt,
            game.time,
            playerFrom,
            { x: game.player.x, y: game.player.y },
            (damage) => {
              if (game.time < game.invulnUntil) return
              game.player.hp -= damage
              game.hits++
              game.attackHit = true
              game.invulnUntil = game.time + 0.8
            }
          )
        }
        if (game.time >= game.attackEnd) {
          if (!game.attackHit) game.dodged++
          game.hazards = []
          game.triBeam = null
          game.currentAttack = null
          game.voice = ''
        }
      }

      // Harmonogram ataków (cooldown liczony od końca poprzedniego)
      if (!game.currentAttack && game.time >= game.invulnUntil) {
        const ready = mechanics.attacks
          .filter((a) => a.stages.includes(stageNow.id))
          .filter((a) => (game.nextAt[a.id] ?? 0) <= game.time)
          .sort((a, b) => (game.nextAt[a.id] ?? 0) - (game.nextAt[b.id] ?? 0))
        if (ready.length > 0) {
          const forcedMemory = ready.find((a) => a.id === 'memory')
          const def = forcedMemory ?? ready[0]
          game.currentAttack = def
          game.attackHit = false
          if (def.id === 'tri-beam') {
            const config = mechanics.triBeam
            const controller = new MavenAttackController(config)
            controller.start(game.time, MAVEN_POS, { x: CX, y: CY, radius: ARENA_R })
            game.triBeam = controller
            game.hazards = []
            game.attackEnd =
              game.time + config.preparation + config.telegraph + config.active
            game.nextAt[def.id] = game.attackEnd + def.cooldown
          } else {
            game.attackEnd = game.time + def.telegraph + def.active
            game.hazards = makeHazard(def, game, mechanics)
            game.nextAt[def.id] = game.attackEnd + def.cooldown
          }
          game.voice = def.voice
        }
      }

      // Przejścia faz
      if (stageNow.target === 'maven' && game.mavenHp <= 0) {
        game.stageIndex++
        game.hazards = []
        game.triBeam = null
        game.currentAttack = null
        game.voice = ''
        if (game.stageIndex >= mechanics.stages.length) {
          game.result = 'won'; game.drop = rollDrop(boss); setDrop(game.drop)
          try {
            const prev = Number(localStorage.getItem(`poe-sim-best-${bossId}`) || 0)
            if (!prev || game.time < prev) { localStorage.setItem(`poe-sim-best-${bossId}`, String(game.time)); setBest(game.time) }
          } catch { /* brak pamięci */ }
          setStage('won')
        } else {
          const next = mechanics.stages[game.stageIndex]
          game.mavenHp = next.id === 'final' ? game.mavenMaxHp * 1.6 : game.mavenMaxHp
          game.nucleusDamage = 0
          game.invulnUntil = game.time + 1
          game.nextAt['memory'] = game.time + 1.5
          if (next.id === 'final') game.nextAt['brain-beam-2'] = game.time + 0.5
          if (next.target === 'nucleus') game.nextAt['brain-beam'] = game.time + 0.5
        }
      }
      if (stageNow.target === 'nucleus' && game.nucleusDamage >= mechanics.nucleusStageDamage) {
        game.stageIndex++
        game.hazards = []
        game.triBeam = null
        game.currentAttack = null
        game.nucleusDamage = 0
        const nextStage = mechanics.stages[game.stageIndex]
        game.mavenHp = nextStage.id === 'final' ? game.mavenMaxHp * 1.6 : game.mavenMaxHp
        game.invulnUntil = game.time + 1
        game.voice = ''
        game.nextAt['memory'] = game.time + 1.5
        if (nextStage.id === 'final') game.nextAt['brain-beam-2'] = game.time + 0.5
      }
      if (game.player.hp <= 0) { game.result = 'lost'; setStage('lost') }

      const stageId = activeStage(mechanics, game).id
      if (game.ambientStageId !== stageId) {
        game.ambientStageId = stageId
        game.ambient = makeAmbient(game, mechanics)
      }
      updateAmbient(game, dt)

      draw(ctx, game, mechanics)

      hudTimer += dt
      if (hudTimer >= 0.1) {
        hudTimer = 0
        setHud({
          stageLabel: activeStage(mechanics, game).label,
          stageNumber: `${game.stageIndex + 1}/${mechanics.stages.length}`,
          hp: Math.max(0, game.player.hp), maxHp: game.player.maxHp,
          bossHp: Math.max(0, stageNow.target === 'maven' ? game.mavenHp : mechanics.nucleusStageDamage - game.nucleusDamage),
          bossMaxHp: stageNow.target === 'maven' ? game.mavenMaxHp : mechanics.nucleusStageDamage,
          time: game.time, voice: game.voice, dodged: game.dodged, hits: game.hits,
          dashCd: Math.max(0, game.dashCd - game.time)
        })
      }
      if (game.result === 'playing') frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [stage, settings, mechanics, boss, bossId])

  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const game = gameRef.current
    if (!game || stage !== 'playing') return
    const pos = pointerPosition(event)
    if (event.button === 2) {
      if (game.time < game.attackCd) return
      const target = activeTarget(mechanics, game)
      const angle = Math.atan2(pos.y - game.player.y, pos.x - game.player.x)
      game.bolts.push({
        x: game.player.x, y: game.player.y, vx: Math.cos(angle) * 700, vy: Math.sin(angle) * 700,
        life: 1.2, damage: game.player.dps * 0.35
      })
      game.attackCd = game.time + 0.35
      return
    }
    game.player.target = insideArena(pos.x, pos.y)
  }

  useEffect(() => {
    if (stage !== 'playing') return
    const onKey = (event: KeyboardEvent) => {
      const game = gameRef.current
      if (!game || event.key.toLowerCase() !== 'w') return
      if (game.time < game.dashCd) return
      const dx = game.player.target.x - game.player.x
      const dy = game.player.target.y - game.player.y
      const angle = Math.hypot(dx, dy) > 8 ? Math.atan2(dy, dx) : game.player.facing
      const next = insideArena(game.player.x + Math.cos(angle) * 110, game.player.y + Math.sin(angle) * 110)
      game.player.x = next.x; game.player.y = next.y
      game.invulnUntil = game.time + 0.4
      game.dashCd = game.time + 3
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage])

  function start() {
    gameRef.current = createGame(settings, mechanics)
    setDrop(null)
    setStage('playing')
  }

  return (
    <div className="sim-overlay">
      <div className="sim-shell">
        <div className="sim-header">
          <div><div className="content-kicker">Fight simulator</div><h1>{mechanics.name} — symulator walki</h1></div>
          <button type="button" className="sim-exit" onClick={onClose}>Zamknij ✕</button>
        </div>
        <div className="sim-body">
          <div className="sim-canvas-wrap">
            <canvas ref={canvasRef} width={W} height={H} className="sim-canvas"
              onPointerDown={handlePointerDown} onContextMenu={(e) => e.preventDefault()} />
            <div className="sim-voice">{hud.voice || '\u00a0'}</div>
          </div>
          <aside className="sim-side">
            <div className="sim-hud">
              <div className="sim-label">Faza {hud.stageNumber} · {hud.stageLabel}</div>
              <div className="sim-bar"><span style={{ width: `${(hud.bossHp / hud.bossMaxHp) * 100}%`, background: '#b26ad6' }} /></div>
              <div className="sim-label">HP celu {Math.round(hud.bossHp).toLocaleString()}</div>
              <div className="sim-bar"><span style={{ width: `${(hud.hp / hud.maxHp) * 100}%`, background: '#6fd6ff' }} /></div>
              <div className="sim-label">HP {Math.round(hud.hp)} / {hud.maxHp}</div>
              <div className="sim-label">Odskok (W): {hud.dashCd > 0 ? `${hud.dashCd.toFixed(1)} s` : 'gotowy'}</div>
            </div>
            <div className="sim-stats">
              <div>Czas <strong>{hud.time.toFixed(1)} s</strong></div>
              <div>Uniki <strong>{hud.dodged}</strong></div>
              <div>Trafienia <strong>{hud.hits}</strong></div>
              {best && <div>Najlepszy <strong>{best.toFixed(1)} s</strong></div>}
            </div>
            {stage === 'setup' && (
              <div className="sim-setup">
                <div className="sim-presets">
                  {Object.entries(PRESETS).map(([key, preset]) => (
                    <button type="button" key={key} className={settings === preset ? 'active' : ''} onClick={() => setSettings(preset)}>
                      {key === 'jugg' ? 'Jugg' : key === 'meta' ? 'Meta' : 'Glass'}
                    </button>
                  ))}
                </div>
                <label>DPS<input type="number" value={settings.dps} min={1000} step={100000} onChange={(e) => setSettings({ ...settings, dps: Number(e.target.value) })} /></label>
                <label>HP<input type="number" value={settings.hp} min={1} step={100} onChange={(e) => setSettings({ ...settings, hp: Number(e.target.value) })} /></label>
                <label>Regen / s<input type="number" value={settings.regen} min={0} step={100} onChange={(e) => setSettings({ ...settings, regen: Number(e.target.value) })} /></label>
                <button type="button" className="sim-start" onClick={start}>Rozpocznij walkę</button>
              </div>
            )}
            {(stage === 'won' || stage === 'lost') && (
              <div className="sim-result">
                <h2>{stage === 'won' ? 'Wygrana!' : 'RIP'}</h2>
                <p>Czas: {hud.time.toFixed(1)} s · uniki: {hud.dodged}</p>
                {stage === 'won' && drop && <p className="sim-drop">Drop: <strong>{drop}</strong></p>}
                <button type="button" className="sim-start" onClick={() => { setStage('setup'); gameRef.current = null }}>Zagraj ponownie</button>
              </div>
            )}
          </aside>
        </div>
        <p className="sim-hint">Lewy przycisk — ruch · Prawy przycisk — atak · W — odskok. Mechaniki: poewiki.net / poedb.tw (CC BY-NC-SA 3.0).</p>
      </div>
    </div>
  )
}
