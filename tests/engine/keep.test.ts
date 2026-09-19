import { describe, expect, it } from 'vitest'
import { parseKeep } from '@/engine/keep'
import type { ParseContext } from '@/engine/tasks'

const ctx: ParseContext = {
  blocks: [{ id: 'blk_pp1', code: 'PP1', name: 'Pawpaws Block 1' }],
  rows: [],
  features: [{ id: 'ftr_gray', name: 'Gray House' }],
  people: [
    { id: 'per_tim', name: 'Tim' },
    { id: 'per_mar', name: 'Marissa' },
  ],
  labels: [],
}

const NOTE = `Catch up activities
mow around the pawpaws
Solar punch list
mount the inverter (Tim)
run conduit to the barn
label the breakers
Monkeys
water the gray house
order elderberry posts - Marissa
Mini Tasks/Projects
build and hang barn doors
Spinning Plates
train kiwis
graft care
Greenhouse Changes Before Fall
hang electric backup heaters (late fall after fig harvest)
move the citrus in
Long Term
paint the barn before cold weather
remove the jujubes?
Graft List 2027
Shenandoah whole row PP1
`

describe('parseKeep', () => {
  it('guesses headings, buckets, projects, and skips the graft list', () => {
    const groups = parseKeep(NOTE, ctx)
    expect(groups.map((g) => [g.heading, g.guess, g.bucket ?? null, g.items.length])).toEqual([
      ['Catch up activities', 'bucket', 'now', 1],
      ['Solar punch list', 'project', null, 3],
      ['Monkeys', 'bucket', 'now', 2],
      ['Mini Tasks/Projects', 'bucket', 'soon', 1],
      ['Spinning Plates', 'bucket', 'recurring', 2],
      ['Greenhouse Changes Before Fall', 'project', null, 2],
      ['Long Term', 'bucket', 'later', 2],
      ['Graft List 2027', 'skip', null, 1],
    ])
    const solar = groups[1]!
    expect(solar.items[0]!.parsed).toMatchObject({
      title: 'Mount the inverter',
      ownerId: 'per_tim',
    })
    const monkeys = groups[2]!
    expect(monkeys.items[0]!.parsed.targets).toEqual([{ kind: 'feature', id: 'ftr_gray' }])
    expect(monkeys.items[1]!.parsed).toMatchObject({ ownerId: 'per_mar', category: 'admin' })
    const later = groups[6]!
    expect(later.items[1]!.parsed.needsDiscussion).toBe(true)
  })

  it('takes lines before any heading as Monkeys and honours renamed buckets', () => {
    const groups = parseKeep('- fix the gate\n- [x] mow\nToday\nweed PP1', ctx, { now: 'Today' })
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ heading: null, guess: 'bucket', bucket: 'now' })
    expect(groups[0]!.items.map((i) => i.parsed.title)).toEqual(['Fix the gate', 'Mow'])
    expect(groups[0]!.items[1]!.parsed.done).toBe(true)
    expect(groups[1]).toMatchObject({ heading: 'Today', guess: 'bucket', bucket: 'now' })
  })
})
