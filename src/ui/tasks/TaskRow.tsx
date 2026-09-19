import { useState, type HTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { targetLabel } from '@/engine/logs'
import { daysBetween, dueState, lastDone } from '@/engine/tasks'
import { categoryLabel } from '@/model/categories'
import type { Task } from '@/model/types'
import { useTaskDrag, type DropIndicator } from './useTaskDrag'

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

/** One task line: a big checkbox, the title, chips, and its subtasks folded underneath. */
export function TaskRow({
  task,
  today,
  onCheck,
  showBucket,
  compact,
  dragProps,
  dropIndicator,
  handle,
}: {
  task: Task
  today: string
  /** Absent: no checkbox (the task page header or a done list). */
  onCheck?: (task: Task) => void
  showBucket?: string
  compact?: boolean
  dragProps?: HTMLAttributes<HTMLLIElement> & { draggable?: boolean }
  dropIndicator?: DropIndicator
  /** Show a drag handle on a desktop. */
  handle?: boolean
}) {
  const state = useFarmStore((s) => s.state)
  const logs = live.logs(state)
  const [expanded, setExpanded] = useState(false)
  const recurring = task.bucket === 'recurring'
  const due = recurring ? dueState(task, logs, today) : null
  const children = live
    .tasks(state)
    .filter((t) => t.projectId === task.id)
    .sort((a, b) => Number(a.done ?? false) - Number(b.done ?? false) || a.order - b.order)
  const openChildren = children.filter((t) => !t.done)

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
      {...dragProps}
      className={clsx(
        'group/row relative flex items-start gap-2 py-2',
        due === 'out-of-season' && 'opacity-50',
        task.done && 'opacity-60',
        dropIndicator === 'before' && 'shadow-[inset_0_2px_0_0_theme(colors.lime.600)]',
        dropIndicator === 'after' && 'shadow-[inset_0_-2px_0_0_theme(colors.lime.600)]',
      )}
    >
      {handle && (
        <span
          aria-hidden
          className="mt-1 hidden w-3 shrink-0 cursor-grab select-none text-stone-300 group-hover/row:text-stone-500 md:block"
          title="Drag to reorder or move"
        >
          ⋮⋮
        </span>
      )}
      {onCheck && !task.done && task.bucket !== 'project' && (
        <button
          type="button"
          onClick={() => onCheck(task)}
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
        {children.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            aria-expanded={expanded}
            className="mt-0.5 text-xs text-stone-500 underline decoration-dotted dark:text-stone-400"
          >
            {expanded ? '▾' : '▸'} {openChildren.length} of {children.length} subtasks open
          </button>
        )}
        {expanded && children.length > 0 && (
          <Subtasks parent={task} items={children} today={today} onCheck={onCheck} />
        )}
      </div>
    </li>
  )
}

function Subtasks({
  parent,
  items,
  today,
  onCheck,
}: {
  parent: Task
  items: Task[]
  today: string
  onCheck?: (task: Task) => void
}) {
  const open = items.filter((t) => !t.done)
  const drag = useTaskDrag(open, { bucket: parent.bucket, projectId: parent.id })
  return (
    <ul
      {...drag.containerProps}
      className={clsx(
        'mt-1 border-l-2 border-stone-100 pl-3 dark:border-stone-800',
        drag.overEnd && 'border-lime-600',
      )}
    >
      {items.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          today={today}
          onCheck={onCheck}
          compact
          handle
          dragProps={t.done ? undefined : drag.rowProps(t)}
          dropIndicator={drag.indicator(t.id)}
        />
      ))}
    </ul>
  )
}
