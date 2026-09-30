import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { today } from '@/state/actions'
import { ensureCurrentPerson } from '@/state/people'
import { completeTask, deleteTask, moveTask, undoEvents, undoLog } from '@/state/taskActions'
import { live } from '@/events/reduce'
import { addDays } from '@/engine/tasks'
import { hoursOf } from '@/engine/logs'
import { bucketName, thisWeek } from '@/engine/tasks'
import type { NewEvent } from '@/events/types'
import type { Bucket, Task } from '@/model/types'
import { Button, Card, PageHeader } from '@/ui/components'
import { Chip } from '@/ui/harvest/Chips'
import { DoneSheet, type DoneSheetResult } from '@/ui/tasks/DoneSheet'
import { QuickAdd } from '@/ui/tasks/QuickAdd'
import { TaskRow } from '@/ui/tasks/TaskRow'
import { Toast } from '@/ui/tasks/Toast'
import { useTaskDrag } from '@/ui/tasks/useTaskDrag'

/** The lists a task can be added to from the orchard, in the order they are worked. */
const ADD_TO: Bucket[] = ['now', 'soon', 'later', 'project']

/** The phone's home: what to do now, what to keep up with, and what the season opened. */
export default function WeekPage() {
  const state = useFarmStore((s) => s.state)
  const date = today()
  const week = thisWeek(state, date)
  const [addTo, setAddTo] = useState<Bucket>('now')
  // Added from a section's own box: shown even past the first few, so the add is visible.
  const [added, setAdded] = useState<string[]>([])
  const noteAdded = (id: string) => setAdded((a) => [...a, id])
  const firstFew = <T,>(list: T[], idOf: (t: T) => string) =>
    list.filter((t, i) => i < 8 || added.includes(idOf(t)))
  const [sheet, setSheet] = useState<Task | null>(null)
  const [toast, setToast] = useState<{ message: string; undo?: NewEvent[] } | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const drag = useTaskDrag(week.now, { bucket: 'now', projectId: null })
  const dragSoon = useTaskDrag(week.soon, { bucket: 'soon', projectId: null })
  const since = addDays(date, -6)
  const lately = live
    .logs(state)
    .filter((l) => l.date >= since)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
    .slice(0, 20)

  const check = (task: Task) => {
    // A recurring task with an estimate logs in one tap; anything else asks the two chips.
    const me = ensureCurrentPerson()
    if (task.bucket === 'recurring' && task.estimatedMinutes && me) {
      const undo = completeTask(task.id, {
        personIds: [me.id],
        durationMinutes: task.estimatedMinutes,
      })
      setToast({ message: `Logged ${task.title}.`, undo })
      return
    }
    setSheet(task)
  }

  const remove = (task: Task) => {
    deleteTask(task.id)
    setToast({
      message: `Deleted ${task.title}.`,
      undo: [{ type: 'task.restore', payload: { id: task.id } }],
    })
  }

  const file = (task: Task, values: DoneSheetResult) => {
    const undo = completeTask(task.id, values)
    setSheet(null)
    setToast({
      message: task.bucket === 'recurring' ? `Logged ${task.title}.` : `Done: ${task.title}.`,
      undo,
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="This week"
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      >
        <Link to="/review" className="text-sm underline decoration-dotted">
          Weekly review
        </Link>
      </PageHeader>

      {/*
        A mini task or a project comes to mind in the orchard as often as this week's work
        does, and walking back to the desk to write it down means losing it. The list to add
        to is one tap, and it stays put between adds.
      */}
      <div className="flex flex-wrap gap-1.5">
        {ADD_TO.map((b) => (
          <Chip key={b} active={addTo === b} onClick={() => setAddTo(b)}>
            {bucketName(state.farm, b)}
          </Chip>
        ))}
      </div>
      <QuickAdd
        bucket={addTo}
        placeholder={`Add to ${bucketName(state.farm, addTo).toLowerCase()}…`}
      />

      <Section
        title={bucketName(state.farm, 'now')}
        empty="Nothing here. Add one above, or enjoy it."
        add={{ bucket: 'now', onAdded: noteAdded }}
        listProps={drag.containerProps}
      >
        {week.now.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            today={date}
            onCheck={check}
            onDelete={remove}
            handle
            dragProps={drag.rowProps(t)}
            handleProps={drag.handleProps(t)}
            lifted={drag.touching === t.id}
            dropIndicator={drag.indicator(t.id)}
          />
        ))}
      </Section>

      <Section
        title={bucketName(state.farm, 'recurring')}
        hint="Due or getting stale. Tap the box when you have done one."
        empty="All kept up. See the full list under Tasks."
        link={{ to: '/tasks?bucket=recurring', label: 'All' }}
        add={{ bucket: 'recurring', onAdded: noteAdded }}
      >
        {week.due.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            today={date}
            onCheck={check}
            onDelete={remove}
            onRest={(message, undo) => setToast({ message, undo })}
          />
        ))}
      </Section>

      <Section
        title={bucketName(state.farm, 'soon')}
        hint="Small jobs for when there is a gap."
        empty="None waiting."
        link={{ to: '/tasks?bucket=soon', label: 'All' }}
        add={{ bucket: 'soon', onAdded: noteAdded }}
        listProps={dragSoon.containerProps}
      >
        {firstFew(week.soon, (t) => t.id).map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            today={date}
            onCheck={check}
            onDelete={remove}
            handle
            dragProps={dragSoon.rowProps(t)}
            handleProps={dragSoon.handleProps(t)}
            lifted={dragSoon.touching === t.id}
            dropIndicator={dragSoon.indicator(t.id)}
          />
        ))}
      </Section>

      <Section
        title={bucketName(state.farm, 'project')}
        hint="Bigger pieces of work. Tap one to add to it."
        empty="No projects open."
        link={{ to: '/tasks?bucket=project', label: 'All' }}
        add={{ bucket: 'project', onAdded: noteAdded }}
      >
        {firstFew(week.projects, (p) => p.task.id).map(({ task, open }) => (
          <li key={task.id} className="flex items-center gap-2 py-1">
            <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate">
              {task.title}
            </Link>
            <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
              {open === 0 ? 'no steps yet' : `${open} open`}
            </span>
          </li>
        ))}
      </Section>

      {week.opened.length > 0 && (
        <Section title="The season has opened" hint="Items waiting for this time of year.">
          {week.opened.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-1">
              <div className="min-w-0 flex-1">
                <TaskRow task={t} today={date} compact />
              </div>
              <Button onClick={() => moveTask(t.id, 'now')}>
                → {bucketName(state.farm, 'now')}
              </Button>
            </li>
          ))}
        </Section>
      )}

      {lately.length > 0 && (
        <Section
          title="Done lately"
          hint="The last seven days. Undo takes the log back and reopens the task."
          link={{ to: '/logs', label: 'All logs' }}
        >
          {lately.map((l) => {
            const task = l.taskId ? state.tasks[l.taskId] : undefined
            return (
              <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-sm">
                <span className="tabular-nums text-stone-500 dark:text-stone-400">
                  {l.date === date ? 'today' : l.date.slice(5)}
                </span>
                <span className="min-w-0 flex-1">
                  {task ? (
                    <Link to={`/tasks/${task.id}`} className="underline decoration-dotted">
                      {task.title}
                    </Link>
                  ) : (
                    (l.notes ?? 'Work logged')
                  )}
                  {hoursOf(l) > 0 && (
                    <span className="ml-2 text-stone-500 dark:text-stone-400">
                      {hoursOf(l).toFixed(1)} h
                    </span>
                  )}
                </span>
                <Button variant="ghost" onClick={() => undoLog(l.id)}>
                  Undo
                </Button>
              </li>
            )
          })}
        </Section>
      )}

      {sheet && (
        <DoneSheet
          title={sheet.bucket === 'recurring' ? `Did: ${sheet.title}` : `Done: ${sheet.title}`}
          initial={{
            durationMinutes: sheet.estimatedMinutes,
            category: sheet.category,
            targets: sheet.targets,
          }}
          onSubmit={(v) => file(sheet, v)}
          onClose={() => setSheet(null)}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          onUndo={toast.undo ? () => undoEvents(toast.undo!) : undefined}
          onClose={closeToast}
        />
      )}
    </div>
  )
}

