// Test stand-in for `virtual:pwa-register/react`, which only exists inside a Vite build.
import { useState } from 'react'

export function useRegisterSW() {
  const needRefresh = useState(false)
  const offlineReady = useState(false)
  return { needRefresh, offlineReady, updateServiceWorker: async () => {} }
}
