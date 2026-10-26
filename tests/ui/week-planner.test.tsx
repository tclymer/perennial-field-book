// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { db } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { completeTask, placeTask, quickAdd, reopenTask, undoEvents } from '@/state/taskActions'
import { createPerson, setCurrentPerson } from '@/state/people'
import { today } from '@/state/actions'
import { addDays } from '@/engine/tasks'
import {
  DEFAULT_WORK_DAYS,
  isWorkDay,
  nextWeek,
  nextWorkDay,
  planDay,
  weekPlan,
} from '@/engine/plan'
import { planTask } from '@/state/planActions'
import { WeekBoard } from '@/ui/plan/WeekBoard'
import { PlanTheWeek } from '@/ui/routes/ReviewPage'
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
      fireEvent.click(screen.getByRole('button', { name: /clean the cooler: (today|monday)/i }))
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

describe('taking a check-off back', () => {
  it('reopens a task by tapping its box again, and drops the log it filed', async () => {
    const id = quickAdd('fix the gate latch', 'now', undefined, day())!
    await open()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /^Done: fix the gate latch/i }))
    })
    // Long after the message has gone, the box is still there to tap.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Not done: fix the gate latch/i }))
    })
    expect(s().tasks[id]!.done).toBeFalsy()
    expect(live.logs(s()).filter((l) => l.taskId === id)).toHaveLength(0)
    expect(screen.getByRole('button', { name: /^Done: fix the gate latch/i })).toBeTruthy()
    // And that can be undone too, from its own message.
    await act(async () => {
      fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    })
    expect(s().tasks[id]!.done).toBe(true)
    expect(live.logs(s()).filter((l) => l.taskId === id)).toHaveLength(1)
  })

  it('takes back work logged on a project, which stays open either way', async () => {
    const id = quickAdd('replace the deer fence', 'project', undefined, day())!
    await open()
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /^Worked on: replace the deer fence/i }),
      )
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Not done: replace the deer fence/i }))
    })
    expect(live.logs(s()).filter((l) => l.taskId === id)).toHaveLength(0)
    expect(s().tasks[id]!.done).toBeFalsy()
  })
})

describe('reordering the steps of a project', () => {
  it('leaves a step its own list, so it keeps its checkbox', async () => {
    const project = quickAdd('replace the deer fence', 'project')!
    quickAdd('order posts', 'soon', project)
    const second = quickAdd('clear the line', 'soon', project)!
    placeTask(second, { bucket: 'project', projectId: project, index: 0 })
    expect(s().tasks[second]!.bucket).toBe('soon')
    expect(live.tasks(s()).find((t) => t.id === second)!.order).toBe(1)
  })

  it('still shows a checkbox on a step an older version turned into a project', async () => {
    const project = quickAdd('replace the deer fence', 'project')!
    const step = quickAdd('order posts', 'soon', project)!
    patch(step, { bucket: 'project' })
    await open(`#/tasks/${project}`)
    expect(await screen.findByRole('button', { name: /^Done: order posts/i })).toBeTruthy()
  })
})