function Section({
  title,
  hint,
  empty,
  link,
  add,
  listProps,
  children,
}: {
  title: string
  hint?: string
  empty?: string
  link?: { to: string; label: string }
  /** A + beside the title that opens an add box for this list, right where you are looking. */
  add?: { bucket: Bucket; onAdded: (id: string) => void }
  listProps?: React.HTMLAttributes<HTMLElement>
  children: React.ReactNode
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []
  const [adding, setAdding] = useState(false)
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex items-center gap-3">
          {link && (
            <Link to={link.to} className="text-xs underline decoration-dotted">
              {link.label}
            </Link>
          )}
          {add && (
            <button
              type="button"
              onClick={() => setAdding((a) => !a)}
              aria-expanded={adding}
              aria-label={adding ? `Stop adding to ${title}` : `Add to ${title}`}
              className="-my-1 flex h-8 w-8 items-center justify-center rounded-full border border-stone-300 text-lg leading-none text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {adding ? '×' : '+'}
            </button>
          )}
        </div>
      </div>
      {hint && <p className="text-xs text-stone-500 dark:text-stone-400">{hint}</p>}
      {add && adding && (
        <div className="mt-2">
          <QuickAdd
            bucket={add.bucket}
            placeholder={`Add to ${title.toLowerCase()}…`}
            autoFocus
            onAdded={add.onAdded}
          />
        </div>
      )}
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800" {...listProps}>
          {children}
        </ul>
      )}
    </Card>
  )
}
