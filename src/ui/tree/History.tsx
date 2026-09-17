import type { FarmState, TreeEvent, TreeEventKind } from '@/model/types'
import { deleteTreeEvent } from '@/state/actions'
import { Button } from '@/ui/components'

export const KIND_LABEL: Record<TreeEventKind, string> = {
  planted: 'Planted',
  grafted: 'Grafted',
  fruited: 'First fruit',
  died: 'Died',
  removed: 'Removed',
  scionwood: 'Scionwood collected',
  note: 'Note',
  photo: 'Photo',
  status: 'Status',
}

function describe(e: TreeEvent, state: FarmState): string {
  const variety = e.varietyId ? state.varieties[e.varietyId]?.name : undefined
  switch (e.kind) {
    case 'grafted':
      return variety ? `Grafted to ${variety}` : 'Grafted'
    case 'planted':
      return variety ? `Planted as ${variety}` : 'Planted'
    case 'status':
      return e.status ? `Marked ${e.status}` : 'Status changed'
    default:
      return KIND_LABEL[e.kind]
  }
}

/** A tree's history, newest first, with the note under each entry. */
export function History({
  events,
  state,
  canDelete = true,
}: {
  events: TreeEvent[]
  state: FarmState
  canDelete?: boolean
}) {
  if (events.length === 0) {
    return <p className="text-sm text-stone-500 dark:text-stone-400">No history yet.</p>
  }
  const list = [...events].reverse()
  return (
    <ol className="divide-y divide-stone-100 dark:divide-stone-800 text-sm">
      {list.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-2 py-2">
          <div>
            <div>
              <span className="tabular-nums text-stone-500 dark:text-stone-400">{e.date}</span>{' '}
              <span className="font-medium">{describe(e, state)}</span>
            </div>
            {e.note && <div className="text-stone-700 dark:text-stone-300">{e.note}</div>}
          </div>
          {canDelete && (
            <Button
              variant="ghost"
              ariaLabel={`Delete ${describe(e, state)} on ${e.date}`}
              onClick={() => deleteTreeEvent(e.id)}
            >
              ×
            </Button>
          )}
        </li>
      ))}
    </ol>
  )
}
