import { useState } from 'react'
import { useFarmStore } from '@/state/store'
import { varietiesByName } from '@/state/derived'
import { createVariety } from '@/state/actions'
import { inputClass } from '@/ui/components'

/**
 * Pick an existing variety or type a new one. A new name is created when the picker is
 * committed, so a graft recorded in the field never waits on a separate page.
 */
export function VarietyPicker({
  value,
  onChange,
  species,
  autoFocus,
  startAdding,
  onCancel,
}: {
  value: string | null
  onChange: (varietyId: string | null) => void
  /** Species a new variety belongs to, when known. */
  species?: string
  autoFocus?: boolean
  /** Open straight on the new-variety form. */
  startAdding?: boolean
  /** Called when the new-variety form is dismissed without adding. */
  onCancel?: () => void
}) {
  const state = useFarmStore((s) => s.state)
  const varieties = varietiesByName(state)
  const [adding, setAdding] = useState(Boolean(startAdding) || varieties.length === 0)
  const [name, setName] = useState('')
  const [sp, setSp] = useState(species ?? '')

  if (adding) {
    const add = () => {
      if (!name.trim()) return
      const id = createVariety({ species: sp.trim() || 'unknown', name: name.trim() })
      onChange(id)
      setAdding(false)
      setName('')
    }
    return (
      <div
        className="space-y-2 rounded-md border border-lime-300 dark:border-lime-800 bg-lime-50/60 dark:bg-lime-950/30 p-2.5"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
      >
        <div className="text-sm font-medium">New variety</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-stone-600 dark:text-stone-400">Name</span>
            <input
              className={inputClass}
              value={name}
              placeholder="Shenandoah"
              autoFocus={autoFocus ?? true}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-stone-600 dark:text-stone-400">Species</span>
            <input
              className={inputClass}
              value={sp}
              placeholder="pawpaw"
              onChange={(e) => setSp(e.target.value)}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={add}
            className="rounded-md border border-lime-700 bg-lime-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-lime-800 disabled:opacity-50"
            disabled={!name.trim()}
          >
            Add variety
          </button>
          {(varieties.length > 0 || onCancel) && (
            <button
              type="button"
              className="text-xs underline decoration-dotted"
              onClick={() => {
                setAdding(false)
                onCancel?.()
              }}
            >
              cancel
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={inputClass}
        value={value ?? ''}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">unknown</option>
        {varieties.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.species ? ` (${v.species})` : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="text-xs underline decoration-dotted"
        onClick={() => setAdding(true)}
      >
        new variety
      </button>
    </div>
  )
}
