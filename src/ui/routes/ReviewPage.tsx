import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { today } from '@/state/actions'
import { addLog, completeTask, moveTask, undoEvents } from '@/state/taskActions'
import { bucketName, weeklyReview } from '@/engine/tasks'
import { hoursOf, targetLabel } from '@/engine/logs'
import { categoryLabel } from '@/model/categories'
import type { NewEvent } from '@/events/types'
import type { Task } from '@/model/types'
import { Button, Card, PageHeader } from '@/ui/components'
import { DoneSheet, type DoneSheetResult } from '@/ui/tasks/DoneSheet'
import { TaskRow } from '@/ui/tasks/TaskRow'
import { Toast } from '@/ui/tasks/Toast'

/** The weekly review (DESIGN.md §4): run whenever it is opened, no fixed day. */
export default function ReviewPage() {
  const state = useFarmStore((s) => s.state)
  const date = today()
  const review = weeklyReview(state, date)
  const [sheet, setSheet] = useState<{ task?: Task } | null>(null)
  const [toast, setToast] = useState<{ message: string; undo?: NewEvent[] } | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const totalHours = review.done.reduce((h, d) => h + hoursOf(d.log), 0)

  const file = (values: DoneSheetResult) => {
    if (sheet?.task) {
      const undo = completeTask(sheet.task.id, values)
      setToast({ message: `Logged ${sheet.task.title}.`, undo })
    } else {
      const id = addLog({
        ...values,
        category: values.category ?? undefined,
        targets: values.targets ?? [],
      })
      setToast({ message: 'Logged.', undo: [{ type: 'log.delete', payload: { id } }] })
    }
    setSheet(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Weekly review" subtitle={`${review.from} to ${review.to}`}>
        <Link to="/week" className="text-sm underline decoration-dotted">
          This week
        </Link>
      </PageHeader>

      <Card>
        <h2 className="font-semibold">
          Done this week{' '}
          <span className="text-sm font-normal text-stone-500 dark:text-stone-400">
            {review.done.length} {review.done.length === 1 ? 'log' : 'logs'}
            {totalHours > 0 && `, ${totalHours.toFixed(1)} hours`}
          </span>
        </h2>
        {review.done.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Nothing logged yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
            {review.done.map(({ log, task }) => (
              <li key={log.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                <span className="tabular-nums text-stone-500 dark:text-stone-400">
                  {log.date.slice(5)}
                </span>
                <span>
                  {task ? (
                    <Link to={`/tasks/${task.id}`} className="underline decoration-dotted">
                      {task.title}
                    </Link>
                  ) : (
                    categoryLabel(log.category, state.farm?.categories) || 'Work'
                  )}
                </span>
                {log.targets.length > 0 && (
                  <span className="text-stone-500 dark:text-stone-400">
                    {log.targets.map((t) => targetLabel(state, t)).join(', ')}
                  </span>
                )}
                {hoursOf(log) > 0 && (
                  <span className="tabular-nums">{hoursOf(log).toFixed(1)} h</span>
                )}
                <span className="text-stone-500 dark:text-stone-400">
                  {log.personIds.map((p) => state.people[p]?.name ?? 'someone').join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Still in {bucketName(state.farm, 'now')}</h2>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Keep it here, or push it to {bucketName(state.farm, 'soon')} or{' '}
          {bucketName(state.farm, 'later')}.
        </p>
        <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800">
          {review.stillNow.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ul>
                  <TaskRow task={t} today={date} compact />
                </ul>
              </div>
              <Button variant="ghost" onClick={() => moveTask(t.id, 'soon')}>
                → {bucketName(state.farm, 'soon')}
              </Button>
              <Button variant="ghost" onClick={() => moveTask(t.id, 'later')}>
                → {bucketName(state.farm, 'later')}
              </Button>
            </li>
          ))}
          {review.stillNow.length === 0 && (
            <li className="py-2 text-sm text-stone-500 dark:text-stone-400">Empty. Nice.</li>
          )}
        </ul>
      </Card>

      {review.stale.length > 0 && (
        <Card>
          <h2 className="font-semibold">{bucketName(state.farm, 'recurring')} getting stale</h2>
          <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800">
            {review.stale.map((t) => (
              <TaskRow key={t.id} task={t} today={date} onCheck={() => setSheet({ task: t })} />
            ))}
          </ul>
        </Card>
      )}

      {review.opened.length > 0 && (
        <Card>
          <h2 className="font-semibold">The season has opened for</h2>
          <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800">
            {review.opened.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <ul>
                    <TaskRow task={t} today={date} compact />
                  </ul>
                </div>
                <Button onClick={() => moveTask(t.id, 'now')}>
                  → {bucketName(state.farm, 'now')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {review.discussion.length > 0 && (
        <Card>
          <h2 className="font-semibold">To discuss</h2>
          <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800">
            {review.discussion.map((t) => (
              <TaskRow key={t.id} task={t} today={date} />
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Anything you did this week that isn't logged?</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {review.suggestions.map((t) => (
            <Button key={t.id} onClick={() => setSheet({ task: t })}>
              {t.title}
            </Button>
          ))}
          <Button variant="primary" onClick={() => setSheet({})}>
            Something else
          </Button>
        </div>
      </Card>

      {sheet && (
        <DoneSheet
          title={sheet.task ? `Did: ${sheet.task.title}` : 'Log some work'}
          showDetails={!sheet.task}
          initial={
            sheet.task
              ? {
                  durationMinutes: sheet.task.estimatedMinutes,
                  category: sheet.task.category,
                  targets: sheet.task.targets,
                }
              : {}
          }
          onSubmit={file}
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
