import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AwardType, Chair, Committee, Competition, Delegate, MunExportData, MunStateData, SavedSetup, SlotResult } from '../types'
import { defaultAwards, initialData } from '../lib/defaults'
import { id } from '../lib/id'

interface MunStore extends MunStateData {
  savedSetups: SavedSetup[]
  updateCompetition: (patch: Partial<Competition>) => void
  addCommittee: (name?: string) => string
  updateCommittee: (committeeId: string, patch: Partial<Omit<Committee, 'id'>>) => void
  deleteCommittee: (committeeId: string) => void
  addAward: (committeeId: string) => void
  updateAward: (committeeId: string, awardId: string, patch: Partial<AwardType>) => void
  deleteAward: (committeeId: string, awardId: string) => void
  moveAward: (committeeId: string, awardId: string, direction: -1 | 1) => void
  addDelegate: (delegate?: Partial<Delegate>) => string
  bulkAddDelegates: (names: string[]) => void
  updateDelegate: (delegateId: string, patch: Partial<Delegate>) => void
  deleteDelegate: (delegateId: string) => void
  addSlot: (committeeId: string) => string
  deleteSlot: (slotId: string) => void
  setSlotDelegates: (slotId: string, delegateIds: string[]) => void
  setSlotResult: (slotId: string, result: SlotResult) => void
  saveSetup: (name: string) => string
  renameSetup: (setupId: string, name: string) => void
  overwriteSetup: (setupId: string) => void
  deleteSetup: (setupId: string) => void
  restoreSetup: (setupId: string) => void
  importData: (data: MunExportData) => void
  reset: () => void
}

const cloneData = (data: MunStateData): MunStateData => JSON.parse(JSON.stringify(data)) as MunStateData

const normalizeDelegate = (delegate: any): Delegate => ({
  id: delegate.id ?? id('delegate'),
  name: String(delegate.name ?? `${delegate.firstName ?? ''} ${delegate.lastName ?? ''}`).trim() || 'Unnamed delegate',
  internalId: delegate.internalId,
  notes: delegate.notes,
})

const normalizeChair = (chair: any): Chair => ({
  id: chair?.id ?? id('chair'),
  name: String(chair?.name ?? '').trim(),
  delegation: String(chair?.delegation ?? '').trim(),
})

const normalizeCommittee = (committee: any): Committee => ({
  id: committee?.id ?? id('committee'),
  name: String(committee?.name ?? 'New Committee'),
  abbreviation: String(committee?.abbreviation ?? ''),
  format: committee?.format === 'pair' ? 'pair' : 'individual',
  topic: String(committee?.topic ?? ''),
  chairs: Array.isArray(committee?.chairs) ? committee.chairs.map(normalizeChair).slice(0, 6) : [],
  awards: Array.isArray(committee?.awards) ? committee.awards : defaultAwards(),
})

const normalizeData = (data: any): MunStateData => ({
  competition: data?.competition ?? initialData.competition,
  committees: Array.isArray(data?.committees) ? data.committees.map(normalizeCommittee) : [],
  delegates: Array.isArray(data?.delegates) ? data.delegates.map(normalizeDelegate) : [],
  slots: Array.isArray(data?.slots) ? data.slots : [],
})

const normalizeSavedSetups = (setups: any): SavedSetup[] =>
  Array.isArray(setups)
    ? setups.map((setup) => ({
        id: setup.id ?? id('setup'),
        name: String(setup.name ?? 'Saved Setup'),
        createdAt: setup.createdAt ?? new Date().toISOString(),
        updatedAt: setup.updatedAt ?? setup.createdAt ?? new Date().toISOString(),
        snapshot: normalizeData(setup.snapshot ?? setup),
      }))
    : []

