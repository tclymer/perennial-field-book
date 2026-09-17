/**
 * The Google logo and copyright the Map Tiles API terms require while its imagery shows.
 * The logo file in public/ should be the one from Google's brand kit; swap it there.
 */
export function GoogleAttribution({ copyright }: { copyright: string | null }) {
  return (
    <div className="pointer-events-none absolute bottom-8 left-2 z-10 flex items-center gap-1.5 rounded bg-white/85 px-1.5 py-0.5 text-[11px] text-stone-800">
      <img src="/google-logo.svg" alt="" className="h-4 w-4" />
      <span className="font-medium">Google</span>
      <span>{copyright ?? ''}</span>
    </div>
  )
}
