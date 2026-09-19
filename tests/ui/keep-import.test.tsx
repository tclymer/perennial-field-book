// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { db } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { installBrowserStubs } from './fixtures'

const NOTE = `Catch up activities
mow around the pawpaws
Solar punch list
mount the inverter (Tim)
run conduit to the barn and then across the yard to the new shed, being careful of the buried water line that runs diagonally from the well to the house (ask before digging)
Monkeys
water the gray house
Spinning Plates
train kiwis
`

beforeEach(async () => {
  installBrowserStubs()
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Test', [-77.083, 40.1794], 17)
  useFarmStore.setState({ hydrated: true, hydrate: () => Promise.resolve() })
})

describe('pasting a list', () => {
  it('imports every line under the guessed headings when the button is clicked', async () => {
    cleanup()
    window.location.hash = '#/import/keep'
    render(
      <HashRouter>
        <App />
      </HashRouter>,
    )
    const box = await screen.findByPlaceholderText(/Monkeys/i, {}, { timeout: 4000 })
    fireEvent.change(box, { target: { value: NOTE } })
    const button = await screen.findByRole('button', { name: /^Import \d+ tasks$/ })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    await act(async () => {
      fireEvent.click(button)
    })
    expect(await screen.findByText(/^Imported/)).toBeTruthy()
    const tasks = live.tasks(useFarmStore.getState().state)
    const titles = tasks.map((t) => t.title)
    expect(titles).toContain('Solar punch list')
    expect(titles).toContain('Mount the inverter')
    expect(titles).toContain('Water the gray house')
    expect(tasks.find((t) => t.title === 'Train kiwis')?.bucket).toBe('recurring')
    expect(tasks.find((t) => t.title === 'Mount the inverter')?.projectId).toBe(
      tasks.find((t) => t.title === 'Solar punch list')?.id,
    )
    expect(tasks).toHaveLength(6)
  })
})
