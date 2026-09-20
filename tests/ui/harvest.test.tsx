// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { db } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { createBlock, createVariety } from '@/state/actions'
import { shortDate } from '@/engine/harvest'
import { today } from '@/state/actions'
import { installBrowserStubs } from './fixtures'

beforeEach(async () => {
  installBrowserStubs()
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Test', [-77.083, 40.1794], 17)
  createBlock({ code: 'PP1', name: 'Pawpaws', species: 'pawpaw' })
  createVariety({ species: 'pawpaw', name: 'Shenandoah' })
  useFarmStore.setState({ hydrated: true, hydrate: () => Promise.resolve() })
})

describe('the weighing station', () => {
  it('records boxes one number at a time and tallies them', async () => {
    cleanup()
    window.location.hash = '#/harvest'
    render(
      <HashRouter>
        <App />
      </HashRouter>,
    )
    const box = await screen.findByLabelText('Weight', {}, { timeout: 4000 })
    fireEvent.click(await screen.findByRole('button', { name: 'PP1 Pawpaws' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Shenandoah' }))

    for (const weight of ['11.5', '8.5']) {
      fireEvent.change(box, { target: { value: weight } })
      await act(async () => {
        fireEvent.keyDown(box, { key: 'Enter' })
      })
    }

    const harvests = live.harvests(useFarmStore.getState().state)
    expect(harvests.map((h) => [h.box, h.quantity, h.unit])).toEqual([
      [1, 11.5, 'lb'],
      [2, 8.5, 'lb'],
    ])
    expect(harvests.every((h) => h.varietyId && h.blockId)).toBe(true)
    // The tally adds them up, and the box number is shown to write on the box.
    expect(await screen.findByText('20 lb in 2 boxes')).toBeTruthy()
    // The line to copy onto the box: where, what, how much, when.
    const stamp = `PP1 · Shenandoah · 8.5 lb · ${shortDate(today())}`
    expect(screen.getByText(stamp)).toBeTruthy()
    // The number box is cleared and ready for the next one.
    expect((box as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: 'Add box' })).toBeTruthy()
  })
})
