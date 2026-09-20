// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { createBlock, createVariety } from '@/state/actions'
import { addHarvest } from '@/state/harvestActions'
import { addLog } from '@/state/taskActions'
import { createPerson, setCurrentPerson } from '@/state/people'
import { setCoverage } from '@/state/plannerActions'
import { installBrowserStubs } from './fixtures'

const BACKUP = {
  id: 'farm_planner_1',
  name: 'Threefold Farm',
  schemaVersion: 2,
  exportedAt: new Date().toISOString(),
  settings: { baseWage: 20, laborBurdenPct: 0.25 },
  scenarios: [],
  sharedAssets: [],
  customTemplates: [],
  plantings: [
    {
      id: 'pl_pawpaw',
      name: 'Pawpaws - Block 1',
      status: 'active',
      geometry: { rowLengthFt: 200, rowWidthFt: 16, inRowSpacingFt: 10, rows: 4 },
      life: { lifeYears: 40, yearsToMaturity: 8, cropLossYears: 1 },
      yield: { maturePerPlant: 30, unit: 'lb', unitsPerHarvestHour: 60 },
      plantCost: 25,
      costItems: [
        {
          id: 'c_mow',
          label: 'Mowing',
          block: 'annual',
          basis: 'perAcre',
          quantity: 4,
          unitCost: 0,
          unitCostRef: 'loadedWage',
          isLabor: true,
        },
      ],
      harvestItems: [],
      revenueChannels: [],
    },
  ],
}

/** A file whose text() the page can read, since jsdom has no File.text in this version. */
function backupFile(): File {
  const file = new File([JSON.stringify(BACKUP)], 'backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(JSON.stringify(BACKUP)) })
  return file
}

const year = new Date().getFullYear()

beforeEach(async () => {
  installBrowserStubs()
  await db.events.clear()
  localStorage.clear()
  resetStoreForTests()
  await useFarmStore.getState().createFarm('Threefold', [-77.083, 40.1794], 17)
  const tim = createPerson('Tim')
  setCurrentPerson(tim)
  const block = createBlock({
    code: 'PP1',
    name: 'Pawpaws Block 1',
    species: 'pawpaw',
    planner: {
      plantingId: 'pl_pawpaw',
      rowLengthFt: 200,
      rowWidthFt: 16,
      inRowSpacingFt: 10,
      rows: 4,
    },
  })
  const shen = createVariety({ species: 'pawpaw', name: 'Shenandoah' })
  for (let i = 0; i < 6; i++) {
    addHarvest({
      crop: 'pawpaw',
      varietyId: shen,
      blockId: block,
      quantity: 100,
      date: `${year}-09-10`,
    })
  }
  addLog({
    date: `${year}-09-10`,
    personIds: [tim],
    durationMinutes: 1200,
    category: 'harvest',
    targets: [{ kind: 'block', id: block }],
  })
  addLog({
    date: `${year}-06-01`,
    personIds: [tim],
    durationMinutes: 660,
    category: 'mowing',
    targets: [{ kind: 'block', id: block }],
  })
  setCoverage('harvest', 'complete')
  setCoverage('mowing', 'complete')
  useFarmStore.setState({ hydrated: true, hydrate: () => Promise.resolve() })
})

describe('comparing with the planner', () => {
  it('shows what the records say, and writes the ticked corrections into the backup', async () => {
    const saved: { name: string; text: string }[] = []
    const createObjectURL = vi.fn(() => 'blob:x')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true })
    // Catch the download: the anchor's click is what saves the file.
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ name: this.download, text: '' })
    })

    cleanup()
    window.location.hash = '#/planner'
    render(
      <HashRouter>
        <App />
      </HashRouter>,
    )
    const input = await screen.findByLabelText(/Planner backup/i, {}, { timeout: 4000 })
    await act(async () => {
      fireEvent.change(input, { target: { files: [backupFile()] } })
    })

    // The file is recognised and dated.
    expect(await screen.findByText(/Threefold Farm · 1 plantings · exported today/)).toBeTruthy()

    // 600 lb against 2,400 lb at maturity is a quarter of mature yield.
    const yieldRow = (await screen.findByText(`Yield realized in ${year}`)).closest('tr')!
    expect(within(yieldRow).getByText('0.25')).toBeTruthy()
    // 600 lb in 20 hours against an estimate of 60.
    const pickRow = screen.getByText('Units picked per hour').closest('tr')!
    expect(within(pickRow).getByText('60')).toBeTruthy()
    expect(within(pickRow).getByText('30')).toBeTruthy()
    // 11 hours over 0.2938 acres against an estimate of 4.
    const mowRow = screen.getByText('Mowing').closest('tr')!
    expect(within(mowRow).getByText('4')).toBeTruthy()
    expect(within(mowRow).getByText(/37\.4/)).toBeTruthy()

    // Nothing is written until something is ticked.
    expect(
      (screen.getByRole('button', { name: /Download the updated backup/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    fireEvent.click(within(pickRow).getByRole('checkbox'))
    fireEvent.click(within(mowRow).getByRole('checkbox'))
    expect(screen.getByText('2 corrections ticked.')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Download the updated backup/ }))
    })
    expect(saved).toHaveLength(1)
    expect(saved[0]!.name).toMatch(/^threefold-farm-\d{4}-\d{2}-\d{2}-trued-up\.json$/)
    expect(await screen.findByText(/2 changes written/)).toBeTruthy()
    click.mockRestore()
  })
})
