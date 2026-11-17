/**
 * What the app calls people day to day: a first name, which is how a small crew talks, and
 * short enough to sit in a day column. Settings and the records exports keep full names.
 */
import type { FarmState, Person } from '@/model/types'
import { live } from '@/events/reduce'

const words = (name: string) => name.trim().split(/\s+/).filter(Boolean)
const first = (name: string) => (words(name)[0] ?? '').toLowerCase()

/**
 * "Tim" for Tim Clymer. When two people share a first name, both get a last initial
 * ("Tim C.", "Tim R."), and if even that clashes, or there is no last name to tell them
 * apart, their full names.
 */
export function shortName(person: Person, people: readonly Person[]): string {
  const parts = words(person.name)
  if (parts.length === 0) return person.name
  const namesakes = people.filter(
    (p) => p.id !== person.id && !p.deleted && first(p.name) === first(person.name),
  )
  if (namesakes.length === 0) return parts[0]!
  const initial = (name: string) => {
    const w = words(name)
    return w.length > 1 ? `${w[0]} ${w[w.length - 1]![0]!.toUpperCase()}.` : null
  }
  const mine = initial(person.name)
  if (mine && namesakes.every((p) => initial(p.name) !== mine)) return mine
  return person.name.trim()
}

/** A lookup from person id to short name, for a screen that names several people. */
export function shortNamer(state: FarmState): (id: string | undefined) => string | undefined {
  const people = live.people(state)
  const cache = new Map<string, string>()
  return (id) => {
    if (!id) return undefined
    const p = state.people[id]
    if (!p) return undefined
    let name = cache.get(id)
    if (name === undefined) {
      name = shortName(p, people)
      cache.set(id, name)
    }
    return name
  }
}