export const useMunStore = create<MunStore>()(
  persist(
    (set, get) => ({
      ...initialData,
      savedSetups: [],
      updateCompetition: (patch) => set((state) => ({ competition: { ...state.competition, ...patch } })),
      addCommittee: (name = 'New Committee') => {
        const committeeId = id('committee')
        set((state) => ({
          committees: [
            ...state.committees,
            { id: committeeId, name, abbreviation: '', format: 'individual', topic: '', chairs: [], awards: defaultAwards() },
          ],
        }))
        return committeeId
      },
      updateCommittee: (committeeId, patch) =>
        set((state) => ({
          committees: state.committees.map((committee) =>
            committee.id === committeeId ? { ...committee, ...patch } : committee,
          ),
        })),
      deleteCommittee: (committeeId) =>
        set((state) => ({
          committees: state.committees.filter((committee) => committee.id !== committeeId),
          slots: state.slots.filter((slot) => slot.committeeId !== committeeId),
        })),
      addAward: (committeeId) =>
        set((state) => ({
          committees: state.committees.map((committee) => {
            if (committee.id !== committeeId) return committee
            const maxRank = Math.max(0, ...committee.awards.map((award) => award.hierarchyRank))
            return {
              ...committee,
              awards: [
                ...committee.awards,
                { id: id('award'), name: 'New Award', quantity: 1, pointValue: 1, hierarchyRank: maxRank + 1 },
              ],
            }
          }),
        })),
      updateAward: (committeeId, awardId, patch) =>
        set((state) => ({
          committees: state.committees.map((committee) =>
            committee.id === committeeId
              ? { ...committee, awards: committee.awards.map((award) => (award.id === awardId ? { ...award, ...patch } : award)) }
              : committee,
          ),
        })),
      deleteAward: (committeeId, awardId) =>
        set((state) => ({
          committees: state.committees.map((committee) =>
            committee.id === committeeId
              ? {
                  ...committee,
                  awards: committee.awards
                    .filter((award) => award.id !== awardId)
                    .sort((a, b) => a.hierarchyRank - b.hierarchyRank)
                    .map((award, index) => ({ ...award, hierarchyRank: index + 1 })),
                }
              : committee,
          ),
        })),
      moveAward: (committeeId, awardId, direction) =>
        set((state) => ({
          committees: state.committees.map((committee) => {
            if (committee.id !== committeeId) return committee
            const ordered = [...committee.awards].sort((a, b) => a.hierarchyRank - b.hierarchyRank)
            const index = ordered.findIndex((award) => award.id === awardId)
            const target = index + direction
            if (index < 0 || target < 0 || target >= ordered.length) return committee
            ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
            return { ...committee, awards: ordered.map((award, i) => ({ ...award, hierarchyRank: i + 1 })) }
          }),
        })),
      addDelegate: (delegate = {}) => {
        const delegateId = id('delegate')
        set((state) => ({ delegates: [...state.delegates, { id: delegateId, name: 'New Delegate', ...delegate }] }))
        return delegateId
      },
      bulkAddDelegates: (names) =>
        set((state) => ({
          delegates: [
            ...state.delegates,
            ...names.map((name) => name.trim()).filter(Boolean).map((name) => ({ id: id('delegate'), name })),
          ],
        })),
      updateDelegate: (delegateId, patch) =>
        set((state) => ({ delegates: state.delegates.map((delegate) => (delegate.id === delegateId ? { ...delegate, ...patch } : delegate)) })),
      deleteDelegate: (delegateId) =>
        set((state) => ({
          delegates: state.delegates.filter((delegate) => delegate.id !== delegateId),
          slots: state.slots.map((slot) => ({ ...slot, delegateIds: slot.delegateIds.filter((item) => item !== delegateId) })),
        })),
      addSlot: (committeeId) => {
        const slotId = id('slot')
        set((state) => ({ slots: [...state.slots, { id: slotId, committeeId, delegateIds: [], result: { state: 'pending' } }] }))
        return slotId
      },
      deleteSlot: (slotId) => set((state) => ({ slots: state.slots.filter((slot) => slot.id !== slotId) })),
      setSlotDelegates: (slotId, delegateIds) =>
        set((state) => ({ slots: state.slots.map((slot) => (slot.id === slotId ? { ...slot, delegateIds } : slot)) })),
      setSlotResult: (slotId, result) =>
        set((state) => ({ slots: state.slots.map((slot) => (slot.id === slotId ? { ...slot, result } : slot)) })),
      saveSetup: (name) => {
        const setupId = id('setup')
        const now = new Date().toISOString()
        const state = get()
        const snapshot = cloneData({ competition: state.competition, committees: state.committees, delegates: state.delegates, slots: state.slots })
        set((current) => ({ savedSetups: [...current.savedSetups, { id: setupId, name: name.trim() || `Setup ${current.savedSetups.length + 1}`, createdAt: now, updatedAt: now, snapshot }] }))
        return setupId
      },
      renameSetup: (setupId, name) =>
        set((state) => ({ savedSetups: state.savedSetups.map((setup) => setup.id === setupId ? { ...setup, name: name.trim() || setup.name, updatedAt: new Date().toISOString() } : setup) })),
      overwriteSetup: (setupId) => {
        const state = get()
        const snapshot = cloneData({ competition: state.competition, committees: state.committees, delegates: state.delegates, slots: state.slots })
        set((current) => ({ savedSetups: current.savedSetups.map((setup) => setup.id === setupId ? { ...setup, snapshot, updatedAt: new Date().toISOString() } : setup) }))
      },
      deleteSetup: (setupId) => set((state) => ({ savedSetups: state.savedSetups.filter((setup) => setup.id !== setupId) })),
      restoreSetup: (setupId) =>
        set((state) => {
          const setup = state.savedSetups.find((item) => item.id === setupId)
          if (!setup) return state
          const restored = cloneData(setup.snapshot)
          return { ...state, ...restored }
        }),
      importData: (data) =>
        set((state) => {
          const normalized = normalizeData(data)
          return { ...state, ...normalized, savedSetups: data.savedSetups ? normalizeSavedSetups(data.savedSetups) : state.savedSetups }
        }),
      reset: () => set((state) => ({ ...state, ...initialData })),
    }),
    {
      name: 'mun-efficiency-system-v1',
      version: 3,
      migrate: (persistedState: any) => {
        const normalized = normalizeData(persistedState)
        return { ...persistedState, ...normalized, savedSetups: normalizeSavedSetups(persistedState?.savedSetups) }
      },
    },
  ),
)
