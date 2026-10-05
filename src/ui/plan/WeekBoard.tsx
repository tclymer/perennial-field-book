import { useState, type DragEvent, type HTMLAttributes } from 'react'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { dayLong, dayShort, loadLabel, weekPlan, type PlanDay } from '@/engine/plan'
import { bucketName } from '@/engine/tasks'
import type { Bucket, Task } from '@/model/types'
import { backToList, keepForToday, planTask } from '@/state/planActions'
import { Button, Card } from '@/ui/components'
import { QuickAdd } from '@/ui/tasks/QuickAdd'
import { TASK_DRAG_TYPE } from '@/ui/tasks/useTaskDrag'
import { PlanRow, Rolled, usePlanNotices } from './PlanParts'

/** The lists the tray offers for planning, in the order they are usually drawn from. */
const TRAY: Bucket[] = ['now', 'soon', 'recurring', 'project']

const carried = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(TASK_DRAG_TYPE)

/**
 * The desktop's week (DESIGN.md §3.10): a column per working day, and the lists down the side
 * to drag from. Dropping on a day plans a task for it; dropping on the tray takes it off.
 */
export function WeekBoard({ today }: { today: string }) {
  const state = useFarmStore((s) => s.state)
  const plan = weekPlan(state, today)
  const { done, notify, overlays } = usePlanNotices(today)
  const [over, setOver] = useState<string | null>(null)

  const dropOn = (day: string | null) => (e: DragEvent) => {
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE)
    setOver(null)
    if (!id) return
    e.preventDefault()
    const task = state.tasks[id]
    if (!task || (task.plannedFor ?? null) === day) return
    const undo = planTask(id, day)
    notify({
      message: day
        ? `${task.title}: ${dayLong(day, plan.today).toLowerCase()}.`
        : `${task.title}: back in its list.`,
      undo,
    })
  }
  const target = (key: string, day: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!carried(e)) return
      e.preventDefault()
      setOver(key)
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget === e.target) setOver(null)
    },
    onDrop: dropOn(day),
  })

  return (
    <div className="space-y-3">
      {plan.stillOn.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <h2 className="font-semibold">Still on?</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Slid three working days or more. Keep one for today, put it back in its list, or drag it
            onto a day.
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {plan.stillOn.map(({ task, rolled }) => (
              <li
                key={task.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(TASK_DRAG_TYPE, task.id)}
                className="flex cursor-grab items-center gap-2 rounded-md border border-stone-200 px-2 py-1 dark:border-stone-700"
              >
                <span>
                  {task.title} <Rolled n={rolled} />
                </span>
                <Button
                  onClick={() =>
                    notify({ message: `${task.title}: today.`, undo: keepForToday(task.id, today) })
                  }
                >
                  Keep for today
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    notify({
                      message: `${task.title}: back in its list.`,
                      undo: backToList(task.id),
                    })
                  }
                >
                  Back to the list
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-[17rem_1fr]">
        <Card
          className={clsx('h-fit', over === 'tray' && 'ring-2 ring-lime-600')}
          {...target('tray', null)}
        >
          <h2 className="font-semibold">Not on a day</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Drag onto a day. Drag a day's task back here to take it off.
          </p>
          {TRAY.map((b) => (
            <TrayList key={b} bucket={b} />
          ))}
        </Card>

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${plan.days.length}, minmax(0, 1fr))` }}
        >
          {plan.days.map((d) => (
            <DayColumn
              key={d.date}
              day={d}
              planToday={plan.today}
              highlight={over === d.date}
              dropProps={target(d.date, d.date)}
              onDone={done}
              notify={notify}
            />
          ))}
        </div>
      </div>
      {plan.later.length > 0 && (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Next week: {plan.later.map((i) => i.task.title).join(' · ')}
        </p>
      )}
      {overlays}
    </div>
  )
}

function DayColumn({
  day,
  planToday,
  highlight,
  dropProps,
  onDone,
  notify,
}: {
  day: PlanDay
  planToday: string
  highlight: boolean
  dropProps: HTMLAttributes<HTMLDivElement>
  onDone: (task: Task) => void
  notify: ReturnType<typeof usePlanNotices>['notify']
}) {
  const past = day.date < planToday
  return (
    <Card
      className={clsx(
        'flex min-h-48 min-w-0 flex-col',
        day.isToday && 'border-lime-600 dark:border-lime-500',
        past && 'opacity-70',
        highlight && 'ring-2 ring-lime-600',
      )}
      {...dropProps}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          {day.isToday ? 'Today' : dayShort(day.date)}{' '}
          <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
            {Number(day.date.slice(8))}
          </span>
        </h2>
        <span className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
          {loadLabel(day)}
        </span>
      </div>
      {!past && (
        <div className="mt-1">
          <QuickAdd bucket="now" plannedFor={day.date} placeholder="Add…" />
        </div>
      )}
      <ul className="mt-1 flex-1 divide-y divide-stone-100 dark:divide-stone-800">
        {[...day.open, ...day.settled].map((it) => (
          <PlanRow
            key={it.task.id}
            item={it}
            onDone={onDone}
            notify={notify}
            draggable={!it.settled}
          />
        ))}
      </ul>
    </Card>
  )
}

/** One list in the tray: its open tasks with no day, each draggable onto one. */
function TrayList({ bucket }: { bucket: Bucket }) {
  const state = useFarmStore((s) => s.state)
  const [all, setAll] = useState(false)
  const tasks = live
    .tasks(state)
    .filter((t) => t.bucket === bucket && !t.projectId && !t.done && !t.plannedFor)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  if (tasks.length === 0) return null
  const shown = all ? tasks : tasks.slice(0, 8)
  return (
    <section className="mt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {bucketName(state.farm, bucket)}
      </h3>
      <ul className="mt-1 space-y-1">
        {shown.map((t) => (
          <li
            key={t.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TASK_DRAG_TYPE, t.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            className="cursor-grab truncate rounded border border-stone-200 px-2 py-1 text-sm hover:border-lime-600 dark:border-stone-700"
            title={t.title}
          >
            {t.title}
          </li>
        ))}
      </ul>
      {tasks.length > 8 && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-1 text-xs text-stone-500 underline decoration-dotted dark:text-stone-400"
        >
          {all ? 'Fewer' : `All ${tasks.length}`}
        </button>
      )}
    </section>
  )
}
