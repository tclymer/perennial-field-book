// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { db } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { quickAdd } from '@/state/taskActions'
import { createPerson, setCurrentPerson } from '@/state/people'
import { today } from '@/state/actions'
import { addDays } from '@/engine/tasks'
import { DEFAULT_WORK_DAYS, isWorkDay, nextWorkDay, planDay } from '@/engine/plan'
import { WeekBoard } from '@/ui/plan/WeekBoard'
import { TASK_DRAG_TYPE } from '@/ui/tasks/useTaskDrag'
import { installBrowserStubs } from './fixtures'

const s = () => useFarmStore.getState().state
const taskNamed = (re: RegExp) => live.tasks(s()).find((t) => re.test(t.title))!
const patch = (id: string, payload: Record<string, unknown>) =>
  useFarmStore.getState().commit([{ type: 'task.patch', payload: { id, ...payload } } as never])
const day = () => planDay(today(), DEFAULT_WORK_DAYS)
const TAKE = "I'll take it"

let tim = ''
let ann = ''

beforeEach(async () => {
  installBrowserStubs()
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Threefold', [-77.083, 40.1794], 17)
  tim = createPerson('Tim')
  ann = createPerson('Ann')
  setCurrentPerson(tim)
  useFarmStore.setState({ hydrated: true, hydrate: () => Promise.resolve() })
})

async function open(hash = '#/week') {
  cleanup()
  window.location.hash = hash
  render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
  await act(async () => {})
}

const ADD_TODAY = /^Add to (Today|Monday)$/
const todayCard = () =>
  screen.getByRole('button', { name: ADD_TODAY }).closest('div.rounded-lg') as HTMLElement

