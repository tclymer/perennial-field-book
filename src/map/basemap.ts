/**
 * Which imagery the map shows and when it falls back: Google while online and under
 * quota, else the farm's free preset, else nothing. Pure so it can be tested; the hook in
 * useBasemap.ts drives it.
 */
export type BasemapSource = 'google' | 'preset' | 'none'

export interface BasemapState {
  source: BasemapSource
  /** Shown over the map when the source is not what was asked for. */
  notice: string | null
  /** Timestamps of recent tile failures while on Google. */
  failures: number[]
  /** Why Google was left, if it was. */
  googleDown: 'quota' | 'denied' | 'network' | 'session' | null
}

export interface Availability {
  hasKey: boolean
  enabled: boolean
  online: boolean
  hasPreset: boolean
  presetName: string | null
}

const BURST_WINDOW_MS = 10_000
const BURST_COUNT = 3

export function initialState(a: Availability): BasemapState {
  const source: BasemapSource =
    a.hasKey && a.enabled && a.online ? 'google' : a.hasPreset ? 'preset' : 'none'
  return { source, notice: null, failures: [], googleDown: null }
}

function fallback(a: Availability): BasemapSource {
  return a.hasPreset ? 'preset' : 'none'
}

function noticeFor(reason: NonNullable<BasemapState['googleDown']>, a: Availability): string {
  const showing = a.hasPreset
    ? `showing ${a.presetName ?? 'free imagery'}`
    : 'showing drawn features only'
  switch (reason) {
    case 'quota':
      return `Google imagery limit reached for today, ${showing}.`
    case 'denied':
      return `Google imagery refused this key, ${showing}.`
    case 'session':
      return `Google imagery could not start a session, ${showing}.`
    default:
      return `Google imagery unavailable, ${showing}.`
  }
}

/** A tile or session failure while on Google. Returns the same state when nothing changes. */
export function onGoogleFailure(
  state: BasemapState,
  status: number | undefined,
  a: Availability,
  now = Date.now(),
): BasemapState {
  if (state.source !== 'google') return state
  if (status === 429) return leave('quota')
  if (status === 403 || status === 401) return leave('denied')
  const failures = [...state.failures.filter((t) => now - t < BURST_WINDOW_MS), now]
  if (failures.length >= BURST_COUNT) return leave('network')
  return { ...state, failures }

  function leave(reason: NonNullable<BasemapState['googleDown']>): BasemapState {
    return { source: fallback(a), notice: noticeFor(reason, a), failures: [], googleDown: reason }
  }
}

/** The session could not be created: same fallback, no burst counting. */
export function onSessionFailure(
  state: BasemapState,
  status: number | undefined,
  a: Availability,
): BasemapState {
  if (state.source !== 'google') return state
  const reason = status === 429 ? 'quota' : status === 403 || status === 401 ? 'denied' : 'session'
  return { source: fallback(a), notice: noticeFor(reason, a), failures: [], googleDown: reason }
}

/** Availability changed (a setting, the network): recompute without losing a quota fallback. */
export function onAvailability(state: BasemapState, a: Availability): BasemapState {
  if (state.googleDown === 'quota' && a.online) {
    // Google will refuse until midnight; keep the fallback but refresh the notice's target.
    return { ...state, source: fallback(a), notice: noticeFor('quota', a) }
  }
  const next = initialState(a)
  return next.source === state.source && !state.googleDown ? state : next
}

/** The user asked to try Google again. */
export function retryGoogle(a: Availability): BasemapState {
  return initialState({ ...a })
}
