import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { today } from '@/state/actions'
import { ensureCurrentPerson } from '@/state/people'
import type { DoneSheet as SheetValues } from '@/state/taskActions'
import { MATERIAL_CATEGORIES, allCategories } from '@/model/categories'
import type { Material, Target } from '@/model/types'
import { Button, Field, inputClass } from '@/ui/components'
import { PeopleChips } from './PeopleChips'
import { TargetPicker } from './TargetPicker'

const DURATIONS: [number, string][] = [
  [15, '15m'],
  [30, '30m'],
  [60, '1h'],
  [120, '2h'],
  [240, '½ day'],
  [480, 'day'],
]

export interface DoneSheetResult extends SheetValues {
  category?: string | null
  targets?: Target[]
}

/**
 * The two-chip sheet that files a work log (DESIGN.md §4): duration and people, with date,
 * notes, and, when asked, category, places, and materials.
 */
export function DoneSheet({
  title,
  submitLabel = 'Log it',
  initial = {},
  showDetails = false,
  onSubmit,
  onClose,
}: {
  title: string
  submitLabel?: string
  initial?: Partial<DoneSheetResult>
  /** Category and places editable (standalone logs); a task's own are used otherwise. */
  showDetails?: boolean
  onSubmit: (values: DoneSheetResult) => void
  onClose: () => void
}) {
  const farm = useFarmStore((s) => s.state.farm)
  const [date, setDate] = useState(initial.date ?? today())
  const [minutes, setMinutes] = useState<number | undefined>(initial.durationMinutes)
  const [customMinutes, setCustomMinutes] = useState('')
  const [personIds, setPersonIds] = useState<string[]>(initial.personIds ?? [])
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [category, setCategory] = useState<string>(initial.category ?? '')
  const [targets, setTargets] = useState<Target[]>(initial.targets ?? [])
  const [materials, setMaterials] = useState<Material[]>(initial.materials ?? [])
  const [more, setMore] = useState(showDetails)

  useEffect(() => {
    if (personIds.length === 0) {
      const me = ensureCurrentPerson()
      if (me) setPersonIds([me.id])
    }
    // Only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const wantsMaterials = MATERIAL_CATEGORIES.has(category || (initial.category ?? ''))

  const submit = () => {
    const values: DoneSheetResult = { date, personIds }
    if (minutes !== undefined) values.durationMinutes = minutes
    if (notes.trim()) values.notes = notes.trim()
    if (more || showDetails) {
      values.category = category || null
      values.targets = targets
    }
    const mats = materials.filter((m) => m.product.trim())
    if (mats.length) values.materials = mats
    onSubmit(values)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-center">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-xl dark:bg-stone-900 md:rounded-2xl"
      >
        <h2 className="text-base font-semibold">{title}</h2>

        <p className="mt-3 text-xs font-medium text-stone-500 dark:text-stone-400">How long</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {DURATIONS.map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              onClick={() => {
                setMinutes(minutes === m ? undefined : m)
                setCustomMinutes('')
              }}
              className={clsx(
                'rounded-full border px-3 py-1.5 text-sm font-medium',
                minutes === m
                  ? 'border-lime-700 bg-lime-700 text-white'
                  : 'border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300',
              )}
            >
              {label}
            </button>
          ))}
          <input
            className={clsx(inputClass, 'w-20')}
            placeholder="min"
            inputMode="numeric"
            value={customMinutes}
            onChange={(e) => {
              setCustomMinutes(e.target.value)
              const n = Number(e.target.value)
              setMinutes(Number.isFinite(n) && n > 0 ? Math.round(n) : undefined)
            }}
          />
        </div>

        <p className="mt-3 text-xs font-medium text-stone-500 dark:text-stone-400">Who</p>
        <div className="mt-1">
          <PeopleChips selected={personIds} onChange={setPersonIds} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="When">
            <input
              type="date"
              className={inputClass}
              value={date}
              max={today()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </Field>
          <Field label="Note">
            <input
              className={inputClass}
              value={notes}
              placeholder="optional"
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        {!more && !showDetails && (
          <button
            type="button"
            onClick={() => setMore(true)}
            className="mt-2 text-xs text-stone-500 underline decoration-dotted dark:text-stone-400"
          >
            Change category, places, or materials
          </button>
        )}
        {(more || showDetails) && (
          <div className="mt-3 space-y-3">
            <Field label="Category">
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">None</option>
                {allCategories(farm?.categories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Where">
              <TargetPicker targets={targets} onChange={setTargets} />
            </Field>
          </div>
        )}

        {(wantsMaterials || materials.length > 0) && (
          <div className="mt-3">
            <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Materials used (the organic input record)
            </p>
            {materials.map((m, i) => (
              <div key={i} className="mt-1 grid grid-cols-[2fr_1fr_1fr_1fr] gap-1">
                <input
                  className={inputClass}
                  placeholder="Product"
                  value={m.product}
                  onChange={(e) =>
                    setMaterials(
                      materials.map((x, j) => (j === i ? { ...x, product: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Rate"
                  value={m.rate ?? ''}
                  onChange={(e) =>
                    setMaterials(
                      materials.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Amount"
                  inputMode="decimal"
                  value={m.amount ?? ''}
                  onChange={(e) =>
                    setMaterials(
                      materials.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              amount: e.target.value === '' ? undefined : Number(e.target.value),
                            }
                          : x,
                      ),
                    )
                  }
                />
                <input
                  className={inputClass}
                  placeholder="Unit / lot"
                  value={m.unit ?? ''}
                  onChange={(e) =>
                    setMaterials(
                      materials.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)),
                    )
                  }
                />
              </div>
            ))}
            <Button
              variant="ghost"
              className="mt-1"
              onClick={() => setMaterials([...materials, { product: '' }])}
            >
              + material
            </Button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={submit}>
            {submitLabel}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
