import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { setCostItemCategory } from '@/state/plannerActions'
import {
  basisUnit,
  guessCategory,
  laborItems,
  parseBackup,
  type PlannerBackup,
} from '@/engine/compare'
import { allCategories, categoryLabel } from '@/model/categories'
import { Card, PageHeader, Pill, inputClass } from '@/ui/components'

/**
 * Which kind of work feeds which line of the plan. Guessed from the planner's own labels and
 * corrected here; the comparison uses this to decide what a measured rate is measuring.
 */
export default function CategoryMapPage() {
  const state = useFarmStore((s) => s.state)
  const [farm, setFarm] = useState<PlannerBackup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const categories = allCategories(state.farm?.categories)
  const blocks = live.blocks(state)

  const open = async (file: File) => {
    setError(null)
    try {
      setFarm(parseBackup(await file.text()).farm)
    } catch (err) {
      setFarm(null)
      setError(err instanceof Error ? err.message : 'That file could not be read.')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Which work feeds which line"
        subtitle="Only labor lines appear; the rest of the plan needs no records."
      >
        <Link to="/planner" className="text-sm underline decoration-dotted">
          Back to the comparison
        </Link>
      </PageHeader>

      <Card>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Open the same planner backup. Each labor line is matched to a kind of work by its name;
          correct any that are wrong. The choices are saved with the farm, so this is a one-time
          job.
        </p>
        <label className="mt-3 block text-sm">
          <span className="mr-2 text-stone-600 dark:text-stone-400">Planner backup:</span>
          <input
            type="file"
            accept=".json,application/json"
            className="text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void open(f)
              e.target.value = ''
            }}
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
            {error}
          </p>
        )}
      </Card>

      {farm?.plantings.map((p) => {
        const items = laborItems(p)
        if (items.length === 0) return null
        const block = blocks.find((b) => b.planner?.plantingId === p.id)
        return (
          <Card key={p.id}>
            <h2 className="font-semibold">
              {p.name}
              {block ? (
                <span className="ml-2 text-sm font-normal text-stone-500 dark:text-stone-400">
                  {block.code} {block.name}
                </span>
              ) : (
                <Pill tone="warn" className="ml-2">
                  no block linked
                </Pill>
              )}
            </h2>
            <ul className="mt-2 divide-y divide-stone-100 text-sm dark:divide-stone-800">
              {items.map((item) => {
                const saved = state.farm?.costItemMap?.[p.id]?.[item.id]
                const guess = guessCategory(item.label)
                const value = saved ?? guess ?? ''
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="min-w-40 flex-1">
                      {item.label}
                      <span className="ml-2 text-xs text-stone-500 dark:text-stone-400">
                        {item.quantity ?? 0} {basisUnit(item)}
                      </span>
                    </span>
                    <select
                      className={inputClass}
                      value={value}
                      aria-label={`Work behind ${item.label}`}
                      onChange={(e) => setCostItemCategory(p.id, item.id, e.target.value)}
                    >
                      <option value="">Nothing recorded for this</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {saved === undefined && guess && (
                      <span className="text-xs text-stone-500 dark:text-stone-400">
                        guessed {categoryLabel(guess, state.farm?.categories).toLowerCase()}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}
