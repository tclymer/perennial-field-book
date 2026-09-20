// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '@/App'
import { db } from '@/events/db'
import { resetStoreForTests, useFarmStore } from '@/state/store'
import { resetSyncForTests, useSync } from '@/sync/store'
import { refreshAccount } from '@/sync/auth'
import { resetEngineForTests } from '@/sync/engine'
import { installBrowserStubs } from '../ui/fixtures'
import { fakeServer, type FakeServer } from './fakeServer'

let server: FakeServer

beforeEach(async () => {
  installBrowserStubs()
  await Promise.all(
    [db.events, db.photos, db.outbox, db.photoOutbox, db.sync].map((t) => t.clear()),
  )
  localStorage.clear()
  resetStoreForTests()
  resetSyncForTests()
  resetEngineForTests()
  server = fakeServer()
  server.install()
  useSync.getState().setSession({
    token: 'tok_test',
    user: { id: 'usr_1', email: 'tim@example.com', name: 'Tim', picture: null },
  })
  await useFarmStore.getState().createFarm('Threefold', [-77.083, 40.1794], 17)
  useFarmStore.setState({ hydrated: true, hydrate: () => Promise.resolve() })
})

afterEach(() => server.uninstall())

describe('the app does not talk to the server in circles', () => {
  it('keeps the session object when nothing about it changed', () => {
    const before = useSync.getState().session
    useSync.getState().setSession({
      token: 'tok_test',
      user: { id: 'usr_1', email: 'tim@example.com', name: 'Tim', picture: null },
    })
    // Same content, same object: an effect watching the session must not fire again.
    expect(useSync.getState().session).toBe(before)
    useSync.getState().setSession({
      token: 'tok_test',
      user: { id: 'usr_1', email: 'tim@example.com', name: 'Tim C.', picture: null },
    })
    expect(useSync.getState().session).not.toBe(before)
    expect(useSync.getState().session?.user.name).toBe('Tim C.')
  })

  it('asks who is signed in once, however many things ask at once', async () => {
    await act(async () => {
      await Promise.all([refreshAccount(), refreshAccount(), refreshAccount()])
    })
    expect(server.calls.filter((c) => c.path === '/api/me')).toHaveLength(1)
  })

  it('settles down when Settings is open rather than refreshing forever', async () => {
    cleanup()
    window.location.hash = '#/settings'
    render(
      <HashRouter>
        <App />
      </HashRouter>,
    )
    await screen.findByText(/Your data/i, {}, { timeout: 4000 })
    // Let every effect and its follow-ups run.
    for (let i = 0; i < 10; i++) await act(async () => {})
    const settled = server.calls.length
    for (let i = 0; i < 10; i++) await act(async () => {})
    // A page that refreshes in a loop would keep adding calls here; this one is done.
    expect(server.calls.length).toBe(settled)
    expect(server.calls.filter((c) => c.path === '/api/me').length).toBeLessThanOrEqual(2)
  })
})
