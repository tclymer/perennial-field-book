// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { useFarmStore } from '@/state/store'
import { installBrowserStubs, seedState } from './fixtures'

beforeAll(() => {
  installBrowserStubs()
})

function seed() {
  // Skip storage hydration: the seeded state is the whole farm for these tests.
  useFarmStore.setState({
    state: seedState(),
    farmId: 'farm_1',
    hydrated: true,
    hydrate: () => Promise.resolve(),
  })
}

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

const routes: [string, RegExp | string][] = [
  ['#/', /cannot draw the map/i],
  ['#/start', /Set up your farm/i],
  ['#/blocks', /Blocks/i],
  ['#/blocks/blk_pp1/grid', /Block grid/i],
  ['#/t/PP1-1-1', 'PP1-1-1'],
  ['#/varieties', /Varieties/i],
  ['#/search', /Search/i],
  ['#/import', /Import from the planner/i],
  ['#/settings', /Your data/i],
  ['#/about', /Credits/i],
  ['#/nope', /Page not found/i],
]

describe('every route renders', () => {
  for (const [hash, expected] of routes) {
    it(hash, async () => {
      seed()
      await open(hash)
      expect((await screen.findAllByText(expected, {}, { timeout: 4000 })).length).toBeGreaterThan(
        0,
      )
      expect(screen.queryByText(/Something went wrong/i)).toBeNull()
    })
  }

  it('sends a browser with no farm to the set-up page', async () => {
    useFarmStore.setState({ farmId: null, hydrated: true, hydrate: () => Promise.resolve() })
    await open('#/blocks')
    expect(
      (await screen.findAllByText(/Set up your farm/i, {}, { timeout: 4000 })).length,
    ).toBeGreaterThan(0)
  })
})
