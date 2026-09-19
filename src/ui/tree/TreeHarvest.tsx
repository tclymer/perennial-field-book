import { useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { treeYieldByYear } from '@/engine/harvest'
import { addHarvest } from '@/state/harvestActions'
import { unitFor } from '@/model/harvest'
import { round } from '@/ui/routes/HarvestPage'
import { Button, inputClass } from '@/ui/components'

/**
 * What this tree has produced: entries logged on the tree itself plus its share of the
 * variety's harvest in its block (DESIGN.md §3.6 trial blocks).
 */
export function TreeHarvest({
  posKey,
  crop,
  onDone,
}: {
  posKey: string
  crop?: string
  onDone?: (message: string) => void
}) {
  const state = useFarmStore((s) => s.state)
  const years = treeYieldByYear(state, posKey)
  const [amount, setAmount] = useState('')
  const unit = unitFor(state.farm, crop ?? '')

  const add = () => {
    const q = Number(amount)
    if (!crop || !Number.isFinite(q) || q <= 0) return
    addHarvest({ crop, quantity: q, posKey })
    setAmount('')
    onDone?.(`Recorded ${q} ${unit} from this tree.`)
  }

  return (
    <div>
      <h2 className="font-semibold">Harvest</h2>
      {years.length === 0 ? (
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Nothing recorded yet.</p>
      ) : (
        <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
          {years.map((y) => (
            <li key={y.year} className="flex flex-wrap items-baseline gap-2 py-1.5">
              <span className="tabular-nums">{y.year}</span>
              <span className="font-medium tabular-nums">
                {round(y.quantity)} {y.unit}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {y.direct > 0 && `${round(y.direct)} ${y.unit} logged on this tree`}
                {y.direct > 0 && y.sharedAmong.length > 0 && '; '}
                {y.sharedAmong.length > 0 &&
                  `the rest is its share of boxes split across ${y.sharedAmong.join(' and ')} trees`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {crop && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className={clsx(inputClass, 'w-24 tabular-nums')}
            inputMode="decimal"
            placeholder={unit}
            value={amount}
            aria-label={`Harvest from this tree, in ${unit}`}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <Button onClick={add} disabled={!amount.trim()}>
            Harvest from this tree
          </Button>
          <Link to="/harvest" className="text-xs underline decoration-dotted">
            Enter a whole session
          </Link>
        </div>
      )}
    </div>
  )
}
