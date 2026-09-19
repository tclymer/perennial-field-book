import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { positions } from '@/state/derived'
import { today } from '@/state/actions'
import { createTask } from '@/state/taskActions'
import { contextFrom, bucketName } from '@/engine/tasks'
import { parseKeep, type Guess, type KeepGroup } from '@/engine/keep'
import { targetLabel } from '@/engine/logs'
import { categoryLabel } from '@/model/categories'
import { BUCKETS, type Bucket } from '@/model/types'
import { Button, Card, PageHeader, inputClass } from '@/ui/components'

interface Choice {
  guess: Guess
  bucket: Bucket
}

/** Paste the Keep note, confirm what each heading is, and land the whole list at once. */
export default function KeepImportPage() {
  const state = useFarmStore((s) => s.state)
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [choices, setChoices] = useState<Record<number, Choice>>({})
  const [done, setDone] = useState<number | null>(null)

  const groups = useMemo(() => {
    if (!text.trim()) return []
    const ctx = contextFrom(
      state,
      positions(state).map((p) => p.label),
    )
    return parseKeep(text, ctx, state.farm?.bucketNames ?? {})
  }, [text, state])

  const choiceFor = (i: number, g: KeepGroup): Choice =>
    choices[i] ?? { guess: g.guess, bucket: g.bucket ?? 'now' }

  const total = groups.reduce(
    (n, g, i) => (choiceFor(i, g).guess === 'skip' ? n : n + g.items.length),
    0,
  )

  const importAll = () => {
    let count = 0
    groups.forEach((g, i) => {
      const c = choiceFor(i, g)
      if (c.guess === 'skip') return
      let projectId: string | undefined
      if (c.guess === 'project' && g.heading) {
        projectId = createTask({ title: g.heading, bucket: 'project' })
      }
      const bucket: Bucket = c.guess === 'project' ? 'now' : c.bucket
      for (const item of g.items) {
        const { done: isDone, ...fields } = item.parsed
        createTask({
          ...fields,
          bucket,
          ...(projectId ? { projectId } : {}),
          ...(isDone ? { done: true, doneAt: today() } : {}),
        })
        count += 1
      }
      if (c.guess === 'task' && g.heading) {
        createTask({ title: g.heading, bucket: c.bucket })
        count += 1
      }
    })
    setDone(count)
    setText('')
    setChoices({})
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Paste a list"
        subtitle="From Google Keep, a note, a text, anywhere. Headings become lists or projects; lines become tasks."
      >
        <Link to="/tasks" className="text-sm underline decoration-dotted">
          Tasks
        </Link>
      </PageHeader>

      {done !== null && (
        <Card className="border-lime-300 dark:border-lime-700">
          <p className="text-sm">
            Imported {done} {done === 1 ? 'task' : 'tasks'}.{' '}
            <button
              type="button"
              className="underline decoration-dotted"
              onClick={() => navigate('/tasks')}
            >
              See them
            </button>
            , or paste another list below.
          </p>
        </Card>
      )}

      <Card>
        <textarea
          className={clsx(inputClass, 'min-h-40 w-full font-mono text-xs')}
          value={text}
          placeholder={
            'Monkeys\nwater the gray house\norder elderberry posts - Marissa\nSpinning Plates\ntrain kiwis\n…'
          }
          onChange={(e) => setText(e.target.value)}
        />
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Copy the whole list and paste it here. Indentation is usually lost in a paste, so headings
          are guessed from their words; correct any guess below before importing.
        </p>
      </Card>

      {groups.map((g, i) => {
        const c = choiceFor(i, g)
        return (
          <Card key={i} className={clsx(c.guess === 'skip' && 'opacity-60')}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{g.heading ?? 'Before the first heading'}</h2>
              {g.reason && (
                <span className="text-xs text-stone-500 dark:text-stone-400">{g.reason}</span>
              )}
              <select
                aria-label="What this heading is"
                className={clsx(inputClass, 'ml-auto')}
                value={c.guess === 'bucket' ? `bucket:${c.bucket}` : c.guess}
                onChange={(e) => {
                  const v = e.target.value
                  setChoices({
                    ...choices,
                    [i]: v.startsWith('bucket:')
                      ? { guess: 'bucket', bucket: v.slice(7) as Bucket }
                      : { guess: v as Guess, bucket: c.bucket },
                  })
                }}
              >
                {BUCKETS.filter((b) => b !== 'project').map((b) => (
                  <option key={b} value={`bucket:${b}`}>
                    List: {bucketName(state.farm, b)}
                  </option>
                ))}
                <option value="project">A project with these subtasks</option>
                <option value="task">
                  A task itself (lines go to {bucketName(state.farm, c.bucket)})
                </option>
                <option value="skip">Skip</option>
              </select>
            </div>
            <ul className="mt-2 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
              {g.items.map((it, j) => (
                <li key={j} className="py-1.5">
                  <span className={clsx(it.parsed.done && 'line-through')}>{it.parsed.title}</span>
                  <span className="ml-2 inline-flex flex-wrap gap-1 text-xs text-stone-500 dark:text-stone-400">
                    {it.parsed.targets.map((t, k) => (
                      <span key={k} className="rounded-full bg-stone-100 dark:bg-stone-800 px-2">
                        {targetLabel(state, t)}
                      </span>
                    ))}
                    {it.parsed.category && (
                      <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2">
                        {categoryLabel(it.parsed.category, state.farm?.categories)}
                      </span>
                    )}
                    {it.parsed.ownerId && (
                      <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2">
                        {state.people[it.parsed.ownerId]?.name}
                      </span>
                    )}
                    {it.parsed.season && <span>{it.parsed.season}</span>}
                    {it.parsed.needsDiscussion && <span>discuss</span>}
                    {it.parsed.notes && <span title={it.parsed.notes}>note</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}

      {groups.length > 0 && (
        <div className="sticky bottom-16 md:bottom-4">
          <Button variant="primary" disabled={total === 0} onClick={importAll}>
            Import {total} {total === 1 ? 'task' : 'tasks'}
          </Button>
        </div>
      )}
    </div>
  )
}
