/** Ids, position keys, and tree labels. Labels are derived, never stored. */

export type IdPrefix =
  | 'farm'
  | 'blk'
  | 'row'
  | 'pos'
  | 'ftr'
  | 'var'
  | 'tree'
  | 'tev'
  | 'evt'
  | 'pho'
  | 'per'
  | 'tsk'
  | 'log'

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('-')
}

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${uuid()}`
}

/** A row position: the row's id and a 1-based index along it. */
export function rowPosKey(rowId: string, index: number): string {
  return `${rowId}:${index}`
}

export type ParsedPosKey = { rowId: string; index: number } | { looseId: string }

export function parsePosKey(key: string): ParsedPosKey {
  const i = key.lastIndexOf(':')
  if (i < 0) return { looseId: key }
  const index = Number(key.slice(i + 1))
  if (!Number.isInteger(index) || index < 1) return { looseId: key }
  return { rowId: key.slice(0, i), index }
}

/** Block codes: letters and digits, up to eight, no separators, so labels parse back. */
export const CODE_RE = /^[A-Za-z0-9]{1,8}$/

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

/** `PP1-3-12` for row 3 position 12 of block PP1; `Y-1` for loose position 1 of block Y. */
export function treeLabel(code: string, rowNumber: number | null, index: number): string {
  return rowNumber === null ? `${code}-${index}` : `${code}-${rowNumber}-${index}`
}

export interface ParsedLabel {
  code: string
  rowNumber: number | null
  index: number
}

export function parseTreeLabel(label: string): ParsedLabel | null {
  const parts = label.trim().toUpperCase().split('-')
  if (parts.length < 2 || parts.length > 3) return null
  const code = parts[0]
  if (!CODE_RE.test(code)) return null
  const nums = parts.slice(1).map(Number)
  if (nums.some((n) => !Number.isInteger(n) || n < 1)) return null
  return parts.length === 2
    ? { code, rowNumber: null, index: nums[0] }
    : { code, rowNumber: nums[0], index: nums[1] }
}
