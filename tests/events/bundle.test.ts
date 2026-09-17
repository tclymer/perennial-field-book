// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildExport, fileSlug, parseImport } from '@/events/bundle'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { seedEvents } from '../ui/fixtures'

beforeEach(async () => {
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
})

describe('export bundle', () => {
  it('round-trips a log through text', () => {
    const events = seedEvents()
    const text = JSON.stringify(buildExport('farm_1', events))
    expect(text).toContain('"appVersion"')
    const parsed = parseImport(text)
    expect(parsed.farmId).toBe('farm_1')
    expect(parsed.events).toEqual(events)
    expect(parsed.photos).toEqual([])
  })

  it('explains what is wrong with a bad file', () => {
    expect(() => parseImport('not json')).toThrow(/not JSON/)
    expect(() => parseImport('{"app":"other"}')).toThrow(/not a Perennial Field Book export/)
    const mixed = buildExport('farm_1', [
      ...seedEvents('farm_1').slice(0, 1),
      ...seedEvents('farm_2').slice(0, 1),
    ])
    expect(() => parseImport(JSON.stringify(mixed))).toThrow(/different farms/)
  })

  it('imports into storage and opens the farm', async () => {
    const parsed = parseImport(JSON.stringify(buildExport('farm_1', seedEvents())))
    const ok = await useFarmStore.getState().importLog(parsed.farmId, parsed.events)
    expect(ok).toBe(true)
    expect(useFarmStore.getState().state.blocks.blk_pp1.code).toBe('PP1')
    // Importing the same file again changes nothing.
    await useFarmStore.getState().importLog(parsed.farmId, parsed.events)
    expect(await db.events.count()).toBe(parsed.events.length)
  })

  it('makes safe file names', () => {
    expect(fileSlug('Threefold Farm!')).toBe('threefold-farm')
    expect(fileSlug('   ')).toBe('farm')
  })
})
