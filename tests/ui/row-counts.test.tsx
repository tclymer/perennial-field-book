// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { EditorPanel } from '@/ui/map/EditorPanel'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { createBlock, createRow, removePositions } from '@/state/actions'
import { fromLocal } from '@/engine/geo'
import { positions } from '@/state/derived'
import { useEditor } from '@/ui/map/editorStore'
import { installBrowserStubs } from './fixtures'
import type { LngLat } from '@/model/types'

const ORIGIN: LngLat = [-77.083, 40.1794]
const at = (e: number, n: number): LngLat => fromLocal(ORIGIN, [e, n])
const s = () => useFarmStore.getState().state

let blockId = ''
let rowId = ''

beforeEach(async () => {
  installBrowserStubs()
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  useEditor.setState({ selectedBlockId: null })
  await useFarmStore.getState().createFarm('Test', ORIGIN, 17)
  blockId = createBlock({ code: 'GRH', name: 'Greenhouse', species: 'fig' })
  rowId = createRow(blockId, [at(0, 0), at(110, 0)], { by: 'count', count: 12 })
  useFarmStore.setState({ hydrated: true, hydrate: () => Promise.resolve() })
})

/** The map sidebar only mounts at a desktop width, so render it on its own. */
function panel() {
  cleanup()
  useEditor.setState({ selectedBlockId: blockId })
  render(
    <HashRouter>
      <EditorPanel />
    </HashRouter>,
  )
}

/** The summary is several text nodes, so match against the whole row's text. */
function rowSummary(): string {
  const el = [...document.querySelectorAll('li')].find((n) => /GRH-1/.test(n.textContent ?? ''))
  return el?.textContent ?? ''
}

async function openPage(hash: string) {
  cleanup()
  window.location.hash = hash
  render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
  await act(async () => {})
}

const liveIn = () => positions(s()).filter((p) => p.rowId === rowId)

/** Take out every spot but the four Tim was left with. */
function thinToFour() {
  const keep = new Set([1, 4, 7, 10])
  removePositions(
    liveIn()
      .filter((p) => !keep.has(p.slot))
      .map((p) => p.posKey),
  )
}

describe('a row that has had spots taken out', () => {
  it('counts the trees standing, not the spots the layout makes', () => {
    thinToFour()
    expect(liveIn()).toHaveLength(4)
    panel()
    // The row read "12 trees" while only four were standing.
    expect(rowSummary()).toMatch(/4 trees/)
    expect(rowSummary()).not.toMatch(/12 trees/)
  })

  it('says one tree rather than 1 trees', () => {
    removePositions(
      liveIn()
        .slice(1)
        .map((p) => p.posKey),
    )
    panel()
    expect(rowSummary()).toMatch(/1 tree ·/)
  })

  it('still counts every spot while none have been taken out', () => {
    panel()
    expect(rowSummary()).toMatch(/12 trees/)
  })

  it('keeps the grid the shape of the row, so nothing looks like it moved', async () => {
    const fourth = liveIn()[3]!
    expect(fourth.label).toBe('GRH-1-4')
    await act(async () => {
      removePositions([liveIn()[0]!.posKey])
    })
    await openPage(`#/blocks/${blockId}/grid`)
    await screen.findByText(/Row defaults/i)

    const body = document.querySelector('tbody')!
    const lines = [...body.querySelectorAll('tr')]
    // Twelve lines still, because the row still lays out twelve spots.
    expect(lines).toHaveLength(12)
    // The tree that was fourth has not moved up the table. It is still on the fourth line,
    // and only its number has changed.
    const cell = lines[3]!.querySelectorAll('td')[1]!.querySelector('button')
    expect(cell?.getAttribute('title')).toMatch(/^GRH-1-3/)
    // The first line is now the gap where a tree was taken out.
    expect(lines[0]!.querySelectorAll('td')[1]!.querySelector('button')).toBeNull()
  })
})
