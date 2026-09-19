import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { today } from '@/state/actions'
import { ensureCurrentPerson } from '@/state/people'
import { completeTask, moveTask, undoEvents } from '@/state/taskActions'
import { bucketName, thisWeek } from '@/engine/tasks'
import type { NewEvent } from '@/events/types'
import type { Task } from '@/model/types'
import { Button, Card, PageHeader } from '@/ui/components'
import { DoneSheet, type DoneSheetResult } from '@/ui/tasks/DoneSheet'
import { QuickAdd } from '@/ui/tasks/QuickAdd'
import { TaskRow } from '@/ui/tasks/TaskRow'
import { Toast } from '@/ui/tasks/Toast'
import { useTaskDrag } from '@/ui/tasks/useTaskDrag'

/** The phone's home: what to do now, what to keep up with, and what the season opened. */
export default function WeekPage() {
  const state = useFarmStore((s) => s.state)
  const date = today()
  const week = thisWeek(state, date)
  const [sheet, setSheet] = useState<Task | null>(null)
  const [toast, setToast] = useState<{ message: string; undo?: NewEvent[] } | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const drag = useTaskDrag(week.now, { bucket: 'now', projectId: null })

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

      <QuickAdd bucket="now" />

      <Section
        title={bucketName(state.farm, 'now')}
        empty="Nothing here. Add one above, or enjoy it."
        listProps={drag.containerProps}
      >
        {week.now.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            today={date}
            onCheck={check}
            handle
            dragProps={drag.rowProps(t)}
            dropIndicator={drag.indicator(t.id)}
          />
        ))}
      </Section>

      <Section
        title={bucketName(state.farm, 'recurring')}
        hint="Due or getting stale. Tap the box when you have done one."
        empty="All kept up. See the full list under Tasks."
        link={{ to: '/tasks?bucket=recurring', label: 'All' }}
      >
        {week.due.map((t) => (
          <TaskRow key={t.id} task={t} today={date} onCheck={check} />
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
  listProps,
  children,
}: {
  title: string
  hint?: string
  empty?: string
  link?: { to: string; label: string }
  listProps?: React.HTMLAttributes<HTMLElement>
  children: React.ReactNode
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {link && (
          <Link to={link.to} className="text-xs underline decoration-dotted">
            {link.label}
          </Link>
        )}
      </div>
      {hint && <p className="text-xs text-stone-500 dark:text-stone-400">{hint}</p>}
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
