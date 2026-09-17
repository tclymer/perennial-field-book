import { useEffect, useState } from 'react'

/** Light, dark, or follow the device. Kept per browser, not in the farm. */
export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'theme'

export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

let lastPref: ThemePref = 'system'
let printHooked = false

/** Put the `dark` class on the root element when the preference (or the device) calls for it. */
export function applyTheme(pref: ThemePref): void {
  lastPref = pref
  const dark = pref === 'dark' || (pref === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
  installPrintTheme()
}

/** Reports print in the light theme whatever is on screen; the dark class comes back afterwards. */
function installPrintTheme(): void {
  if (printHooked || typeof window === 'undefined') return
  printHooked = true
  window.addEventListener('beforeprint', () => document.documentElement.classList.remove('dark'))
  window.addEventListener('afterprint', () => applyTheme(lastPref))
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readTheme)
  useEffect(() => {
    applyTheme(pref)
    try {
      localStorage.setItem(KEY, pref)
    } catch {
      // Storage may be unavailable; the choice then lasts for this page only.
    }
    if (pref !== 'system' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])
  return [pref, setPref]
}

export const themeLabel: Record<ThemePref, string> = {
  system: 'Auto',
  light: 'Light',
  dark: 'Dark',
}
export const nextTheme: Record<ThemePref, ThemePref> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}
