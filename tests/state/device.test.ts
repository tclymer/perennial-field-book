// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

describe('device prefs', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists a change and reads it back', async () => {
    const { useDevice } = await import('@/state/device')
    useDevice
      .getState()
      .set({ basemap: 'esri', lastView: { center: [1, 2], zoom: 15, bearing: 30 } })
    const raw = JSON.parse(localStorage.getItem('fieldbook:device') ?? '{}')
    expect(raw.basemap).toBe('esri')
    expect(raw.lastView.zoom).toBe(15)
    expect(raw.set).toBeUndefined()
  })

  it('gives this browser one stable id', async () => {
    const { deviceId } = await import('@/state/device')
    const a = deviceId()
    expect(a.length).toBeGreaterThan(8)
    expect(deviceId()).toBe(a)
    expect(localStorage.getItem('fieldbook:deviceId')).toBe(a)
  })
})
