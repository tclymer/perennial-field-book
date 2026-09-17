import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './components'

/** Offers a reload when a newer build has been installed by the service worker. */
export function UpdateToast() {
  const {
    needRefresh: [need, setNeed],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
  })
  if (!need) return null
  return (
    <div
      role="status"
      className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm shadow-lg md:bottom-4 print:hidden"
    >
      <span>A new version is ready.</span>
      <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
      <Button variant="ghost" onClick={() => setNeed(false)}>
        Later
      </Button>
    </div>
  )
}
