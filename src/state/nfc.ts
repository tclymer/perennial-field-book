/**
 * Web NFC, which exists in Chrome on Android and nowhere else. Everything here is optional:
 * a phone that cannot scan can still pair a tag by typing its serial, and any phone at all
 * can follow a tag that has already been written, because that is an ordinary link.
 */
import { tagUrl } from '@/engine/tags'

interface NdefRecordInit {
  recordType: string
  data?: string
}
interface NdefReadingEvent extends Event {
  serialNumber: string
}
interface NdefReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>
  write(
    message: { records: NdefRecordInit[] },
    options?: { signal?: AbortSignal; overwrite?: boolean },
  ): Promise<void>
  addEventListener(type: 'reading', listener: (e: NdefReadingEvent) => void): void
  addEventListener(type: 'readingerror', listener: () => void): void
}

function Reader(): (new () => NdefReaderLike) | null {
  const w = window as unknown as { NDEFReader?: new () => NdefReaderLike }
  return w.NDEFReader ?? null
}

export function nfcSupported(): boolean {
  return Reader() !== null
}

export type ScanResult =
  { ok: true; serial: string } | { ok: false; reason: string; denied?: boolean }

function describe(err: unknown): { reason: string; denied?: boolean } {
  const e = err as { name?: string; message?: string }
  if (e?.name === 'NotAllowedError') {
    return {
      reason: 'This browser needs permission to use NFC. Allow it and try again.',
      denied: true,
    }
  }
  if (e?.name === 'NotSupportedError') return { reason: 'This phone cannot scan NFC tags.' }
  if (e?.name === 'AbortError') return { reason: 'Scan cancelled.' }
  return { reason: e?.message || 'The tag could not be read.' }
}

/** Wait for one tag and report its serial. The signal is how a screen cancels the wait. */
export async function scanOnce(signal: AbortSignal): Promise<ScanResult> {
  const R = Reader()
  if (!R) return { ok: false, reason: 'This phone cannot scan NFC tags.' }
  const reader = new R()
  return new Promise<ScanResult>((resolve) => {
    let done = false
    const finish = (r: ScanResult) => {
      if (done) return
      done = true
      resolve(r)
    }
    signal.addEventListener('abort', () => finish({ ok: false, reason: 'Scan cancelled.' }))
    reader.addEventListener('reading', (e) => finish({ ok: true, serial: e.serialNumber }))
    reader.addEventListener('readingerror', () =>
      finish({ ok: false, reason: 'That tag could not be read. Try holding it steadier.' }),
    )
    reader.scan({ signal }).catch((err) => finish({ ok: false, ...describe(err) }))
  })
}

/**
 * Write a tag's own link onto it. Done once per tag, ever: after this the tag is an ordinary
 * link that any phone can follow, and what it means is decided in the app.
 */
export async function writeTagUrl(
  serial: string,
  origin: string,
  signal: AbortSignal,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const R = Reader()
  if (!R) return { ok: false, reason: 'This phone cannot write NFC tags.' }
  try {
    await new R().write(
      { records: [{ recordType: 'url', data: tagUrl(origin, serial) }] },
      { signal },
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, ...describe(err) }
  }
}
