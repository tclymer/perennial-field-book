// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { db } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { quickAdd } from '@/state/taskActions'
import { thisWeek } from '@/engine/tasks'
import { today } from '@/state/actions'
import { installBrowserStubs } from './fixtures'

const s = () => useFarmStore.getState().state

beforeEach(async () => {
  installBrowserStubs()
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Threefold', [-77.083, 40.1794], 17)
  useFarmStore.setState({ hydrated: true, hydrate: () => Promise.resolve() })
})

async function openWeek() {
  cleanup()
  window.location.hash = '#/week'
  render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
  await act(async () => {})
}

describe('what the week knows about', () => {
  it('keeps the small jobs and the projects apart from this week', () => {
    quickAdd('mow around the pawpaws', 'now')
    quickAdd('fix the gate latch', 'soon')
    quickAdd('replace the deer fence', 'project')
    const w = thisWeek(s(), today())
    const lower = (list: { title: string }[]) => list.map((t) => t.title.toLowerCase())
    expect(lower(w.now)).toEqual(['mow around the pawpaws'])
    expect(lower(w.soon)).toEqual(['fix the gate latch'])
    expect(lower(w.projects.map((p) => p.task))).toEqual(['replace the deer fence'])
  })

  it('counts the steps still open under a project', () => {
    const id = quickAdd('replace the deer fence', 'project')!
    quickAdd('order posts', 'soon', id)
    quickAdd('clear the line', 'soon', id)
    const w = thisWeek(s(), today())
    expect(w.projects[0]!.open).toBe(2)
    // The steps belong to the project, not to the loose list of small jobs.
    expect(w.soon).toHaveLength(0)
  })

  it('leaves a finished project out', () => {
    const id = quickAdd('replace the deer fence', 'project')!
    useFarmStore.getState().commit([{ type: 'task.patch', payload: { id, done: true } }])
    expect(thisWeek(s(), today()).projects).toHaveLength(0)
  })
})

describe('adding from the orchard', () => {
  it('offers every list to add to, not only this week', async () => {
    await openWeek()
    // The buckets are named by the farm, so match the defaults it ships with. "Monkeys" is
    // there twice, once as the chip and once as the heading of this week's own list.
    expect(await screen.findByRole('button', { name: 'Monkeys' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mini Tasks/Projects' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Long Term' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Projects' })).toBeTruthy()
  })

  it('adds to the list that is chosen, not always to this week', async () => {
    await openWeek()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mini Tasks/Projects' }))
    })
    const box = screen.getByRole('textbox')
    await act(async () => {
      fireEvent.change(box, { target: { value: 'fix the gate latch' } })
      fireEvent.keyDown(box, { key: 'Enter' })
    })
    const added = live.tasks(s()).find((t) => /fix the gate latch/i.test(t.title))
    expect(added?.bucket).toBe('soon')
  })

  it('starts on this week, which is still the common case', async () => {
    await openWeek()
    const box = screen.getByRole('textbox')
    await act(async () => {
      fireEvent.change(box, { target: { value: 'mow around the pawpaws' } })
      fireEvent.keyDown(box, { key: 'Enter' })
    })
    expect(live.tasks(s()).find((t) => /mow around the pawpaws/i.test(t.title))?.bucket).toBe('now')
  })

  it('shows the small jobs and projects once there are some', async () => {
    quickAdd('fix the gate latch', 'soon')
    quickAdd('replace the deer fence', 'project')
    await openWeek()
    expect(await screen.findByText(/fix the gate latch/i)).toBeTruthy()
    expect(screen.getByText(/replace the deer fence/i)).toBeTruthy()
  })

  it('does not clutter the page with lists that are empty', async () => {
    quickAdd('mow around the pawpaws', 'now')
    await openWeek()
    await screen.findByText(/mow around the pawpaws/i)
    // The chip to add to it is there; a section full of nothing is not.
    expect(screen.getAllByText('Mini Tasks/Projects')).toHaveLength(1)
    expect(screen.getAllByText('Monkeys').length).toBeGreaterThan(1)
  })
})
