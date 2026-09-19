import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { positions } from '@/state/derived'
import { deleteHarvest, updateHarvest } from '@/state/harvestActions'
import {
  cropsOf,
  harvestsToCsv,
  placeLabel,
  sessions,
  yieldBy,
  type YieldRow,
} from '@/engine/harvest'
import { cropKey } from '@/model/harvest'
import { downloadText, fileSlug } from '@/events/bundle'
import { Button, Card, Field, PageHeader, inputClass } from '@/ui/components'
import { round } from './HarvestPage'

/** What came in, by variety, place, and year, and the sessions behind it. */
export default function HarvestReportsPage() {
  const state = useFarmStore((s) => s.state)
  const crops = useMemo(() => cropsOf(state), [state])
  const [crop, setCrop] = useState('')
  const [year, setYear] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const all = live.harvests(state)
  const years = [...new Set(all.map((h) => h.date.slice(0, 4)))].sort().reverse()
  const entries = all
    .filter((h) => !crop || cropKey(h.crop) === crop)
    .filter((h) => !year || h.date.startsWith(year))
  const list = useMemo(
    () =>
      sessions(state).filter(
        (s) => (!crop || s.crop === crop) && (!year || s.date.startsWith(year)),
      ),
    [state, crop, year],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Harvest reports"
        subtitle={`${entries.length} ${entries.length === 1 ? 'box' : 'boxes'} recorded`}
      >
        <div className="flex flex-wrap gap-2">
          <Link to="/harvest" className="text-sm underline decoration-dotted">
            Enter harvest
          </Link>
          <Button
            disabled={entries.length === 0}
            onClick={() =>
              downloadText(
                `${fileSlug(state.farm?.name ?? 'farm')}-harvest-${new Date().toISOString().slice(0, 10)}.csv`,
                harvestsToCsv(state, entries),
                'text/csv',
              )
            }
          >
            Download CSV
          </Button>
        </div>
      </PageHeader>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Crop">
            <select className={inputClass} value={crop} onChange={(e) => setCrop(e.target.value)}>
              <option value="">All</option>
              {crops.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <select className={inputClass} value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {entries.length === 0 ? (
        <Card>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Nothing recorded yet.{' '}
            <Link to="/harvest" className="underline decoration-dotted">
              Enter a box
            </Link>
            .
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Table title="By variety" rows={yieldBy(state, entries, 'variety')} />
            <Table title="By place" rows={yieldBy(state, entries, 'place')} />
            <Table title="By year" rows={yieldBy(state, entries, 'year')} />
            <Table title="By crop" rows={yieldBy(state, entries, 'crop')} />
          </div>
          <Card>
            <h2 className="font-semibold">Variety in each place</h2>
            <Rows rows={yieldBy(state, entries, 'varietyPlace')} />
          </Card>

          <Card>
            <h2 className="font-semibold">Sessions</h2>
            <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
              {list.map((s) => {
                const id = `${s.date}|${s.crop}`
                return (
                  <li key={id} className="py-1.5">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-baseline gap-2 text-left"
                      onClick={() => setOpen(open === id ? null : id)}
                      aria-expanded={open === id}
                    >
                      <span className="tabular-nums">{s.date}</span>
                      <span className="capitalize">{s.crop}</span>
                      <span className="text-stone-500 dark:text-stone-400">
                        {s.totals.map((t) => `${round(t.quantity)} ${t.unit}`).join(', ')} in{' '}
                        {s.entries.length} {s.entries.length === 1 ? 'box' : 'boxes'}
                      </span>
                      <span className="ml-auto text-stone-400">{open === id ? '▾' : '▸'}</span>
                    </button>
                    {open === id && (
                      <ul className="mt-1 divide-y divide-stone-100 pl-4 dark:divide-stone-800">
                        {s.entries.map((e) => (
                          <li key={e.id} className="flex flex-wrap items-center gap-2 py-1">
                            <span className="w-8 tabular-nums text-stone-500 dark:text-stone-400">
                              #{e.box}
                            </span>
                            <input
                              className={`${inputClass} w-20 tabular-nums`}
                              defaultValue={e.quantity}
                              inputMode="decimal"
                              aria-label={`Quantity for box ${e.box}`}
                              onBlur={(ev) => {
                                const q = Number(ev.target.value)
                                if (Number.isFinite(q) && q > 0 && q !== e.quantity) {
                                  updateHarvest(e.id, { quantity: q })
                                } else ev.target.value = String(e.quantity)
                              }}
                            />
                            <span className="text-stone-500 dark:text-stone-400">{e.unit}</span>
                            <span>
                              {e.varietyId ? state.varieties[e.varietyId]?.name : 'Mixed'}
                            </span>
                            <span className="text-stone-500 dark:text-stone-400">
                              {e.posKey
                                ? (positions(state).find((p) => p.posKey === e.posKey)?.label ?? '')
                                : placeLabel(state, e)}
                            </span>
                            <Button
                              variant="ghost"
                              className="ml-auto"
                              onClick={() => deleteHarvest(e.id)}
                            >
                              Delete
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}

function Table({ title, rows }: { title: string; rows: YieldRow[] }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold">{title}</h2>
      <Rows rows={rows} />
    </Card>
  )
}

function Rows({ rows }: { rows: YieldRow[] }) {
  if (rows.length === 0) return null
  return (
    <table className="mt-1 w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-stone-100 dark:border-stone-800">
            <td className="py-1 capitalize">{r.label}</td>
            <td className="py-1 text-right tabular-nums text-stone-500 dark:text-stone-400">
              {r.boxes}
            </td>
            <td className="py-1 text-right tabular-nums">
              {round(r.quantity)} {r.unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
