// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { db } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { createBlock, createRow, createVariety, currentTree, ensureTrees } from '@/state/actions'
import { addHarvest } from '@/state/harvestActions'
import { treeShares } from '@/engine/harvest'
import { positions, slots } from '@/state/derived'
import { fromLocal } from '@/engine/geo'
import type { LngLat } from '@/model/types'
import { installBrowserStubs } from './fixtures'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
const s = () => useFarmStore.getState().state

let rowId = ''

beforeEach(async () => {
  installBrowserStubs()
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Threefold', ORIGIN, 17)
  const blockId = createBlock({ code: 'PP1', name: 'Pawpaws', species: 'pawpaw' })
  const shen = createVariety({ species: 'pawpaw', name: 'Shenandoah' })
  rowId = createRow(blockId, [at(0, 0), at(110, 0)], { by: 'count', count: 4 })
  useFarmStore
    .getState()
    .commit([{ type: 'row.patch', payload: { id: rowId, defaultVarietyId: shen } }])
  ensureTrees(blockId)
  useFarmStore.setState({ hydrated: true, hydrate: () => Promise.resolve() })
})

const liveIn = () => positions(s()).filter((p) => p.rowId === rowId)

async function openTree(label: string) {
  cleanup()
  window.location.hash = `#/t/${encodeURIComponent(label)}`
  render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
  await act(async () => {})
}

describe('what a tree page offers', () => {
  it('offers three things, not ten', async () => {
    await openTree(liveIn()[0]!.label)
    expect(await screen.findByRole('button', { name: 'Note' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Photo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Grafted over to…' })).toBeTruthy()

    // The ones that drove nothing, or duplicated something, are gone.
    for (const label of [
      'First fruit',
      'Scionwood collected',
      'Status…',
      'Died',
      'Removed',
      'Replace tree…',
      'Take the spot out of the row…',
    ]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  })

  it('calls the standing field something other than a note', async () => {
    await openTree(liveIn()[0]!.label)
    expect(await screen.findByText('About this tree')).toBeTruthy()
    expect(screen.queryByText('Notes about this tree')).toBeNull()
  })

  it('keeps the graft, which is the one event worth a button', async () => {
    const key = liveIn()[0]!.posKey
    await openTree(liveIn()[0]!.label)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Grafted over to…' }))
    })
    expect(screen.getByText('Grafted to')).toBeTruthy()
    expect(currentTree(key)).toBeTruthy()
  })
})

describe('recording that a tree is gone', () => {
  it('asks whether the spot stays, and keeping it leaves the row alone', async () => {
    const before = liveIn().length
    const key = liveIn()[1]!.posKey
    await openTree(liveIn()[1]!.label)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dead or gone/i }))
    })
    expect(screen.getByText(/Does the spot stay in the row/i)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep the spot' }))
    })
    expect(currentTree(key)!.status).toBe('removed')
    expect(liveIn()).toHaveLength(before)
  })

  it('closes the gap when asked, which renumbers the rest', async () => {
    const key = liveIn()[1]!.posKey
    await openTree(liveIn()[1]!.label)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dead or gone/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close the gap' }))
    })
    expect(currentTree(key)!.status).toBe('removed')
    expect(liveIn()).toHaveLength(3)
    expect(slots(s()).filter((p) => p.skipped)).toHaveLength(1)
  })

  it('offers to plant a new one once the old one is gone, which is how replacing happens now', async () => {
    const label = liveIn()[1]!.label
    await openTree(label)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dead or gone/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep the spot' }))
    })
    expect(await screen.findByRole('button', { name: 'Plant a tree here…' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Grafted over to…' })).toBeNull()
  })

  it('takes it back when the tree turns out to be standing', async () => {
    const key = liveIn()[1]!.posKey
    await openTree(liveIn()[1]!.label)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dead or gone/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep the spot' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /still there after all/i }))
    })
    expect(currentTree(key)!.status).toBe('alive')
  })
})

describe('why the status could not just be a note', () => {
  it('stops a tree that is gone from drawing a share of the crop', async () => {
    // Four Shenandoah in the row, forty pounds picked against the variety and the block.
    const blockId = s().blocks[Object.keys(s().blocks)[0]!]!.id
    const shen = live.varieties(s())[0]!.id
    addHarvest({
      crop: 'pawpaw',
      date: '2026-09-19',
      quantity: 40,
      unit: 'lb',
      varietyId: shen,
      blockId,
    })
    expect([...treeShares(s(), 2026).values()].map((v) => v.quantity)).toEqual([10, 10, 10, 10])

    // One of them is gone. The rest should each carry more, not the same.
    const key = liveIn()[0]!.posKey
    await openTree(liveIn()[0]!.label)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dead or gone/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep the spot' }))
    })

    const shares = treeShares(s(), 2026)
    expect(shares.get(key)).toBeUndefined()
    expect([...shares.values()].map((v) => v.quantity)).toEqual([40 / 3, 40 / 3, 40 / 3])
  })
})
