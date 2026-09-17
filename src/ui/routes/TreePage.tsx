import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { positionByLabel, treesAt, varietyAt } from '@/state/derived'
import { live } from '@/events/reduce'
import { describeNumbering } from '@/engine/layout'
import { parseTreeLabel } from '@/model/ids'
import type { Tree } from '@/model/types'
import { Button, Card, PageHeader, Pill, inputClass, type Tone } from '@/ui/components'
import { ActionSheet } from '@/ui/tree/ActionSheet'
import { History } from '@/ui/tree/History'
import { PhotoStrip } from '@/ui/tree/PhotoStrip'
import { updateTree } from '@/state/actions'

const STATUS_TONE: Record<Tree['status'], Tone> = {
  alive: 'good',
  struggling: 'warn',
  dead: 'bad',
  removed: 'neutral',
}

export default function TreePage() {
  const { label = '' } = useParams()
  const state = useFarmStore((s) => s.state)
  const [message, setMessage] = useState<string | null>(null)
  const parsed = parseTreeLabel(decodeURIComponent(label))
  const position = parsed
    ? positionByLabel(state).get(decodeURIComponent(label).toUpperCase())
    : undefined

  if (!position) {
    return (
      <div className="space-y-3">
        <PageHeader title={decodeURIComponent(label) || 'Tree'} />
        <Card>
          <p className="text-sm">
            That label is not in this farm. Check the block code, row, and position, or{' '}
            <Link
              to={`/search?q=${encodeURIComponent(label)}`}
              className="underline decoration-dotted"
            >
              search for it
            </Link>
            .
          </p>
        </Card>
      </div>
    )
  }

  const block = state.blocks[position.blockId]
  const row = position.rowId ? state.rows[position.rowId] : null
  const trees = treesAt(state, position.posKey)
  const current = trees[0] ?? null
  const previous = trees.slice(1)
  const variety = varietyAt(state, position)
  const events = current ? live.treeEvents(state, current.id) : []
  const rowVariety = row?.defaultVarietyId ? state.varieties[row.defaultVarietyId] : undefined

  return (
    <div className="space-y-4">
      <PageHeader
        title={position.label}
        subtitle={[
          block?.name,
          row ? `row ${row.number}, position ${position.index}` : `position ${position.index}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        <Link
          to={`/?focus=${encodeURIComponent(position.posKey)}`}
          className="text-sm underline decoration-dotted"
        >
          Show on map
        </Link>
        {block && (
          <Link to={`/blocks/${block.id}/grid`} className="text-sm underline decoration-dotted">
            Block grid
          </Link>
        )}
      </PageHeader>

      <Card>
        {current ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">
                {variety?.name ?? 'Variety unknown'}
                {variety?.species && (
                  <span className="ml-2 text-sm font-normal text-stone-500 dark:text-stone-400">
                    {variety.species}
                  </span>
                )}
              </div>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-3">
                {current.plantedDate && (
                  <>
                    <dt className="text-stone-500 dark:text-stone-400">Planted</dt>
                    <dd className="sm:col-span-2">{current.plantedDate}</dd>
                  </>
                )}
                {current.graftedDate && (
                  <>
                    <dt className="text-stone-500 dark:text-stone-400">Grafted</dt>
                    <dd className="sm:col-span-2">{current.graftedDate}</dd>
                  </>
                )}
                {current.firstFruitYear && (
                  <>
                    <dt className="text-stone-500 dark:text-stone-400">First fruit</dt>
                    <dd className="sm:col-span-2">{current.firstFruitYear}</dd>
                  </>
                )}
                {current.rootstock && (
                  <>
                    <dt className="text-stone-500 dark:text-stone-400">Rootstock</dt>
                    <dd className="sm:col-span-2">{current.rootstock}</dd>
                  </>
                )}
              </dl>
            </div>
            <Pill tone={STATUS_TONE[current.status]}>{current.status}</Pill>
          </div>
        ) : (
          <p className="text-sm">
            Empty position.
            {rowVariety && ` The row is ${rowVariety.name}.`}
          </p>
        )}
        {current && (
          <label className="mt-3 block text-sm">
            <span className="text-stone-600 dark:text-stone-400">Notes about this tree</span>
            <textarea
              className={`${inputClass} mt-1 min-h-16 w-full`}
              defaultValue={current.notes ?? ''}
              placeholder="Hardiness, form, vigor, anything worth remembering"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (current.notes ?? '')) updateTree(current.id, { notes: v || null })
              }}
            />
          </label>
        )}
        <div className="mt-4">
          <ActionSheet
            posKey={position.posKey}
            tree={current}
            species={variety?.species ?? block?.species}
            onDone={setMessage}
          />
        </div>
        {message && (
          <p role="status" className="mt-2 text-sm text-lime-800 dark:text-lime-300">
            {message}
          </p>
        )}
      </Card>

      {current && (
        <Card>
          <h2 className="font-semibold">History</h2>
          <PhotoStrip events={events} />
          <History events={events} state={state} />
        </Card>
      )}

      {previous.length > 0 && <PreviousTrees trees={previous} />}

      {block && (
        <p className="text-xs text-stone-500 dark:text-stone-400">{describeNumbering(block)}</p>
      )}
    </div>
  )
}

function PreviousTrees({ trees }: { trees: Tree[] }) {
  const state = useFarmStore((s) => s.state)
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <button
        className="flex w-full items-center justify-between font-semibold"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>
          Earlier trees at this position <Pill>{trees.length}</Pill>
        </span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {trees.map((t) => {
            const v = t.varietyId ? state.varieties[t.varietyId] : undefined
            return (
              <div key={t.id}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{v?.name ?? 'Variety unknown'}</span>
                  <Pill tone={STATUS_TONE[t.status]}>{t.status}</Pill>
                  {t.plantedDate && (
                    <span className="text-stone-500 dark:text-stone-400">
                      planted {t.plantedDate}
                    </span>
                  )}
                </div>
                <History events={live.treeEvents(state, t.id)} state={state} canDelete={false} />
              </div>
            )
          })}
        </div>
      )}
      {!open && (
        <Button variant="ghost" className="mt-1" onClick={() => setOpen(true)}>
          Show
        </Button>
      )}
    </Card>
  )
}
