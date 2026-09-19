/**
 * People and who is holding this device (DESIGN.md §3.7). The current person is matched
 * from the Google sign-in the first time it is needed, then remembered per device.
 */
import type { Person } from '@/model/types'
import { newId } from '@/model/ids'
import { live } from '@/events/reduce'
import { useSync } from '@/sync/store'
import { useDevice } from './device'
import { useFarmStore } from './store'

function state() {
  return useFarmStore.getState().state
}

export function createPerson(name: string, email?: string): string {
  const id = newId('per')
  useFarmStore
    .getState()
    .commit([
      {
        type: 'person.create',
        payload: { id, name: name.trim(), active: true, ...(email ? { email } : {}) },
      },
    ])
  return id
}

export function updatePerson(
  id: string,
  patch: { name?: string; active?: boolean; email?: string | null },
) {
  useFarmStore.getState().commit([{ type: 'person.patch', payload: { id, ...patch } }])
}

export function deletePerson(id: string): void {
  useFarmStore.getState().commit([{ type: 'person.delete', payload: { id } }])
  if (useDevice.getState().personId === id) useDevice.getState().set({ personId: null })
}

export function activePeople(): Person[] {
  return live
    .people(state())
    .filter((p) => p.active)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The person this device logs as, if one is set and still exists. */
export function currentPerson(): Person | null {
  const id = useDevice.getState().personId
  if (!id) return null
  const p = state().people[id]
  return p && !p.deleted ? p : null
}

export function setCurrentPerson(id: string | null): void {
  useDevice.getState().set({ personId: id })
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * The person for this device: the remembered one; else the signed-in account matched by
 * email or name (creating them if new); else nothing, and the sheet asks.
 */
export function ensureCurrentPerson(): Person | null {
  const current = currentPerson()
  if (current) return current
  const user = useSync.getState().session?.user
  if (!user) return null
  const people = live.people(state())
  const email = norm(user.email)
  const name = norm(user.name)
  const match =
    people.find((p) => p.email && norm(p.email) === email) ??
    people.find((p) => norm(p.name) === name) ??
    people.find((p) => name && norm(p.name).split(' ')[0] === name.split(' ')[0])
  const id = match?.id ?? createPerson(user.name || user.email, user.email)
  if (match && !match.email && user.email) updatePerson(match.id, { email: user.email })
  setCurrentPerson(id)
  return state().people[id] ?? null
}
