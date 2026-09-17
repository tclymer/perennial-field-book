import { useState } from 'react'
import type { Tree, TreeStatus } from '@/model/types'
import { addTreeEvent, plantTree, replaceTree, today } from '@/state/actions'
import { addPhoto } from '@/state/photos'
import { useFarmStore } from '@/state/store'
import { Button, Field, inputClass } from '@/ui/components'
import { VarietyPicker } from './VarietyPicker'

type Action =
  | 'note'
  | 'photo'
  | 'grafted'
  | 'scionwood'
  | 'fruited'
  | 'died'
  | 'removed'
  | 'status'
  | 'replace'
  | 'plant'

const STATUSES: TreeStatus[] = ['alive', 'struggling', 'dead', 'removed']

/**
 * The one-tap actions on a tree page. Each opens a short form with today's date filled in;
 * saving records a history event (or a new tree) and closes the form.
 */
export function ActionSheet({
  posKey,
  tree,
  species,
  onDone,
}: {
  posKey: string
  tree: Tree | null
  species?: string
  onDone?: (message: string) => void
}) {
  const farmId = useFarmStore((s) => s.farmId)
  const [action, setAction] = useState<Action | null>(null)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [varietyId, setVarietyId] = useState<string | null>(tree?.varietyId ?? null)
  const [status, setStatus] = useState<TreeStatus>(tree?.status ?? 'alive')
  const [how, setHow] = useState<'planted' | 'grafted'>('planted')
  const [busy, setBusy] = useState(false)

  const open = (a: Action) => {
    setAction(a)
    setDate(today())
    setNote('')
    setVarietyId(
      a === 'grafted' || a === 'replace' || a === 'plant' ? null : (tree?.varietyId ?? null),
    )
  }
  const close = (message?: string) => {
    setAction(null)
    if (message) onDone?.(message)
  }

  const save = async () => {
    if (action === 'plant') {
      plantTree(posKey, { varietyId: varietyId ?? undefined, date, how })
      close('Tree recorded.')
      return
    }
    if (action === 'replace') {
      replaceTree(posKey, { varietyId: varietyId ?? undefined, date, how })
      close('New tree recorded; the old one is kept in the history.')
      return
    }
    if (!tree) return
    if (action === 'grafted') {
      addTreeEvent(tree.id, 'grafted', {
        date,
        varietyId: varietyId ?? undefined,
        note: note || undefined,
      })
      close('Graft recorded.')
    } else if (action === 'status') {
      addTreeEvent(tree.id, 'status', { date, status, note: note || undefined })
      close('Status recorded.')
    } else if (action === 'note') {
      if (!note.trim()) return
      addTreeEvent(tree.id, 'note', { date, note: note.trim() })
      close('Note added.')
    } else if (action) {
      addTreeEvent(tree.id, action, { date, note: note || undefined })
      close('Recorded.')
    }
  }

  const onPhoto = async (file: File) => {
    if (!tree || !farmId) return
    setBusy(true)
    try {
      const id = await addPhoto(farmId, file)
      if (!id) {
        onDone?.('The photo could not be saved in this browser.')
        return
      }
      addTreeEvent(tree.id, 'photo', { date: today(), photoId: id, note: note || undefined })
      close('Photo added.')
    } finally {
      setBusy(false)
    }
  }

  const btn = (a: Action, label: string) => (
    <Button
      key={a}
      variant={action === a ? 'primary' : 'secondary'}
      onClick={() => (action === a ? close() : open(a))}
    >
      {label}
    </Button>
  )

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tree ? (
          <>
            {btn('note', 'Note')}
            {btn('photo', 'Photo')}
            {btn('grafted', 'Grafted to…')}
            {btn('scionwood', 'Scionwood collected')}
            {btn('fruited', 'First fruit')}
            {btn('status', 'Status…')}
            {btn('died', 'Died')}
            {btn('removed', 'Removed')}
            {btn('replace', 'Replace tree…')}
          </>
        ) : (
          btn('plant', 'Plant a tree here…')
        )}
      </div>

      {action && (
        <form
          className="mt-3 space-y-3 rounded-md border border-stone-200 dark:border-stone-700 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {action !== 'photo' && (
            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>
          )}
          {(action === 'grafted' || action === 'replace' || action === 'plant') && (
            <Field label={action === 'grafted' ? 'Grafted to' : 'Variety'}>
              <VarietyPicker
                value={varietyId}
                onChange={setVarietyId}
                species={species}
                autoFocus
              />
            </Field>
          )}
          {(action === 'replace' || action === 'plant') && (
            <Field label="How">
              <select
                className={inputClass}
                value={how}
                onChange={(e) => setHow(e.target.value as 'planted' | 'grafted')}
              >
                <option value="planted">planted a whole tree</option>
                <option value="grafted">grafted onto rootstock here</option>
              </select>
            </Field>
          )}
          {action === 'status' && (
            <Field label="Status">
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as TreeStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {action === 'photo' ? (
            <Field label="Photo" hint="Resized to 1600 px and kept in this browser.">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="text-sm"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onPhoto(f)
                  e.target.value = ''
                }}
              />
            </Field>
          ) : (
            <Field label={action === 'note' ? 'Note' : 'Note (optional)'}>
              <textarea
                className={`${inputClass} min-h-16 w-full`}
                value={note}
                autoFocus={action === 'note'}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  action === 'scionwood'
                    ? 'How much, and for whom'
                    : action === 'note'
                      ? 'Very hardy, late to leaf out, upright form…'
                      : ''
                }
              />
            </Field>
          )}
          {action !== 'photo' && (
            <div className="flex gap-2">
              <Button variant="primary" type="submit" disabled={busy}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => close()}>
                Cancel
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
