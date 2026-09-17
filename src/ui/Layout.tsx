import { useEffect, useRef } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { APP_NAME, APP_VERSION } from '@/version'
import { useFarmStore } from '@/state/store'
import { ErrorBoundary } from './ErrorBoundary'
import { UpdateToast } from './UpdateToast'
import { nextTheme, themeLabel, useTheme } from './theme'

const navClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-stone-100',
  )

const tabClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
    isActive ? 'text-lime-700 dark:text-lime-400' : 'text-stone-500 dark:text-stone-400',
  )

const DESKTOP_NAV: [string, string][] = [
  ['/', 'Map'],
  ['/blocks', 'Blocks'],
  ['/varieties', 'Varieties'],
  ['/search', 'Search'],
  ['/settings', 'Settings'],
]

const PHONE_TABS: [string, string, string][] = [
  ['/', 'Map', '◎'],
  ['/blocks', 'Blocks', '▦'],
  ['/search', 'Search', '⌕'],
  ['/settings', 'Settings', '⚙'],
]

/** Pages that work before a farm exists. */
const NO_FARM_OK = ['/start', '/about']

export default function Layout() {
  const [theme, setTheme] = useTheme()
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const hydrated = useFarmStore((s) => s.hydrated)
  const farmId = useFarmStore((s) => s.farmId)
  const hydrate = useFarmStore((s) => s.hydrate)
  // The map fills the space between the header and the phone tabs; other pages scroll.
  const fullBleed = pathname === '/' || pathname === ''
  const needsFarm = hydrated && !farmId && !NO_FARM_OK.some((p) => pathname.startsWith(p))

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // Each page gets its own tab title, and focus moves to the page on navigation.
  useEffect(() => {
    document.title = `${pageTitle(pathname)} · ${APP_NAME}`
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div
      className={clsx(
        'flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100',
        fullBleed ? 'h-dvh' : 'min-h-dvh',
      )}
    >
      <button
        type="button"
        onClick={() => {
          // A plain #main link would be read as a route by the hash router.
          mainRef.current?.focus()
          mainRef.current?.scrollIntoView({ block: 'start' })
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-lime-700 focus:px-3 focus:py-1.5 focus:text-sm focus:text-white"
      >
        Skip to content
      </button>
      <header className="z-20 border-b border-stone-200 dark:border-stone-700 bg-white/95 dark:bg-stone-900/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <NavLink
            to="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            <img src="/icon.svg" alt="" className="h-6 w-6 rounded" />
            <span>{APP_NAME}</span>
          </NavLink>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {DESKTOP_NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={navClass}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setTheme(nextTheme[theme])}
              className="rounded-md border border-stone-300 dark:border-stone-600 bg-stone-100 dark:bg-stone-800 px-2.5 py-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              title={`Theme: ${themeLabel[theme]}. Click for ${themeLabel[nextTheme[theme]].toLowerCase()}.`}
              aria-label={`Theme: ${themeLabel[theme]}. Click for ${themeLabel[nextTheme[theme]].toLowerCase()}.`}
            >
              <span aria-hidden>{theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}</span>
              <span className="ml-1 hidden sm:inline">{themeLabel[theme]}</span>
            </button>
          </div>
        </div>
      </header>
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className={clsx(
          'outline-none',
          fullBleed ? 'relative min-h-0 flex-1' : 'mx-auto w-full max-w-6xl flex-1 px-4 py-5',
        )}
      >
        {!hydrated ? (
          <p className="p-4 text-stone-500 dark:text-stone-400">Loading your farm…</p>
        ) : needsFarm ? (
          <Navigate to="/start" replace />
        ) : (
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        )}
      </main>
      {!fullBleed && (
        <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-stone-400 dark:text-stone-500 print:hidden">
          {APP_NAME} v{APP_VERSION} ·{' '}
          <NavLink
            to="/about"
            className="underline decoration-dotted hover:text-stone-700 dark:hover:text-stone-300"
          >
            About
          </NavLink>
        </footer>
      )}
      <nav
        aria-label="Main"
        className="sticky bottom-0 z-20 flex border-t border-stone-200 dark:border-stone-700 bg-white/95 dark:bg-stone-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
      >
        {PHONE_TABS.map(([to, label, glyph]) => (
          <NavLink key={to} to={to} end={to === '/'} className={tabClass}>
            <span aria-hidden className="text-lg leading-none">
              {glyph}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
      <UpdateToast />
    </div>
  )
}

/** Tab title for a route. */
function pageTitle(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'Map'
  if (pathname.startsWith('/start')) return 'Set up your farm'
  if (/^\/blocks\/[^/]+\/grid/.test(pathname)) return 'Block grid'
  if (pathname.startsWith('/blocks')) return 'Blocks'
  if (pathname.startsWith('/t/')) return decodeURIComponent(pathname.slice(3))
  if (pathname.startsWith('/varieties')) return 'Varieties'
  if (pathname.startsWith('/search')) return 'Search'
  if (pathname.startsWith('/import')) return 'Import from the planner'
  if (pathname.startsWith('/settings')) return 'Settings'
  if (pathname.startsWith('/about')) return 'About'
  return 'Field Book'
}
