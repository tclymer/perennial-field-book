import { Component, type ErrorInfo, type ReactNode } from 'react'
import { exportCurrentFarm } from '@/state/exporter'

interface Props {
  children: ReactNode
  /** When this changes (for example the route), a shown error is cleared. */
  resetKey?: string
}

interface State {
  error: Error | null
}

/**
 * Catches a render-time failure in the pages below it and shows a way out instead of a
 * blank screen. Everything already recorded is still in the browser's storage.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render failed', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const stale =
      /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
        error.message,
      )
    return (
      <div
        role="alert"
        className="mx-auto my-8 max-w-xl rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-stone-900 p-4 shadow-sm"
      >
        <h2 className="font-semibold">
          {stale ? 'A newer version is available' : 'Something went wrong on this page'}
        </h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {stale
            ? 'Part of the app could not load, most likely because a new version was published while this page was open. Reload to continue.'
            : 'Everything you have recorded is still saved in this browser. Reload to continue.'}
        </p>
        <pre className="mt-2 max-h-32 overflow-auto rounded bg-stone-100 dark:bg-stone-800 p-2 text-xs text-stone-700 dark:text-stone-300">
          {error.message}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-md border border-lime-700 bg-lime-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-lime-800"
            onClick={() => location.reload()}
          >
            Reload
          </button>
          <button
            className="rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-1.5 text-sm font-medium text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
            onClick={() => void exportCurrentFarm()}
          >
            Export a copy
          </button>
          <button
            className="rounded-md border border-transparent px-3 py-1.5 text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
