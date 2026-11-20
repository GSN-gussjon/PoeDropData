export type MechanicKind =
  | 'beams'
  | 'orbs'
  | 'orbit'
  | 'chase'
  | 'well'
  | 'circle'
  | 'beam'
  | 'memory'
  | 'safe'
  | 'rotating'
  | 'chasers'
  | 'gapped'
  | 'sun'
  | 'teleport'

export type BossStage = {
  id: string
  label: string
  target: 'maven' | 'nucleus'
}

export type BossAttack = {
  id: string
  name: string
  voice: string
  cooldown: number
  telegraph: number
  active: number
  damage: number
  kind: MechanicKind
  stages: string[]
}

export type TriBeamConfig = {
  preparation: number
  telegraph: number
  active: number
  beamCount: number
  handOffset: number
  lineLength: number
  width: number
  connectorWidth: number
  connectorHitWidth: number
  damage: number
}

export type CascadeConfig = {
  preparation: number
  telegraph: number
  ballCount: number
  interval: number
  speed: number
  radius: number
  hitRadius: number
  spread: number
  damage: number
}

export type DecelConfig = {
  preparation: number
  telegraph: number
  orbCount: number
  interval: number
  initialSpeed: number
  deceleration: number
  chaseSpeed: number
  chaseAcceleration: number
  radius: number
  hitRadius: number
  fuse: number
  explosionRadius: number
  explosionDamage: number
  wellRadius: number
  wellDps: number
  slowFactor: number
  wellDuration: number
}

export type AutoAttackConfig = {
  interval: number
  damage: number
  speed: number
}

export type PlatformsConfig = {
  orbitOffset: number
  radius: number
  length: number
  speed: number
}

export type BrainBlastConfig = {
  preparation: number
  blastDuration: number
  aftermath: number
  damage: number
}

export type MemoryConfig = {
  preparation: number
  flashInterval: number
  shortSteps: number
  longSteps: number
  repeatWindow: number
  blastBoostOnError: number
  slowOnError: number
  feedbackDuration: number
  damage: number
}

export type BossMechanics = {
  name: string
  firstAttack: string | null
  triBeam: TriBeamConfig
  cascade: CascadeConfig
  decel: DecelConfig
  memory: MemoryConfig
  autoAttack: AutoAttackConfig
  platforms: PlatformsConfig
  brainBlast: BrainBlastConfig
  mavenHp: number
  nucleusStageDamage: number
  stages: BossStage[]
  attacks: BossAttack[]
}

export type MechanicsData = {
  schemaVersion: number
  source: { name: string; license: string }
  bosses: Record<string, BossMechanics>
}
