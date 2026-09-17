import { describe, expect, it } from 'vitest'
import {
  initialState,
  onAvailability,
  onGoogleFailure,
  onSessionFailure,
  retryGoogle,
  type Availability,
} from '@/map/basemap'

const full: Availability = {
  hasKey: true,
  enabled: true,
  online: true,
  hasPreset: true,
  presetName: 'Pennsylvania imagery (PEMA 2018–2020)',
}

describe('basemap fallback', () => {
  it('starts on Google only with a key, the toggle on, and a connection', () => {
    expect(initialState(full).source).toBe('google')
    expect(initialState({ ...full, hasKey: false }).source).toBe('preset')
    expect(initialState({ ...full, enabled: false }).source).toBe('preset')
    expect(initialState({ ...full, online: false }).source).toBe('preset')
    expect(initialState({ ...full, hasKey: false, hasPreset: false }).source).toBe('none')
  })

  it('leaves Google at once on quota or a refused key, with a notice', () => {
    const quota = onGoogleFailure(initialState(full), 429, full)
    expect(quota.source).toBe('preset')
    expect(quota.googleDown).toBe('quota')
    expect(quota.notice).toMatch(/limit reached for today, showing Pennsylvania/)
    const denied = onGoogleFailure(initialState(full), 403, full)
    expect(denied.googleDown).toBe('denied')
    const bare = onGoogleFailure(initialState({ ...full, hasPreset: false }), 429, {
      ...full,
      hasPreset: false,
    })
    expect(bare.source).toBe('none')
    expect(bare.notice).toMatch(/drawn features only/)
  })

  it('tolerates two network failures and leaves on the third within ten seconds', () => {
    let s = initialState(full)
    s = onGoogleFailure(s, undefined, full, 1000)
    s = onGoogleFailure(s, undefined, full, 2000)
    expect(s.source).toBe('google')
    expect(s.failures).toHaveLength(2)
    // An old failure ages out of the window.
    s = onGoogleFailure(s, undefined, full, 20_000)
    expect(s.source).toBe('google')
    s = onGoogleFailure(s, undefined, full, 21_000)
    s = onGoogleFailure(s, undefined, full, 22_000)
    expect(s.source).toBe('preset')
    expect(s.googleDown).toBe('network')
  })

  it('ignores failures once off Google, and a session failure falls back too', () => {
    const off = onGoogleFailure(initialState(full), 429, full)
    expect(onGoogleFailure(off, 500, full)).toBe(off)
    expect(onSessionFailure(initialState(full), 403, full).googleDown).toBe('denied')
    expect(onSessionFailure(initialState(full), undefined, full).googleDown).toBe('session')
  })

  it('keeps a quota fallback when settings change, but retry goes back to Google', () => {
    const off = onGoogleFailure(initialState(full), 429, full)
    expect(onAvailability(off, full).source).toBe('preset')
    expect(onAvailability(initialState(full), { ...full, enabled: false }).source).toBe('preset')
    expect(retryGoogle(full).source).toBe('google')
  })
})
