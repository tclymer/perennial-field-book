import { useState } from 'react'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import {
  byPerson,
  dayLong,
  loadLabel,
  nextWorkDay,
  weekPlan,
  workDaysOf,
  type PlanDay,
  type PlanItem,
} from '@/engine/plan'
import type { Task } from '@/model/types'
import { backToList, keepForToday, rainDay } from '@/state/planActions'
import { Button, Card } from '@/ui/components'
import { QuickAdd } from '@/ui/tasks/QuickAdd'
import { PlanRow, Rolled, useMe, type Notice } from './PlanParts'

/**
 * The top of the phone's home (DESIGN.md §3.10): anything that slid too far, today's tasks by
 * who does them, and a glance at the rest of the week.
 */
export function TodayPlan({
  today,
  onDone,
  notify,
  between,
}: {
  today: string
  onDone: (task: Task) => void
  notify: (n: Notice) => void
  /** Shown after today and before the rest of the week: the plates to keep up with. */
  between?: React.ReactNode
}) {
  const state = useFarmStore((s) => s.state)
  const me = useMe()
  const plan = weekPlan(state, today)
  const day = plan.days.find((d) => d.isToday)!
  const rest = plan.days.filter((d) => d.date > plan.today)
  const [adding, setAdding] = useState(false)
  const [opened, setOpened] = useState<string | null>(null)
  const nameOf = (id: string) => {
    const p = state.people[id]
    return p && !p.deleted ? p.name : undefined
  }
  const title = dayLong(plan.today, today)
  const after = dayLong(nextWorkDay(plan.today, workDaysOf(state.farm)), plan.today).toLowerCase()

  return (
    <>
      {plan.stillOn.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <h2 className="font-semibold">Still on?</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            These have slid three working days or more. Keep one for today, or put it back in its
            list for another week.
          </p>
          <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800">
            {plan.stillOn.map(({ task, rolled }) => (
              <li key={task.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                <span className="min-w-0 flex-1">
                  {task.title} <Rolled n={rolled} />
                </span>
                <Button
                  onClick={() =>
                    notify({
                      message: `${task.title}: today.`,
                      undo: keepForToday(task.id, today),
                    })
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

      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">
            {title}{' '}
            <span className="text-sm font-normal tabular-nums text-stone-500 dark:text-stone-400">
              {loadLabel(day)}
            </span>
          </h2>
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
            aria-label={adding ? `Stop adding to ${title}` : `Add to ${title}`}
            className="-my-1 flex h-8 w-8 items-center justify-center rounded-full border border-stone-300 text-lg leading-none text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {adding ? '×' : '+'}
          </button>
        </div>
        {adding && (
          <div className="mt-2">
            <QuickAdd
              bucket="now"
              plannedFor={plan.today}
              placeholder={`Add to ${title.toLowerCase()}…`}
              autoFocus
            />
          </div>
        )}
        <DayList
          day={day}
          me={me}
          nameOf={nameOf}
          onDone={onDone}
          notify={notify}
          empty={
            rest.some((d) => d.open.length)
              ? 'Nothing planned. Pull something in from the week below, or a list.'
              : 'Nothing planned. Tap Plan on anything in the lists below.'
          }
        />
        {day.open.length > 0 && (
          <div className="mt-2 border-t border-stone-100 pt-2 dark:border-stone-800">
            <button
              type="button"
              onClick={() => {
                const { undo, to } = rainDay(today)
                notify({ message: `Moved to ${dayLong(to, plan.today).toLowerCase()}.`, undo })
              }}
              className="text-xs text-stone-500 underline decoration-dotted dark:text-stone-400"
              title="Weather moves whole days: everything still open today goes to the next working day"
            >
              Rain day: push today to {after}
            </button>
          </div>
        )}
      </Card>

      {between}

      {(rest.length > 0 || plan.later.length > 0) && (
        <Card>
          <h2 className="font-semibold">The rest of the week</h2>
          <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800">
            {rest.map((d) => (
              <li key={d.date} className="py-1.5">
                <button
                  type="button"
                  onClick={() => setOpened((o) => (o === d.date ? null : d.date))}
                  aria-expanded={opened === d.date}
                  className="flex w-full items-baseline gap-2 text-left"
                >
                  <span className="w-20 shrink-0 font-medium">{dayLong(d.date, plan.today)}</span>
                  <span className="shrink-0 text-sm tabular-nums text-stone-500 dark:text-stone-400">
                    {loadLabel(d)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-stone-600 dark:text-stone-300">
                    {d.open.map((i) => i.task.title).join(' · ')}
                  </span>
                </button>
                {opened === d.date && (
                  <div className="pl-2">
                    <QuickAdd
                      bucket="now"
                      plannedFor={d.date}
                      placeholder={`Add to ${dayLong(d.date, plan.today).toLowerCase()}…`}
                    />
                    <DayList day={d} me={me} nameOf={nameOf} onDone={onDone} notify={notify} />
                  </div>
                )}
              </li>
            ))}
            {plan.later.length > 0 && (
              <li className="flex items-baseline gap-2 py-1.5">
                <span className="w-20 shrink-0 font-medium">Next week</span>
                <span className="shrink-0 text-sm tabular-nums text-stone-500 dark:text-stone-400">
                  {plan.later.length}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-stone-600 dark:text-stone-300">
                  {plan.later.map((i) => i.task.title).join(' · ')}
                </span>
              </li>
            )}
          </ul>
        </Card>
      )}
    </>
  )
}

/** One day's tasks: grouped by who does them, then what is already done, crossed out. */
function DayList({
  day,
  me,
  nameOf,
  onDone,
  notify,
  empty,
}: {
  day: PlanDay
  me: string | null
  nameOf: (id: string) => string | undefined
  onDone: (task: Task) => void
  notify: (n: Notice) => void
  empty?: string
}) {
  const groups = byPerson(day.open, me, nameOf)
  if (groups.length === 0 && day.settled.length === 0) {
    return empty ? <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{empty}</p> : null
  }
  return (
    <div className="mt-1">
      {groups.map((g) => (
        <section key={g.personId ?? 'anyone'}>
          {groups.length > 1 || g.personId !== me ? (
            <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              {g.label}
            </h3>
          ) : null}
          <Items items={g.items} onDone={onDone} notify={notify} />
        </section>
      ))}
      {day.settled.length > 0 && (
        <Items items={day.settled} onDone={onDone} notify={notify} className="opacity-80" />
      )}
    </div>
  )
}

function Items({
  items,
  onDone,
  notify,
  className,
}: {
  items: PlanItem[]
  onDone: (task: Task) => void
  notify: (n: Notice) => void
  className?: string
}) {
  return (
    <ul className={clsx('divide-y divide-stone-100 dark:divide-stone-800', className)}>
      {items.map((it) => (
        <PlanRow key={it.task.id} item={it} onDone={onDone} notify={notify} />
      ))}
    </ul>
  )
}
