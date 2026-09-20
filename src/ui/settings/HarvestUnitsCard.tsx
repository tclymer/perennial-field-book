import { useMemo } from 'react'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { cropsOf } from '@/engine/harvest'
import { UNITS, unitsFor } from '@/model/harvest'
import { setUnits } from '@/state/harvestActions'
import { Card } from '@/ui/components'

/**
 * What each crop is measured in. A crop can have more than one: figs are sold by the half
 * pint but go on the scale by the pound when a bin comes in, and apples are bushels or
 * pounds depending on where they are headed. The first unit is the one offered by default
 * when a box is entered; the rest are a tap away on the harvest screen.
 */
export function HarvestUnitsCard() {
  const state = useFarmStore((s) => s.state)
  const crops = useMemo(() => cropsOf(state), [state])
  if (crops.length === 0) return null
  return (
    <Card>
      <h2 className="font-semibold">Harvest units</h2>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        What a box is measured in. Tap to add or remove a unit; the first one is offered by default.
        Changing this affects new entries only, and reports never add one unit to another.
      </p>
      <div className="mt-3 space-y-3">
        {crops.map((crop) => {
          const chosen = unitsFor(state.farm, crop)
          const toggle = (u: string) => {
            const has = chosen.includes(u)
            if (has && chosen.length === 1) return
            setUnits(crop, has ? chosen.filter((x) => x !== u) : [...chosen, u])
          }
          return (
            <div key={crop}>
              <div className="mb-1 text-sm font-medium capitalize">{crop}</div>
              <div className="flex flex-wrap gap-1.5">
                {UNITS.map((u) => {
                  const at = chosen.indexOf(u)
                  const on = at >= 0
                  return (
                    <button
                      key={u}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(u)}
                      title={
                        on && at === 0
                          ? `${u} is offered by default for ${crop}`
                          : on
                            ? `Tap to stop measuring ${crop} in ${u}`
                            : `Tap to also measure ${crop} in ${u}`
                      }
                      className={clsx(
                        'rounded-full border px-2.5 py-1 text-xs',
                        on
                          ? 'border-lime-700 bg-lime-700 text-white'
                          : 'border-stone-300 text-stone-600 hover:border-lime-700 dark:border-stone-600 dark:text-stone-400',
                      )}
                    >
                      {u}
                      {on && at === 0 && <span className="ml-1 opacity-70">default</span>}
                    </button>
                  )
                })}
              </div>
              {chosen.length > 1 && (
                <button
                  type="button"
                  className="mt-1 text-xs underline decoration-dotted text-stone-500 dark:text-stone-400"
                  onClick={() => setUnits(crop, [chosen[1]!, ...chosen.filter((_, i) => i !== 1)])}
                >
                  make {chosen[1]} the default
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
