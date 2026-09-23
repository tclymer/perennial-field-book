import { useState } from 'react'
import type { Tree } from '@/model/types'
import { addTreeEvent, plantTree, today } from '@/state/actions'
import { addPhoto } from '@/state/photos'
import { useFarmStore } from '@/state/store'
import { Button, Field, inputClass } from '@/ui/components'
import { VarietyPicker } from './VarietyPicker'

type Action = 'note' | 'photo' | 'grafted' | 'plant'

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
  // A tree recorded as gone leaves the spot open for a new one.
  const gone = tree?.status === 'dead' || tree?.status === 'removed'
  const [action, setAction] = useState<Action | null>(null)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [varietyId, setVarietyId] = useState<string | null>(tree?.varietyId ?? null)
  const [how, setHow] = useState<'planted' | 'grafted'>('planted')
  const [busy, setBusy] = useState(false)

  const open = (a: Action) => {
    setAction(a)
    setDate(today())
    setNote('')
    setVarietyId(a === 'grafted' || a === 'plant' ? null : (tree?.varietyId ?? null))
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
    if (!tree) return
    if (action === 'grafted') {
      addTreeEvent(tree.id, 'grafted', {
        date,
        varietyId: varietyId ?? undefined,
        note: note || undefined,
      })
      close('Graft recorded.')
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
      {/*
        Three things, because three is what anyone does at a tree: write something down, take
        a picture, or record a graft. Everything else that used to live here either drove
        nothing in the records, or happens once in a tree's life and belongs somewhere
        quieter. What is gone: first fruit (the harvest log already has it), scionwood
        collected (it changed nothing), struggling (it counted as alive everywhere), and
        replacing a tree (mark it gone, then plant, which is the order it happens in anyway).
      */}
      <div className="flex flex-wrap gap-1.5">
        {!tree ? (
          btn('plant', 'Plant a tree here…')
        ) : (
          <>
            {btn('note', 'Note')}
            {btn('photo', 'Photo')}
            {gone ? btn('plant', 'Plant a tree here…') : btn('grafted', 'Grafted over to…')}
          </>
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
          {(action === 'grafted' || action === 'plant') && (
            <Field label={action === 'grafted' ? 'Grafted to' : 'Variety'}>
              <VarietyPicker
                value={varietyId}
                onChange={setVarietyId}
                species={species}
                autoFocus
              />
            </Field>
          )}
          {action === 'plant' && (
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
                placeholder={action === 'note' ? 'Very hardy, late to leaf out, upright form…' : ''}
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
