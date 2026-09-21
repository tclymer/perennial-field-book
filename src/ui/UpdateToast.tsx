import { useRegisterSW } from 'virtual:pwa-register/react'
import { useFarmStore } from '@/state/store'
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
  // Changes this build cannot act on came from one that can. Saying so beats showing less
  // than the other devices and leaving someone to wonder which one is telling the truth.
  const beyond = useFarmStore((s) => s.state.beyond)
  if (!need && beyond === 0) return null
  return (
    <div
      role="status"
      className="fixed bottom-20 right-4 z-30 flex max-w-80 flex-wrap items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-lg md:bottom-4 dark:border-stone-600 dark:bg-stone-900 print:hidden"
    >
      <span>
        {beyond > 0
          ? `${beyond} ${beyond === 1 ? 'change was' : 'changes were'} made by a newer version of the app. They are saved here, and will show once this device catches up.`
          : 'A new version is ready.'}
      </span>
      <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
      {need && (
        <Button variant="ghost" onClick={() => setNeed(false)}>
          Later
        </Button>
      )}
    </div>
  )
}
