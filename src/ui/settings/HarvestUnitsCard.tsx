import { useMemo } from 'react'
import { useFarmStore } from '@/state/store'
import { cropsOf } from '@/engine/harvest'
import { UNITS, unitFor } from '@/model/harvest'
import { setUnit } from '@/state/harvestActions'
import { Card, Field, inputClass } from '@/ui/components'

/** What each crop is measured in when a box is entered. Past entries keep their own unit. */
export function HarvestUnitsCard() {
  const state = useFarmStore((s) => s.state)
  const crops = useMemo(() => cropsOf(state), [state])
  if (crops.length === 0) return null
  return (
    <Card>
      <h2 className="font-semibold">Harvest units</h2>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        What one box is measured in. Changing this affects new entries only; what is already
        recorded keeps the unit it was entered with.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {crops.map((crop) => (
          <Field key={crop} label={crop}>
            <select
              className={inputClass}
              value={unitFor(state.farm, crop)}
              onChange={(e) => setUnit(crop, e.target.value)}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
    </Card>
  )
}
