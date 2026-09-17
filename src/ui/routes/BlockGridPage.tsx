import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import {
  currentTreeByPos,
  positions,
  varietiesByName,
  varietyAt,
  varietyColors,
} from '@/state/derived'
import {
  assignVariety,
  commitEvents,
  planGrafts,
  setBlockStatus,
  setRowDefaultVariety,
  unplanGrafts,
} from '@/state/actions'
import { live } from '@/events/reduce'
import { blockIdOfPosKey } from '@/state/derived'
import { parsePosKey, treeLabel } from '@/model/ids'
import { deleteTree } from '@/state/actions'
import type { NewEvent } from '@/events/types'
import { EMPTY_COLOR, STATUS_COLOR, type ColorBy } from '@/map/geojson'
import { describeNumbering } from '@/engine/layout'
import { planKey } from '@/model/types'
import { Button, Card, Field, NumberInput, PageHeader, Pill, inputClass } from '@/ui/components'
import { VarietyPicker } from '@/ui/tree/VarietyPicker'

export default function BlockGridPage() {
  const { id = '' } = useParams()
  const state = useFarmStore((s) => s.state)
  const block = state.blocks[id]
  const [colorBy, setColorBy] = useState<ColorBy>('variety')
  const [planYear, setPlanYear] = useState(new Date().getFullYear() + 1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ events: NewEvent[]; label: string } | null>(null)
  const [varietyId, setVarietyId] = useState<string | null>(null)
  const [plantedYear, setPlantedYear] = useState(0)

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 8000)
    return () => clearTimeout(t)
  }, [undo])

  const rows = useMemo(
    () =>
      live
        .rows(state)
        .filter((r) => r.blockId === id)
        .sort((a, b) => a.number - b.number),
    [state, id],
  )
  const byRow = useMemo(() => {
    const m = new Map<string, ReturnType<typeof positions>>()
    for (const p of positions(state)) {
      if (p.blockId !== id || !p.rowId) continue
      const list = m.get(p.rowId) ?? []
      list.push(p)
      m.set(p.rowId, list)
    }
    return m
  }, [state, id])
  const loose = positions(state).filter((p) => p.blockId === id && !p.rowId)
  // Trees whose position is no longer generated, after a row was shortened or re-laid out.
  const known = new Set(positions(state).map((p) => p.posKey))
  const orphans = live
    .trees(state)
    .filter((t) => !known.has(t.posKey) && blockIdOfPosKey(state, t.posKey) === id)
    .map((t) => {
      const parsed = parsePosKey(t.posKey)
      const row = 'rowId' in parsed ? state.rows[parsed.rowId] : undefined
      const index = 'rowId' in parsed ? parsed.index : 0
      const label = row ? treeLabel(block?.code ?? '?', row.number, index) : t.posKey
      return { tree: t, row, index, label }
    })
  const colors = varietyColors(state)
  const trees = currentTreeByPos(state)
  const varieties = varietiesByName(state)
  const unrecorded = positions(state).filter((p) => p.blockId === id && !trees.has(p.posKey)).length

  if (!block || block.deleted) {
    return (
      <div>
        <PageHeader title="Block grid" />
        <Card>
          <p className="text-sm">
            That block is not in this farm.{' '}
            <Link to="/blocks" className="underline decoration-dotted">
              All blocks
            </Link>
          </p>
        </Card>
      </div>
    )
  }

  const maxLen = Math.max(0, ...rows.map((r) => byRow.get(r.id)?.length ?? 0))

  const colorOf = (posKey: string): string => {
    const p = positions(state).find((x) => x.posKey === posKey)
    if (!p) return EMPTY_COLOR
    const tree = trees.get(posKey)
    if (colorBy === 'status') return tree ? STATUS_COLOR[tree.status] : EMPTY_COLOR
    if (colorBy === 'plan') {
      const plan = state.plans[planKey(planYear, posKey)]
      return plan && !plan.doneEventId ? (colors.get(plan.varietyId) ?? '#fbbf24') : EMPTY_COLOR
    }
    const v = varietyAt(state, p)
    return v ? (colors.get(v.id) ?? EMPTY_COLOR) : EMPTY_COLOR
  }

  const toggle = (posKey: string, shift: boolean, column: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (shift && anchor && column.includes(anchor)) {
        const a = column.indexOf(anchor)
        const b = column.indexOf(posKey)
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(column[i])
      } else if (next.has(posKey)) next.delete(posKey)
      else next.add(posKey)
      return next
    })
    setAnchor(posKey)
  }

  const keys = [...selected]
  const act = (label: string, run: () => NewEvent[]) => {
    const inverse = run()
    setUndo(inverse.length ? { events: inverse, label } : null)
    setSelected(new Set())
  }

  const planCounts = new Map<string, number>()
  for (const plan of Object.values(state.plans)) {
    if (plan.year !== planYear || plan.doneEventId) continue
    const p = positions(state).find((x) => x.posKey === plan.posKey)
    if (p?.blockId !== id) continue
    planCounts.set(plan.varietyId, (planCounts.get(plan.varietyId) ?? 0) + 1)
  }

  return (
    <div className="space-y-4">
      <PageHeader title={`${block.code} · ${block.name}`} subtitle={describeNumbering(block)}>
        <Link
          to={
            rows[0] && byRow.get(rows[0].id)?.[0]
              ? `/?focus=${encodeURIComponent(byRow.get(rows[0].id)![0].posKey)}`
              : '/'
          }
          className="text-sm underline decoration-dotted"
        >
          Map
        </Link>
        <Field label="Color by">
          <select
            className={inputClass}
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as ColorBy)}
          >
            <option value="variety">variety</option>
            <option value="status">status</option>
            <option value="plan">graft plan</option>
          </select>
        </Field>
        {colorBy === 'plan' && (
          <Field label="Plan year">
            <NumberInput value={planYear} min={2000} max={2100} step={1} onChange={setPlanYear} />
          </Field>
        )}
      </PageHeader>

      {rows.length === 0 && loose.length === 0 ? (
        <Card>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            No rows yet. Draw them on the{' '}
            <Link to="/" className="underline decoration-dotted">
              map
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-2">
          <table className="border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="w-8 text-stone-400">#</th>
                {rows.map((r) => {
                  const dv = r.defaultVarietyId ? state.varieties[r.defaultVarietyId] : undefined
                  const column = (byRow.get(r.id) ?? []).map((p) => p.posKey)
                  return (
                    <th key={r.id} className="min-w-14 align-top font-medium">
                      <button
                        className="w-full rounded px-1 py-0.5 hover:bg-stone-100 dark:hover:bg-stone-800"
                        title="Select the whole row"
                        onClick={() =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            const all = column.every((k) => next.has(k))
                            for (const k of column) all ? next.delete(k) : next.add(k)
                            return next
                          })
                        }
                      >
                        {block.code}-{r.number}
                      </button>
                      <div
                        className="truncate text-[10px] font-normal text-stone-500 dark:text-stone-400"
                        title={dv?.name}
                      >
                        {dv?.name ?? '—'}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxLen }, (_, i) => (
                <tr key={i}>
                  <td className="text-right text-stone-400">{i + 1}</td>
                  {rows.map((r) => {
                    const column = (byRow.get(r.id) ?? []).map((p) => p.posKey)
                    const p = byRow.get(r.id)?.[i]
                    if (!p) return <td key={r.id} />
                    const tree = trees.get(p.posKey)
                    const v = varietyAt(state, p)
                    const plan = state.plans[planKey(planYear, p.posKey)]
                    const isSel = selected.has(p.posKey)
                    return (
                      <td key={r.id} className="p-0">
                        <button
                          className={clsx(
                            'flex h-9 w-full items-center justify-center rounded border text-[10px] leading-none',
                            isSel
                              ? 'border-stone-900 dark:border-white ring-2 ring-lime-500'
                              : 'border-stone-300 dark:border-stone-600',
                            !tree && 'opacity-60',
                          )}
                          style={{ background: colorOf(p.posKey) }}
                          title={`${p.label}${v ? ` · ${v.name}` : ''}${tree ? ` · ${tree.status}` : ' · empty'}${plan && !plan.doneEventId ? ` · plan ${planYear}: ${state.varieties[plan.varietyId]?.name ?? ''}` : ''}`}
                          onClick={(e) => toggle(p.posKey, e.shiftKey, column)}
                          onDoubleClick={() => {
                            window.location.hash = `#/t/${encodeURIComponent(p.label)}`
                          }}
                        >
                          <span className="rounded bg-white/70 px-1 text-stone-900">{p.index}</span>
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {loose.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {loose.map((p) => (
                <Link
                  key={p.posKey}
                  to={`/t/${encodeURIComponent(p.label)}`}
                  className="rounded border border-stone-300 dark:border-stone-600 px-2 py-1 text-xs"
                  style={{ background: colorOf(p.posKey) }}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            Click a position to select it, shift-click for a range, click a row heading for the
            whole row. Double-click opens the tree.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">
          Selection <Pill>{keys.length}</Pill>
        </h2>
        {keys.length === 1 && (
          <p className="mt-1 text-sm">
            <Link
              to={`/t/${encodeURIComponent(positions(state).find((p) => p.posKey === keys[0])?.label ?? '')}`}
              className="underline decoration-dotted"
            >
              Open {positions(state).find((p) => p.posKey === keys[0])?.label}
            </Link>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <Field label="Variety">
            <VarietyPicker value={varietyId} onChange={setVarietyId} species={block.species} />
          </Field>
          <Button
            variant="primary"
            disabled={keys.length === 0}
            onClick={() => act('variety assigned', () => assignVariety(keys, varietyId))}
            title="Set the variety of the selected trees; empty positions get a tree of this variety"
          >
            Assign variety
          </Button>
          <Button
            disabled={keys.length === 0 || !varietyId}
            onClick={() => act('graft planned', () => planGrafts(planYear, keys, varietyId!))}
          >
            Plan graft for {planYear}
          </Button>
          <Button
            disabled={keys.length === 0}
            onClick={() => act('plan cleared', () => unplanGrafts(planYear, keys))}
          >
            Clear plan
          </Button>
          <Button
            variant="ghost"
            disabled={keys.length === 0}
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </Button>
        </div>
        {undo && (
          <p role="status" className="mt-2 flex items-center gap-2 text-sm">
            <span>Done: {undo.label}.</span>
            <Button
              variant="ghost"
              onClick={() => {
                commitEvents(undo.events)
                setUndo(null)
              }}
            >
              Undo
            </Button>
          </p>
        )}
      </Card>

      {block.status === 'planned' && (
        <Card className="border-sky-300 dark:border-sky-700">
          <h2 className="font-semibold">
            Planned layout <Pill tone="info">not in the ground</Pill>
          </h2>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
            Positions show their row's variety but nothing is recorded as a tree yet. When this
            block is planted, mark it so: every position ({unrecorded} without a record) becomes a
            tree you can log against.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Field label="Planted in (optional)">
              <NumberInput
                value={plantedYear}
                min={1900}
                max={2100}
                step={1}
                onChange={setPlantedYear}
              />
            </Field>
            <Button
              variant="primary"
              onClick={() => {
                const n = setBlockStatus(id, 'planted', plantedYear > 0 ? plantedYear : undefined)
                setUndo(null)
                setSelected(new Set())
                if (n) setPlantedYear(0)
              }}
            >
              Mark as planted
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Row defaults</h2>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          A row's default variety fills its empty positions on the map and in this grid.
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="w-16 font-medium">
                {block.code}-{r.number}
              </span>
              <select
                className={inputClass}
                value={r.defaultVarietyId ?? ''}
                onChange={(e) => setRowDefaultVariety(r.id, e.target.value || null)}
              >
                <option value="">mixed / none</option>
                {varieties.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </Card>

      {orphans.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <h2 className="font-semibold">Trees without a position</h2>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
            These trees are still on record, but their row no longer reaches their position.
            Lengthen the row (more trees in the row's settings on the map) to bring them back, or
            remove the tree if it never existed.
          </p>
          <ul className="mt-2 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
            {orphans.map(({ tree, row, index, label }) => (
              <li key={tree.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  <span className="font-medium">{label}</span>{' '}
                  <span className="text-stone-500 dark:text-stone-400">
                    {tree.varietyId ? (state.varieties[tree.varietyId]?.name ?? '') : ''}
                    {row
                      ? ` · row ${row.number} now has ${positions(state).filter((p) => p.rowId === row.id).length} positions, this was ${index}`
                      : ''}
                  </span>
                </span>
                <Button variant="ghost" onClick={() => deleteTree(tree.id)}>
                  Remove tree
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {planCounts.size > 0 && (
        <Card>
          <h2 className="font-semibold">Graft plan {planYear}: scionwood to gather</h2>
          <ul className="mt-2 text-sm">
            {[...planCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([vid, n]) => (
                <li key={vid} className="flex justify-between">
                  <span>{state.varieties[vid]?.name ?? 'unknown'}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Legend</h2>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {colorBy === 'status'
            ? Object.entries(STATUS_COLOR).map(([k, c]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded" style={{ background: c }} /> {k}
                </span>
              ))
            : varieties.map((v) => (
                <span key={v.id} className="flex items-center gap-1">
                  <span
                    className="inline-block h-3 w-3 rounded"
                    style={{ background: colors.get(v.id) }}
                  />{' '}
                  {v.name}
                </span>
              ))}
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded" style={{ background: EMPTY_COLOR }} />{' '}
            unknown or empty
          </span>
        </div>
      </Card>
    </div>
  )
}
