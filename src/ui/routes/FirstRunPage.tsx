import { PageHeader } from '@/ui/components'

export default function FirstRunPage() {
  return (
    <div>
      <PageHeader title="Set up your farm" />
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Name your farm and point the map at it. Coming in the next step.
      </p>
    </div>
  )
}
