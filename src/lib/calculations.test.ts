import { describe, expect, it } from 'vitest'
import type { AwardType, Committee, MunStateData, Slot } from '../types'
import { calculateOverallEfficiency, calculatePossiblePoints, calculateCommitteeEfficiency, isActiveSlot } from './calculations'

const awards: AwardType[] = [
  { id: 'b', name: 'Best', quantity: 1, pointValue: 4, hierarchyRank: 1 },
  { id: 'o', name: 'Outstanding', quantity: 1, pointValue: 3, hierarchyRank: 2 },
  { id: 'h', name: 'Honorable', quantity: 2, pointValue: 2, hierarchyRank: 3 },
  { id: 'd', name: 'Diplomatic', quantity: 2, pointValue: 1, hierarchyRank: 4 },
]
const committee: Committee = { id: 'c', name: 'Committee', abbreviation: 'C', format: 'individual', topic: '', chairs: [], awards }

describe('calculation engine', () => {
  it('Test A: 1 slot = 4 possible points', () => expect(calculatePossiblePoints(committee, 1)).toBe(4))
  it('Test B: 2 slots = 7 possible points', () => expect(calculatePossiblePoints(committee, 2)).toBe(7))
  it('Test C: 4 slots = 11 possible points', () => expect(calculatePossiblePoints(committee, 4)).toBe(11))
  it('Test D: 10 slots is capped by award inventory = 13', () => expect(calculatePossiblePoints(committee, 10)).toBe(13))
  it('Test F: 4 / 7 = 57.14%', () => expect(calculateCommitteeEfficiency(4, 7)).toBeCloseTo(57.142857, 5))
  it('Test G: overall efficiency is unweighted committee average', () => {
    const committees: Committee[] = [0, 1, 2].map((i) => ({ ...committee, id: `c${i}` }))
    const slots: Slot[] = committees.flatMap((c, i) => {
      const achieved = i === 0 ? 'h' : i === 1 ? 'd' : 'o'
      return [
        { id: `s${i}a`, committeeId: c.id, delegateIds: [`d${i}a`], result: { state: 'award', awardId: achieved } },
      ]
    })
    // Efficiencies are 50%, 25%, 75% with one slot possible=4 => avg 50.
    const data: MunStateData = {
      competition: { name: 'x', delegationName: 'y' },
      committees,
      delegates: [],
      slots,
    }
    expect(calculateOverallEfficiency(data)).toBeCloseTo(50, 5)
  })

  it('Pair slot remains incomplete when only one seat is filled, even if it is seat 2', () => {
    const pair: Committee = { ...committee, format: 'pair' }
    const slot: Slot = { id: 'pair-draft', committeeId: pair.id, delegateIds: ['', 'delegate-2'], result: { state: 'pending' } }
    expect(isActiveSlot(slot, pair)).toBe(false)
  })
  it('Test E: pair committee possible points are per slot, not per delegate', () => {
    const pair: Committee = { ...committee, format: 'pair' }
    expect(calculatePossiblePoints(pair, 2)).toBe(7)
  })
})
