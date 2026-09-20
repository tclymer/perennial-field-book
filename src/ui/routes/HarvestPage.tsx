import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { positions } from '@/state/derived'
import { today } from '@/state/actions'
import { addHarvest, deleteHarvest } from '@/state/harvestActions'
import {
  allVarietiesOf,
  boxLabel,
  cropsOf,
  formatQuantity,
  placesFor,
  recentChoices,
  sessionOf,
  varietiesIn,
  type Place,
} from '@/engine/harvest'
import { cropKey, isCountUnit, unitsFor } from '@/model/harvest'
import { useDevice } from '@/state/device'
import { Button, Card, PageHeader, inputClass } from '@/ui/components'
import { Chip, ChipRow } from '@/ui/harvest/Chips'
import { Toast } from '@/ui/tasks/Toast'

/**
 * The weighing station (DESIGN.md §3.6): pick the crop once, then a number per box. The
 * variety and place chips stay put between boxes, so a session is number, Enter, number.
 */
export default function HarvestPage() {
  const state = useFarmStore((s) => s.state)
  const lastCrop = useDevice((s) => s.lastCrop)
  const setPrefs = useDevice((s) => s.set)
  const crops = useMemo(() => cropsOf(state), [state])
  const [crop, setCrop] = useState(lastCrop ?? crops[0] ?? '')
  const [date, setDate] = useState(today())
  const [varietyId, setVarietyId] = useState<string | null>(null)
  const [place, setPlace] = useState<Place | null>(null)
  const [perTree, setPerTree] = useState(false)
  const [treeLabel, setTreeLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [pickVariety, setPickVariety] = useState('')
  const [last, setLast] = useState<{ id: string; text: string } | null>(null)
  const [toast, setToast] = useState<{ message: string; id: string } | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const numberRef = useRef<HTMLInputElement>(null)

  const key = cropKey(crop)
  // A crop can be measured more than one way: figs by the half pint to sell, by the pound
  // when a bin goes on the scale. The usual one is picked for you; the rest are one tap away.
  const units = useMemo(() => unitsFor(state.farm, key), [state.farm, key])
  const [unitChoice, setUnitChoice] = useState<string | null>(null)
  const unit = unitChoice && units.includes(unitChoice) ? unitChoice : units[0]!
  const counts = isCountUnit(unit)
  const session = useMemo(() => sessionOf(state, date, key), [state, date, key])
  const recent = useMemo(() => recentChoices(state, key), [state, key])
  const places = useMemo(() => placesFor(state, key), [state, key])
  const everyVariety = useMemo(() => allVarietiesOf(state, key), [state, key])
  // Only what stands in the chosen place, so sixty varieties never become sixty chips.
  // Until the trees are recorded there is nothing to narrow by, so show them all.
  const narrowed = useMemo(() => varietiesIn(state, key, place), [state, key, place])
  const varieties = useMemo(() => {
    const list = narrowed.length ? narrowed : everyVariety
    const order = new Map(recent.varieties.map((id, i) => [id, i]))
    return [...list].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
  }, [narrowed, everyVariety, recent])
  const labels = useMemo(
    () =>
      positions(state)
        .filter((p) => !place || place.kind !== 'block' || p.blockId === place.id)
        .map((p) => p.label),
    [state, place],
  )

  useEffect(() => {
    if (crop && crop !== lastCrop) setPrefs({ lastCrop: crop })
  }, [crop, lastCrop, setPrefs])

  // Changing crop drops choices that belong to the old one.
  useEffect(() => {
    setVarietyId(null)
    setPlace(null)
    setPerTree(false)
    setTreeLabel('')
    setUnitChoice(null)
  }, [key])

  // A crop picked in only one place needs no choosing.
  useEffect(() => {
    if (!place && places.length === 1) setPlace(places[0]!)
  }, [places, place])

  // A variety that does not stand in the newly chosen place cannot be what was just picked.
  useEffect(() => {
    if (varietyId && !varieties.some((v) => v.id === varietyId)) setVarietyId(null)
  }, [varietyId, varieties])

  if (crops.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Harvest" />
        <Card>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Nothing to harvest yet. Add varieties and blocks first, on the{' '}
            <Link to="/varieties" className="underline decoration-dotted">
              Varieties
            </Link>{' '}
            page and the map.
          </p>
        </Card>
      </div>
    )
  }

  const quantity = Number(amount)
  const canAdd = Number.isFinite(quantity) && quantity > 0

  const add = () => {
    if (!canAdd) return
    const posKey = perTree
      ? positions(state).find((p) => p.label.toUpperCase() === treeLabel.trim().toUpperCase())
          ?.posKey
      : undefined
    if (perTree && !posKey) {
      setToast({ message: `No tree called ${treeLabel.trim()}.`, id: '' })
      return
    }
    const id = addHarvest({
      crop: key,
      date,
      quantity,
      ...(varietyId ? { varietyId } : {}),
      ...(place?.kind === 'block' ? { blockId: place.id } : {}),
      ...(place?.kind === 'feature' ? { featureId: place.id } : {}),
      ...(posKey ? { posKey } : {}),
    })
    const after = useFarmStore.getState().state
    const entry = after.harvests[id]
    setLast({ id, text: entry ? boxLabel(after, entry) : '' })
    setToast({ message: 'Box recorded.', id })
    setAmount('')
    numberRef.current?.focus()
  }

  const remove = (id: string) => {
    deleteHarvest(id)
    setLast((l) => (l?.id === id ? null : l))
    setToast(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Harvest" subtitle={date === today() ? 'Today' : date}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="Harvest date"
            className={inputClass}
            value={date}
            max={today()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <Link to="/harvest/reports" className="text-sm underline decoration-dotted">
            Reports
          </Link>
        </div>
      </PageHeader>

      {crops.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {crops.map((c) => (
            <Chip key={c} active={key === c} onClick={() => setCrop(c)}>
              <span className="capitalize">{c}</span>
            </Chip>
          ))}
        </div>
      )}

      <Card className="space-y-3">
        {!perTree && places.length > 0 && (
          <ChipRow label="Where">
            <Chip active={place === null} onClick={() => setPlace(null)}>
              Anywhere
            </Chip>
            {places.map((p) => (
              <Chip key={p.id} active={place?.id === p.id} onClick={() => setPlace(p)}>
                {p.label}
              </Chip>
            ))}
          </ChipRow>
        )}

        {everyVariety.length > 0 && (
          <ChipRow label={place ? `Variety in ${place.label}` : 'Variety'}>
            <Chip active={varietyId === null} onClick={() => setVarietyId(null)}>
              Mixed
            </Chip>
            {!pickVariety &&
              varieties.slice(0, 10).map((v) => (
                <Chip key={v.id} active={varietyId === v.id} onClick={() => setVarietyId(v.id)}>
                  {v.name}
                </Chip>
              ))}
            {(varieties.length > 10 || everyVariety.length > varieties.length) && (
              <input
                className={clsx(inputClass, 'w-40')}
                placeholder={`find any ${key}…`}
                value={pickVariety}
                onChange={(e) => setPickVariety(e.target.value)}
                aria-label="Find a variety"
              />
            )}
            {pickVariety &&
              everyVariety
                .filter((v) => v.name.toLowerCase().includes(pickVariety.trim().toLowerCase()))
                .slice(0, 12)
                .map((v) => (
                  <Chip
                    key={v.id}
                    active={varietyId === v.id}
                    tone={varieties.some((x) => x.id === v.id) ? 'plain' : 'dashed'}
                    onClick={() => {
                      setVarietyId(v.id)
                      setPickVariety('')
                    }}
                  >
                    {v.name}
                  </Chip>
                ))}
          </ChipRow>
        )}

        {place && narrowed.length === 0 && everyVariety.length > 0 && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            No {key} trees are recorded in {place.label} yet, so every {key} variety is offered.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
            <input
              type="checkbox"
              checked={perTree}
              onChange={(e) => setPerTree(e.target.checked)}
            />
            One tree at a time
          </label>
          {perTree && (
            <>
              <input
                className={clsx(inputClass, 'w-32')}
                placeholder="PP1-3-12"
                list="harvest-tree-labels"
                value={treeLabel}
                aria-label="Tree label"
                onChange={(e) => setTreeLabel(e.target.value)}
              />
              <datalist id="harvest-tree-labels">
                {labels.slice(0, 500).map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
              {counts ? 'How many' : 'Weight'}
            </span>
            <span className="flex items-center gap-2">
              <input
                ref={numberRef}
                className={clsx(inputClass, 'w-32 py-3 text-2xl tabular-nums')}
                inputMode="decimal"
                enterKeyHint="done"
                autoFocus
                value={amount}
                aria-label={counts ? 'How many' : 'Weight'}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    add()
                  }
                }}
              />
              {units.length === 1 ? (
                <span className="text-lg text-stone-500 dark:text-stone-400">{unit}</span>
              ) : (
                <select
                  className={`${inputClass} w-auto text-base`}
                  value={unit}
                  aria-label="Unit"
                  onChange={(e) => setUnitChoice(e.target.value)}
                >
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>
          <Button
            variant="primary"
            className="px-6 py-3 text-base"
            disabled={!canAdd}
            onClick={add}
          >
            Add box
          </Button>
        </div>

        {last && (
          <p className="rounded-md bg-lime-50 px-3 py-2 text-lg font-semibold tabular-nums text-lime-900 dark:bg-lime-950/40 dark:text-lime-200">
            {last.text}
            <span className="ml-2 text-xs font-normal text-lime-800/70 dark:text-lime-300/70">
              write this on the box
            </span>
          </p>
        )}
      </Card>

      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">
            <span className="capitalize">{key}</span> tally
          </h2>
          <span className="text-sm text-stone-500 dark:text-stone-400">
            {session.totals
              .map((t) => `${formatQuantity(t.quantity)} ${t.unit} in ${t.boxes} boxes`)
              .join(', ') || 'nothing yet'}
          </span>
        </div>
        {session.tally.length > 0 && (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {session.tally.map((line) => (
                <tr
                  key={line.varietyId ?? 'mixed'}
                  className="border-t border-stone-100 dark:border-stone-800"
                >
                  <td className="py-1">{line.label}</td>
                  <td className="py-1 text-right tabular-nums text-stone-500 dark:text-stone-400">
                    {line.boxes} {line.boxes === 1 ? 'box' : 'boxes'}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatQuantity(line.quantity)} {line.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {session.entries.length > 0 && (
        <Card>
          <h2 className="font-semibold">Boxes</h2>
          <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
            {[...session.entries].reverse().map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                <span className="w-8 tabular-nums text-stone-500 dark:text-stone-400">
                  #{e.box}
                </span>
                <span className="tabular-nums">
                  {formatQuantity(e.quantity)} {e.unit}
                </span>
                <span>{e.varietyId ? state.varieties[e.varietyId]?.name : 'Mixed'}</span>
                {e.posKey && (
                  <span className="text-stone-500 dark:text-stone-400">
                    {positions(state).find((p) => p.posKey === e.posKey)?.label ?? ''}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(e.id)}
                  aria-label={`Delete box ${e.box}`}
                  className="ml-auto rounded px-1.5 text-base leading-none text-stone-300 hover:bg-stone-100 hover:text-rose-600 dark:text-stone-600 dark:hover:bg-stone-800"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {toast && (
        <Toast
          message={toast.message}
          onUndo={toast.id ? () => remove(toast.id) : undefined}
          onClose={closeToast}
        />
      )}
    </div>
  )
}
