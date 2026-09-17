import { describe, expect, it } from 'vitest'
import { newId, parsePosKey, parseTreeLabel, rowPosKey, treeLabel } from '@/model/ids'

describe('ids and labels', () => {
  it('prefixes ids and never repeats', () => {
    const a = newId('tree')
    const b = newId('tree')
    expect(a.startsWith('tree_')).toBe(true)
    expect(a).not.toBe(b)
  })

  it('round-trips a row position key', () => {
    expect(parsePosKey(rowPosKey('row_abc', 12))).toEqual({ rowId: 'row_abc', index: 12 })
    expect(parsePosKey('pos_xyz')).toEqual({ looseId: 'pos_xyz' })
    expect(parsePosKey('row_abc:0')).toEqual({ looseId: 'row_abc:0' })
  })

  it('builds and parses tree labels for rows and loose positions', () => {
    expect(treeLabel('PP1', 3, 12)).toBe('PP1-3-12')
    expect(treeLabel('Y', null, 1)).toBe('Y-1')
    expect(parseTreeLabel('PP1-3-12')).toEqual({ code: 'PP1', rowNumber: 3, index: 12 })
    expect(parseTreeLabel('y-1')).toEqual({ code: 'Y', rowNumber: null, index: 1 })
    expect(parseTreeLabel(' pp1-3-12 ')).toEqual({ code: 'PP1', rowNumber: 3, index: 12 })
  })

  it('rejects labels that cannot be trees', () => {
    expect(parseTreeLabel('PP1')).toBeNull()
    expect(parseTreeLabel('PP1-0-1')).toBeNull()
    expect(parseTreeLabel('PP-1-x')).toBeNull()
    expect(parseTreeLabel('A-B-1-2')).toBeNull()
    expect(parseTreeLabel('TOOLONGCODE-1')).toBeNull()
  })
})
