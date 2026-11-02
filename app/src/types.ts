export type SectionId = 'today' | 'cases' | 'affairs' | 'people' | 'ledger' | 'life'
export type SceneId = 'county' | 'river' | 'study'
export type Period = '晨' | '午' | '暮' | '夜'
export type DocMode = 'original' | 'reading' | 'compare'
export type OverlayId = 'document' | 'intelligence' | 'plan' | 'banquet' | 'person' | 'summary' | 'goal' | 'evidence' | 'signing' | 'review' | 'world' | 'epilogue' | 'atlas' | null

export type OfficialActionId = 'endorse' | 'commissioner' | 'files' | 'citation' | 'impeach' | 'suppress'

export type RevealDepth = '闻名' | '相识' | '共事' | '深交'

export interface Capability {
  行政: number
  财政: number
  工程: number
  司法: number
  交涉: number
}

export interface Needs {
  仕途: number
  家族: number
  财富: number
  名声: number
  安全: number
  安逸: number
}

export interface RelationTokens {
  owesYou: number
  hook: number
  youOwe: number
}

export type ClueSource = 'document' | 'ledger' | 'river'
export type TaskStage = '起' | '查' | '谋' | '办' | '验' | '结'

export interface Clue {
  id: string
  text: string
  source: ClueSource
  refs: string[]
  day: number
}

export interface RiverPlan {
  leader: string
  leaderName: string
  material: number
  labor: number
  supervisor: string
  detail: string
  day: number
  period: Period
}

export interface Comparison {
  id: string
  source: ClueSource
  refs: string[]
  question: string
  day: number
}

export interface Goal {
  id: string
  title: string
  seal: string
  statement: string
  hint: string
}

export interface Person {
  id: string
  name: string
  style: string
  role: string
  rank: string
  monogram: string
  seal: string
  origin: string
  desire: string
  fear: string
  quote: string
  claim: string
  claimId: string
  status: string
  capability: Capability
  needs: Needs
  reputation: string[]
  tokens: RelationTokens
  hookNote: string
  milestones: string[]
  questions: Array<{
    label: string
    answer: string
    basis: string
    tone: 'yes' | 'maybe' | 'no'
  }>
}

export interface ToastMessage {
  id: number
  title: string
  detail: string
}

export interface GameLog {
  done: string
  stuck: string
  rumor: string
}
