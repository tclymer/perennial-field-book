import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { addLog, deleteLog, updateLog } from '@/state/taskActions'
import { blocksOfTarget, hoursOf, logsToCsv, targetLabel, totals } from '@/engine/logs'
import { downloadText, fileSlug } from '@/events/bundle'
import { allCategories, categoryLabel } from '@/model/categories'
import type { WorkLog } from '@/model/types'
import { Button, Card, Field, PageHeader, inputClass } from '@/ui/components'
import { DoneSheet, type DoneSheetResult } from '@/ui/tasks/DoneSheet'

/** Every work log, filtered, with totals and a CSV for the certifier or the planner. */
export default function LogsPage() {
  const state = useFarmStore((s) => s.state)
  const [person, setPerson] = useState('')
  const [category, setCategory] = useState('')
  const [block, setBlock] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [editing, setEditing] = useState<WorkLog | 'new' | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const logs = useMemo(() => {
    return live
      .logs(state)
      .filter((l) => !person || l.personIds.includes(person))
      .filter((l) => !category || l.category === category)
      .filter(
        (l) =>
          !block ||
          (block === 'overhead'
            ? !l.targets.some((t) => t.kind === 'farm' || blocksOfTarget(state, t).length)
            : l.targets.some((t) => blocksOfTarget(state, t).includes(block))),
      )
      .filter((l) => !from || l.date >= from)
      .filter((l) => !to || l.date <= to)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
  }, [state, person, category, block, from, to])
  const hours = logs.reduce((h, l) => h + hoursOf(l), 0)
  const people = live.people(state).sort((a, b) => a.name.localeCompare(b.name))
  const blocks = live.blocks(state).sort((a, b) => a.code.localeCompare(b.code))

  const save = (values: DoneSheetResult) => {
    if (editing === 'new') {
      addLog({ ...values, category: values.category ?? undefined, targets: values.targets ?? [] })
    } else if (editing) {
      updateLog(editing.id, {
        date: values.date,
        personIds: values.personIds,
        durationMinutes: values.durationMinutes ?? null,
        category: values.category ?? null,
        targets: values.targets ?? [],
        materials: values.materials?.length ? values.materials : null,
        notes: values.notes ?? null,
      })
    }
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Work logs" subtitle={`${logs.length} logs, ${hours.toFixed(1)} hours`}>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setEditing('new')}>
            Add a log
          </Button>
          <Link to="/planner" className="self-center text-sm underline decoration-dotted">
            Compare with the planner
          </Link>
          <Button
            disabled={logs.length === 0}
            onClick={() =>
              downloadText(
                `${fileSlug(state.farm?.name ?? 'farm')}-logs-${new Date().toISOString().slice(0, 10)}.csv`,
                logsToCsv(state, logs),
                'text/csv',
              )
            }
          >
            Download CSV
          </Button>
        </div>
      </PageHeader>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Person">
            <select
              className={inputClass}
              value={person}
              onChange={(e) => setPerson(e.target.value)}
            >
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All</option>
              {allCategories(state.farm?.categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Block">
            <select className={inputClass} value={block} onChange={(e) => setBlock(e.target.value)}>
              <option value="">All</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} {b.name}
                </option>
              ))}
              <option value="overhead">Overhead (no planting)</option>
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              className={inputClass}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className={inputClass}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {logs.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          <Totals title="By category" rows={totals(state, logs, 'category')} />
          <Totals title="By person" rows={totals(state, logs, 'person')} />
        </div>
      )}

      <Card>
        {logs.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">
            No logs match. Checking a task off on the{' '}
            <Link to="/week" className="underline decoration-dotted">
              Week
            </Link>{' '}
            page files one.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span className="tabular-nums">{l.date}</span>
                <span className="font-medium">
                  {l.taskId && state.tasks[l.taskId] ? (
                    <Link to={`/tasks/${l.taskId}`} className="underline decoration-dotted">
                      {state.tasks[l.taskId]!.title}
                    </Link>
                  ) : (
                    categoryLabel(l.category, state.farm?.categories) || 'Work'
                  )}
                </span>
                {l.taskId && l.category && (
                  <span className="text-stone-500 dark:text-stone-400">
                    {categoryLabel(l.category, state.farm?.categories)}
                  </span>
                )}
                {l.targets.length > 0 && (
                  <span className="text-stone-500 dark:text-stone-400">
                    {l.targets.map((t) => targetLabel(state, t)).join(', ')}
                  </span>
                )}
                <span className="text-stone-500 dark:text-stone-400">
                  {l.personIds.map((p) => state.people[p]?.name ?? 'someone').join(', ') ||
                    'nobody named'}
                </span>
                {hoursOf(l) > 0 && <span className="tabular-nums">{hoursOf(l).toFixed(2)} h</span>}
                {l.materials?.length ? (
                  <span className="text-stone-500 dark:text-stone-400">
                    {l.materials.map((m) => m.product).join(', ')}
                  </span>
                ) : null}
                {l.notes && <span className="text-stone-500 dark:text-stone-400">{l.notes}</span>}
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" onClick={() => setEditing(l)}>
                    Edit
                  </Button>
                  {confirm === l.id ? (
                    <>
                      <Button
                        variant="danger"
                        onClick={() => {
                          deleteLog(l.id)
                          setConfirm(null)
                        }}
                      >
                        Delete
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirm(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" onClick={() => setConfirm(l.id)}>
                      Delete
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <DoneSheet
          title={editing === 'new' ? 'Log some work' : 'Edit log'}
          submitLabel="Save"
          showDetails
          initial={
            editing === 'new'
              ? {}
              : {
                  date: editing.date,
                  personIds: editing.personIds,
                  durationMinutes: editing.durationMinutes,
                  category: editing.category,
                  targets: editing.targets,
                  materials: editing.materials,
                  notes: editing.notes,
                }
          }
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function Totals({ title, rows }: { title: string; rows: ReturnType<typeof totals> }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold">{title}</h2>
      <table className="mt-1 w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-stone-100 dark:border-stone-800">
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-right tabular-nums text-stone-500 dark:text-stone-400">
                {r.count}
              </td>
              <td className="py-1 text-right tabular-nums">{r.hours.toFixed(1)} h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
