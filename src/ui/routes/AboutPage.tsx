import { Card, PageHeader } from '@/ui/components'
import { APP_NAME, APP_VERSION, BUILD_DATE } from '@/version'

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="About" />
      <Card>
        <p className="text-sm">
          {APP_NAME} v{APP_VERSION}
          {BUILD_DATE && ` (built ${BUILD_DATE})`}. Map your orchard, find every tree, keep its
          history. A companion to the Perennial Profit Planner.
        </p>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Your farm lives only in this browser. There is no server, no account, and no analytics.
          Map tiles come from the imagery provider chosen in Settings; nothing else leaves the
          browser.
        </p>
      </Card>
      <Card>
        <h2 className="font-semibold">Credits</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-400">
          <li>Maps rendered with MapLibre GL JS; drawing with Terra Draw.</li>
          <li>Pennsylvania imagery: PEMA orthoimagery 2018–2020 via PASDA, Penn State.</li>
          <li>World imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community.</li>
          <li>Google satellite imagery via the Google Map Tiles API, where enabled.</li>
        </ul>
      </Card>
      <p className="text-xs text-stone-400 dark:text-stone-500">
        MIT License, copyright (c) 2026 Threefold Farm.
      </p>
    </div>
  )
}
