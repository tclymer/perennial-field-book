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

  it('keeps a place to add even when a list is empty', async () => {
    await openWeek()
    expect(await screen.findByRole('button', { name: 'Add to Mini Tasks/Projects' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add to Projects' })).toBeTruthy()
  })
})

describe('adding from a section itself', () => {
  async function addIn(section: string, text: string) {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Add to ${section}` }))
    })
    const box = screen.getByPlaceholderText(`Add to ${section.toLowerCase()}…`)
    await act(async () => {
      fireEvent.change(box, { target: { value: text } })
      fireEvent.keyDown(box, { key: 'Enter' })
    })
    return box
  }

  it('adds to that section, whatever the list at the top is set to', async () => {
    await openWeek()
    await addIn('Mini Tasks/Projects', 'fix the gate latch')
    expect(live.tasks(s()).find((t) => /fix the gate latch/i.test(t.title))?.bucket).toBe('soon')
    expect(screen.getByText(/fix the gate latch/i)).toBeTruthy()
  })

  it('stays open for another, and closes with the same button', async () => {
    await openWeek()
    const box = await addIn('Projects', 'replace the deer fence')
    expect((box as HTMLInputElement).value).toBe('')
    expect(screen.getByPlaceholderText('Add to projects…')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop adding to Projects' }))
    })
    expect(screen.queryByPlaceholderText('Add to projects…')).toBeNull()
  })

  it('adds a plate to keep spinning, which then shows as due', async () => {
    await openWeek()
    await addIn('Spinning Plates', 'check the deer fence')
    expect(live.tasks(s()).find((t) => /check the deer fence/i.test(t.title))?.bucket).toBe(
      'recurring',
    )
    expect(screen.getByText(/check the deer fence/i)).toBeTruthy()
  })

  it('shows what was just added even past the first eight', async () => {
    for (let i = 1; i <= 9; i++) quickAdd(`small job ${i}`, 'soon')
    await openWeek()
    expect(screen.queryByText(/small job 9/i)).toBeNull()
    await addIn('Mini Tasks/Projects', 'oil the loppers')
    expect(screen.getByText(/oil the loppers/i)).toBeTruthy()
  })
})

describe('reordering with a finger', () => {
  it('carries a task down the list by its grip', async () => {
    quickAdd('first job', 'now')
    quickAdd('second job', 'now')
    quickAdd('third job', 'now')
    await openWeek()
    await screen.findByText(/third job/i)
    const rowOf = (text: RegExp) => screen.getByText(text).closest('li')!
    const grip = rowOf(/first job/i).querySelector<HTMLElement>(
      '[title="Drag to reorder or move"]',
    )!
    // jsdom does no layout, so say which row is under the finger, and put the finger on its
    // lower half so the task lands after it.
    const third = rowOf(/third job/i)
    document.elementFromPoint = () => third
    third.getBoundingClientRect = () => ({ top: 100, height: 40 }) as DOMRect
    await act(async () => {
      fireEvent.pointerDown(grip, { pointerType: 'touch', pointerId: 1 })
    })
    await act(async () => {
      fireEvent.pointerMove(grip, { pointerType: 'touch', pointerId: 1, clientX: 10, clientY: 130 })
    })
    await act(async () => {
      fireEvent.pointerUp(grip, { pointerType: 'touch', pointerId: 1 })
    })
    const order = thisWeek(s(), today()).now.map((t) => t.title.toLowerCase())
    expect(order).toEqual(['second job', 'third job', 'first job'])
  })

  it('leaves a mouse to the ordinary drag, which can also move between lists', async () => {
    quickAdd('first job', 'now')
    quickAdd('second job', 'now')
    await openWeek()
    const grip = (await screen.findByText(/first job/i))
      .closest('li')!
      .querySelector<HTMLElement>('[title="Drag to reorder or move"]')!
    await act(async () => {
      fireEvent.pointerDown(grip, { pointerType: 'mouse', pointerId: 1 })
      fireEvent.pointerUp(grip, { pointerType: 'mouse', pointerId: 1 })
    })
    const order = thisWeek(s(), today()).now.map((t) => t.title.toLowerCase())
    expect(order).toEqual(['first job', 'second job'])
  })
})

describe('done for the season', () => {
  const thisMonth = () => Number(today().slice(5, 7))
  const nextYear = () => Number(today().slice(0, 4)) + 1
  const pad = (m: number) => String(m).padStart(2, '0')
  const plateNamed = (re: RegExp) => live.tasks(s()).find((t) => re.test(t.title))!

  it('takes a plate off the week until its season comes round again', async () => {
    const id = quickAdd('prune the kiwis', 'recurring')!
    useFarmStore
      .getState()
      .commit([{ type: 'task.patch', payload: { id, seasonMonths: [thisMonth()] } }])
    await openWeek()
    expect(await screen.findByText(/prune the kiwis/i)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done for the season' }))
    })
    expect(plateNamed(/prune the kiwis/i).restUntil).toBe(`${nextYear()}-${pad(thisMonth())}-01`)
    expect(screen.queryByRole('link', { name: /prune the kiwis/i })).toBeNull()
    // No work was logged: this is a decision about the list, not a record of pruning.
    expect(live.logs(s())).toHaveLength(0)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })
    expect(plateNamed(/prune the kiwis/i).restUntil).toBeUndefined()
  })

  it('asks for a month when the plate has no season set', async () => {
    quickAdd('check the deer fence', 'recurring')
    await openWeek()
    await screen.findByText(/check the deer fence/i)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done for the season' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mar' }))
    })
    expect(plateNamed(/check the deer fence/i).restUntil).toMatch(/^\d{4}-03-01$/)
    expect(screen.queryByRole('link', { name: /check the deer fence/i })).toBeNull()
  })
})

describe('a resting plate on its own page', () => {
  it('says when it comes back, and can be brought back early', async () => {
    const id = quickAdd('prune the kiwis', 'recurring')!
    useFarmStore
      .getState()
      .commit([{ type: 'task.patch', payload: { id, restUntil: '2099-05-01' } }])
    cleanup()
    window.location.hash = `#/tasks/${id}`
    render(
      <HashRouter>
        <App />
      </HashRouter>,
    )
    expect(await screen.findByText(/Done for the season, back in/)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring it back now' }))
    })
    expect(live.tasks(s()).find((t) => t.id === id)!.restUntil).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Done for the season' })).toBeTruthy()
  })
})
