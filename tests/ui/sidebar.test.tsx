// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/events/db'
import { live } from '@/events/reduce'
import { createFeature } from '@/state/actions'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { EditorPanel } from '@/ui/map/EditorPanel'
import { useEditor } from '@/ui/map/editorStore'
import { installBrowserStubs } from './fixtures'

beforeEach(async () => {
  installBrowserStubs()
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Test', [-77.083, 40.1794], 17)
  useFarmStore.setState({ hydrated: true, hydrate: () => Promise.resolve() })
  await act(async () => {
    createFeature('Blue House', 'greenhouse', {
      type: 'Point',
      coordinates: [-77.0829, 40.1796],
    })
  })
})

function panel() {
  cleanup()
  render(
    <MemoryRouter>
      <EditorPanel />
    </MemoryRouter>,
  )
}

describe('the map sidebar', () => {
  it('shows buildings and areas without being opened first', () => {
    panel()
    expect(screen.getByText('Blue House')).toBeTruthy()
  })

  it('keeps the forms out of the way until the + is pressed', () => {
    panel()
    // Nothing to draw with, and no name field, until the section is asked for one.
    expect(screen.queryByText('Place a point')).toBeNull()
    fireEvent.click(screen.getByLabelText('Add a building or area'))
    expect(screen.getByText('Place a point')).toBeTruthy()
    // The same button closes it again.
    fireEvent.click(screen.getByLabelText('Add a building or area'))
    expect(screen.queryByText('Place a point')).toBeNull()
  })

  it('offers the new block form only when asked', () => {
    panel()
    expect(screen.queryByPlaceholderText(/PP1/i)).toBeNull()
    fireEvent.click(screen.getByLabelText('New block'))
    expect(screen.getByLabelText('New block').getAttribute('aria-expanded')).toBe('true')
  })

  it('takes a removal back', async () => {
    panel()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove Blue House'))
    })
    expect(live.features(useFarmStore.getState().state)).toHaveLength(0)
    await act(async () => {
      fireEvent.click(screen.getByText('Undo'))
    })
    const back = live.features(useFarmStore.getState().state)
    expect(back.map((f) => f.name)).toEqual(['Blue House'])
  })
})

describe('editing a building or area', () => {
  it('renames it, and says what it is for', async () => {
    panel()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Details for Blue House'))
    })
    const name = screen.getByDisplayValue('Blue House')
    await act(async () => {
      fireEvent.change(name, { target: { value: 'Gray House' } })
      fireEvent.blur(name)
    })
    const desc = screen.getByLabelText(/Short description/i)
    await act(async () => {
      fireEvent.change(desc, { target: { value: 'seed starting' } })
      fireEvent.blur(desc)
    })
    const f = live.features(useFarmStore.getState().state)[0]!
    expect(f.name).toBe('Gray House')
    expect(f.description).toBe('seed starting')
  })

  it('refuses to leave it with no name at all', async () => {
    panel()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Details for Blue House'))
    })
    const name = screen.getByDisplayValue('Blue House')
    await act(async () => {
      fireEvent.change(name, { target: { value: '   ' } })
      fireEvent.blur(name)
    })
    expect(live.features(useFarmStore.getState().state)[0]!.name).toBe('Blue House')
  })

  it('keeps notes separately from the description', async () => {
    panel()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Details for Blue House'))
    })
    const notes = screen.getByLabelText(/Notes/i)
    await act(async () => {
      fireEvent.change(notes, { target: { value: 'Heater serviced each October.' } })
      fireEvent.blur(notes)
    })
    const f = live.features(useFarmStore.getState().state)[0]!
    expect(f.notes).toBe('Heater serviced each October.')
    expect(f.description).toBeUndefined()
  })

  it('turns reshaping on for one building at a time', async () => {
    panel()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reshape' }))
    })
    expect(useEditor.getState().editingFeatureId).toBeTruthy()
    expect(useEditor.getState().editMode).toBe('feature')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    })
    expect(useEditor.getState().editingFeatureId).toBeNull()
    expect(useEditor.getState().editMode).toBe('none')
  })
})

describe('sizes in the sidebar', () => {
  it("shows a building's area in the details, not in the list", async () => {
    await act(async () => {
      createFeature('Back field', 'area', {
        type: 'Polygon',
        // Roughly 100 m by 100 m, which is about two and a half acres.
        coordinates: [
          [-77.083, 40.1794],
          [-77.0818, 40.1794],
          [-77.0818, 40.1803],
          [-77.083, 40.1803],
        ],
      })
    })
    panel()
    // The list stays short: name, what it is for, and kind.
    const row = [...document.querySelectorAll('li')].find((n) =>
      /Back field/.test(n.textContent ?? ''),
    )
    expect(row?.textContent).not.toMatch(/sq ft/)

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Details for Back field'))
    })
    expect(screen.getByText(/sq ft/)).toBeTruthy()
    expect(screen.getByText(/ac$/)).toBeTruthy()
  })

  it('says a point has no area rather than showing zero', async () => {
    panel()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Details for Blue House'))
    })
    // The seeded Blue House is a point.
    expect(screen.queryByText(/sq ft/)).toBeNull()
  })
})
