// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { installBrowserStubs } from './fixtures'

beforeAll(() => {
  installBrowserStubs()
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

const routes: [string, RegExp | string][] = [
  ['#/', /cannot draw the map/i],
  ['#/start', /Set up your farm/i],
  ['#/blocks', /No blocks yet/i],
  ['#/blocks/blk_x/grid', /Block grid/i],
  ['#/t/PP1-1-1', 'PP1-1-1'],
  ['#/varieties', /Varieties/i],
  ['#/search', /Search/i],
  ['#/import', /Import from the planner/i],
  ['#/settings', /Settings/i],
  ['#/about', /Credits/i],
  ['#/nope', /Page not found/i],
]

describe('every route renders', () => {
  for (const [hash, expected] of routes) {
    it(hash, async () => {
      await open(hash)
      expect((await screen.findAllByText(expected, {}, { timeout: 4000 })).length).toBeGreaterThan(
        0,
      )
      expect(screen.queryByText(/Something went wrong/i)).toBeNull()
    })
  }
})
