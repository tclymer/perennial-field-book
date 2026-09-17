/** jsdom lacks a few browser APIs the pages touch. */
export function installBrowserStubs() {
  if (!('ResizeObserver' in globalThis)) {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.assign(globalThis, { ResizeObserver: RO })
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        matches: false,
        media: '',
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      }),
    })
  }
}
