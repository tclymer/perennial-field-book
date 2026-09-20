// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { pairTag } from '@/state/tagActions'
import { removePosition } from '@/state/actions'
import { tagOf } from '@/engine/tags'
import { positions } from '@/state/derived'
import { installBrowserStubs, seedState } from './fixtures'

const ID = '04a1b2c3d4e5f6'
const s = () => useFarmStore.getState().state

beforeEach(async () => {
  installBrowserStubs()
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Test', [-77.083, 40.1794], 17)
  useFarmStore.setState({
    state: { ...seedState(), tags: {} },
    farmId: 'farm_1',
    hydrated: true,
    hydrate: () => Promise.resolve(),
  })
})

async function open(hash: string) {
  cleanup()
  window.location.hash = hash
  render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
  await act(async () => {})
}

describe('tapping a tag', () => {
  it('asks what an unknown tag is on', async () => {
    await open(`#/tag/${ID}`)
    expect(await screen.findByText(/not paired to anything yet/i)).toBeTruthy()
    // Pairing is off until something is chosen.
    expect(screen.getByRole('button', { name: /Pair this tag/i }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('hands straight over to the tree it is paired to', async () => {
    pairTag(ID, { kind: 'tree', posKey: 'row_1:1' })
    await open(`#/tag/${ID}`)
    // The tree page, not the tag page.
    expect(await screen.findByText(/Shenandoah/)).toBeTruthy()
    expect(screen.queryByText(/not paired to anything yet/i)).toBeNull()
  })

  it('lands on the same tree under its new number after the row is thinned', async () => {
    const fourth = positions(s()).filter((p) => p.rowId === 'row_1')[3]!
    pairTag(ID, { kind: 'tree', posKey: fourth.posKey })
    expect(fourth.label).toBe('PP1-1-4')
    await act(async () => {
      removePosition(positions(s()).filter((p) => p.rowId === 'row_1')[0]!.posKey)
    })
    await open(`#/tag/${ID}`)
    expect(await screen.findByRole('heading', { name: 'PP1-1-3' })).toBeTruthy()
  })

  it('offers to re-pair when the spot it was on has gone', async () => {
    const first = positions(s()).filter((p) => p.rowId === 'row_1')[0]!
    pairTag(ID, { kind: 'tree', posKey: first.posKey })
    await act(async () => {
      removePosition(first.posKey)
    })
    await open(`#/tag/${ID}`)
    expect(await screen.findByText(/no longer on the farm/i)).toBeTruthy()
  })

  it('says a serial that is not a serial is not one', async () => {
    await open('#/tag/hello')
    expect(await screen.findByText(/not a tag serial number/i)).toBeTruthy()
  })
})

describe('the tags list', () => {
  it('takes a serial typed by hand and opens its page', async () => {
    await open('#/tags')
    const field = await screen.findByLabelText(/Or type its serial/i)
    fireEvent.change(field, { target: { value: '04:A1:B2:C3:D4:E5:F6' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })
    expect(tagOf(s(), ID)).toBeDefined()
    expect(await screen.findByText(/not paired to anything yet/i)).toBeTruthy()
  })

  it('refuses a serial that is not one, and records nothing', async () => {
    await open('#/tags')
    const field = await screen.findByLabelText(/Or type its serial/i)
    fireEvent.change(field, { target: { value: 'hello' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })
    expect(await screen.findByText(/does not look like a tag serial/i)).toBeTruthy()
    expect(Object.keys(s().tags)).toHaveLength(0)
  })

  it('says this browser cannot scan, since jsdom has no NFC', async () => {
    await open('#/tags')
    expect(await screen.findByText(/cannot read tags directly/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Scan a tag/i })).toBeNull()
  })

  it('lists a paired tag against what it is on, and unpairs it', async () => {
    pairTag(ID, { kind: 'tree', posKey: 'row_1:1' })
    await open('#/tags')
    expect(await screen.findByText('04:A1:B2:C3:D4:E5:F6')).toBeTruthy()
    expect(screen.getByText('PP1-1-1')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unpair' }))
    })
    expect(tagOf(s(), ID)?.target).toBeUndefined()
    expect(await screen.findByText(/not paired/i)).toBeTruthy()
  })
})