describe('a task with steps is a holder', () => {
  const fence = () => {
    const project = quickAdd('replace the deer fence', 'project')!
    const posts = quickAdd('order posts', 'soon', project)!
    const line = quickAdd('clear the line', 'soon', project)!
    return { project, posts, line }
  }
  const me = () => ({ personIds: [tim] })

  it('closes when its last step is checked off, and Undo opens both again', () => {
    const { project, posts, line } = fence()
    completeTask(posts, me())
    expect(s().tasks[project]!.done).toBeFalsy()
    const undo = completeTask(line, me())
    expect(s().tasks[project]!.done).toBe(true)
    // The steps carry the logs; the task itself files none.
    expect(live.logs(s()).filter((l) => l.taskId === project)).toHaveLength(0)
    undoEvents(undo)
    expect(s().tasks[line]!.done).toBeFalsy()
    expect(s().tasks[project]!.done).toBeFalsy()
  })

  it('closes an ordinary task with steps the same way', () => {
    const task = quickAdd('fix the cooler', 'now')!
    const step = quickAdd('buy a thermostat', 'soon', task)!
    completeTask(step, me())
    expect(s().tasks[task]!.done).toBe(true)
  })

  it('opens again when a step is reopened, or a new step is added', () => {
    const { project, posts, line } = fence()
    completeTask(posts, me())
    completeTask(line, me())
    reopenTask(line)
    expect(s().tasks[project]!.done).toBeFalsy()
    completeTask(line, me())
    quickAdd('string the wire', 'soon', project)
    expect(s().tasks[project]!.done).toBeFalsy()
  })

  it('gives its day to its first step, so nothing drops out of the week', () => {
    const task = quickAdd('fix the cooler', 'now', undefined, day())!
    const step = quickAdd('buy a thermostat', 'soon', task)!
    expect(s().tasks[step]!.plannedFor).toBe(day())
    expect(s().tasks[task]!.plannedFor).toBeUndefined()
  })

  it('never goes on a day itself, even with a day from before', () => {
    const { project, posts } = fence()
    patch(project, { plannedFor: day() })
    expect(planTask(project, day())).toEqual([])
    const today_ = weekPlan(s(), today()).days.find((d) => d.isToday)!
    expect(today_.open.map((i) => i.task.id)).toEqual([])
    planTask(posts, day())
    const again = weekPlan(s(), today()).days.find((d) => d.isToday)!
    expect(again.open.map((i) => i.task.id)).toEqual([posts])
    expect(again.open[0]!.parent?.id).toBe(project)
  })

  it('lends its place and category to a step logged without its own', () => {
    const task = quickAdd('fix the cooler', 'now')!
    patch(task, { targets: [{ kind: 'farm' }], category: 'maintenance' })
    const step = quickAdd('buy a thermostat', 'soon', task)!
    completeTask(step, me())
    const log = live.logs(s()).find((l) => l.taskId === step)!
    expect(log.targets).toEqual([{ kind: 'farm' }])
    expect(log.category).toBe('maintenance')
  })

  it('offers its steps from the Plan chip, and a step on today names its task', async () => {
    const { posts } = fence()
    await open()
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /Plan a step of replace the deer fence/i }),
      )
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /order posts: (today|monday)/i }))
    })
    expect(s().tasks[posts]!.plannedFor).toBe(day())
    expect(within(todayCard()).getByText(/replace the deer fence ·/i)).toBeTruthy()
  })

  it('checks the last step off on today and closes the project with it', async () => {
    const { project, posts, line } = fence()
    completeTask(posts, me())
    planTask(line, day())
    await open()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /^Done: clear the line/i }))
    })
    expect(s().tasks[project]!.done).toBe(true)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Not done: clear the line/i }))
    })
    expect(s().tasks[project]!.done).toBeFalsy()
  })

  it('shows a holder in the desktop tray as a heading over its steps', async () => {
    const { project, posts } = fence()
    cleanup()
    render(
      <HashRouter>
        <WeekBoard today={today()} />
      </HashRouter>,
    )
    const tray = screen.getByText('Not on a day').closest('div.rounded-lg') as HTMLElement
    const heading = within(tray).getByText(/replace the deer fence/i)
    expect(heading.closest('li')!.getAttribute('draggable')).toBeNull()
    expect(
      within(tray)
        .getByText(/order posts/i)
        .closest('li')!
        .getAttribute('draggable'),
    ).toBe('true')
    // Dropping the holder itself on a day is refused.
    const data = new Map<string, string>([[TASK_DRAG_TYPE, project]])
    const dataTransfer = { types: [TASK_DRAG_TYPE], getData: (k: string) => data.get(k) ?? '' }
    const column = screen.getAllByRole('textbox')[0]!.closest('div.rounded-lg')!
    await act(async () => {
      fireEvent.drop(column, { dataTransfer })
    })
    expect(s().tasks[project]!.plannedFor).toBeUndefined()
    expect(s().tasks[posts]!.plannedFor).toBeUndefined()
  })
})

