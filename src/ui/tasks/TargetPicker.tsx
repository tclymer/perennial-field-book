import { useState } from 'react'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { positions } from '@/state/derived'
import { targetLabel } from '@/engine/logs'
import type { Target } from '@/model/types'
import { inputClass } from '@/ui/components'

function sameTarget(a: Target, b: Target): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'farm') return true
  if (a.kind === 'tree' && b.kind === 'tree') return a.posKey === b.posKey
  if (a.kind === 'species' && b.kind === 'species') return a.species === b.species
  return 'id' in a && 'id' in b && a.id === b.id
}

/** Chips for what a task or log points at, with a picker to add a place, a tree, or the farm. */
export function TargetPicker({
  targets,
  onChange,
}: {
  targets: Target[]
  onChange: (targets: Target[]) => void
}) {
  const state = useFarmStore((s) => s.state)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const remove = (t: Target) => onChange(targets.filter((x) => !sameTarget(x, t)))
  const add = (t: Target) => {
    if (!targets.some((x) => sameTarget(x, t))) onChange([...targets, t])
    setOpen(false)
    setQuery('')
  }

  const q = query.trim().toLowerCase()
  const options: { label: string; target: Target }[] = []
  if (!q || 'whole farm'.includes(q))
    options.push({ label: 'Whole farm', target: { kind: 'farm' } })
  const species = new Set(
    live
      .blocks(state)
      .map((b) => b.species?.trim())
      .filter((s): s is string => Boolean(s)),
  )
  for (const sp of species) {
    const label = `All ${sp} blocks`
    if (!q || label.toLowerCase().includes(q))
      options.push({ label, target: { kind: 'species', species: sp } })
  }
  for (const b of live.blocks(state)) {
    const label = `${b.code} ${b.name}`
    if (!q || label.toLowerCase().includes(q))
      options.push({ label, target: { kind: 'block', id: b.id } })
  }
  for (const f of live.features(state)) {
    if (!q || f.name.toLowerCase().includes(q))
      options.push({ label: f.name, target: { kind: 'feature', id: f.id } })
  }
  for (const r of live.rows(state)) {
    const b = state.blocks[r.blockId]
    const label = `${b?.code ?? ''} row ${r.number}`
    if (q && label.toLowerCase().includes(q))
      options.push({ label, target: { kind: 'row', id: r.id } })
  }
  if (q.length >= 2) {
    for (const p of positions(state)) {
      if (p.label.toLowerCase().includes(q))
        options.push({ label: p.label, target: { kind: 'tree', posKey: p.posKey } })
      if (options.length > 40) break
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {targets.map((t, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-1 text-xs"
          >
            {targetLabel(state, t)}
            <button
              type="button"
              aria-label={`Remove ${targetLabel(state, t)}`}
              onClick={() => remove(t)}
              className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={clsx(
            'rounded-full border border-dashed border-stone-300 dark:border-stone-600 px-2.5 py-1 text-xs text-stone-500 dark:text-stone-400',
            open && 'border-lime-600 text-lime-700',
          )}
        >
          {targets.length ? '+ place' : '+ where'}
        </button>
      </div>
      {open && (
        <div className="rounded-md border border-stone-200 dark:border-stone-700 p-2">
          <input
            className={clsx(inputClass, 'w-full')}
            placeholder="Block, row, tree label, building…"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="mt-1 max-h-48 overflow-y-auto text-sm">
            {options.slice(0, 40).map((o, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => add(o.target)}
                  className="w-full rounded px-2 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  {o.label}
                </button>
              </li>
            ))}
            {options.length === 0 && (
              <li className="px-2 py-1 text-stone-500 dark:text-stone-400">Nothing matches.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
