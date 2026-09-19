import { useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { search, type SearchHit } from '@/engine/search'
import { Card, PageHeader, Pill, inputClass } from '@/ui/components'

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  tree: 'Tree',
  row: 'Row',
  block: 'Block',
  variety: 'Variety',
  feature: 'Place',
  task: 'Task',
}

export default function SearchPage() {
  const state = useFarmStore((s) => s.state)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const input = useRef<HTMLInputElement>(null)
  const result = useMemo(() => search(state, q), [state, q])

  useEffect(() => {
    input.current?.focus()
  }, [])

  return (
    <div className="space-y-4">
      <PageHeader title="Search" />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (result.exact) navigate(result.exact.to)
        }}
      >
        <input
          ref={input}
          className={`${inputClass} w-full text-base`}
          placeholder="PP1-3-12, Shenandoah, blue house…"
          value={q}
          inputMode="search"
          autoCapitalize="characters"
          onChange={(e) =>
            setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
          }
        />
      </form>
      {result.exact && (
        <Card className="border-lime-300 dark:border-lime-700">
          <Link to={result.exact.to} className="flex items-center justify-between">
            <span>
              <span className="font-semibold">{result.exact.title}</span>{' '}
              <span className="text-sm text-stone-600 dark:text-stone-400">
                {result.exact.detail}
              </span>
            </span>
            <span className="text-sm">Open →</span>
          </Link>
        </Card>
      )}
      {q && result.hits.length === 0 && !result.exact && (
        <p className="text-sm text-stone-500 dark:text-stone-400">Nothing matches.</p>
      )}
      {result.hits.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {result.hits.map((h, i) => (
              <li key={`${h.kind}-${h.title}-${i}`}>
                <Link
                  to={h.to}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800"
                >
                  <Pill className="w-16 justify-center text-center">{KIND_LABEL[h.kind]}</Pill>
                  <span className="font-medium">{h.title}</span>
                  {h.detail && (
                    <span className="text-sm text-stone-500 dark:text-stone-400">{h.detail}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
