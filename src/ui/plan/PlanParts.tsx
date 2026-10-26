/**
 * Pieces the week planner shares between the phone's Today and the desktop's Week view
 * (DESIGN.md §3.10): a task on a day, who it is for, the Plan chip, and one-tap check-off
 * with Undo and Add time.
 */
import { useCallback, useState, type HTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import type { NewEvent } from '@/events/types'
import {
  dayLong,
  dayShort,
  nextWeek,
  planDay,
  workDaysOf,
  workingWeek,
  type PlanItem,
} from '@/engine/plan'
import type { Task } from '@/model/types'
import { isHolder, isProject, openSteps } from '@/engine/tasks'
import { useDevice } from '@/state/device'
import { currentPerson } from '@/state/people'
import { assignTask, planTask, quickDone, takeTask, uncheck } from '@/state/planActions'
import { undoEvents, updateLog } from '@/state/taskActions'
import { inputClass } from '@/ui/components'
import { DoneSheet } from '@/ui/tasks/DoneSheet'
import { Toast } from '@/ui/tasks/Toast'
import { TASK_DRAG_TYPE } from '@/ui/tasks/useTaskDrag'

export interface Notice {
  message: string
  undo?: NewEvent[]
  action?: { label: string; run: () => void }
}

/**
 * The toast and the Add time sheet a planner page needs, and the one-tap check-off that
 * feeds them. `notify` is for anything else worth an Undo.
 */
export function usePlanNotices(today: string) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [timing, setTiming] = useState<{ logId: string; task: Task } | null>(null)
  const close = useCallback(() => setNotice(null), [])

  const done = (task: Task) => {
    const { undo, logId } = quickDone(task.id, today)
    const verb = isProject(task) ? 'Worked on' : task.bucket === 'recurring' ? 'Did' : 'Done'
    const parent = task.projectId ? useFarmStore.getState().state.tasks[task.projectId] : undefined
    const finished = parent?.done ? ` That finishes ${parent.title}.` : ''
    setNotice({
      message: `${verb}: ${task.title}.${finished}`,
      undo,
      ...(logId ? { action: { label: 'Add time', run: () => setTiming({ logId, task }) } } : {}),
    })
  }

  const overlays = (
    <>
      {timing && (
        <DoneSheet
          title={`Time on ${timing.task.title}`}
          submitLabel="Save"
          initial={(() => {
            const log = useFarmStore.getState().state.logs[timing.logId]
            return {
              durationMinutes: log?.durationMinutes,
              personIds: log?.personIds,
              date: log?.date,
            }
          })()}
          onSubmit={(v) => {
            updateLog(timing.logId, {
              date: v.date,
              personIds: v.personIds,
              durationMinutes: v.durationMinutes ?? null,
              ...(v.notes ? { notes: v.notes } : {}),
            })
            setTiming(null)
          }}
          onClose={() => setTiming(null)}
        />
      )}
      {notice && (
        <Toast
          message={notice.message}
          onUndo={notice.undo?.length ? () => undoEvents(notice.undo!) : undefined}
          action={notice.action}
          onClose={close}
        />
      )}
    </>
  )

  return { done, notify: setNotice, overlays }
}

/** Who a task is for: their name, or Anyone with a one-tap claim. Changeable in place. */
export function OwnerChip({ task, notify }: { task: Task; notify: (n: Notice) => void }) {
  const state = useFarmStore((s) => s.state)
  const people = live.people(state).filter((p) => p.active || p.id === task.ownerId)
  const owner = task.ownerId ? state.people[task.ownerId] : undefined
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1">
      <select
        aria-label={`Who does ${task.title}`}
        className={clsx(
          inputClass,
          'w-auto rounded-full py-0 pl-2 pr-6 text-xs',
          !owner && 'text-stone-500 dark:text-stone-400',
        )}
        value={owner ? owner.id : ''}
        onChange={(e) => {
          const undo = assignTask(task.id, e.target.value || null)
          const name = e.target.value ? state.people[e.target.value]?.name : 'Anyone'
          notify({ message: `${task.title}: ${name}.`, undo })
        }}
      >
        <option value="">Anyone</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {!owner && (
        <button
          type="button"
          onClick={() => {
            const undo = takeTask(task.id)
            if (undo.length) notify({ message: `${task.title} is yours.`, undo })
          }}
          className="whitespace-nowrap rounded-full bg-lime-100 px-2 py-0.5 text-xs text-lime-900 dark:bg-lime-900/50 dark:text-lime-100"
        >
          I'll take it
        </button>
      )}
    </span>
  )
}

/** ↻2: worked days a task has slid. */
export function Rolled({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span
      className="text-xs tabular-nums text-amber-700 dark:text-amber-300"
      title={`Rolled over ${n} working ${n === 1 ? 'day' : 'days'}`}
    >
      ↻{n}
    </span>
  )
}

