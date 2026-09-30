import { useState, type HTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { targetLabel } from '@/engine/logs'
import { daysBetween, dueState, isResting, lastDone } from '@/engine/tasks'
import type { NewEvent } from '@/events/types'
import { categoryLabel } from '@/model/categories'
import type { Task } from '@/model/types'
import { SeasonDone, monthName } from './SeasonDone'
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
  onDelete,
  showBucket,
  compact,
  dragProps,
  dropIndicator,
  handle,
  handleProps,
  lifted,
  onRest,
}: {
  task: Task
  today: string
  /** Absent: no checkbox (the task page header or a done list). */
  onCheck?: (task: Task) => void
  /** Absent: no delete button. */
  onDelete?: (task: Task) => void
  showBucket?: string
  compact?: boolean
  dragProps?: HTMLAttributes<HTMLLIElement> & { draggable?: boolean }
  dropIndicator?: DropIndicator
  /** Show a drag handle: hover to see it with a mouse, always there on a touch screen. */
  handle?: boolean
  /** Pointer handlers for the handle, so a finger can drag where native drag does not work. */
  handleProps?: HTMLAttributes<HTMLElement>
  /** This row is being carried by a finger. */
  lifted?: boolean
  /** Offer "Done for the season" on a recurring task in season; reports it for an Undo. */
  onRest?: (message: string, undo: NewEvent[]) => void
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
  const resting = recurring && isResting(task, today)
  if (resting) {
    chips.push({
      text: `done for the season, back in ${monthName(task.restUntil!)}`,
      tone: 'muted',
    })
  } else if (recurring) {
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
        lifted && 'bg-lime-50 dark:bg-lime-950',
        dropIndicator === 'before' && 'shadow-[inset_0_2px_0_0_theme(colors.lime.600)]',
        dropIndicator === 'after' && 'shadow-[inset_0_-2px_0_0_theme(colors.lime.600)]',
      )}
    >
      {handle && (
        <span
          aria-hidden
          {...handleProps}
          className="-my-1 -ml-1 flex w-7 shrink-0 cursor-grab select-none items-center justify-center self-stretch text-stone-400 md:ml-0 md:w-3 md:text-stone-300 md:group-hover/row:text-stone-500"
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
            {onRest && recurring && due !== 'out-of-season' && (
              <SeasonDone task={task} today={today} onRested={onRest} />
            )}
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
          <Subtasks
            parent={task}
            items={children}
            today={today}
            onCheck={onCheck}
            onDelete={onDelete}
          />
        )}
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(task)}
          aria-label={`Delete ${task.title}`}
          title="Delete (undo from the toast or Settings)"
          className="mt-0.5 shrink-0 rounded px-1.5 text-base leading-none text-stone-300 hover:bg-stone-100 hover:text-rose-600 dark:text-stone-600 dark:hover:bg-stone-800 md:opacity-0 md:group-hover/row:opacity-100"
        >
          ×
        </button>
      )}
    </li>
  )
}

function Subtasks({
  parent,
  items,
  today,
  onCheck,
  onDelete,
}: {
  parent: Task
  items: Task[]
  today: string
  onCheck?: (task: Task) => void
  onDelete?: (task: Task) => void
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
          onDelete={onDelete}
          compact
          handle
          dragProps={t.done ? undefined : drag.rowProps(t)}
          handleProps={t.done ? undefined : drag.handleProps(t)}
          lifted={drag.touching === t.id}
          dropIndicator={drag.indicator(t.id)}
        />
      ))}
    </ul>
  )
}
