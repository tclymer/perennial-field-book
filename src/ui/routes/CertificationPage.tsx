import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { downloadText, fileSlug } from '@/events/bundle'
import {
  applications,
  applicationsToCsv,
  harvestsInRange,
  logsInCategories,
  logsInRange,
  plantingStock,
  plantingStockToCsv,
  summarize,
  yearRange,
  type Range,
} from '@/engine/certification'
import { harvestsToCsv } from '@/engine/harvest'
import { logsToCsv, targetLabel } from '@/engine/logs'
import { categoryLabel } from '@/model/categories'
import { Button, Card, Field, PageHeader, Pill, inputClass } from '@/ui/components'

/** The categories a certifier asks about beyond inputs and harvest. */
const HOUSEKEEPING = ['maintenance', 'construction', 'other']

/**
 * The packet a certifier asks for (DESIGN.md §7), built from records the farm keeps anyway:
 * what was applied and where, what came off, where the trees came from, and how equipment and
 * buffers were handled. Everything downloads as CSV, and the page itself prints as the
 * summary sheet that goes in front of them.
 */
export default function CertificationPage() {
  const state = useFarmStore((s) => s.state)
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [custom, setCustom] = useState<Range | null>(null)
  const range = custom ?? yearRange(year)

  const apps = useMemo(() => applications(state, range), [state, range])
  const stock = useMemo(() => plantingStock(state), [state])
  const harvests = useMemo(() => harvestsInRange(state, range), [state, range])
  const logs = useMemo(() => logsInRange(state, range), [state, range])
  const housekeeping = useMemo(() => logsInCategories(state, range, HOUSEKEEPING), [state, range])
  const sum = useMemo(() => summarize(state, range), [state, range])

  const name = fileSlug(state.farm?.name ?? 'farm')
  const label = custom ? `${range.from}_${range.to}` : String(year)
  const save = (what: string, text: string) =>
    downloadText(`${name}-${what}-${label}.csv`, text, 'text/csv')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Certification records"
        subtitle={`${state.farm?.name ?? 'This farm'}, ${custom ? `${range.from} to ${range.to}` : year}`}
      >
        <Button onClick={() => window.print()}>Print this summary</Button>
      </PageHeader>

      <Card className="print:hidden">
        <h2 className="font-semibold">Which season</h2>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <Button
              key={y}
              variant={!custom && year === y ? 'primary' : 'secondary'}
              onClick={() => {
                setCustom(null)
                setYear(y)
              }}
            >
              {y}
            </Button>
          ))}
          <Field label="From">
            <input
              type="date"
              className={inputClass}
              value={range.from}
              onChange={(e) => setCustom({ from: e.target.value, to: range.to })}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className={inputClass}
              value={range.to}
              onChange={(e) => setCustom({ from: range.from, to: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">The season at a glance</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <Stat label="Applications" value={sum.applications} />
          <Stat label="Products used" value={sum.products.length} />
          <Stat label="Harvest entries" value={sum.harvestEntries} />
          <Stat label="Hours logged" value={sum.hours} />
        </dl>
        {sum.harvestByCrop.length > 0 && (
          <p className="mt-2 text-sm">
            {sum.harvestByCrop.map((c) => `${c.quantity} ${c.unit} of ${c.crop}`).join(', ')}
          </p>
        )}
        {sum.products.length > 0 && (
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Products: {sum.products.join(', ')}
          </p>
        )}
        {(sum.varietiesWithoutSource.length > 0 || sum.treesWithoutPlantedDate > 0) && (
          <div className="mt-3 rounded-md border border-amber-300 p-2 text-sm dark:border-amber-700">
            <p className="font-medium">Gaps a certifier is likely to ask about</p>
            <ul className="mt-1 list-inside list-disc text-stone-700 dark:text-stone-300">
              {sum.varietiesWithoutSource.length > 0 && (
                <li>
                  No source recorded for {sum.varietiesWithoutSource.length}{' '}
                  {sum.varietiesWithoutSource.length === 1 ? 'variety' : 'varieties'}:{' '}
                  {sum.varietiesWithoutSource.slice(0, 6).join(', ')}
                  {sum.varietiesWithoutSource.length > 6 && ', and more'}.{' '}
                  <Link to="/varieties" className="underline decoration-dotted print:hidden">
                    Add it on Varieties
                  </Link>
                </li>
              )}
              {sum.treesWithoutPlantedDate > 0 && (
                <li>
                  {sum.treesWithoutPlantedDate}{' '}
                  {sum.treesWithoutPlantedDate === 1 ? 'tree has' : 'trees have'} no planted date.
                </li>
              )}
            </ul>
          </div>
        )}
      </Card>

      <Section
        title="Input applications"
        hint="Every product that went out, one line each, with where it went and who applied it."
        count={apps.length}
        onSave={apps.length ? () => save('inputs', applicationsToCsv(apps)) : undefined}
      >
        {apps.length === 0 ? (
          <Empty>
            Nothing recorded in this range. Materials go on a work log when the category is spraying
            or fertilizing.
          </Empty>
        ) : (
          <Table head={['Date', 'Product', 'Rate', 'Amount', 'Lot', 'Where', 'By']}>
            {apps.map((a, i) => (
              <tr
                key={`${a.logId}-${i}`}
                className="border-t border-stone-100 dark:border-stone-800"
              >
                <Td>{a.date}</Td>
                <Td>{a.product}</Td>
                <Td>{a.rate ?? ''}</Td>
                <Td>{a.amount !== undefined ? `${a.amount} ${a.unit ?? ''}`.trim() : ''}</Td>
                <Td>{a.lot ?? ''}</Td>
                <Td>{a.where}</Td>
                <Td>{a.people}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title="Harvest"
        hint="What came off, by date and place."
        count={harvests.length}
        onSave={harvests.length ? () => save('harvest', harvestsToCsv(state, harvests)) : undefined}
      >
        {harvests.length === 0 ? (
          <Empty>Nothing harvested in this range.</Empty>
        ) : (
          <p className="text-sm">
            {sum.harvestByCrop.map((c) => `${c.quantity} ${c.unit} of ${c.crop}`).join(', ')}, over{' '}
            {harvests.length} {harvests.length === 1 ? 'entry' : 'entries'}. The CSV has one line
            per box.
          </p>
        )}
      </Section>

      <Section
        title="Planting stock"
        hint="Where the trees came from and when they went in. Not limited by the date range."
        count={stock.length}
        onSave={stock.length ? () => save('planting-stock', plantingStockToCsv(stock)) : undefined}
      >
        {stock.length === 0 ? (
          <Empty>No trees recorded with a variety yet.</Empty>
        ) : (
          <Table head={['Species', 'Variety', 'Source', 'Trees', 'Blocks', 'Planted']}>
            {stock.map((s) => (
              <tr
                key={`${s.species}-${s.variety}`}
                className="border-t border-stone-100 dark:border-stone-800"
              >
                <Td>{s.species}</Td>
                <Td>
                  {s.variety}
                  {s.group && (
                    <span className="ml-1 text-xs text-stone-500 dark:text-stone-400">
                      {s.group}
                    </span>
                  )}
                </Td>
                <Td>
                  {s.source === 'not recorded' ? <Pill tone="warn">not recorded</Pill> : s.source}
                </Td>
                <Td>{s.trees}</Td>
                <Td>{s.blocks}</Td>
                <Td>
                  {s.firstPlanted ?? ''}
                  {s.lastPlanted ? ` to ${s.lastPlanted}` : ''}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title="Equipment and buffers"
        hint="Maintenance, construction and other logs, where cleaning and buffer work is usually written."
        count={housekeeping.length}
        onSave={
          housekeeping.length
            ? () => save('equipment-and-buffers', logsToCsv(state, housekeeping))
            : undefined
        }
      >
        {housekeeping.length === 0 ? (
          <Empty>
            Nothing in this range. These come from work logs in the maintenance, construction or
            other categories.
          </Empty>
        ) : (
          <Table head={['Date', 'Category', 'Where', 'Notes']}>
            {housekeeping.map((l) => (
              <tr key={l.id} className="border-t border-stone-100 dark:border-stone-800">
                <Td>{l.date}</Td>
                <Td>{categoryLabel(l.category, state.farm?.categories)}</Td>
                <Td>{l.targets.map((t) => targetLabel(state, t)).join('; ')}</Td>
                <Td>{l.notes ?? ''}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Card className="print:hidden">
        <h2 className="font-semibold">Everything at once</h2>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          All work logs in the range, whatever the category, for anything the sections above do not
          cover.
        </p>
        <Button
          className="mt-2"
          disabled={logs.length === 0}
          onClick={() => save('all-work-logs', logsToCsv(state, logs))}
        >
          Download all {logs.length} work logs
        </Button>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  )
}

function Section({
  title,
  hint,
  count,
  onSave,
  children,
}: {
  title: string
  hint: string
  count: number
  onSave?: () => void
  children: React.ReactNode
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          {title}{' '}
          <span className="text-sm font-normal text-stone-500 dark:text-stone-400">{count}</span>
        </h2>
        {onSave && (
          <Button className="print:hidden" onClick={onSave}>
            Download CSV
          </Button>
        )}
      </div>
      <p className="mt-1 mb-2 text-xs text-stone-500 dark:text-stone-400">{hint}</p>
      {children}
    </Card>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-stone-600 dark:text-stone-400">{children}</p>
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {head.map((h) => (
              <th key={h} className="pb-1 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-1.5 pr-3 align-top">{children}</td>
}
