import { describe, expect, it } from 'vitest'
import { unitFor, unitsFor } from '@/model/harvest'
import { defaultSpeciesColor, speciesColors, SPECIES_PALETTE } from '@/state/colors'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import type { FarmMeta } from '@/model/types'

const farm = (units?: FarmMeta['units']) => ({ units }) as FarmMeta

describe('the units a crop is measured in', () => {
  it('reads a farm that stored one unit as a plain string', () => {
    expect(unitsFor(farm({ fig: 'half pint' }), 'fig')).toEqual(['half pint'])
    expect(unitFor(farm({ fig: 'half pint' }), 'fig')).toBe('half pint')
  })

  it('keeps several, the usual one first', () => {
    const f = farm({ fig: ['half pint', 'lb'] })
    expect(unitsFor(f, 'fig')).toEqual(['half pint', 'lb'])
    expect(unitFor(f, 'fig')).toBe('half pint')
  })

  it('falls back to what the fruit is usually measured in, then to pounds', () => {
    expect(unitsFor(null, 'fig')).toEqual(['half pint'])
    expect(unitsFor(null, 'pawpaw')).toEqual(['lb'])
    expect(unitsFor(null, 'something new')).toEqual(['lb'])
  })

  it('ignores blanks and repeats rather than offering an empty chip', () => {
    expect(unitsFor(farm({ fig: ['lb', ' ', 'lb', 'pint'] }), 'fig')).toEqual(['lb', 'pint'])
    expect(unitsFor(farm({ fig: [] }), 'fig')).toEqual(['half pint'])
  })

  it('matches a crop written in the plural', () => {
    expect(unitsFor(farm({ fig: ['pint'] }), 'figs')).toEqual(['pint'])
  })
})

function state(varieties: [string, string][], speciesColorSetting?: Record<string, string>) {
  const events: NewEvent[] = [
    {
      type: 'farm.create',
      payload: { id: 'farm_1', name: 'T', center: [-77.083, 40.1794], zoom: 17 },
    },
    ...varieties.map(([id, species]): NewEvent => ({
      type: 'variety.create',
      payload: { id, species, name: `${species} one` },
    })),
  ]
  if (speciesColorSetting) {
    events.push({ type: 'farm.patch', payload: { speciesColors: speciesColorSetting } })
  }
  return materialize(
    events.map((e, i) => ({
      id: `evt_${i}`,
      farmId: 'farm_1',
      deviceId: 'dev',
      ts: 1_700_000_000_000 + i,
      ...e,
    })) as AnyEvent[],
  )
}

describe('the colour a crop is drawn in', () => {
  it('gives a fruit the colour it already has', () => {
    expect(defaultSpeciesColor('persimmon')).toBe('#f97316')
    expect(defaultSpeciesColor('Pawpaw')).toBe('#a3e635')
    expect(defaultSpeciesColor('fig')).toBe('#a855f7')
    expect(defaultSpeciesColor('kiwi')).toBe('#16a34a')
    expect(defaultSpeciesColor('kiwi berry')).toBe('#16a34a')
    // Plurals and unknown crops.
    expect(defaultSpeciesColor('persimmons')).toBe('#f97316')
    expect(defaultSpeciesColor('sapote')).toBeUndefined()
  })

  it('uses those colours on the map rather than the palette order', () => {
    const s = state([
      ['v1', 'persimmon'],
      ['v2', 'pawpaw'],
      ['v3', 'fig'],
    ])
    const m = speciesColors(s)
    expect(m.get('persimmon')).toBe('#f97316')
    expect(m.get('pawpaw')).toBe('#a3e635')
    expect(m.get('fig')).toBe('#a855f7')
  })

  it('lets the farm overrule the fruit', () => {
    const s = state([['v1', 'persimmon']], { persimmon: '#123456' })
    expect(speciesColors(s).get('persimmon')).toBe('#123456')
  })

  it('gives an unknown crop a palette colour no other crop is using', () => {
    const s = state([
      ['v1', 'pawpaw'],
      ['v2', 'sapote'],
      ['v3', 'loquat'],
    ])
    const m = speciesColors(s)
    const used = [...m.values()]
    expect(new Set(used).size).toBe(used.length)
    expect(m.get('pawpaw')).toBe('#a3e635')
    // The unknown ones take palette colours, and not the one pawpaw's default already took.
    for (const key of ['sapote', 'loquat']) {
      expect(SPECIES_PALETTE).toContain(m.get(key))
      expect(m.get(key)).not.toBe('#a3e635')
    }
  })
})
