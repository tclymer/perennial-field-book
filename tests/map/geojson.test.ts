import { describe, expect, it } from 'vitest'
import { blocksFC, featuresFC, planFC, positionsFC, rowsFC, EMPTY_COLOR } from '@/map/geojson'
import { materialize } from '@/events/reduce'
import { varietyColors } from '@/state/derived'
import { seedEvents } from '../ui/fixtures'

const state = materialize(seedEvents())

describe('geojson builders', () => {
  it('draws rows, positions, and features from state', () => {
    expect(rowsFC(state).features.map((f) => f.properties?.label)).toEqual(['PP1-1', 'PP1-2'])
    const pts = positionsFC(state, { colorBy: 'variety' })
    expect(pts.features).toHaveLength(20)
    expect(pts.features[0].properties?.label).toBe('PP1-1-1')
    expect(featuresFC(state).features[0].properties?.name).toBe('Blue House')
    expect(blocksFC(state).features).toHaveLength(0)
  })

  it('colors by variety, with the row default filling empty positions', () => {
    const color = varietyColors(state).get('var_shen')
    const pts = positionsFC(state, { colorBy: 'variety' }).features
    // Row 1 has a default variety, so even empty positions carry its color.
    expect(pts[0].properties?.color).toBe(color)
    expect(pts[0].properties?.empty).toBe(false)
    expect(pts[5].properties?.empty).toBe(true)
    expect(pts[5].properties?.color).toBe(color)
    // Row 2 has none.
    expect(pts[10].properties?.color).toBe(EMPTY_COLOR)
  })

  it('colors by status and hides rows under edit', () => {
    const pts = positionsFC(state, { colorBy: 'status', hideRows: new Set(['row_2']) }).features
    expect(pts).toHaveLength(10)
    expect(pts[0].properties?.status).toBe('alive')
    expect(rowsFC(state, new Set(['row_1'])).features).toHaveLength(1)
  })

  it('shows plans for the chosen year only', () => {
    const planned = materialize([
      ...seedEvents(),
      {
        id: 'evt_p',
        farmId: 'farm_1',
        deviceId: 'd',
        ts: 1_800_000_000_000,
        type: 'graft.plan',
        payload: { year: 2027, posKey: 'row_2:3', varietyId: 'var_shen' },
      },
    ])
    expect(planFC(planned, 2027).features.map((f) => f.properties?.label)).toEqual(['PP1-2-3'])
    expect(planFC(planned, 2028).features).toHaveLength(0)
    const byPlan = positionsFC(planned, { colorBy: 'plan', planYear: 2027 }).features
    expect(byPlan[12].properties?.color).toBe(varietyColors(planned).get('var_shen'))
  })
})
