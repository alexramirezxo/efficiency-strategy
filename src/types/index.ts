export type CommitteeFormat = 'individual' | 'pair'
export type ResultState = 'pending' | 'no-award' | 'award'

export interface Competition {
  name: string
  delegationName: string
  conferenceName?: string
  date?: string
}

export interface AwardType {
  id: string
  name: string
  quantity: number
  pointValue: number
  hierarchyRank: number
}

export interface Chair {
  id: string
  name: string
  delegation: string
}

export interface Committee {
  id: string
  name: string
  abbreviation: string
  format: CommitteeFormat
  topic: string
  chairs: Chair[]
  awards: AwardType[]
}

export interface Delegate {
  id: string
  name: string
  internalId?: string
  notes?: string
}

export interface SlotResult {
  state: ResultState
  awardId?: string
}

export interface Slot {
  id: string
  committeeId: string
  delegateIds: string[]
  result: SlotResult
}

export interface MunStateData {
  competition: Competition
  committees: Committee[]
  delegates: Delegate[]
  slots: Slot[]
}

export interface SavedSetup {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  snapshot: MunStateData
}

export interface MunExportData extends MunStateData {
  savedSetups?: SavedSetup[]
}

export type CommitteeStatus = 'Not Assigned' | 'Ready' | 'Partial Results' | 'Completed'
