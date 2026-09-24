// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { db } from '@/events/db'
import { live } from '@/events/reduce'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { createVariety, updateVariety } from '@/state/actions'
import { search } from '@/engine/search'
import { traitsOf } from '@/engine/traits'
import { installBrowserStubs } from './fixtures'

const s = () => useFarmStore.getState().state
const varietyNamed = (name: string) => live.varieties(s()).find((v) => v.name === name)!

let prok = ''

beforeEach(async () => {
  installBrowserStubs()
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Threefold', [-77.083, 40.1794], 17)
  prok = createVariety({ species: 'persimmon', name: 'Prok' })
  createVariety({ species: 'persimmon', name: 'Barbra' })
  createVariety({ species: 'pawpaw', name: 'Shenandoah' })
  useFarmStore.setState({ hydrated: true, hydrate: () => Promise.resolve() })
})

async function openVarieties() {
  cleanup()
  window.location.hash = '#/varieties'
  render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
  await act(async () => {})
  // Wait for the page itself, not just a tick: with nothing else pending the first render
  // can still be the loading fallback.
  await screen.findByRole('heading', { name: 'Varieties' })
}

/** A variety card keeps its fields folded away until its name is tapped. */
async function openCard(name: string) {
  await openVarieties()
  await act(async () => {
    fireEvent.click(await screen.findByText(name))
  })
}

describe('writing down what a cultivar is like', () => {
  it('adds a trait by typing it and pressing Enter', async () => {
    await openCard('Prok')
    const box = await screen.findByLabelText('Add a trait to Prok')
    await act(async () => {
      fireEvent.change(box, { target: { value: 'precocious' } })
      fireEvent.keyDown(box, { key: 'Enter' })
    })
    expect(traitsOf(varietyNamed('Prok'))).toEqual(['precocious'])
  })

  it('takes the same word only once, however it is capitalised', async () => {
    updateVariety(prok, { traits: ['precocious'] })
    await openCard('Prok')
    const box = await screen.findByLabelText('Add a trait to Prok')
    await act(async () => {
      fireEvent.change(box, { target: { value: 'Precocious' } })
      fireEvent.keyDown(box, { key: 'Enter' })
    })
    expect(traitsOf(varietyNamed('Prok'))).toEqual(['precocious'])
  })

  it('takes one off again', async () => {
    updateVariety(prok, { traits: ['precocious', 'upright'] })
    await openCard('Prok')
    await act(async () => {
      fireEvent.click(await screen.findByLabelText('Remove upright'))
    })
    expect(traitsOf(varietyNamed('Prok'))).toEqual(['precocious'])
  })

  it('offers what the same species already uses, so the words settle themselves', async () => {
    updateVariety(varietyNamed('Barbra').id, { traits: ['shy bearing'] })
    await openCard('Prok')
    // Offered on Prok because another persimmon carries it.
    expect(await screen.findByRole('button', { name: 'shy bearing' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'shy bearing' }))
    })
    expect(traitsOf(varietyNamed('Prok'))).toEqual(['shy bearing'])
  })

  it('filters the list down to one trait, across every species', async () => {
    updateVariety(prok, { traits: ['precocious'] })
    updateVariety(varietyNamed('Shenandoah').id, { traits: ['precocious'] })
    await openVarieties()
    await act(async () => {
      fireEvent.click(await screen.findByText(/precocious/))
    })
    // A pawpaw and a persimmon share the word, so both survive the filter.
    expect(screen.getByText('Prok')).toBeTruthy()
    expect(screen.getByText('Shenandoah')).toBeTruthy()
    expect(screen.queryByText('Barbra')).toBeNull()
  })
})

describe('finding things again, which is the point', () => {
  it('finds a variety by a trait', () => {
    updateVariety(prok, { traits: ['precocious', 'vigor: high'] })
    const hits = search(s(), 'precoc').hits.filter((h) => h.kind === 'variety')
    expect(hits.map((h) => h.title)).toEqual(['Prok'])
    expect(hits[0]!.detail).toContain('precocious')
  })

  it('finds a variety by its notes, which it could not do before', () => {
    updateVariety(prok, { notes: 'Ripens a fortnight ahead of everything else here.' })
    const hits = search(s(), 'fortnight').hits.filter((h) => h.kind === 'variety')
    expect(hits.map((h) => h.title)).toEqual(['Prok'])
    expect(hits[0]!.detail).toContain('in the notes')
  })

  it('still finds a variety by name and species', () => {
    expect(
      search(s(), 'shenandoah')
        .hits.filter((h) => h.kind === 'variety')
        .map((h) => h.title),
    ).toEqual(['Shenandoah'])
    expect(search(s(), 'persimmon').hits.filter((h) => h.kind === 'variety')).toHaveLength(2)
  })

  it('finds nothing for a word nobody wrote', () => {
    expect(search(s(), 'zzzz').hits).toHaveLength(0)
  })
})
