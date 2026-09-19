import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Layout from './ui/Layout'
import { ErrorBoundary } from './ui/ErrorBoundary'

const MapPage = lazy(() => import('./ui/routes/MapPage'))
const FirstRunPage = lazy(() => import('./ui/routes/FirstRunPage'))
const BlocksPage = lazy(() => import('./ui/routes/BlocksPage'))
const BlockGridPage = lazy(() => import('./ui/routes/BlockGridPage'))
const TreePage = lazy(() => import('./ui/routes/TreePage'))
const VarietiesPage = lazy(() => import('./ui/routes/VarietiesPage'))
const SearchPage = lazy(() => import('./ui/routes/SearchPage'))
const ImportPage = lazy(() => import('./ui/routes/ImportPage'))
const SettingsPage = lazy(() => import('./ui/routes/SettingsPage'))
const AboutPage = lazy(() => import('./ui/routes/AboutPage'))
const AuthPage = lazy(() => import('./ui/routes/AuthPage'))
const JoinPage = lazy(() => import('./ui/routes/JoinPage'))
const WeekPage = lazy(() => import('./ui/routes/WeekPage'))
const NotFound = lazy(() => import('./ui/routes/NotFound'))

/** Each route gets its own error boundary and loading fallback. */
function Page({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<p className="p-4 text-stone-500 dark:text-stone-400">Loading…</p>}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Page>
              <MapPage />
            </Page>
          }
        />
        <Route
          path="week"
          element={
            <Page>
              <WeekPage />
            </Page>
          }
        />
        <Route
          path="start"
          element={
            <Page>
              <FirstRunPage />
            </Page>
          }
        />
        <Route
          path="blocks"
          element={
            <Page>
              <BlocksPage />
            </Page>
          }
        />
        <Route
          path="blocks/:id/grid"
          element={
            <Page>
              <BlockGridPage />
            </Page>
          }
        />
        <Route
          path="t/:label"
          element={
            <Page>
              <TreePage />
            </Page>
          }
        />
        <Route
          path="varieties"
          element={
            <Page>
              <VarietiesPage />
            </Page>
          }
        />
        <Route
          path="search"
          element={
            <Page>
              <SearchPage />
            </Page>
          }
        />
        <Route
          path="import"
          element={
            <Page>
              <ImportPage />
            </Page>
          }
        />
        <Route
          path="settings"
          element={
            <Page>
              <SettingsPage />
            </Page>
          }
        />
        <Route
          path="auth"
          element={
            <Page>
              <AuthPage />
            </Page>
          }
        />
        <Route
          path="join/:token"
          element={
            <Page>
              <JoinPage />
            </Page>
          }
        />
        <Route
          path="about"
          element={
            <Page>
              <AboutPage />
            </Page>
          }
        />
        <Route
          path="*"
          element={
            <Page>
              <NotFound />
            </Page>
          }
        />
      </Route>
    </Routes>
  )
}
