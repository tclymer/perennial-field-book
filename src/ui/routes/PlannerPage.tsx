import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import {
  backupAgeDays,
  compareAll,
  overheadSummary,
  parseBackup,
  type PlannerBackup,
  type PlantingComparison,
  type Row,
} from '@/engine/compare'
import { applyChanges, changesFrom, fileNameFor } from '@/engine/writeback'
import { downloadText } from '@/events/bundle'
import { categoryLabel } from '@/model/categories'
import { Button, Card, Field, PageHeader, Pill, inputClass } from '@/ui/components'
import { SeedTasks } from '@/ui/planner/SeedTasks'

interface Loaded {
  raw: unknown
  farm: PlannerBackup
  fileName: string
}

/**
 * A season of records beside the planner's estimates (DESIGN.md §6). Nothing is stored: the
 * file is read, compared, and written back out with whatever was ticked.
 */
export default function PlannerPage() {
  const state = useFarmStore((s) => s.state)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<string | null>(null)

  const open = async (file: File) => {
    setError(null)
    setSaved(null)
    try {
      const { raw, farm } = parseBackup(await file.text())
      setLoaded({ raw, farm, fileName: file.name })
      setChosen(new Set())
    } catch (err) {
      setLoaded(null)
      setError(err instanceof Error ? err.message : 'That file could not be read.')
    }
  }

  const result = useMemo(
    () => (loaded ? compareAll(state, loaded.farm, year) : null),
    [state, loaded, year],
  )
  const overhead = useMemo(
    () => (loaded ? overheadSummary(state, loaded.farm, year) : null),
    [state, loaded, year],
  )
  const age = loaded ? backupAgeDays(loaded.farm) : undefined

  const toggle = (key: string) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const download = () => {
    if (!loaded || !result) return
    const changes = result.comparisons.flatMap((c) => changesFrom(c.planting.id, c.rows, chosen))
    const out = applyChanges(loaded.raw, changes)
    downloadText(fileNameFor(loaded.farm.name), out.json, 'application/json')
    setSaved(
      `${out.applied} ${out.applied === 1 ? 'change' : 'changes'} written. Restore this file in the planner, under Settings.`,
    )
  }

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compare with the planner"
        subtitle="What the records say, beside what the plan assumed."
      >
        <Link to="/planner/map" className="text-sm underline decoration-dotted">
          Which work feeds which line
        </Link>
      </PageHeader>

      <Card>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Export a backup from the planner (Settings, "Download a backup"), open it here, tick the
          corrections you believe, and download the file to restore in the planner. Nothing is kept
          in this app.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm">
            <span className="mr-2 text-stone-600 dark:text-stone-400">Planner backup:</span>
            <input
              type="file"
              accept=".json,application/json"
              className="text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void open(f)
                e.target.value = ''
              }}
            />
          </label>
          {loaded && (
            <Field label="Year">
              <select
                className={inputClass}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
            {error}
          </p>
        )}
        {loaded && (
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            {loaded.farm.name ?? 'A farm'} · {loaded.farm.plantings.length} plantings ·{' '}
            {age === undefined
              ? 'no export date in the file'
              : age <= 0
                ? 'exported today'
                : `exported ${age} ${age === 1 ? 'day' : 'days'} ago`}
          </p>
        )}
        {loaded && age !== undefined && age > 0 && (
          <p role="alert" className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            Restoring this file replaces the whole farm in the planner, so anything you changed
            there since it was exported would be lost. Export a fresh backup first if you have been
            editing.
          </p>
        )}
      </Card>

      {result && (
        <>
          {result.comparisons.map((c) => (
            <ComparisonCard key={c.planting.id} comparison={c} chosen={chosen} onToggle={toggle} />
          ))}

          {result.comparisons.length === 0 && (
            <Card>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                No block is linked to a planting in this file. Link them on the{' '}
                <Link to="/import" className="underline decoration-dotted">
                  planner import
                </Link>{' '}
                page, or in a block's own settings.
              </p>
            </Card>
          )}

          {overhead && overhead.hours > 0 && (
            <Card>
              <h2 className="font-semibold">Overhead in {year}</h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                {overhead.hours.toFixed(1)} hours that point at no planting
                {overhead.wage > 0 &&
                  `, worth ${money(overhead.cost)} at the planner's loaded wage of ${money(overhead.wage)} an hour`}
                . The planner has no line for this; compare it against whatever overhead assumption
                the plan carries.
              </p>
              <table className="mt-2 w-full max-w-md text-sm">
                <tbody>
                  {overhead.byCategory.map((c) => (
                    <tr
                      key={c.category}
                      className="border-t border-stone-100 dark:border-stone-800"
                    >
                      <td className="py-1">
                        {categoryLabel(c.category, state.farm?.categories) || 'Uncategorized'}
                      </td>
                      <td className="py-1 text-right tabular-nums">{c.hours.toFixed(1)} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <SeedTasks plantings={loaded!.farm.plantings} />

          {(result.unlinkedBlocks.length > 0 || result.unmatchedPlantings.length > 0) && (
            <Card>
              <h2 className="font-semibold">Not compared</h2>
              {result.unlinkedBlocks.length > 0 && (
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  Blocks with no planting:{' '}
                  {result.unlinkedBlocks.map((b) => `${b.code} ${b.name}`).join(', ')}.
                </p>
              )}
              {result.unmatchedPlantings.length > 0 && (
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  Plantings with no block: {result.unmatchedPlantings.map((p) => p.name).join(', ')}
                  .
                </p>
              )}
            </Card>
          )}

          <Card className="sticky bottom-16 md:bottom-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={chosen.size === 0} onClick={download}>
                Download the updated backup
              </Button>
              <span className="text-sm text-stone-600 dark:text-stone-400">
                {chosen.size === 0
                  ? 'Tick the corrections you believe.'
                  : `${chosen.size} ${chosen.size === 1 ? 'correction' : 'corrections'} ticked.`}
              </span>
            </div>
            {saved && (
              <p role="status" className="mt-2 text-sm text-lime-800 dark:text-lime-300">
                {saved}
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function ComparisonCard({
  comparison,
  chosen,
  onToggle,
}: {
  comparison: PlantingComparison
  chosen: Set<string>
  onToggle: (key: string) => void
}) {
  const { planting, block, rows } = comparison
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          {block.code} {block.name}
          <span className="ml-2 text-sm font-normal text-stone-500 dark:text-stone-400">
            {planting.name}
          </span>
        </h2>
        {comparison.unitMismatch && (
          <Pill tone="warn">
            recorded in {comparison.unitMismatch.farm}, planned in {comparison.unitMismatch.planner}
          </Pill>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Nothing recorded for {comparison.year} that this planting has a line for.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500 dark:text-stone-400">
                <th className="py-1 pr-2 font-medium">Use</th>
                <th className="py-1 pr-2 font-medium">What</th>
                <th className="py-1 pr-2 text-right font-medium">Planned</th>
                <th className="py-1 pr-2 text-right font-medium">Measured</th>
                <th className="py-1 pr-2 font-medium">From</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RowLine
                  key={r.key}
                  row={r}
                  id={`${planting.id}:${r.key}`}
                  checked={chosen.has(`${planting.id}:${r.key}`)}
                  onToggle={onToggle}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function RowLine({
  row,
  id,
  checked,
  onToggle,
}: {
  row: Row
  id: string
  checked: boolean
  onToggle: (key: string) => void
}) {
  const applicable = !row.blocked && row.measured !== undefined
  const diff =
    row.planner !== undefined && row.measured !== undefined && row.planner !== 0
      ? (row.measured - row.planner) / row.planner
      : undefined
  return (
    <tr className="border-t border-stone-100 align-top dark:border-stone-800">
      <td className="py-1.5 pr-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={!applicable}
          aria-label={`Use the measured ${row.title}`}
          onChange={() => onToggle(id)}
        />
      </td>
      <td className="py-1.5 pr-2">
        {row.title}
        {row.coverage !== 'complete' && (
          <Pill tone={row.coverage === 'untracked' ? 'bad' : 'warn'} className="ml-2">
            {row.coverage === 'untracked' ? 'not tracked' : 'partly logged'}
          </Pill>
        )}
        {row.blocked && (
          <span className="block text-xs text-amber-700 dark:text-amber-400">{row.blocked}</span>
        )}
      </td>
      <td className="py-1.5 pr-2 text-right tabular-nums">
        {row.planner === undefined ? '—' : trim(row.planner)}
      </td>
      <td className="py-1.5 pr-2 text-right tabular-nums">
        <span className={clsx(diff !== undefined && Math.abs(diff) > 0.25 && 'font-semibold')}>
          {row.measured === undefined ? '—' : trim(row.measured)}
        </span>
        <span className="ml-1 text-xs text-stone-500 dark:text-stone-400">{row.unit}</span>
        {diff !== undefined && (
          <span className="block text-xs text-stone-500 dark:text-stone-400">
            {diff > 0 ? '+' : ''}
            {Math.round(diff * 100)}%
          </span>
        )}
      </td>
      <td className="py-1.5 pr-2 text-xs text-stone-500 dark:text-stone-400">
        {row.evidence.logs > 0 &&
          `${row.evidence.logs} ${row.evidence.logs === 1 ? 'entry' : 'entries'}`}
        {row.evidence.hours > 0 && `, ${row.evidence.hours.toFixed(1)} h`}
        {row.evidence.quantity !== undefined && `, ${trim(row.evidence.quantity)} picked`}
        {row.evidence.from && (
          <span className="block">
            {row.evidence.from}
            {row.evidence.to && row.evidence.to !== row.evidence.from && ` to ${row.evidence.to}`}
          </span>
        )}
      </td>
    </tr>
  )
}

function trim(n: number): string {
  return Number(n.toFixed(3)).toString()
}
