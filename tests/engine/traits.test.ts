import { describe, expect, it } from 'vitest'
import {
  normalizeTrait,
  sameTrait,
  splitTrait,
  traitMatches,
  traitsInUse,
  traitsOf,
  traitSuggestions,
  varietiesWithTrait,
  varietySheet,
  varietySheetToCsv,
} from '@/engine/traits'
import { materialize } from '@/events/reduce'
import type { AnyEvent, NewEvent } from '@/events/types'
import type { Variety } from '@/model/types'

const ev = (type: string, payload: unknown): NewEvent => ({ type, payload }) as NewEvent

function state(extra: NewEvent[] = []) {
  const base: NewEvent[] = [
    ev('farm.create', { id: 'farm_1', name: 'T', center: [-77.083, 40.1794], zoom: 17 }),
    ev('variety.create', {
      id: 'v_prok',
      species: 'persimmon',
      name: 'Prok',
      group: 'American',
      source: 'England Orchard',
      traits: ['precocious', 'vigor: high', 'fruit size: large'],
    }),
    ev('variety.create', {
      id: 'v_barbra',
      species: 'persimmon',
      name: 'Barbra',
      group: 'American',
      traits: ['precocious', 'upright'],
    }),
    ev('variety.create', {
      id: 'v_shen',
      species: 'pawpaw',
      name: 'Shenandoah',
      traits: ['precocious'],
    }),
    ev('variety.create', { id: 'v_fig', species: 'fig', name: 'Adriatic JH' }),
  ]
  return materialize(
    [...base, ...extra].map((e, i) => ({
      id: `evt_${i}`,
      farmId: 'farm_1',
      deviceId: 'dev',
      ts: 1_700_000_000_000 + i,
      ...e,
    })) as AnyEvent[],
  )
}

describe('writing a trait down', () => {
  it('tidies the spacing but leaves the words alone', () => {
    expect(normalizeTrait('  vigor:  high  ')).toBe('vigor: high')
    expect(normalizeTrait('Precocious')).toBe('Precocious')
  })

  it('matches without caring about case', () => {
    expect(sameTrait('Precocious', 'precocious')).toBe(true)
    expect(sameTrait('precocious', 'upright')).toBe(false)
  })

  it('reads a value when there is one, and does not invent one when there is not', () => {
    expect(splitTrait('vigor: high')).toEqual({ key: 'vigor', value: 'high' })
    expect(splitTrait('precocious')).toEqual({ value: 'precocious' })
    // A stray colon with nothing after it is just words.
    expect(splitTrait('ripens early:')).toEqual({ value: 'ripens early:' })
  })

  it('drops blanks and repeats off a variety', () => {
    const v = { traits: ['precocious', ' ', 'Precocious', 'upright'] } as Variety
    expect(traitsOf(v)).toEqual(['precocious', 'upright'])
    expect(traitsOf(undefined)).toEqual([])
  })
})

describe('the traits a farm is using', () => {
  it('counts them across every species, because one word means one thing', () => {
    const use = traitsInUse(state())
    const precocious = use.find((u) => u.trait === 'precocious')!
    // Two persimmons and a pawpaw.
    expect(precocious.count).toBe(3)
  })

  it('puts what this species already uses first', () => {
    const use = traitsInUse(state(), 'persimmon')
    expect(use[0]!.trait).toBe('precocious')
    expect(use[0]!.inSpecies).toBe(2)
  })

  it('suggests what the species uses, then the rest, minus what is already there', () => {
    const s = state()
    const suggestions = traitSuggestions(s, 'persimmon', ['precocious'])
    expect(suggestions).not.toContain('precocious')
    expect(suggestions).toContain('upright')
    expect(suggestions).toContain('vigor: high')
  })

  it('offers the rest of the farm to a species that has none yet', () => {
    const suggestions = traitSuggestions(state(), 'fig', [])
    expect(suggestions).toContain('precocious')
  })

  it('finds every variety carrying one, whatever the species', () => {
    const names = varietiesWithTrait(state(), 'PRECOCIOUS').map((v) => v.name)
    expect(names.sort()).toEqual(['Barbra', 'Prok', 'Shenandoah'])
  })

  it('matches a partial word, for the search box', () => {
    const prok = state().varieties['v_prok']!
    expect(traitMatches(prok, 'precoc')).toBe(true)
    expect(traitMatches(prok, 'vigor')).toBe(true)
    expect(traitMatches(prok, 'shy')).toBe(false)
    expect(traitMatches(prok, '')).toBe(false)
  })
})

describe('the variety sheet', () => {
  it('lists every variety with what it is like and how much of it stands here', () => {
    const rows = varietySheet(state())
    // Grouped by species, then by variety within it, which is how a catalogue reads.
    expect(rows.map((r) => r.variety)).toEqual(['Adriatic JH', 'Shenandoah', 'Barbra', 'Prok'])
    const prok = rows.find((r) => r.variety === 'Prok')!
    expect(prok.species).toBe('persimmon')
    expect(prok.group).toBe('American')
    expect(prok.source).toBe('England Orchard')
    expect(prok.traits).toBe('precocious; vigor: high; fruit size: large')
  })

  it('counts the trees standing and the year the first went in', () => {
    const s = state([
      ev('block.create', {
        id: 'blk',
        code: 'PER',
        name: 'Persimmons',
        numbering: { rowsFrom: 'W', positionsFrom: 'road' },
      }),
      ev('row.create', {
        id: 'row_1',
        blockId: 'blk',
        number: 1,
        polyline: [
          [-77.0832, 40.17935],
          [-77.0828, 40.17935],
        ],
        layout: { by: 'count', count: 2 },
      }),
      ev('tree.create', {
        id: 't1',
        posKey: 'row_1:1',
        varietyId: 'v_prok',
        status: 'alive',
        plantedDate: '2021-04-02',
      }),
      ev('tree.create', {
        id: 't2',
        posKey: 'row_1:2',
        varietyId: 'v_prok',
        status: 'alive',
        plantedDate: '2019-05-01',
      }),
    ])
    const prok = varietySheet(s).find((r) => r.variety === 'Prok')!
    expect(prok.trees).toBe(2)
    expect(prok.firstPlanted).toBe('2019-05-01')
  })

  it('writes a CSV that quotes the traits, since they carry commas and semicolons', () => {
    const csv = varietySheetToCsv(varietySheet(state()))
    const lines = csv.split('\n')
    expect(lines[0]).toBe('species,variety,type,traits,source,trees,first planted,notes')
    expect(lines).toHaveLength(5)
    expect(csv).toContain('precocious; vigor: high; fruit size: large')
  })

  it('leaves a variety with nothing said about it as blanks, not as the word undefined', () => {
    const fig = varietySheet(state()).find((r) => r.variety === 'Adriatic JH')!
    expect(fig.traits).toBe('')
    expect(fig.source).toBe('')
    expect(fig.firstPlanted).toBe('')
    expect(varietySheetToCsv([fig])).not.toContain('undefined')
  })
})
