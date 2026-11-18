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
  beamLength: number
  beamCount: number
  spread: number
  handOffset: number
  leftStartAngle: number
  leftEndAngle: number
  rightStartAngle: number
  rightEndAngle: number
  width: number
  hitWidth: number
  damage: number
}

export type BossMechanics = {
  name: string
  triBeam: TriBeamConfig
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
