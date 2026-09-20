import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'

const LogsPage = lazy(() => import('./LogsPage'))
const HarvestReportsPage = lazy(() => import('./HarvestReportsPage'))
const PlannerPage = lazy(() => import('./PlannerPage'))

type Section = 'work' | 'harvest' | 'planner'

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: 'work', label: 'Work', hint: 'Hours logged, by whom, where, and on what' },
  { id: 'harvest', label: 'Harvest', hint: 'What came in, by variety, place, and year' },
  { id: 'planner', label: 'Against the plan', hint: 'A season beside what the plan assumed' },
]

/**
 * Everything that looks back at a season, in one place: the three used to be three tabs in a
 * ten-tab bar, and none of them is a daily job.
 */
export default function RecordsPage() {
  const [params, setParams] = useSearchParams()
  const section = (params.get('show') as Section | null) ?? 'work'
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setParams(s.id === 'work' ? {} : { show: s.id }, { replace: true })}
            aria-pressed={current.id === s.id}
            title={s.hint}
            className={clsx(
              'rounded-full border px-3 py-1 text-sm',
              current.id === s.id
                ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                : 'border-stone-300 text-stone-700 dark:border-stone-600 dark:text-stone-300',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <Suspense fallback={<p className="text-stone-500 dark:text-stone-400">Loading…</p>}>
        {current.id === 'work' && <LogsPage />}
        {current.id === 'harvest' && <HarvestReportsPage />}
        {current.id === 'planner' && <PlannerPage />}
      </Suspense>
    </div>
  )
}
