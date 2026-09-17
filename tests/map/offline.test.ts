import { describe, expect, it } from 'vitest'
import { farmBounds, plannedTiles, tileUrl } from '@/map/offline'
import { PRESETS } from '@/map/presets'
import { emptyState } from '@/events/reduce'
import { seedState } from '../ui/fixtures'

describe('offline map save', () => {
  it('refuses sources that may not be stored, and an empty farm', () => {
    const s = seedState()
    expect(plannedTiles(s, null)).toMatchObject({ ok: false })
    expect(plannedTiles(s, PRESETS.esri)).toMatchObject({ ok: false, reason: /may not be stored/ })
    expect(plannedTiles(emptyState(), PRESETS.pema)).toMatchObject({ ok: false, reason: /Draw/ })
  })

  it('plans a modest set of tiles over the drawn farm', () => {
    const s = seedState()
    const b = farmBounds(s)!
    expect(b[0]).toBeLessThan(-77.0835)
    expect(b[2]).toBeGreaterThan(-77.0828)
    const plan = plannedTiles(s, PRESETS.pema)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.tiles.length).toBeGreaterThan(6)
    expect(plan.tiles.length).toBeLessThan(200)
    expect(plan.tiles.every((t) => t.z >= 14 && t.z <= 19)).toBe(true)
    expect(tileUrl(PRESETS.pema, { z: 19, x: 149883, y: 198142 })).toBe(
      'https://apps.pasda.psu.edu/arcgis/rest/services/PEMAImagery2018_WEB/MapServer/tile/19/198142/149883',
    )
  })
})
