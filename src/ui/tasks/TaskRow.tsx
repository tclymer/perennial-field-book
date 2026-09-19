import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { targetLabel } from '@/engine/logs'
import { daysBetween, dueState, lastDone } from '@/engine/tasks'
import { categoryLabel } from '@/model/categories'
import type { Task } from '@/model/types'

/** "last done 3 days ago", "never done", for a recurring task. */
export function lastDoneText(
  task: Task,
  logs: ReturnType<typeof live.logs>,
  today: string,
): string {
  const last = lastDone(task, logs)
  if (!last) return 'never done'
  const d = daysBetween(last, today)
  if (d <= 0) return 'done today'
  if (d === 1) return 'done yesterday'
  return `last done ${d} days ago`
}

/** One task line: a big checkbox, the title, and small chips for what the app knows. */
export function TaskRow({
  task,
  today,
  onCheck,
  showBucket,
  compact,
}: {
  task: Task
  today: string
  /** Absent: no checkbox (the task page or a done list). */
  onCheck?: () => void
  showBucket?: string
  compact?: boolean
}) {
  const state = useFarmStore((s) => s.state)
  const logs = live.logs(state)
  const recurring = task.bucket === 'recurring'
  const due = recurring ? dueState(task, logs, today) : null
  const chips: { text: string; tone?: 'warn' | 'muted' }[] = []
  if (recurring) {
    chips.push({
      text: lastDoneText(task, logs, today),
      tone: due === 'due' || due === 'stale' ? 'warn' : 'muted',
    })
  }
  for (const t of task.targets) chips.push({ text: targetLabel(state, t) })
  if (task.category) chips.push({ text: categoryLabel(task.category, state.farm?.categories) })
  if (task.ownerId) chips.push({ text: state.people[task.ownerId]?.name ?? 'owner' })
  if (task.season) chips.push({ text: task.season, tone: 'muted' })
  if (task.needsDiscussion) chips.push({ text: 'discuss', tone: 'warn' })
  if (showBucket) chips.push({ text: showBucket, tone: 'muted' })

  return (
    <li
      className={clsx(
        'flex items-start gap-3 py-2',
        due === 'out-of-season' && 'opacity-50',
        task.done && 'opacity-60',
      )}
    >
      {onCheck && (
        <button
          type="button"
          onClick={onCheck}
          aria-label={recurring ? `Did: ${task.title}` : `Done: ${task.title}`}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-stone-400 text-transparent hover:border-lime-700 hover:text-lime-700 dark:border-stone-500"
        >
          ✓
        </button>
      )}
      <div className="min-w-0 flex-1">
        <Link
          to={`/tasks/${task.id}`}
          className={clsx('block text-[15px] leading-snug', task.done && 'line-through')}
        >
          {task.title}
        </Link>
        {!compact && chips.length > 0 && (
          <p className="mt-0.5 flex flex-wrap gap-1 text-xs">
            {chips.map((c, i) => (
              <span
                key={i}
                className={clsx(
                  'rounded-full px-2 py-0.5',
                  c.tone === 'warn'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                    : c.tone === 'muted'
                      ? 'text-stone-500 dark:text-stone-400'
                      : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
                )}
              >
                {c.text}
              </span>
            ))}
          </p>
        )}
      </div>
    </li>
  )
}
