import { useFarmStore } from '@/state/store'
import { setCoverage } from '@/state/plannerActions'
import { coverageOf, type Coverage } from '@/engine/compare'
import { allCategories } from '@/model/categories'
import { Link } from 'react-router-dom'
import { Card, inputClass } from '@/ui/components'

const LEVELS: { value: Coverage; label: string }[] = [
  { value: 'complete', label: 'Everything is logged' },
  { value: 'partial', label: 'Some of it is logged' },
  { value: 'untracked', label: 'Not logged at all' },
]

/**
 * How completely each category is recorded. The planner comparison only proposes changing an
 * estimate from a category marked complete, so half-kept records cannot quietly make the
 * plan look better than reality.
 */
export function CoverageCard() {
  const state = useFarmStore((s) => s.state)
  return (
    <Card>
      <h2 className="font-semibold">How completely do you track each kind of work?</h2>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        Used only by the{' '}
        <Link to="/planner" className="underline decoration-dotted">
          planner comparison
        </Link>
        . A category where some work goes unlogged would make the plan look cheaper than it is, so
        only the ones you mark as fully logged can change the planner's estimates.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {allCategories(state.farm?.categories).map((c) => (
          <label key={c.id} className="flex flex-col gap-1 text-sm">
            <span className="text-stone-600 dark:text-stone-400">{c.label}</span>
            <select
              className={inputClass}
              value={coverageOf(state, c.id)}
              onChange={(e) => setCoverage(c.id, e.target.value as Coverage)}
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </Card>
  )
}
