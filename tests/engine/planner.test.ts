import { describe, expect, it } from 'vitest'
import { parsePlannerBackup, proposeBlocks, suggestCode } from '@/engine/planner'

/** The planner's backup shape, trimmed to what matters. */
const backup = {
  id: 'farm_x',
  name: 'Threefold Farm',
  schemaVersion: 2,
  settings: { baseWage: 19 },
  appVersion: '1.0.0',
  exportedAt: '2026-09-05T00:00:00.000Z',
  plantings: [
    {
      id: 'pl_pp1',
      name: 'Pawpaws - Block 1',
      status: 'active',
      templateId: 'pawpaw-threefold',
      geometry: { rowLengthFt: 220, rowWidthFt: 16, inRowSpacingFt: 11, rows: 8 },
      yield: { maturePerPlant: 25, unit: 'lb', unitsPerHarvestHour: 40 },
      costItems: [],
    },
    {
      id: 'pl_pp2',
      name: 'Pawpaws - Block 2',
      status: 'active',
      geometry: { rowLengthFt: 264, rowWidthFt: 16, inRowSpacingFt: 11, rows: 8 },
      yield: { unit: 'lb' },
    },
    { id: 'pl_kb', name: 'Kiwi Berries', status: 'removed', geometry: { rows: 4 } },
  ],
}

describe('planner import', () => {
  it('reads only what it needs from a backup', () => {
    const parsed = parsePlannerBackup(JSON.stringify(backup))
    expect(parsed.name).toBe('Threefold Farm')
    expect(parsed.plantings).toHaveLength(3)
    expect(() => parsePlannerBackup('nope')).toThrow(/not JSON/)
    expect(() => parsePlannerBackup('{"foo":1}')).toThrow(/not a Perennial Profit Planner/)
  })

  it('suggests short codes from names', () => {
    expect(suggestCode('Pawpaws - Block 1')).toBe('PB1')
    expect(suggestCode('Kiwi Berries')).toBe('KB')
    expect(suggestCode('Gray House Figs')).toBe('GHF')
    expect(suggestCode('!!!')).toBe('BLK')
  })

  it('proposes linked blocks with unique codes and the planner numbers', () => {
    const props = proposeBlocks(parsePlannerBackup(JSON.stringify(backup)).plantings, ['KB'])
    expect(props.map((p) => p.code)).toEqual(['PB1', 'PB2', 'KB2'])
    expect(props[0]).toMatchObject({
      rowSpacingFt: 16,
      inRowSpacingFt: 11,
      species: 'pawpaw',
      planner: { plantingId: 'pl_pp1', rowLengthFt: 220, rows: 8, unit: 'lb' },
    })
    expect(props[2].status).toBe('removed')
    expect(props[2].planner.rowLengthFt).toBeUndefined()
  })
})
