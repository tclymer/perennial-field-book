import { Link } from 'react-router-dom'
import { PageHeader } from '@/ui/components'

export default function NotFound() {
  return (
    <div>
      <PageHeader title="Page not found" />
      <p className="text-sm text-stone-600 dark:text-stone-400">
        <Link to="/" className="underline decoration-dotted">
          Back to the map
        </Link>
      </p>
    </div>
  )
}