describe('planning ahead', () => {
  // 2026-10-09 is a Friday; 2026-10-12 the Monday after.
  const FRI = '2026-10-09'
  const NEXT_MON = '2026-10-12'
  const board = (on: string) => {
    cleanup()
    render(
      <HashRouter>
        <WeekBoard today={on} />
      </HashRouter>,
    )
  }

  it('shows only Friday on top on a Friday, under its weekday, with next week below', () => {
    const id = quickAdd('mow the alleys', 'now', undefined, NEXT_MON)!
    board(FRI)
    const top = screen.getByRole('region', { name: 'This week' })
    const below = screen.getByRole('region', { name: 'Next week' })
    const tops = within(top).getAllByRole('heading', { level: 2 }).slice(1)
    expect(tops.map((h) => h.textContent)).toEqual(['Today 9'])
    expect((tops[0]!.closest('div.rounded-lg') as HTMLElement).style.gridColumnStart).toBe('5')
    expect(within(below).getAllByRole('heading', { level: 2 })).toHaveLength(6)
    expect(within(below).getByText(/mow the alleys/i)).toBeTruthy()
    expect(s().tasks[id]!.plannedFor).toBe(NEXT_MON)
  })

  it('plans a tray task onto next week by dropping it there', async () => {
    const id = quickAdd('mow the alleys', 'soon')!
    board(FRI)
    const below = screen.getByRole('region', { name: 'Next week' })
    const monday = within(below)
      .getAllByRole('heading', { level: 2 })[1]!
      .closest('div.rounded-lg')!
    const data = new Map<string, string>([[TASK_DRAG_TYPE, id]])
    const dataTransfer = { types: [TASK_DRAG_TYPE], getData: (k: string) => data.get(k) ?? '' }
    await act(async () => {
      fireEvent.drop(monday, { dataTransfer })
    })
    expect(s().tasks[id]!.plannedFor).toBe(NEXT_MON)
  })

  it('offers next week from the Plan chip on a phone', async () => {
    const id = quickAdd('clean the cooler', 'soon')!
    await open()
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /Plan clean the cooler for a day/i }),
      )
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Next week ›$/ }))
    })
    const ahead = nextWeek(today(), DEFAULT_WORK_DAYS)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clean the cooler: next tuesday/i }))
    })
    expect(s().tasks[id]!.plannedFor).toBe(ahead[1])
  })

  it('opens next week on Today into its days, with what is planned there', async () => {
    const ahead = nextWeek(today(), DEFAULT_WORK_DAYS)
    quickAdd('mow the alleys', 'now', undefined, ahead[2])
    await open()
    const row = await screen.findByRole('button', { name: /^Next week/ })
    expect(row.textContent).toMatch(/mow the alleys/i)
    await act(async () => {
      fireEvent.click(row)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Next Wednesday: 1$/ }))
    })
    expect(screen.getByPlaceholderText(/Add to next wednesday/i)).toBeTruthy()
  })

  it('turns the review card to next week from Thursday', () => {
    const THU = '2026-10-08'
    quickAdd('mow the alleys', 'now', undefined, NEXT_MON)
    cleanup()
    render(
      <HashRouter>
        <PlanTheWeek today={THU} />
      </HashRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Plan next week' })).toBeTruthy()
    expect(
      screen.getByText(
        /1 task is on a day next week\. Nothing yet on Tue, Wed, Thu, Fri\. 1 has no one yet\./,
      ),
    ).toBeTruthy()
    cleanup()
    render(
      <HashRouter>
        <PlanTheWeek today="2026-10-06" />
      </HashRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Plan the week' })).toBeTruthy()
  })
})
