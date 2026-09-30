import { describe, expect, it } from 'vitest'
import { dueState, isResting, nextFirstOf, nextSeasonStart, sortRecurring } from '@/engine/tasks'
import type { Task } from '@/model/types'

const plate = (fields: Partial<Task> = {}): Task =>
  ({
    id: 't1',
    title: 'Prune kiwis',
    bucket: 'recurring',
    targets: [],
    order: 1,
    ...fields,
  }) as Task

describe('when done for the season brings a plate back', () => {
  it('goes to the start of the next season, not the next month in it', () => {
    // Kiwi pruning May to September, finished in August: back next May, not in September.
    expect(nextSeasonStart(plate({ seasonMonths: [5, 6, 7, 8, 9] }), '2026-08-20')).toBe(
      '2027-05-01',
    )
  })

  it('stays in the same year when the next season is later this year', () => {
    // Mowing in spring and again in fall: done with spring, back in September.
    expect(nextSeasonStart(plate({ seasonMonths: [4, 5, 9, 10] }), '2026-05-15')).toBe('2026-09-01')
  })

  it('handles a season that runs over the new year', () => {
    // Dormant pruning November to March, done in January: back next November.
    expect(nextSeasonStart(plate({ seasonMonths: [11, 12, 1, 2, 3] }), '2027-01-10')).toBe(
      '2027-11-01',
    )
  })

  it('has to ask when there is no season to wait for', () => {
    expect(nextSeasonStart(plate(), '2026-08-20')).toBeNull()
    expect(
      nextSeasonStart(
        plate({ seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }),
        '2026-08-20',
      ),
    ).toBeNull()
  })

  it('takes a picked month as the next one of that name', () => {
    expect(nextFirstOf(3, '2026-08-20')).toBe('2027-03-01')
    expect(nextFirstOf(10, '2026-08-20')).toBe('2026-10-01')
    // This month means a year from now; it was just put away.
    expect(nextFirstOf(8, '2026-08-20')).toBe('2027-08-01')
  })
})

describe('a plate that is resting', () => {
  const resting = plate({ restUntil: '2027-05-01' })

  it('counts as out of season until its date, then comes back by itself', () => {
    expect(isResting(resting, '2026-09-30')).toBe(true)
    expect(dueState(resting, [], '2026-09-30')).toBe('out-of-season')
    expect(isResting(resting, '2027-05-01')).toBe(false)
    expect(dueState(resting, [], '2027-05-01')).toBe('stale')
  })

  it('sorts below the plates still in play', () => {
    const awake = plate({ id: 't2', title: 'Mow' })
    expect(sortRecurring([resting, awake], [], '2026-09-30').map((t) => t.id)).toEqual(['t2', 't1'])
  })
})
