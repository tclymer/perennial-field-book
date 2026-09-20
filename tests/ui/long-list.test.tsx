// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LongList } from '@/ui/LongList'

function items(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Thing ${i}` }))
}

function show(n: number, extra?: Partial<Parameters<typeof LongList>[0]>) {
  cleanup()
  render(
    <LongList
      items={items(n)}
      keyOf={(it) => (it as { id: string }).id}
      search={(it) => (it as { name: string }).name}
      row={(it) => <span>{(it as { name: string }).name}</span>}
      noun="things"
      {...(extra as object)}
    />,
  )
}

describe('a list that can grow long', () => {
  it('shows a short list whole, with no controls in the way', () => {
    show(6)
    expect(screen.getByText('Thing 5')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(/Show more/)).toBeNull()
  })

  it('shows a page of a long one and says how much is left', () => {
    show(132)
    expect(screen.getByText('Thing 9')).toBeTruthy()
    expect(screen.queryByText('Thing 10')).toBeNull()
    expect(screen.getByText(/122 more things/)).toBeTruthy()
    expect(screen.getByText('132 things')).toBeTruthy()
  })

  it('shows more, then all', () => {
    show(132)
    fireEvent.click(screen.getByText('Show more'))
    expect(screen.getByText('Thing 29')).toBeTruthy()
    fireEvent.click(screen.getByText('Show all 132'))
    expect(screen.getByText('Thing 131')).toBeTruthy()
    expect(screen.queryByText(/more things/)).toBeNull()
  })

  it('filters by what is typed, and counts what matched', () => {
    show(132)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Thing 12' } })
    // 12, 120 through 129.
    expect(screen.getByText(/11 of 132 things/)).toBeTruthy()
    expect(screen.getByText('Thing 120')).toBeTruthy()
    expect(screen.queryByText('Thing 3')).toBeNull()
  })

  it('says so plainly when nothing matches', () => {
    show(132)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } })
    expect(screen.getByText(/Nothing matches that/)).toBeTruthy()
  })

  it('goes back to the first page when the filter changes', () => {
    show(132)
    fireEvent.click(screen.getByText('Show all 132'))
    expect(screen.getByText('Thing 131')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Thing 1' } })
    // A new filter starts at one page again rather than rendering everything it matched.
    expect(screen.queryByText('Thing 19')).toBeNull()
  })

  it('narrows to a named subset', () => {
    show(132, {
      filters: [
        { label: 'Everything', match: () => true },
        {
          label: 'Evens',
          match: (it: unknown) => Number((it as { id: string }).id.slice(1)) % 2 === 0,
        },
      ],
    })
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: '1' } })
    expect(screen.getByText(/66 of 132 things/)).toBeTruthy()
    expect(screen.getByText('Thing 0')).toBeTruthy()
    expect(screen.queryByText('Thing 1')).toBeNull()
  })
})
