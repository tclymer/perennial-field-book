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
  ['#/week', /This week/i],
  ['#/tasks', /Paste a list/i],
  ['#/tasks/tsk_nope', /not here/i],
  ['#/review', /Weekly review/i],
  ['#/logs', /Work logs/i],
  ['#/harvest', /tally/i],
  ['#/harvest/reports', /Harvest reports/i],
  ['#/import/keep', /Paste a list/i],
  ['#/blocks', /Blocks/i],
  ['#/blocks/blk_pp1/grid', /Row defaults/i],
  ['#/blocks/blk_nope/grid', /not in this farm/i],
  ['#/t/PP1-1-1', /Shenandoah/],
  ['#/t/PP1-2-4', /Empty position/i],
  ['#/t/ZZ-9-9', /not in this farm/i],
  ['#/varieties', /Varieties/i],
  ['#/search', /Search/i],
  ['#/import', /Import from the planner/i],
  ['#/settings', /Your data/i],
  ['#/about', /Credits/i],
  ['#/auth', /Sign in with Google/i],
  ['#/auth?error=denied', /did not complete/i],
  ['#/join/sometoken', /shared a farm with you/i],
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
