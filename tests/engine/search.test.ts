import { describe, expect, it } from 'vitest'
import { search } from '@/engine/search'
import { seedState } from '../ui/fixtures'

const state = seedState()

describe('search', () => {
  it('finds an exact tree label and its neighbors by prefix', () => {
    const r = search(state, 'pp1-1-1')
    expect(r.exact?.title).toBe('PP1-1-1')
    expect(r.exact?.detail).toBe('Shenandoah')
    expect(r.hits.filter((h) => h.kind === 'tree').map((h) => h.title)).toContain('PP1-1-10')
    expect(r.hits.some((h) => h.title === 'PP1-1-1')).toBe(false)
  })

  it('finds rows, blocks, varieties, and features by name', () => {
    expect(search(state, 'shenandoah').hits.map((h) => h.kind)).toContain('variety')
    expect(search(state, 'shenandoah').hits.filter((h) => h.kind === 'row')[0]?.title).toBe('PP1-1')
    expect(search(state, 'pawpaws').hits[0]?.kind).toBe('block')
    expect(search(state, 'blue').hits[0]).toMatchObject({ kind: 'feature', title: 'Blue House' })
    expect(search(state, '').hits).toEqual([])
    expect(search(state, 'zzz').hits).toEqual([])
  })
})
