import { useEffect, useState } from 'react'

const QUERY = '(min-width: 900px) and (pointer: fine)'

function matches(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(QUERY).matches
  )
}

/** True on a wide screen with a mouse or trackpad: where layout editing is offered. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(QUERY)
    const onChange = () => setDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return desktop
}
