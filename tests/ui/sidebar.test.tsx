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
