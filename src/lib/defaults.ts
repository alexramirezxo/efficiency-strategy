import type { AwardType, MunStateData } from '../types'
import { id } from './id'

export function defaultAwards(): AwardType[] {
  return [
    { id: id('award'), name: 'Best Delegate', quantity: 1, pointValue: 4, hierarchyRank: 1 },
    { id: id('award'), name: 'Outstanding Delegate', quantity: 1, pointValue: 3, hierarchyRank: 2 },
    { id: id('award'), name: 'Honorable Mention', quantity: 2, pointValue: 2, hierarchyRank: 3 },
    { id: id('award'), name: 'Diplomatic Commendation', quantity: 2, pointValue: 1, hierarchyRank: 4 },
    { id: id('award'), name: 'Peer Award', quantity: 1, pointValue: 1, hierarchyRank: 5 },
  ]
}

export const initialData: MunStateData = {
  competition: {
    name: 'MUN Competition 2027',
    delegationName: 'Your Delegation',
    conferenceName: '',
    date: '',
  },
  committees: [],
  delegates: [],
  slots: [],
}
