import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { today } from '@/state/actions'
import { completeTask, moveTask, nudgeTask, reopenTask, undoEvents } from '@/state/taskActions'
import { bucketName, sortRecurring } from '@/engine/tasks'
import type { NewEvent } from '@/events/types'
import { BUCKETS, type Bucket, type Task } from '@/model/types'
import { Button, Card, PageHeader, inputClass } from '@/ui/components'
import { useIsDesktop } from '@/ui/useIsDesktop'
import { DoneSheet, type DoneSheetResult } from '@/ui/tasks/DoneSheet'
import { QuickAdd } from '@/ui/tasks/QuickAdd'
import { TaskRow } from '@/ui/tasks/TaskRow'
import { Toast } from '@/ui/tasks/Toast'

/** Buckets as columns on a desktop; one bucket at a time on a phone. */
export default function TasksPage() {
  const state = useFarmStore((s) => s.state)
  const isDesktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  const picked = (params.get('bucket') as Bucket | null) ?? 'now'
  const date = today()
  const [sheet, setSheet] = useState<Task | null>(null)
  const [toast, setToast] = useState<{ message: string; undo?: NewEvent[] } | null>(null)
  const closeToast = useCallback(() => setToast(null), [])

  const file = (task: Task, values: DoneSheetResult) => {
    const undo = completeTask(task.id, values)
    setSheet(null)
    setToast({
      message: task.bucket === 'recurring' ? `Logged ${task.title}.` : `Done: ${task.title}.`,
      undo,
    })
  }

  const columns = BUCKETS.filter((b) => isDesktop || b === picked)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        subtitle={`${live.tasks(state).filter((t) => !t.done).length} open`}
      >
        <Link to="/import/keep" className="text-sm underline decoration-dotted">
          Paste a list from Keep
        </Link>
      </PageHeader>

      {!isDesktop && (
        <div className="flex flex-wrap gap-1.5">
          {BUCKETS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setParams({ bucket: b })}
              aria-pressed={picked === b}
              className={clsx(
                'rounded-full border px-3 py-1 text-sm',
                picked === b
                  ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                  : 'border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300',
              )}
            >
              {bucketName(state.farm, b)}
            </button>
          ))}
        </div>
      )}

      <div className={clsx(isDesktop && 'grid gap-3 xl:grid-cols-5 md:grid-cols-3')}>
        {columns.map((bucket) => (
          <Column key={bucket} bucket={bucket} today={date} onCheck={setSheet} />
        ))}
      </div>

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

function Column({
  bucket,
  today,
  onCheck,
}: {
  bucket: Bucket
  today: string
  onCheck: (task: Task) => void
}) {
  const state = useFarmStore((s) => s.state)
  const [showDone, setShowDone] = useState(false)
  const all = live.tasks(state).filter((t) => t.bucket === bucket && !t.projectId)
  const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt - b.createdAt
  const open =
    bucket === 'recurring'
      ? sortRecurring(
          all.filter((t) => !t.done),
          live.logs(state),
          today,
        )
      : all.filter((t) => !t.done).sort(byOrder)
  const done = all
    .filter((t) => t.done)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  const children = (id: string) =>
    live.tasks(state).filter((t) => t.projectId === id && !t.done).length

  return (
    <Card className="flex min-h-40 flex-col">
      <h2 className="font-semibold">{bucketName(state.farm, bucket)}</h2>
      <div className="mt-2">
        <QuickAdd bucket={bucket} placeholder={bucket === 'project' ? 'New project…' : 'Add…'} />
      </div>
      <ul className="mt-1 flex-1 divide-y divide-stone-100 dark:divide-stone-800">
        {open.map((t) => (
          <li key={t.id} className="group">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                {bucket === 'project' ? (
                  <ProjectRow task={t} openCount={children(t.id)} />
                ) : (
                  <ul>
                    <TaskRow task={t} today={today} onCheck={() => onCheck(t)} />
                  </ul>
                )}
              </div>
              <RowActions task={t} />
            </div>
          </li>
        ))}
        {open.length === 0 && (
          <li className="py-2 text-sm text-stone-500 dark:text-stone-400">Nothing here.</li>
        )}
      </ul>
      {done.length > 0 && (
        <div className="mt-2 border-t border-stone-100 dark:border-stone-800 pt-2">
          <button
            type="button"
            onClick={() => setShowDone((s) => !s)}
            className="text-xs text-stone-500 underline decoration-dotted dark:text-stone-400"
          >
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && (
            <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800">
              {done.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ul>
                      <TaskRow task={t} today={today} compact />
                    </ul>
                  </div>
                  <Button variant="ghost" onClick={() => reopenTask(t.id)}>
                    Reopen
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

function ProjectRow({ task, openCount }: { task: Task; openCount: number }) {
  return (
    <div className="py-2">
      <Link to={`/tasks/${task.id}`} className="block text-[15px] font-medium leading-snug">
        {task.title}
      </Link>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {openCount === 0 ? 'nothing open' : `${openCount} open`}
        {task.ownerId && ' · '}
        {task.ownerId && <OwnerName id={task.ownerId} />}
      </p>
    </div>
  )
}

function OwnerName({ id }: { id: string }) {
  const name = useFarmStore((s) => s.state.people[id]?.name)
  return <>{name ?? 'owner'}</>
}

/** Up, down, and move-to, shown on hover on a desktop and always on a phone. */
function RowActions({ task }: { task: Task }) {
  const farm = useFarmStore((s) => s.state.farm)
  return (
    <div className="flex shrink-0 items-center gap-0.5 pt-2 opacity-60 group-hover:opacity-100 md:opacity-0">
      <button
        type="button"
        aria-label="Move up"
        onClick={() => nudgeTask(task.id, -1)}
        className="rounded px-1 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
      >
        ↑
      </button>
      <button
        type="button"
        aria-label="Move down"
        onClick={() => nudgeTask(task.id, 1)}
        className="rounded px-1 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
      >
        ↓
      </button>
      <select
        aria-label="Move to another list"
        className={clsx(inputClass, 'w-6 appearance-none px-1 py-0.5 text-xs text-stone-500')}
        value=""
        onChange={(e) => {
          if (e.target.value) moveTask(task.id, e.target.value as Bucket)
        }}
      >
        <option value="">→</option>
        {BUCKETS.filter((b) => b !== task.bucket && b !== 'project').map((b) => (
          <option key={b} value={b}>
            {bucketName(farm, b)}
          </option>
        ))}
      </select>
    </div>
  )
}