/** A task on a day: a box, the title, how far it slid, and who it is for. */
export function PlanRow({
  item,
  onDone,
  notify,
  draggable,
  compact,
}: {
  item: PlanItem
  onDone: (task: Task) => void
  notify: (n: Notice) => void
  /** Desktop: drag onto another day or back to the lists. */
  draggable?: boolean
  compact?: boolean
}) {
  const { task, rolled, settled, parent } = item
  const worked = isProject(task)
  const dragProps: HTMLAttributes<HTMLLIElement> = draggable
    ? {
        draggable: true,
        onDragStart: (e) => {
          e.dataTransfer.setData(TASK_DRAG_TYPE, task.id)
          e.dataTransfer.effectAllowed = 'move'
        },
      }
    : {}
  return (
    <li {...dragProps} className={clsx('flex items-start gap-2 py-2', draggable && 'cursor-grab')}>
      {settled ? (
        <button
          type="button"
          onClick={() => {
            // Tapping a done task's box takes the check-off back.
            const undo = uncheck(task.id)
            if (undo.length) notify({ message: `Not done: ${task.title}.`, undo })
          }}
          aria-label={`Not done: ${task.title}`}
          title="Checked by mistake? Tap to take it back"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-lime-700 text-white hover:bg-lime-800"
        >
          ✓
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onDone(task)}
          aria-label={worked ? `Worked on: ${task.title}` : `Done: ${task.title}`}
          title={worked ? 'Worked on it today; the project stays open' : 'Done'}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-stone-400 text-transparent hover:border-lime-700 hover:text-lime-700 dark:border-stone-500"
        >
          ✓
        </button>
      )}
      <div className="min-w-0 flex-1">
        <Link
          to={`/tasks/${task.id}`}
          className={clsx(
            'block text-[15px] leading-snug',
            settled && 'text-stone-500 line-through dark:text-stone-400',
          )}
        >
          {parent && <span className="text-stone-500 dark:text-stone-400">{parent.title} · </span>}
          {task.title}
        </Link>
        {!settled && (
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            {worked && <span className="text-stone-500 dark:text-stone-400">project</span>}
            <Rolled n={rolled} />
            {!compact && <OwnerChip task={task} notify={notify} />}
          </p>
        )}
      </div>
    </li>
  )
}

/** The days a task can be planned onto from here: today and the rest of this week. */
export function plannableDays(
  state: ReturnType<typeof useFarmStore.getState>['state'],
  today: string,
) {
  const workDays = workDaysOf(state.farm)
  const now = planDay(today, workDays)
  return workingWeek(today, workDays).filter((d) => d >= now)
}

/** The worked days of next week, for planning ahead. */
export function nextWeekDays(
  state: ReturnType<typeof useFarmStore.getState>['state'],
  today: string,
) {
  return nextWeek(today, workDaysOf(state.farm))
}

/**
 * Put a task on a day from a phone, where dragging between days is clumsy and two taps is
 * not: "Plan" opens the week's days; the task's own day is marked, and tapping it again
 * takes the task off.
 */
export function PlanChip({
  task,
  today,
  notify,
}: {
  task: Task
  today: string
  notify: (n: Notice) => void
}) {
  const state = useFarmStore((s) => s.state)
  const [open, setOpen] = useState(false)
  // A holder is never on a day; what goes on days is its steps (DESIGN.md §3.10).
  const steps = isHolder(state, task)
    ? openSteps(state, task.id).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
    : null
  const ahead = nextWeekDays(state, today)
  const shownDay =
    task.plannedFor && !steps
      ? `${task.plannedFor >= ahead[0]! ? 'Next ' : ''}${dayShort(task.plannedFor)}`
      : null
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={steps ? `Plan a step of ${task.title}` : `Plan ${task.title} for a day`}
        className="rounded-full px-2 py-0.5 text-stone-500 underline decoration-dotted hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
      >
        {steps ? 'Plan a step' : (shownDay ?? 'Plan')}
      </button>
      {open && !steps && (
        <DayChips task={task} today={today} notify={notify} onChosen={() => setOpen(false)} />
      )}
      {open && steps && (
        <span className="block w-full space-y-1 pt-1">
          {steps.map((step) => (
            <span key={step.id} className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-stone-700 dark:text-stone-300">{step.title}</span>
              <DayChips task={step} today={today} notify={notify} />
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

/**
 * The days left this week as chips, then "Next week ›" opening the week after; the task's own
 * day is marked, and tapping it clears it.
 */
export function DayChips({
  task,
  today,
  notify,
  onChosen,
}: {
  task: Task
  today: string
  notify: (n: Notice) => void
  onChosen?: () => void
}) {
  const state = useFarmStore((s) => s.state)
  const days = plannableDays(state, today)
  const ahead = nextWeekDays(state, today)
  const now = planDay(today, workDaysOf(state.farm))
  const [showAhead, setShowAhead] = useState(
    () => !!task.plannedFor && task.plannedFor >= ahead[0]!,
  )
  const chip = (d: string, label: string) => (
    <button
      key={d}
      type="button"
      onClick={() => choose(task.plannedFor === d ? null : d)}
      aria-pressed={task.plannedFor === d}
      aria-label={`${task.title}: ${d === now ? 'today' : dayLong(d, now).toLowerCase()}`}
      className={clsx(
        'rounded-full border px-2 py-0.5',
        task.plannedFor === d
          ? 'border-lime-700 bg-lime-700 text-white'
          : 'border-stone-300 dark:border-stone-600',
      )}
    >
      {label}
    </button>
  )
  const choose = (day: string | null) => {
    const undo = planTask(task.id, day)
    onChosen?.()
    notify({
      message: day
        ? `${task.title}: ${dayLong(day, now).toLowerCase()}.`
        : `${task.title}: no day.`,
      undo,
    })
  }
  return (
    <>
      {days.map((d) => chip(d, d === now ? 'Today' : dayShort(d)))}
      <button
        type="button"
        onClick={() => setShowAhead((s) => !s)}
        aria-expanded={showAhead}
        className="rounded-full px-2 py-0.5 text-stone-500 underline decoration-dotted dark:text-stone-400"
      >
        Next week {showAhead ? '‹' : '›'}
      </button>
      {showAhead && (
        <span className="flex basis-full flex-wrap gap-1">
          {ahead.map((d) => chip(d, `${dayShort(d)} ${Number(d.slice(8))}`))}
        </span>
      )}
    </>
  )
}

/** The name of whoever is holding this phone, for "Yours". */
export function useMe(): string | null {
  useDevice((s) => s.personId)
  useFarmStore((s) => s.state.people)
  return currentPerson()?.id ?? null
}
