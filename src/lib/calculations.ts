import type { AwardType, Committee, CommitteeStatus, MunStateData, Slot } from '../types'

export interface AwardInventoryItem {
  awardId: string
  name: string
  pointValue: number
  hierarchyRank: number
}

export interface CommitteeMetrics {
  activeSlots: number
  totalSlots: number
  delegateCount: number
  possiblePoints: number
  achievedPoints: number
  efficiency: number | null
  awardsWon: number
  pendingSlots: number
  status: CommitteeStatus
}

export function requiredDelegates(committee: Committee) {
  return committee.format === 'pair' ? 2 : 1
}

export function isActiveSlot(slot: Slot, committee: Committee) {
  return slot.delegateIds.filter(Boolean).length === requiredDelegates(committee)
}

export function calculateAwardInventory(awards: AwardType[]): AwardInventoryItem[] {
  return [...awards]
    .sort((a, b) => a.hierarchyRank - b.hierarchyRank)
    .flatMap((award) =>
      Array.from({ length: Math.max(0, award.quantity) }, () => ({
        awardId: award.id,
        name: award.name,
        pointValue: award.pointValue,
        hierarchyRank: award.hierarchyRank,
      })),
    )
}

export function calculatePossiblePoints(committee: Committee, activeSlotCount: number) {
  return calculateAwardInventory(committee.awards)
    .slice(0, Math.max(0, activeSlotCount))
    .reduce((sum, item) => sum + item.pointValue, 0)
}

export function calculateAchievedPoints(committee: Committee, slots: Slot[]) {
  const awardMap = new Map(committee.awards.map((award) => [award.id, award]))
  return slots.reduce((sum, slot) => {
    if (!isActiveSlot(slot, committee) || slot.result.state !== 'award' || !slot.result.awardId) return sum
    return sum + (awardMap.get(slot.result.awardId)?.pointValue ?? 0)
  }, 0)
}

export function calculateCommitteeEfficiency(achievedPoints: number, possiblePoints: number) {
  return possiblePoints > 0 ? (achievedPoints / possiblePoints) * 100 : null
}

export function calculateAwardAvailability(committee: Committee, slots: Slot[]) {
  return committee.awards.map((award) => {
    const used = slots.filter(
      (slot) => isActiveSlot(slot, committee) && slot.result.state === 'award' && slot.result.awardId === award.id,
    ).length
    return { ...award, used, remaining: award.quantity - used, overAssigned: used > award.quantity }
  })
}

export function validateCommitteeResults(committee: Committee, slots: Slot[]) {
  const availability = calculateAwardAvailability(committee, slots)
  const errors = availability
    .filter((award) => award.overAssigned)
    .map((award) => `${award.name}: ${award.used} assigned, only ${award.quantity} available.`)

  for (const slot of slots) {
    if (slot.result.state === 'award' && !committee.awards.some((award) => award.id === slot.result.awardId)) {
      errors.push(`A slot contains an award that no longer exists in ${committee.name}.`)
    }
  }
  return errors
}

export function committeeStatus(committee: Committee, slots: Slot[]): CommitteeStatus {
  const active = slots.filter((slot) => isActiveSlot(slot, committee))
  if (slots.length === 0 || active.length === 0) return 'Not Assigned'
  const completed = active.filter((slot) => slot.result.state !== 'pending').length
  if (completed === 0) return 'Ready'
  if (completed < active.length) return 'Partial Results'
  return 'Completed'
}

export function calculateCommitteeMetrics(committee: Committee, allSlots: Slot[]): CommitteeMetrics {
  const slots = allSlots.filter((slot) => slot.committeeId === committee.id)
  const active = slots.filter((slot) => isActiveSlot(slot, committee))
  const possiblePoints = calculatePossiblePoints(committee, active.length)
  const achievedPoints = calculateAchievedPoints(committee, slots)
  const efficiency = calculateCommitteeEfficiency(achievedPoints, possiblePoints)
  return {
    activeSlots: active.length,
    totalSlots: slots.length,
    delegateCount: active.reduce((sum, slot) => sum + slot.delegateIds.filter(Boolean).length, 0),
    possiblePoints,
    achievedPoints,
    efficiency,
    awardsWon: active.filter((slot) => slot.result.state === 'award').length,
    pendingSlots: active.filter((slot) => slot.result.state === 'pending').length,
    status: committeeStatus(committee, slots),
  }
}

export function calculateOverallEfficiency(data: MunStateData) {
  const efficiencies = data.committees
    .map((committee) => calculateCommitteeMetrics(committee, data.slots).efficiency)
    .filter((value): value is number => value !== null)
  return efficiencies.length ? efficiencies.reduce((sum, value) => sum + value, 0) / efficiencies.length : null
}

export function calculateGlobalMetrics(data: MunStateData) {
  const committeeMetrics = data.committees.map((committee) => ({
    committee,
    metrics: calculateCommitteeMetrics(committee, data.slots),
  }))
  const participating = committeeMetrics.filter(({ metrics }) => metrics.activeSlots > 0)
  const possiblePoints = participating.reduce((sum, item) => sum + item.metrics.possiblePoints, 0)
  const achievedPoints = participating.reduce((sum, item) => sum + item.metrics.achievedPoints, 0)
  return {
    overallEfficiency: calculateOverallEfficiency(data),
    pointsConversion: possiblePoints > 0 ? (achievedPoints / possiblePoints) * 100 : null,
    possiblePoints,
    achievedPoints,
    participatingCommittees: participating.length,
    activeSlots: participating.reduce((sum, item) => sum + item.metrics.activeSlots, 0),
    delegatesCompeting: new Set(
      data.slots
        .filter((slot) => {
          const committee = data.committees.find((item) => item.id === slot.committeeId)
          return committee ? isActiveSlot(slot, committee) : false
        })
        .flatMap((slot) => slot.delegateIds.filter(Boolean)),
    ).size,
    awardsWon: participating.reduce((sum, item) => sum + item.metrics.awardsWon, 0),
    pendingResults: participating.reduce((sum, item) => sum + item.metrics.pendingSlots, 0),
    committeeMetrics,
  }
}
