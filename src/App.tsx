import { useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { Chair, Committee, Delegate, MunExportData, SavedSetup, Slot, SlotResult } from './types'
import { useMunStore } from './store/useMunStore'
import {
  calculateAwardAvailability,
  calculateCommitteeMetrics,
  calculateGlobalMetrics,
  isActiveSlot,
  requiredDelegates,
  validateCommitteeResults,
} from './lib/calculations'

type DragPayload =
  | { kind: 'delegate'; delegateId: string; sourceSlotId?: string; sourceSeat?: number }
  | { kind: 'award'; committeeId: string; awardId?: string; resultState: SlotResult['state']; sourceSlotId?: string }

type AppTab = 'board' | 'setups'

const fmtPct = (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}%`)
const delegateName = (delegate?: Delegate) => delegate?.name.trim() || (delegate ? 'Unnamed delegate' : 'Empty seat')
const initials = (delegate?: Delegate) => {
  if (!delegate) return '+'
  const words = delegate.name.trim().split(/\s+/).filter(Boolean)
  return `${words[0]?.[0] ?? ''}${words.length > 1 ? words[words.length - 1]?.[0] ?? '' : ''}`.toUpperCase() || '?'
}

function App() {
  const store = useMunStore()
  const global = useMemo(() => calculateGlobalMetrics(store), [store.competition, store.committees, store.delegates, store.slots])
  const [activeTab, setActiveTab] = useState<AppTab>('board')
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [rosterSearch, setRosterSearch] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [awardEditorId, setAwardEditorId] = useState<string | null>(null)
  const [committeeDetailsId, setCommitteeDetailsId] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [confirmAction, setConfirmAction] = useState<{ title: string; body: string; action: () => void } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2100)
  }

  const assignedDelegateIds = useMemo(() => new Set(store.slots.flatMap((slot) => slot.delegateIds).filter(Boolean)), [store.slots])
  const filteredDelegates = store.delegates.filter((delegate) => delegateName(delegate).toLowerCase().includes(rosterSearch.toLowerCase()))

  const setDrag = (event: DragEvent, payload: DragPayload) => {
    event.dataTransfer.effectAllowed = payload.kind === 'delegate' ? 'move' : 'copyMove'
    event.dataTransfer.setData('application/x-mun-piece', JSON.stringify(payload))
  }

  const readDrag = (event: DragEvent): DragPayload | null => {
    try { return JSON.parse(event.dataTransfer.getData('application/x-mun-piece')) as DragPayload } catch { return null }
  }

  const findDelegateSeat = (delegateId: string) => {
    for (const slot of store.slots) {
      const seat = slot.delegateIds.indexOf(delegateId)
      if (seat >= 0) return { slotId: slot.id, seat }
    }
    return null
  }

  const writeSeats = (slotId: string, seats: Array<string | null>) => {
    store.setSlotDelegates(slotId, seats.map((item) => item ?? ''))
  }

  const placeDelegate = (payload: Extract<DragPayload, { kind: 'delegate' }>, targetSlotId: string, targetSeat: number) => {
    const targetSlot = store.slots.find((slot) => slot.id === targetSlotId)
    if (!targetSlot) return
    const targetCommittee = store.committees.find((committee) => committee.id === targetSlot.committeeId)
    if (!targetCommittee || targetSeat >= requiredDelegates(targetCommittee)) return

    const located = payload.sourceSlotId ? { slotId: payload.sourceSlotId, seat: payload.sourceSeat ?? 0 } : findDelegateSeat(payload.delegateId)
    const sourceSlot = located ? store.slots.find((slot) => slot.id === located.slotId) : undefined
    const targetSeats: Array<string | null> = Array.from({ length: requiredDelegates(targetCommittee) }, (_, index) => targetSlot.delegateIds[index] || null)
    const targetOccupant = targetSeats[targetSeat]

    if (sourceSlot?.id === targetSlotId) {
      const sourceSeat = located?.seat ?? 0
      const sourceValue = targetSeats[sourceSeat]
      targetSeats[sourceSeat] = targetOccupant
      targetSeats[targetSeat] = sourceValue
      writeSeats(targetSlotId, targetSeats)
      notify('Delegates swapped')
      return
    }

    if (sourceSlot && located) {
      const sourceCommittee = store.committees.find((committee) => committee.id === sourceSlot.committeeId)
      const sourceSeats: Array<string | null> = Array.from(
        { length: sourceCommittee ? requiredDelegates(sourceCommittee) : Math.max(1, sourceSlot.delegateIds.length) },
        (_, index) => sourceSlot.delegateIds[index] || null,
      )
      sourceSeats[located.seat] = targetOccupant ?? null
      writeSeats(sourceSlot.id, sourceSeats)
    }

    targetSeats[targetSeat] = payload.delegateId
    writeSeats(targetSlotId, targetSeats)
    notify(targetOccupant ? 'Delegates swapped' : 'Delegate placed')
  }

  const placeAward = (payload: Extract<DragPayload, { kind: 'award' }>, targetSlotId: string) => {
    const targetSlot = store.slots.find((slot) => slot.id === targetSlotId)
    if (!targetSlot || targetSlot.committeeId !== payload.committeeId) return
    const committee = store.committees.find((item) => item.id === payload.committeeId)
    if (!committee) return

    if (payload.sourceSlotId && payload.sourceSlotId !== targetSlotId) {
      const source = store.slots.find((slot) => slot.id === payload.sourceSlotId)
      if (!source) return
      const targetResult = targetSlot.result
      store.setSlotResult(source.id, targetResult)
      store.setSlotResult(targetSlot.id, { state: payload.resultState, awardId: payload.awardId })
      notify('Results swapped')
      return
    }

    if (payload.resultState === 'award' && payload.awardId) {
      const availability = calculateAwardAvailability(committee, store.slots.filter((slot) => slot.committeeId === committee.id))
      const award = availability.find((item) => item.id === payload.awardId)
      const targetAlreadyHasAward = targetSlot.result.state === 'award' && targetSlot.result.awardId === payload.awardId
      if (award && award.remaining <= 0 && !targetAlreadyHasAward) {
        notify(`No ${award.name} awards remaining`)
        return
      }
    }

    store.setSlotResult(targetSlot.id, { state: payload.resultState, awardId: payload.awardId })
    notify('Result updated')
  }

  const exportJson = () => {
    const data: MunExportData = {
      competition: store.competition,
      committees: store.committees,
      delegates: store.delegates,
      slots: store.slots,
      savedSetups: store.savedSetups,
    }
    downloadFile(`${safeName(store.competition.name)}.json`, JSON.stringify(data, null, 2), 'application/json')
  }

  const exportCsv = () => {
    const rows = [['Committee', 'Format', 'Topic', 'Chairs', 'Active Slots', 'Delegates', 'Possible Points', 'Achieved Points', 'Efficiency']]
    global.committeeMetrics.forEach(({ committee, metrics }) => rows.push([
      committee.name,
      committee.format === 'pair' ? 'Pair' : 'Individual',
      committee.topic || '',
      (committee.chairs ?? []).filter((chair) => chair.name.trim()).map((chair) => chair.delegation.trim() ? `${chair.name} (${chair.delegation})` : chair.name).join('; '),
      String(metrics.activeSlots), String(metrics.delegateCount), String(metrics.possiblePoints), String(metrics.achievedPoints),
      metrics.efficiency === null ? '' : metrics.efficiency.toFixed(2),
    ]))
    rows.push(['OVERALL', '', '', '', '', '', String(global.possiblePoints), String(global.achievedPoints), global.overallEfficiency === null ? '' : global.overallEfficiency.toFixed(2)])
    downloadFile(`${safeName(store.competition.name)}-results.csv`, rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
  }

  const importJson = async (file?: File) => {
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as MunExportData
      if (!data.competition || !Array.isArray(data.committees) || !Array.isArray(data.delegates) || !Array.isArray(data.slots)) throw new Error('Invalid structure')
      setConfirmAction({
        title: 'Replace current competition?',
        body: 'Importing this file will replace the live board. If the file contains saved setups, those will be imported too.',
        action: () => { store.importData(data); setSelectedSetupId(null); notify('Competition imported') },
      })
    } catch { notify('That JSON file is not a valid competition export') }
    if (importRef.current) importRef.current.value = ''
  }

  const addQuickDelegate = () => {
    const id = store.addDelegate({ name: 'New Delegate' })
    notify('Delegate added — edit the name in the roster')
    window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-delegate-id="${id}"]`)?.select(), 40)
  }

  const addBulk = () => {
    const names = bulkText.split(/\n|,/).map((item) => item.trim()).filter(Boolean)
    if (!names.length) return
    store.bulkAddDelegates(names)
    setBulkText('')
    setBulkOpen(false)
    notify(`${names.length} delegates added`)
  }

  const openSaveDialog = () => {
    setSaveName(`Distribution ${store.savedSetups.length + 1}`)
    setSaveDialogOpen(true)
  }

  const saveCurrentSetup = () => {
    const setupId = store.saveSetup(saveName)
    setSaveDialogOpen(false)
    setSelectedSetupId(null)
    notify('Distribution saved')
  }

  const showBoard = () => {
    setActiveTab('board')
    setSelectedSetupId(null)
  }

  const showSetups = () => { setActiveTab('setups'); setSelectedSetupId(null) }

  return (
    <div className="board-app">
      <header className="command-bar">
        <div className="brand-lockup"><span className="brand-glyph">M</span><div><strong>MUN Puzzle Board</strong><small>live delegation workspace</small></div></div>
        <nav className="top-tabs" aria-label="Main views">
          <button className={activeTab === 'board' ? 'active' : ''} onClick={showBoard}>Puzzle Board</button>
          <button className={activeTab === 'setups' ? 'active' : ''} onClick={showSetups}>Saved Setups <span>{store.savedSetups.length}</span></button>
        </nav>
        <div className="competition-fields">
          <input value={store.competition.name} onChange={(e) => store.updateCompetition({ name: e.target.value })} aria-label="Competition name" />
          <span>/</span>
          <input value={store.competition.delegationName} onChange={(e) => store.updateCompetition({ delegationName: e.target.value })} aria-label="Delegation name" />
        </div>
        <div className="command-actions">
          <span className="saved"><i /> Saved locally</span>
          <button className="save-setup-btn" onClick={openSaveDialog}>Save Setup</button>
          <button className="soft-btn" onClick={exportCsv}>CSV</button>
          <button className="soft-btn" onClick={exportJson}>JSON</button>
          <button className="soft-btn" onClick={() => importRef.current?.click()}>Import</button>
          <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(e) => importJson(e.target.files?.[0])} />
        </div>
      </header>

      {activeTab === 'board' ? <>
        <section className="score-ribbon">
          <Score label="Overall Efficiency" value={fmtPct(global.overallEfficiency)} accent />
          <Score label="Points" value={`${global.achievedPoints} / ${global.possiblePoints}`} sub={`${fmtPct(global.pointsConversion)} conversion`} />
          <Score label="Committees" value={String(global.participatingCommittees)} sub={`${store.committees.length} configured`} />
          <Score label="Active Slots" value={String(global.activeSlots)} sub={`${global.delegatesCompeting} delegates`} />
          <Score label="Awards Won" value={String(global.awardsWon)} sub={`${global.pendingResults} pending`} />
        </section>

        <main className="workspace">
          <aside className="piece-bank">
            <div className="bank-head"><div><span className="section-kicker">PIECE BANK</span><h2>Delegates</h2></div><button className="square-btn" onClick={addQuickDelegate} title="Add delegate">+</button></div>
            <input className="search-input" placeholder="Search delegates…" value={rosterSearch} onChange={(e) => setRosterSearch(e.target.value)} />
            <div className="delegate-bank-list">
              {filteredDelegates.map((delegate) => {
                const assigned = assignedDelegateIds.has(delegate.id)
                return <div key={delegate.id} className={`delegate-piece ${assigned ? 'assigned' : ''}`} draggable onDragStart={(e) => setDrag(e, { kind: 'delegate', delegateId: delegate.id })}>
                  <span className="avatar">{initials(delegate)}</span>
                  <div className="piece-name">
                    <input data-delegate-id={delegate.id} value={delegate.name} onChange={(e) => store.updateDelegate(delegate.id, { name: e.target.value })} aria-label="Delegate name" />
                    <small>{assigned ? 'On the board' : 'Available'}</small>
                  </div>
                  <button className="mini-x" title="Delete delegate" onClick={() => setConfirmAction({ title: `Delete ${delegateName(delegate)}?`, body: 'The delegate will be removed from any assigned slot.', action: () => store.deleteDelegate(delegate.id) })}>×</button>
                </div>
              })}
              {filteredDelegates.length === 0 && <p className="bank-empty">No delegates match your search.</p>}
            </div>
            <button className="bulk-toggle" onClick={() => setBulkOpen((value) => !value)}>{bulkOpen ? 'Close bulk add' : '+ Paste a list of delegates'}</button>
            {bulkOpen && <div className="bulk-box"><textarea rows={6} placeholder={'María Pérez\nCarlos López\nAndrea Gómez'} value={bulkText} onChange={(e) => setBulkText(e.target.value)} /><button className="primary-btn" onClick={addBulk}>Add list</button></div>}
            <div className="drag-tip"><span>↗</span><p><strong>Move pieces, don’t re-enter data.</strong><br />Drag a delegate onto any seat. Drop onto an occupied seat to swap them.</p></div>
          </aside>

          <section className="board-area">
            <div className="board-heading">
              <div><span className="section-kicker">COMPETITION BOARD</span><h1>Build the distribution.</h1><p>Move delegates and awards like puzzle pieces, then save any arrangement you want to compare later.</p></div>
              <div className="board-heading-actions"><button className="soft-btn" onClick={openSaveDialog}>Save current distribution</button><button className="primary-btn" onClick={() => { const committeeId = store.addCommittee(); store.addSlot(committeeId); notify('Committee added') }}>+ Add Committee</button></div>
            </div>

            {store.committees.length === 0 ? <EmptyBoard onCreate={() => { const committeeId = store.addCommittee('Security Council'); store.addSlot(committeeId) }} /> :
              <div className="committee-stack">
                {store.committees.map((committee) => <CommitteeLane
                  key={committee.id}
                  committee={committee}
                  store={store}
                  setDrag={setDrag}
                  readDrag={readDrag}
                  placeDelegate={placeDelegate}
                  placeAward={placeAward}
                  openAwards={() => setAwardEditorId(committee.id)}
                  openDetails={() => setCommitteeDetailsId(committee.id)}
                  confirm={setConfirmAction}
                  notify={notify}
                />)}
              </div>}
          </section>
        </main>
      </> : <SavedSetupsView
        setups={store.savedSetups}
        selectedSetupId={selectedSetupId}
        onSelect={setSelectedSetupId}
        onBack={() => setSelectedSetupId(null)}
        onSaveCurrent={openSaveDialog}
        onRename={(setupId, name) => store.renameSetup(setupId, name)}
        onOverwrite={(setupId) => setConfirmAction({ title: 'Update this saved setup?', body: 'The saved snapshot will be replaced with the arrangement currently on your Puzzle Board.', action: () => { store.overwriteSetup(setupId); notify('Saved setup updated') } })}
        onRestore={(setupId) => setConfirmAction({ title: 'Load this setup onto the board?', body: 'Your live arrangement will be replaced. Save the current distribution first if you want to keep it.', action: () => { store.restoreSetup(setupId); setActiveTab('board'); setSelectedSetupId(null); notify('Setup loaded onto board') } })}
        onDelete={(setupId, name) => setConfirmAction({ title: `Delete ${name}?`, body: 'This removes the saved distribution. Your live board is not affected.', action: () => { store.deleteSetup(setupId); setSelectedSetupId(null); notify('Saved setup deleted') } })}
      />}

      {awardEditorId && <AwardEditor committee={store.committees.find((item) => item.id === awardEditorId)} store={store} onClose={() => setAwardEditorId(null)} />}
      {committeeDetailsId && <CommitteeDetailsEditor committee={store.committees.find((item) => item.id === committeeDetailsId)} store={store} onClose={() => setCommitteeDetailsId(null)} />}
      {saveDialogOpen && <SaveSetupDialog value={saveName} onChange={setSaveName} onCancel={() => setSaveDialogOpen(false)} onSave={saveCurrentSetup} />}
      {confirmAction && <ConfirmDialog {...confirmAction} onCancel={() => setConfirmAction(null)} onConfirm={() => { confirmAction.action(); setConfirmAction(null) }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function CommitteeLane({ committee, store, setDrag, readDrag, placeDelegate, placeAward, openAwards, openDetails, confirm, notify }: {
  committee: Committee
  store: ReturnType<typeof useMunStore>
  setDrag: (event: DragEvent, payload: DragPayload) => void
  readDrag: (event: DragEvent) => DragPayload | null
  placeDelegate: (payload: Extract<DragPayload, { kind: 'delegate' }>, targetSlotId: string, targetSeat: number) => void
  placeAward: (payload: Extract<DragPayload, { kind: 'award' }>, targetSlotId: string) => void
  openAwards: () => void
  openDetails: () => void
  confirm: (value: { title: string; body: string; action: () => void }) => void
  notify: (message: string) => void
}) {
  const slots = store.slots.filter((slot) => slot.committeeId === committee.id)
  const metrics = calculateCommitteeMetrics(committee, store.slots)
  const availability = calculateAwardAvailability(committee, slots)
  const validation = validateCommitteeResults(committee, slots)
  const awardMap = new Map(committee.awards.map((award) => [award.id, award]))

  const assignFromSelect = (slot: Slot, value: string) => {
    if (value === 'pending') store.setSlotResult(slot.id, { state: 'pending' })
    else if (value === 'no-award') store.setSlotResult(slot.id, { state: 'no-award' })
    else {
      const award = availability.find((item) => item.id === value)
      const same = slot.result.state === 'award' && slot.result.awardId === value
      if (award && award.remaining <= 0 && !same) { notify(`No ${award.name} awards remaining`); return }
      store.setSlotResult(slot.id, { state: 'award', awardId: value })
    }
  }

  return <article className="committee-lane">
    <div className="lane-header">
      <div className="lane-identity">
        <input className="committee-name" value={committee.name} onChange={(e) => store.updateCommittee(committee.id, { name: e.target.value })} />
        <div className="lane-meta">
          <input className="abbr" placeholder="ABBR" value={committee.abbreviation} onChange={(e) => store.updateCommittee(committee.id, { abbreviation: e.target.value })} />
          <select value={committee.format} onChange={(e) => store.updateCommittee(committee.id, { format: e.target.value as Committee['format'] })}><option value="individual">Individual</option><option value="pair">Pair / Double</option></select>
          <span className={`status-pill status-${metrics.status.toLowerCase().replaceAll(' ', '-')}`}>{metrics.status}</span>
        </div>
        <div className="chairs-dashboard-line">
          <span>CHAIRS</span>
          <strong>{(committee.chairs ?? []).filter((chair) => chair.name.trim()).map((chair) => chair.name).join(' · ') || 'Not added yet'}</strong>
        </div>
      </div>
      <div className="lane-score">
        <div><small>EFFICIENCY</small><strong>{fmtPct(metrics.efficiency)}</strong></div>
        <div><small>POINTS</small><strong>{metrics.achievedPoints}<em>/ {metrics.possiblePoints}</em></strong></div>
        <div><small>SLOTS</small><strong>{metrics.activeSlots}</strong></div>
      </div>
      <div className="lane-actions">
        <button className="soft-btn committee-details-btn" onClick={openDetails}>More details</button>
        <button className="soft-btn" onClick={openAwards}>Edit Awards</button>
        <button className="soft-btn" onClick={() => store.addSlot(committee.id)}>+ Slot</button>
        <button className="icon-danger" onClick={() => confirm({ title: `Delete ${committee.name}?`, body: 'This removes the committee and all of its slots and results.', action: () => store.deleteCommittee(committee.id) })}>×</button>
      </div>
    </div>

    <div className="lane-body">
      <div className="award-palette">
        <div className="palette-title"><span>AWARD PIECES</span><small>drag onto a result zone</small></div>
        <div className="award-chips">
          {[...availability].sort((a, b) => a.hierarchyRank - b.hierarchyRank).map((award) => <div
            key={award.id}
            className={`award-piece ${award.remaining <= 0 ? 'spent' : ''}`}
            draggable={award.remaining > 0}
            onDragStart={(e) => setDrag(e, { kind: 'award', committeeId: committee.id, awardId: award.id, resultState: 'award' })}
            title={`${award.pointValue} points · hierarchy #${award.hierarchyRank}`}
          ><b>{award.name}</b><span>{award.pointValue}pt</span><i>{award.remaining}/{award.quantity}</i></div>)}
          <div className="award-piece neutral" draggable onDragStart={(e) => setDrag(e, { kind: 'award', committeeId: committee.id, resultState: 'no-award' })}><b>No Award</b><span>0pt</span></div>
          <div className="award-piece pending-piece" draggable onDragStart={(e) => setDrag(e, { kind: 'award', committeeId: committee.id, resultState: 'pending' })}><b>Pending</b></div>
        </div>
        {validation.length > 0 && <div className="validation-note">⚠ {validation[0]}</div>}
      </div>

      <div className="slot-strip">
        {slots.map((slot, slotIndex) => {
          const seats = Array.from({ length: requiredDelegates(committee) }, (_, seatIndex) => store.delegates.find((delegate) => delegate.id === slot.delegateIds[seatIndex]))
          const resultAward = slot.result.state === 'award' ? awardMap.get(slot.result.awardId ?? '') : undefined
          const active = isActiveSlot(slot, committee)
          return <div className={`slot-card ${active ? 'active-slot' : 'draft-slot'}`} key={slot.id}>
            <div className="slot-top"><span>SLOT {slotIndex + 1}</span><span className={active ? 'ready-dot' : 'draft-dot'}>{active ? 'ACTIVE' : 'INCOMPLETE'}</span><button onClick={() => confirm({ title: `Delete Slot ${slotIndex + 1}?`, body: 'Its assignment and result will be removed.', action: () => store.deleteSlot(slot.id) })}>×</button></div>
            <div className={`seat-grid seats-${requiredDelegates(committee)}`}>
              {seats.map((delegate, seatIndex) => <div
                key={seatIndex}
                className={`seat-drop ${delegate ? 'filled' : ''}`}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={(e) => { e.preventDefault(); const payload = readDrag(e); if (payload?.kind === 'delegate') placeDelegate(payload, slot.id, seatIndex) }}
              >
                {delegate ? <div className="seated-piece" draggable onDragStart={(e) => setDrag(e, { kind: 'delegate', delegateId: delegate.id, sourceSlotId: slot.id, sourceSeat: seatIndex })}><span className="avatar">{initials(delegate)}</span><div><strong>{delegateName(delegate)}</strong><small>{requiredDelegates(committee) === 2 ? `Seat ${seatIndex + 1}` : 'Delegate'}</small></div><span className="grab">⠿</span></div> : <div className="empty-seat"><span>+</span><small>Drop delegate here</small></div>}
              </div>)}
            </div>

            <div
              className={`result-drop result-${slot.result.state}`}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={(e) => { e.preventDefault(); const payload = readDrag(e); if (payload?.kind === 'award') placeAward(payload, slot.id) }}
              draggable={slot.result.state !== 'pending'}
              onDragStart={(e) => {
                if (slot.result.state === 'pending') return
                setDrag(e, { kind: 'award', committeeId: committee.id, awardId: slot.result.awardId, resultState: slot.result.state, sourceSlotId: slot.id })
              }}
            >
              <div className="result-copy"><small>RESULT</small><strong>{slot.result.state === 'pending' ? 'Drop an award here' : slot.result.state === 'no-award' ? 'No Award' : resultAward?.name ?? 'Unknown award'}</strong></div>
              <span className="result-points">{slot.result.state === 'award' ? `+${resultAward?.pointValue ?? 0}` : slot.result.state === 'no-award' ? '0' : '—'}</span>
            </div>
            <select className="result-select" aria-label={`Result for slot ${slotIndex + 1}`} value={slot.result.state === 'award' ? slot.result.awardId : slot.result.state} onChange={(e) => assignFromSelect(slot, e.target.value)}>
              <option value="pending">Pending</option><option value="no-award">No Award</option>
              {[...committee.awards].sort((a, b) => a.hierarchyRank - b.hierarchyRank).map((award) => <option key={award.id} value={award.id}>{award.name} · {award.pointValue}pt</option>)}
            </select>
          </div>
        })}
        <button className="add-slot-card" onClick={() => store.addSlot(committee.id)}><span>+</span><strong>Add slot</strong><small>{committee.format === 'pair' ? '2 delegate seats' : '1 delegate seat'}</small></button>
      </div>
    </div>
    <div className="lane-efficiency"><span style={{ width: `${Math.max(0, Math.min(100, metrics.efficiency ?? 0))}%` }} /></div>
  </article>
}

function SavedSetupsView({ setups, selectedSetupId, onSelect, onBack, onSaveCurrent, onRename, onOverwrite, onRestore, onDelete }: {
  setups: SavedSetup[]
  selectedSetupId: string | null
  onSelect: (setupId: string) => void
  onBack: () => void
  onSaveCurrent: () => void
  onRename: (setupId: string, name: string) => void
  onOverwrite: (setupId: string) => void
  onRestore: (setupId: string) => void
  onDelete: (setupId: string, name: string) => void
}) {
  const selected = setups.find((setup) => setup.id === selectedSetupId)
  if (selected) return <SetupDetail setup={selected} onBack={onBack} onRename={onRename} onOverwrite={onOverwrite} onRestore={onRestore} onDelete={onDelete} />

  const ordered = [...setups].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return <main className="setups-view">
    <div className="setups-heading">
      <div><span className="section-kicker">DISTRIBUTION LIBRARY</span><h1>Saved Setups</h1><p>Freeze different arrangements, compare them at a glance, then open any setup to inspect every committee and slot.</p></div>
      <button className="primary-btn" onClick={onSaveCurrent}>+ Save current board</button>
    </div>
    {ordered.length === 0 ? <div className="setups-empty"><div className="snapshot-stack"><span /><span /><span /></div><h2>No saved distributions yet</h2><p>Arrange your live Puzzle Board, then save it here as a setup. You can keep as many alternatives as you need.</p><button className="primary-btn" onClick={onSaveCurrent}>Save first setup</button></div> :
      <div className="setup-grid">{ordered.map((setup) => <SetupCard key={setup.id} setup={setup} onOpen={() => onSelect(setup.id)} />)}</div>}
  </main>
}

function SetupCard({ setup, onOpen }: { setup: SavedSetup; onOpen: () => void }) {
  const metrics = calculateGlobalMetrics(setup.snapshot)
  const committeePreview = metrics.committeeMetrics.slice(0, 4)
  return <button className="setup-card" onClick={onOpen}>
    <div className="setup-card-top"><div><small>SAVED DISTRIBUTION</small><h2>{setup.name}</h2></div><span className="setup-open">↗</span></div>
    <div className="setup-card-metrics">
      <div><small>EFFICIENCY</small><strong>{fmtPct(metrics.overallEfficiency)}</strong></div>
      <div><small>ACTIVE SLOTS</small><strong>{metrics.activeSlots}</strong></div>
      <div><small>DELEGATES</small><strong>{metrics.delegatesCompeting}</strong></div>
      <div><small>POINTS</small><strong>{metrics.achievedPoints}/{metrics.possiblePoints}</strong></div>
    </div>
    <div className="setup-mini-committees">
      {committeePreview.map(({ committee, metrics: committeeMetrics }) => <div key={committee.id}><span>{committee.abbreviation || committee.name}</span><b>{fmtPct(committeeMetrics.efficiency)}</b></div>)}
      {metrics.committeeMetrics.length > 4 && <small>+{metrics.committeeMetrics.length - 4} more committees</small>}
    </div>
    <div className="setup-card-footer"><span>{formatDate(setup.updatedAt)}</span><strong>View setup →</strong></div>
  </button>
}

function SetupDetail({ setup, onBack, onRename, onOverwrite, onRestore, onDelete }: {
  setup: SavedSetup
  onBack: () => void
  onRename: (setupId: string, name: string) => void
  onOverwrite: (setupId: string) => void
  onRestore: (setupId: string) => void
  onDelete: (setupId: string, name: string) => void
}) {
  const metrics = calculateGlobalMetrics(setup.snapshot)
  return <main className="setup-detail-view">
    <div className="detail-topbar">
      <button className="back-btn" onClick={onBack}>← All setups</button>
      <div className="detail-actions"><button className="soft-btn" onClick={() => onOverwrite(setup.id)}>Update from current board</button><button className="primary-btn" onClick={() => onRestore(setup.id)}>Load onto Puzzle Board</button><button className="danger-link" onClick={() => onDelete(setup.id, setup.name)}>Delete</button></div>
    </div>
    <section className="setup-detail-hero">
      <div><span className="section-kicker">SAVED DISTRIBUTION</span><input className="setup-title-input" value={setup.name} onChange={(event) => onRename(setup.id, event.target.value)} /><p>Saved {formatDate(setup.createdAt)} · Last updated {formatDate(setup.updatedAt)}</p></div>
      <div className="detail-efficiency"><small>OVERALL EFFICIENCY</small><strong>{fmtPct(metrics.overallEfficiency)}</strong></div>
    </section>
    <section className="detail-stat-row">
      <Score label="Points" value={`${metrics.achievedPoints} / ${metrics.possiblePoints}`} sub={`${fmtPct(metrics.pointsConversion)} conversion`} />
      <Score label="Participating Committees" value={String(metrics.participatingCommittees)} sub={`${setup.snapshot.committees.length} configured`} />
      <Score label="Active Slots" value={String(metrics.activeSlots)} sub={`${metrics.delegatesCompeting} delegates`} />
      <Score label="Awards Won" value={String(metrics.awardsWon)} sub={`${metrics.pendingResults} pending`} />
    </section>
    <div className="snapshot-committee-stack">
      {setup.snapshot.committees.map((committee) => <SnapshotCommittee key={committee.id} committee={committee} setup={setup} />)}
      {setup.snapshot.committees.length === 0 && <div className="snapshot-empty">This setup has no committees.</div>}
    </div>
  </main>
}

function SnapshotCommittee({ committee, setup }: { committee: Committee; setup: SavedSetup }) {
  const slots = setup.snapshot.slots.filter((slot) => slot.committeeId === committee.id)
  const metrics = calculateCommitteeMetrics(committee, setup.snapshot.slots)
  const delegates = new Map(setup.snapshot.delegates.map((delegate) => [delegate.id, delegate]))
  const awards = new Map(committee.awards.map((award) => [award.id, award]))
  return <article className="snapshot-committee">
    <div className="snapshot-committee-head">
      <div><span>{committee.abbreviation || (committee.format === 'pair' ? 'PAIR' : 'IND')}</span><h2>{committee.name}</h2><small>{committee.format === 'pair' ? 'Pair / Double Delegate' : 'Individual'} · {metrics.activeSlots} active slots</small><div className="snapshot-committee-context"><b>Chairs:</b> {(committee.chairs ?? []).filter((chair) => chair.name.trim()).map((chair) => chair.delegation.trim() ? `${chair.name} (${chair.delegation})` : chair.name).join(', ') || 'Not added'}{committee.topic?.trim() ? <><i>•</i><b>Topic:</b> {committee.topic}</> : null}</div></div>
      <div className="snapshot-score"><small>EFFICIENCY</small><strong>{fmtPct(metrics.efficiency)}</strong><span>{metrics.achievedPoints} / {metrics.possiblePoints} pts</span></div>
    </div>
    <div className="snapshot-slot-grid">
      {slots.map((slot, index) => {
        const required = requiredDelegates(committee)
        const seatNames = Array.from({ length: required }, (_, seat) => delegates.get(slot.delegateIds[seat] || ''))
        const award = slot.result.state === 'award' ? awards.get(slot.result.awardId ?? '') : undefined
        return <div className="snapshot-slot" key={slot.id}>
          <div className="snapshot-slot-label"><span>SLOT {index + 1}</span><i className={isActiveSlot(slot, committee) ? 'active' : ''}>{isActiveSlot(slot, committee) ? 'ACTIVE' : 'INCOMPLETE'}</i></div>
          <div className="snapshot-delegates">{seatNames.map((delegate, seat) => <div key={seat}><span className="avatar">{initials(delegate)}</span><strong>{delegateName(delegate)}</strong></div>)}</div>
          <div className={`snapshot-result ${slot.result.state}`}><small>RESULT</small><strong>{slot.result.state === 'pending' ? 'Pending' : slot.result.state === 'no-award' ? 'No Award' : award?.name ?? 'Unknown Award'}</strong><span>{slot.result.state === 'award' ? `${award?.pointValue ?? 0} pt` : slot.result.state === 'no-award' ? '0 pt' : '—'}</span></div>
        </div>
      })}
      {slots.length === 0 && <p className="no-slots-note">No slots in this committee.</p>}
    </div>
  </article>
}

function CommitteeDetailsEditor({ committee, store, onClose }: { committee?: Committee; store: ReturnType<typeof useMunStore>; onClose: () => void }) {
  if (!committee) return null
  const chairs = committee.chairs ?? []

  const updateChair = (chairId: string, patch: Partial<Chair>) => {
    store.updateCommittee(committee.id, { chairs: chairs.map((chair) => chair.id === chairId ? { ...chair, ...patch } : chair) })
  }

  const addChair = () => {
    if (chairs.length >= 6) return
    store.updateCommittee(committee.id, { chairs: [...chairs, { id: `chair_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', delegation: '' }] })
  }

  const removeChair = (chairId: string) => {
    store.updateCommittee(committee.id, { chairs: chairs.filter((chair) => chair.id !== chairId) })
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="committee-details-editor" onMouseDown={(event) => event.stopPropagation()}>
    <div className="editor-head"><div><span className="section-kicker">COMMITTEE DETAILS</span><h2>{committee.name}</h2><p>Keep the board compact: chair names appear on the dashboard, while topic and chair delegations live here.</p></div><button className="close-btn" onClick={onClose}>×</button></div>

    <div className="committee-topic-field">
      <label>Committee topic</label>
      <textarea rows={3} value={committee.topic ?? ''} onChange={(event) => store.updateCommittee(committee.id, { topic: event.target.value })} placeholder="e.g. The Situation in the South China Sea" />
    </div>

    <div className="chairs-editor-head">
      <div><span className="section-kicker">CHAIRS</span><h3>Chair team</h3><p>Recommended: 3–6 chairs per committee. Each chair can include the delegation they represent.</p></div>
      <button className="soft-btn" disabled={chairs.length >= 6} onClick={addChair}>+ Add chair</button>
    </div>

    <div className="chairs-editor-list">
      {chairs.map((chair, index) => <div className="chair-editor-row" key={chair.id}>
        <span className="chair-number">{index + 1}</span>
        <label><small>Chair name</small><input value={chair.name} onChange={(event) => updateChair(chair.id, { name: event.target.value })} placeholder="Chair name" /></label>
        <label><small>Delegation</small><input value={chair.delegation} onChange={(event) => updateChair(chair.id, { delegation: event.target.value })} placeholder="e.g. Georgetown University" /></label>
        <button className="mini-x chair-remove" title="Remove chair" onClick={() => removeChair(chair.id)}>×</button>
      </div>)}
      {chairs.length === 0 && <div className="chairs-empty"><strong>No chairs added yet.</strong><span>Add the committee's chair team here; only their names will show on the Puzzle Board.</span></div>}
    </div>

    <div className="committee-details-preview">
      <span>DASHBOARD PREVIEW</span>
      <strong>{chairs.filter((chair) => chair.name.trim()).map((chair) => chair.name).join(' · ') || 'Chair names will appear here'}</strong>
    </div>
    <div className="editor-footer"><span className="chair-count">{chairs.length}/6 chairs</span><button className="primary-btn" onClick={onClose}>Done</button></div>
  </section></div>
}

function AwardEditor({ committee, store, onClose }: { committee?: Committee; store: ReturnType<typeof useMunStore>; onClose: () => void }) {
  if (!committee) return null
  const ordered = [...committee.awards].sort((a, b) => a.hierarchyRank - b.hierarchyRank)
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="award-editor" onMouseDown={(event) => event.stopPropagation()}>
    <div className="editor-head"><div><span className="section-kicker">AWARD INVENTORY</span><h2>{committee.name}</h2><p>Hierarchy controls theoretical possible points. Quantity controls how many times each piece can be used.</p></div><button className="close-btn" onClick={onClose}>×</button></div>
    <div className="award-editor-head"><span>Rank</span><span>Award</span><span>Qty</span><span>Points</span><span /></div>
    <div className="award-editor-list">
      {ordered.map((award, index) => <div className="award-editor-row" key={award.id}>
        <div className="rank-box"><b>#{award.hierarchyRank}</b><button disabled={index === 0} onClick={() => store.moveAward(committee.id, award.id, -1)}>↑</button><button disabled={index === ordered.length - 1} onClick={() => store.moveAward(committee.id, award.id, 1)}>↓</button></div>
        <input value={award.name} onChange={(event) => store.updateAward(committee.id, award.id, { name: event.target.value })} />
        <input type="number" min="0" value={award.quantity} onChange={(event) => store.updateAward(committee.id, award.id, { quantity: Math.max(0, Number(event.target.value)) })} />
        <input type="number" value={award.pointValue} onChange={(event) => store.updateAward(committee.id, award.id, { pointValue: Number(event.target.value) })} />
        <button className="mini-x" onClick={() => store.deleteAward(committee.id, award.id)}>×</button>
      </div>)}
    </div>
    <div className="editor-footer"><button className="soft-btn" onClick={() => store.addAward(committee.id)}>+ Add award type</button><button className="primary-btn" onClick={onClose}>Done</button></div>
  </section></div>
}

function SaveSetupDialog({ value, onChange, onCancel, onSave }: { value: string; onChange: (value: string) => void; onCancel: () => void; onSave: () => void }) {
  return <div className="modal-backdrop"><div className="save-setup-dialog">
    <span className="section-kicker">SAVE DISTRIBUTION</span><h3>Freeze this arrangement</h3><p>This creates an independent snapshot of the current delegates, slots, committees, awards, and results.</p>
    <label>Setup name<input autoFocus value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSave() }} placeholder="e.g. Option A — Crisis heavy" /></label>
    <div><button className="soft-btn" onClick={onCancel}>Cancel</button><button className="primary-btn" onClick={onSave}>Save setup</button></div>
  </div></div>
}

function Score({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return <div className={`score-cell ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>
}

function EmptyBoard({ onCreate }: { onCreate: () => void }) {
  return <div className="empty-board"><div className="empty-visual"><span>1</span><span>2</span><span>3</span></div><h2>Build your first committee lane</h2><p>Then drag delegates from the piece bank into slots and awards onto results.</p><button className="primary-btn" onClick={onCreate}>Create first committee</button></div>
}

function ConfirmDialog({ title, body, onCancel, onConfirm }: { title: string; body: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop"><div className="confirm-dialog"><span className="warning-icon">!</span><h3>{title}</h3><p>{body}</p><div><button className="soft-btn" onClick={onCancel}>Cancel</button><button className="danger-btn" onClick={onConfirm}>Continue</button></div></div></div>
}

function safeName(value: string) { return (value || 'mun-competition').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function csvCell(value: string) { return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value }
function downloadFile(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url) }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) }

export default App
