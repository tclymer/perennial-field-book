import { useState } from 'react'
import { nextFirstOf, nextSeasonStart } from '@/engine/tasks'
import type { NewEvent } from '@/events/types'
import type { Task } from '@/model/types'
import { restTask } from '@/state/taskActions'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The month a task comes back, by name. */
export function monthName(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'long' })
}

/**
 * Put a recurring task away until its season comes round again. The last kiwi prune of the
 * year is only known to be the last one afterwards, and until then the plate sits on the list
 * looking stale. A task with months set goes back to its next season on one tap; one without
 * asks which month to bring it back.
 */
export function SeasonDone({
  task,
  today,
  onRested,
}: {
  task: Task
  today: string
  onRested: (message: string, undo: NewEvent[]) => void
}) {
  const [asking, setAsking] = useState(false)
  const rest = (until: string) => {
    const undo = restTask(task.id, until)
    setAsking(false)
    onRested(`${task.title}: done for the season, back in ${monthName(until)}.`, undo)
  }
  const next = nextSeasonStart(task, today)

  return (
    <span className="contents">
      <button
        type="button"
        onClick={() => (next ? rest(next) : setAsking((a) => !a))}
        aria-expanded={next ? undefined : asking}
        title={next ? `Put away until ${monthName(next)}` : 'Put away until a month you pick'}
        className="rounded-full px-2 py-0.5 text-stone-500 underline decoration-dotted hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
      >
        Done for the season
      </button>
      {asking && (
        <span className="flex w-full flex-wrap items-center gap-1 pt-1">
          <span className="text-stone-500 dark:text-stone-400">Back in</span>
          {MONTHS.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => rest(nextFirstOf(i + 1, today))}
              className="rounded-full border border-stone-300 px-2 py-0.5 dark:border-stone-600"
            >
              {m}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
