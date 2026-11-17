import { describe, expect, it } from 'vitest'
import { shortName } from '@/engine/people'
import type { Person } from '@/model/types'

const person = (id: string, name: string, extra: Partial<Person> = {}): Person =>
  ({ id, name, active: true, createdAt: 0, updatedAt: 0, ...extra }) as Person

describe('short names', () => {
  it('uses the first name', () => {
    const tim = person('a', 'Tim Clymer')
    expect(shortName(tim, [tim, person('b', 'Rebecca Johnson-Smith')])).toBe('Tim')
    expect(shortName(person('c', 'Ann'), [])).toBe('Ann')
  })

  it('adds a last initial to both people who share a first name', () => {
    const people = [person('a', 'Tim Clymer'), person('b', 'tim rhodes')]
    expect(shortName(people[0]!, people)).toBe('Tim C.')
    expect(shortName(people[1]!, people)).toBe('tim R.')
  })

  it('falls back to the full name when an initial cannot tell them apart', () => {
    const people = [person('a', 'Sam Cole'), person('b', 'Sam Carter'), person('c', 'Sam')]
    expect(shortName(people[0]!, people)).toBe('Sam Cole')
    expect(shortName(people[2]!, people)).toBe('Sam')
  })

  it('ignores someone removed from the farm', () => {
    const people = [person('a', 'Tim Clymer'), person('b', 'Tim Rhodes', { deleted: true })]
    expect(shortName(people[0]!, people)).toBe('Tim')
  })
})
