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
          Your farm lives in this browser and works without an account. Map tiles come from the
          imagery provider chosen in Settings. There is no analytics.
        </p>
      </Card>
      <Card>
        <h2 className="font-semibold">What the server stores when you sign in</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Signing in with Google is optional. It keeps a copy of your farm on this app's server so
          your other devices and the people you invite can sync it. The server stores your Google
          account's name, email address, and picture, and the farm records and photos you sync.
          Nothing else. Google is used only to confirm who you are.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-400">
          <li>Everyone on a farm can see its records and who else is on it.</li>
          <li>
            The owner can remove a person or delete the farm from the server at any time; a member
            can leave. Access ends immediately, though copies already on a device stay there.
          </li>
          <li>Export a complete copy from Settings whenever you like.</li>
          <li>
            The server runs on Cloudflare in the United States and is operated by Threefold Farm as
            a volunteer effort, with no guarantee of uptime. Keep exports of anything you cannot
            afford to lose.
          </li>
        </ul>
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