describe('today on the phone', () => {
  it('shows what is planned for today, and who it is for', async () => {
    const mine = quickAdd('prune the figs (Tim)', 'now', undefined, day())!
    quickAdd('fix the gate latch', 'now', undefined, day())
    await open()
    await screen.findByText(/prune the figs/i)
    const card = todayCard()
    expect(within(card).getByText(/prune the figs/i)).toBeTruthy()
    expect(within(card).getByText(/fix the gate latch/i)).toBeTruthy()
    // Unowned work says so, and can be claimed.
    expect(within(card).getByRole('heading', { name: 'Anyone' })).toBeTruthy()
    expect(s().tasks[mine]!.ownerId).toBe(tim)
  })

  it('claims an Anyone task with one tap', async () => {
    const id = quickAdd('fix the gate latch', 'now', undefined, day())!
    await open()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: TAKE }))
    })
    expect(s().tasks[id]!.ownerId).toBe(tim)
  })

  it('checks a task off in one tap, logs it as me, and offers Undo and Add time', async () => {
    const id = quickAdd('fix the gate latch', 'now', undefined, day())!
    await open()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Done: fix the gate latch/i }))
    })
    expect(s().tasks[id]!.done).toBe(true)
    const log = live.logs(s()).find((l) => l.taskId === id)!
    expect(log.personIds).toEqual([tim])
    expect(screen.getByRole('button', { name: 'Add time' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    })
    expect(s().tasks[id]!.done).toBeFalsy()
    expect(live.logs(s()).filter((l) => l.taskId === id)).toHaveLength(0)
  })

  it('adds time to the log afterwards', async () => {
    const id = quickAdd('fix the gate latch', 'now', undefined, day())!
    await open()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Done: fix the gate latch/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add time' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1h' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(live.logs(s()).find((l) => l.taskId === id)!.durationMinutes).toBe(60)
  })

  it('logs work on a project without closing it', async () => {
    const id = quickAdd('replace the deer fence', 'project', undefined, day())!
    await open()
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /Worked on: replace the deer fence/i }),
      )
    })
    expect(s().tasks[id]!.done).toBeFalsy()
    expect(live.logs(s()).filter((l) => l.taskId === id)).toHaveLength(1)
  })

  it('adds straight onto today, with nobody named as owner', async () => {
    await open()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: ADD_TODAY }))
    })
    const box = screen.getByPlaceholderText(/^Add to (today|monday)…$/)
    await act(async () => {
      fireEvent.change(box, { target: { value: 'mow the lane' } })
      fireEvent.keyDown(box, { key: 'Enter' })
    })
    const t = taskNamed(/mow the lane/i)
    expect(t.plannedFor).toBe(day())
    expect(t.ownerId).toBeUndefined()
    expect(t.addedBy).toBe(tim)
    expect(t.bucket).toBe('now')
  })

  it('plans a task from its list with the Plan chip, and the list stops showing it', async () => {
    quickAdd('clean the cooler', 'soon')
    await open()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Plan clean the cooler/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    })
    expect(taskNamed(/clean the cooler/i).plannedFor).toBe(day())
    expect(within(todayCard()).getByText(/clean the cooler/i)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /clean the cooler/i })).toHaveLength(1)
  })

  it('pushes the whole day to the next working day on a rain day', async () => {
    const a = quickAdd('paint the barn doors', 'now', undefined, day())!
    const b = quickAdd('burn the brush pile', 'now', undefined, day())!
    await open()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Rain day/ }))
    })
    const next = nextWorkDay(day(), DEFAULT_WORK_DAYS)
    expect(s().tasks[a]!.plannedFor).toBe(next)
    expect(s().tasks[b]!.plannedFor).toBe(next)
  })

  it('asks "Still on?" about a task that has slid three working days', async () => {
    let back = day()
    for (let n = 0; n < 3;) {
      back = addDays(back, -1)
      if (isWorkDay(back, DEFAULT_WORK_DAYS)) n++
    }
    const id = quickAdd('sharpen the loppers', 'now', undefined, back)!
    await open()
    expect(await screen.findByText('Still on?')).toBeTruthy()
    expect(screen.getByText('↻3')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep for today' }))
    })
    expect(s().tasks[id]!.plannedFor).toBe(day())
    expect(screen.queryByText('Still on?')).toBeNull()
  })

  it('puts it back in its list when it is not still on', async () => {
    const id = quickAdd('sharpen the loppers', 'now', undefined, '2020-01-06')!
    await open()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Back to the list' }))
    })
    expect(s().tasks[id]!.plannedFor).toBeUndefined()
    expect(s().tasks[id]!.bucket).toBe('now')
  })
})

describe('the task page', () => {
  it('puts a task on a day and says who added it', async () => {
    const id = quickAdd('clean the cooler', 'soon')!
    patch(id, { ownerId: ann })
    await open(`#/tasks/${id}`)
    expect(await screen.findByText('Added by Tim')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^(Today|Monday)$/ }))
    })
    expect(s().tasks[id]!.plannedFor).toBe(day())
  })
})

describe('the desktop week', () => {
  it('plans a task by dropping it on a day, and takes it off on the tray', async () => {
    const id = quickAdd('clean the cooler', 'soon')!
    cleanup()
    render(
      <HashRouter>
        <WeekBoard today={today()} />
      </HashRouter>,
    )
    const data = new Map<string, string>([[TASK_DRAG_TYPE, id]])
    const dataTransfer = {
      types: [TASK_DRAG_TYPE],
      getData: (k: string) => data.get(k) ?? '',
      setData: () => {},
    }
    const column = screen.getAllByRole('textbox')[0]!.closest('div.rounded-lg')!
    await act(async () => {
      fireEvent.dragOver(column, { dataTransfer })
      fireEvent.drop(column, { dataTransfer })
    })
    expect(s().tasks[id]!.plannedFor).toBeTruthy()
    const tray = screen.getByText('Not on a day').closest('div.rounded-lg')!
    await act(async () => {
      fireEvent.drop(tray, { dataTransfer })
    })
    expect(s().tasks[id]!.plannedFor).toBeUndefined()
  })
})
