import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { today } from '@/state/actions'
import {
  completeTask,
  deleteTask,
  moveTask,
  reopenTask,
  undoEvents,
  updateTask,
} from '@/state/taskActions'
import { bucketName, parseSeason } from '@/engine/tasks'
import { hoursOf } from '@/engine/logs'
import { allCategories } from '@/model/categories'
import type { NewEvent } from '@/events/types'
import { BUCKETS, type Bucket, type Task } from '@/model/types'
import { Button, Card, Field, NumberInput, PageHeader, Pill, inputClass } from '@/ui/components'
import { DoneSheet, type DoneSheetResult } from '@/ui/tasks/DoneSheet'
import { QuickAdd } from '@/ui/tasks/QuickAdd'
import { TargetPicker } from '@/ui/tasks/TargetPicker'
import { TaskRow, lastDoneText } from '@/ui/tasks/TaskRow'
import { Toast } from '@/ui/tasks/Toast'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export default function TaskPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const state = useFarmStore((s) => s.state)
  const task = state.tasks[id]
  const date = today()
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [season, setSeason] = useState(task?.season ?? '')
  const [sheet, setSheet] = useState<Task | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [toast, setToast] = useState<{ message: string; undo?: NewEvent[] } | null>(null)
  const closeToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    setTitle(task?.title ?? '')
    setNotes(task?.notes ?? '')
    setSeason(task?.season ?? '')
  }, [task?.id, task?.title, task?.notes, task?.season])

  if (!task || task.deleted) {
    return (
      <div className="space-y-3">
        <PageHeader title="Task" />
        <Card>
          <p className="text-sm">
            That task is not here.{' '}
            <Link to="/tasks" className="underline decoration-dotted">
              Back to tasks
            </Link>
          </p>
        </Card>
      </div>
    )
  }

  const project = task.projectId ? state.tasks[task.projectId] : undefined
  const isProject = task.bucket === 'project'
  const subtasks = live
    .tasks(state)
    .filter((t) => t.projectId === task.id)
    .sort((a, b) => Number(a.done ?? false) - Number(b.done ?? false) || a.order - b.order)
  const logs = live
    .logs(state)
    .filter((l) => l.taskId === task.id)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const people = live.people(state).filter((p) => p.active || p.id === task.ownerId)
  const projects = live.tasks(state).filter((t) => t.bucket === 'project' && t.id !== task.id)

  const file = (t: Task, values: DoneSheetResult) => {
    const undo = completeTask(t.id, values)
    setSheet(null)
    setToast({
      message: t.bucket === 'recurring' ? `Logged ${t.title}.` : `Done: ${t.title}.`,
      undo,
    })
  }

  const toggleMonth = (m: number) => {
    const cur = task.seasonMonths ?? []
    const next = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort((a, b) => a - b)
    updateTask(task.id, { seasonMonths: next.length ? next : null })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={task.title}
        subtitle={
          project
            ? `In ${project.title}`
            : `${bucketName(state.farm, task.bucket)}${task.done ? ' · done' : ''}`
        }
      >
        <div className="flex flex-wrap gap-2">
          {project && (
            <Link to={`/tasks/${project.id}`} className="text-sm underline decoration-dotted">
              {project.title}
            </Link>
          )}
          <Link to="/tasks" className="text-sm underline decoration-dotted">
            All tasks
          </Link>
        </div>
      </PageHeader>

      {!isProject && (
        <Card className="flex flex-wrap items-center gap-2">
          {task.done ? (
            <>
              <Pill tone="good">Done {task.doneAt}</Pill>
              <Button onClick={() => reopenTask(task.id)}>Reopen</Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setSheet(task)}>
              {task.bucket === 'recurring' ? 'Did it, log it' : 'Done, log it'}
            </Button>
          )}
          {task.bucket === 'recurring' && (
            <span className="text-sm text-stone-500 dark:text-stone-400">
              {lastDoneText(task, live.logs(state), date)}
            </span>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <Field label="Title">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const v = title.trim()
              if (v && v !== task.title) updateTask(task.id, { title: v })
              else setTitle(task.title)
            }}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {!project && (
            <Field label="List">
              <select
                className={inputClass}
                value={task.bucket}
                onChange={(e) => moveTask(task.id, e.target.value as Bucket)}
              >
                {BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {bucketName(state.farm, b)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {!isProject && projects.length > 0 && (
            <Field label="Part of project">
              <select
                className={inputClass}
                value={task.projectId ?? ''}
                onChange={(e) => updateTask(task.id, { projectId: e.target.value || null })}
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Category">
            <select
              className={inputClass}
              value={task.category ?? ''}
              onChange={(e) => updateTask(task.id, { category: e.target.value || null })}
            >
              <option value="">None</option>
              {allCategories(state.farm?.categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner">
            <select
              className={inputClass}
              value={task.ownerId ?? ''}
              onChange={(e) => updateTask(task.id, { ownerId: e.target.value || null })}
            >
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Where">
          <TargetPicker
            targets={task.targets}
            onChange={(targets) => updateTask(task.id, { targets })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Season" hint="Free words; the months below are what the app uses.">
            <input
              className={inputClass}
              value={season}
              placeholder="late fall, before cold weather…"
              onChange={(e) => setSeason(e.target.value)}
              onBlur={() => {
                const v = season.trim()
                if (v === (task.season ?? '')) return
                const parsed = v ? parseSeason(v) : null
                updateTask(task.id, {
                  season: v || null,
                  ...(parsed ? { seasonMonths: parsed.months } : v ? {} : { seasonMonths: null }),
                })
              }}
            />
          </Field>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-stone-600 dark:text-stone-400">Months</span>
            <div className="flex flex-wrap gap-1">
              {MONTHS.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Month ${i + 1}`}
                  aria-pressed={task.seasonMonths?.includes(i + 1) ?? false}
                  onClick={() => toggleMonth(i + 1)}
                  className={clsx(
                    'h-7 w-7 rounded-full border text-xs',
                    task.seasonMonths?.includes(i + 1)
                      ? 'border-lime-700 bg-lime-700 text-white'
                      : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {task.bucket === 'recurring' && (
            <Field label="Every (days)" hint="Optional. Adds a due hint.">
              <NumberInput
                value={task.intervalDays ?? 0}
                min={0}
                max={3660}
                step={1}
                onChange={(n) => updateTask(task.id, { intervalDays: n > 0 ? n : null })}
              />
            </Field>
          )}
          <Field
            label="Usually takes (minutes)"
            hint={
              task.bucket === 'recurring'
                ? 'With this set, one tap logs it.'
                : 'Default for the log.'
            }
          >
            <NumberInput
              value={task.estimatedMinutes ?? 0}
              min={0}
              max={1440}
              step={5}
              onChange={(n) => updateTask(task.id, { estimatedMinutes: n > 0 ? n : null })}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={task.needsDiscussion ?? false}
              onChange={(e) => updateTask(task.id, { needsDiscussion: e.target.checked || null })}
            />
            Needs discussion
          </label>
        </div>
        <Field label="Notes">
          <textarea
            className={clsx(inputClass, 'min-h-20')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              const v = notes.trim()
              if (v !== (task.notes ?? '')) updateTask(task.id, { notes: v || null })
            }}
          />
        </Field>
      </Card>

      {isProject && (
        <Card>
          <h2 className="font-semibold">Subtasks</h2>
          <div className="mt-2">
            <QuickAdd bucket="now" projectId={task.id} placeholder="Add a subtask…" />
          </div>
          <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800">
            {subtasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={date}
                onCheck={t.done ? undefined : () => setSheet(t)}
              />
            ))}
            {subtasks.length === 0 && (
              <li className="py-2 text-sm text-stone-500 dark:text-stone-400">None yet.</li>
            )}
          </ul>
        </Card>
      )}

      {logs.length > 0 && (
        <Card>
          <h2 className="font-semibold">Work logged</h2>
          <ul className="mt-2 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-2 py-1.5">
                <span className="tabular-nums">{l.date}</span>
                <span className="text-stone-600 dark:text-stone-400">
                  {l.personIds.map((p) => state.people[p]?.name ?? 'someone').join(', ') ||
                    'nobody named'}
                </span>
                {hoursOf(l) > 0 && <span className="tabular-nums">{hoursOf(l).toFixed(2)} h</span>}
                {l.notes && <span className="text-stone-500 dark:text-stone-400">{l.notes}</span>}
              </li>
            ))}
          </ul>
          <Link to="/logs" className="mt-2 inline-block text-xs underline decoration-dotted">
            All logs
          </Link>
        </Card>
      )}

      <Card>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Delete this {isProject ? 'project and hide its subtasks' : 'task'}?</span>
            <Button
              variant="danger"
              onClick={() => {
                deleteTask(task.id)
                navigate('/tasks')
              }}
            >
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </Card>

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
