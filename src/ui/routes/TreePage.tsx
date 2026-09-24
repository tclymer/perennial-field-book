import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { positionByLabel, treesAt, varietyAt } from '@/state/derived'
import { live } from '@/events/reduce'
import { describeNumbering } from '@/engine/layout'
import { parseTreeLabel } from '@/model/ids'
import { formatTagId, tagsFor } from '@/engine/tags'
import { traitsOf } from '@/engine/traits'
import type { Tree } from '@/model/types'
import { Button, Card, PageHeader, Pill, inputClass, type Tone } from '@/ui/components'
import { ActionSheet } from '@/ui/tree/ActionSheet'
import { History } from '@/ui/tree/History'
import { PhotoStrip } from '@/ui/tree/PhotoStrip'
import { LogWork } from '@/ui/tree/LogWork'
import { TreeHarvest } from '@/ui/tree/TreeHarvest'
import { addTreeEvent, completePlannedGraft, removePosition, updateTree } from '@/state/actions'

const STATUS_TONE: Record<Tree['status'], Tone> = {
  alive: 'good',
  struggling: 'warn',
  dead: 'bad',
  removed: 'neutral',
}

/**
 * Whether a tree is still there. It sits with the status rather than among the actions,
 * because it happens once in a tree's life and the actions are things done weekly.
 *
 * It is not a note, because the status is load-bearing: a harvest recorded by variety and
 * place is split across the living trees of that variety, so a tree that is gone and not
 * marked keeps drawing a share and every survivor reads low.
 */
function GoneControl({
  tree,
  posKey,
  label,
  onDone,
}: {
  tree: Tree
  posKey: string
  label: string
  onDone: (message: string) => void
}) {
  const [asking, setAsking] = useState(false)
  const gone = tree.status === 'dead' || tree.status === 'removed'
  const inRow = posKey.includes(':')

  if (gone) {
    return (
      <span className="flex items-center gap-2">
        <Pill tone={STATUS_TONE[tree.status]}>gone</Pill>
        <button
          type="button"
          className="text-xs underline decoration-dotted text-stone-500 dark:text-stone-400"
          onClick={() => {
            updateTree(tree.id, { status: 'alive' })
            onDone('Back to standing.')
          }}
        >
          still there after all
        </button>
      </span>
    )
  }

  if (!asking) {
    return (
      <span className="flex items-center gap-2">
        <Pill tone={STATUS_TONE[tree.status]}>{tree.status}</Pill>
        <button
          type="button"
          className="text-xs underline decoration-dotted text-stone-500 dark:text-stone-400"
          onClick={() => setAsking(true)}
        >
          dead or gone
        </button>
      </span>
    )
  }

  return (
    <div className="w-full max-w-sm rounded-md border border-stone-200 p-2 text-sm dark:border-stone-700">
      <p>
        {label} is gone. Why it went can go in a note. Does the spot stay in the row for a
        replacement?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            addTreeEvent(tree.id, 'removed')
            setAsking(false)
            onDone('Recorded as gone. The spot is still in the row.')
          }}
        >
          Keep the spot
        </Button>
        {inRow && (
          <Button
            onClick={() => {
              const r = removePosition(posKey)
              setAsking(false)
              onDone(
                r.ok
                  ? 'Recorded as gone, and the spot is out of the row. The trees after it have moved up a number.'
                  : r.reason,
              )
            }}
          >
            Close the gap
          </Button>
        )}
        <Button variant="ghost" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
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
  const tags = tagsFor(state, { kind: 'tree', posKey: position.posKey })

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
        <Link to="/tags" className="text-sm underline decoration-dotted">
          {tags.length === 0
            ? 'No tag'
            : tags.length === 1
              ? `Tag ${formatTagId(tags[0]!.id)}`
              : `${tags.length} tags`}
        </Link>
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
              {variety && traitsOf(variety).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {traitsOf(variety).map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-stone-300 px-2 py-0.5 text-xs text-stone-600 dark:border-stone-600 dark:text-stone-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
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
            <GoneControl
              tree={current}
              posKey={position.posKey}
              label={position.label}
              onDone={setMessage}
            />
          </div>
        ) : (
          <p className="text-sm">
            Empty position.
            {rowVariety && ` The row is ${rowVariety.name}.`}
          </p>
        )}
        {current && (
          <label className="mt-3 block text-sm">
            <span className="text-stone-600 dark:text-stone-400">About this tree</span>
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
        <PlannedGraft posKey={position.posKey} onDone={setMessage} />
        <div className="mt-4">
          <ActionSheet
            posKey={position.posKey}
            tree={current}
            species={variety?.species ?? block?.species}
            onDone={setMessage}
          />
          <div className="mt-2">
            <LogWork posKey={position.posKey} onDone={setMessage} />
          </div>
        </div>
        <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
          <TreeHarvest
            posKey={position.posKey}
            crop={variety?.species ?? block?.species}
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

/** Open graft plans for this position, with a one-tap "done" that records the graft. */
function PlannedGraft({ posKey, onDone }: { posKey: string; onDone: (m: string) => void }) {
  const state = useFarmStore((s) => s.state)
  const plans = Object.values(state.plans)
    .filter((p) => p.posKey === posKey && !p.doneEventId)
    .sort((a, b) => a.year - b.year)
  if (plans.length === 0) return null
  return (
    <div className="mt-3 space-y-1">
      {plans.map((p) => (
        <div
          key={p.year}
          className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 text-sm"
        >
          <span>
            Planned for {p.year}: graft to{' '}
            <strong>{state.varieties[p.varietyId]?.name ?? 'unknown'}</strong>
          </span>
          <Button
            onClick={() => {
              const r = completePlannedGraft(p.year, posKey)
              onDone(r.ok ? 'Graft recorded and the plan marked done.' : r.reason)
            }}
          >
            Grafted today
          </Button>
        </div>
      ))}
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
