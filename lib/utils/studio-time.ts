/**
 * The studio's clock — one place, used everywhere a member sees a time.
 *
 * Class times are stored as absolute instants. Turning one back into "17:30"
 * needs a timezone, and until now every part of the app inferred a different
 * one: the member's device when rendering, the admin's device when creating a
 * schedule, and UTC inside server actions. That is why the same class could
 * show three different times.
 *
 * Everything member-facing should go through here instead.
 *
 * ---------------------------------------------------------------------------
 * THE OVERRIDE
 *
 * Naming the zone is not sufficient on its own. `Africa/Casablanca` is
 * resolved from whatever copy of the IANA timezone database the runtime
 * happens to carry, and after a rule change those copies lag: as of
 * 2026-09-20 the production Postgres, the Node runtime (tz 2025c) and the
 * build image (tzdata 2025b) all still place Morocco at UTC+1.
 *
 * STUDIO_TZ_OFFSET_OVERRIDE_MINUTES corrects that gap without waiting for the
 * platforms. It is the number of minutes to add to the instant before
 * formatting, so a runtime that is an hour ahead of reality is corrected with
 * -60. It defaults to 0, which is plain zone behaviour, and should be reset to
 * 0 (or the variable removed) once the platforms ship rules that match the
 * country — leaving it in place afterwards would double-correct.
 *
 * Set NEXT_PUBLIC_STUDIO_TZ_OFFSET_OVERRIDE in Vercel. It is public on
 * purpose: the browser needs the same correction the server uses, otherwise
 * the two disagree again.
 * ---------------------------------------------------------------------------
 */

export const STUDIO_TZ = 'Africa/Casablanca'

export const STUDIO_TZ_OFFSET_OVERRIDE_MINUTES = (() => {
  const raw = process.env.NEXT_PUBLIC_STUDIO_TZ_OFFSET_OVERRIDE
  const parsed = raw ? Number(raw) : 0
  // A typo here would silently move every displayed time, so refuse anything
  // that is not a sane whole-minute offset and fall back to zone behaviour.
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || Math.abs(parsed) > 180) {
    if (raw) console.error(`Ignoring invalid NEXT_PUBLIC_STUDIO_TZ_OFFSET_OVERRIDE: ${raw}`)
    return 0
  }
  return parsed
})()

function corrected(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value)
  return STUDIO_TZ_OFFSET_OVERRIDE_MINUTES === 0
    ? d
    : new Date(d.getTime() + STUDIO_TZ_OFFSET_OVERRIDE_MINUTES * 60_000)
}

function studioFormat(value: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: STUDIO_TZ, ...options }).format(corrected(value))
}

/** "17:30" — the time the class actually starts, at the studio. */
export function formatStudioTime(value: string | Date): string {
  return studioFormat(value, { hour: '2-digit', minute: '2-digit' })
}

/** "lundi 21 septembre 2026" */
export function formatStudioDate(value: string | Date): string {
  return studioFormat(value, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

/** "lundi 21 septembre" — for messages where the year is noise. */
export function formatStudioDayMonth(value: string | Date): string {
  return studioFormat(value, { weekday: 'long', day: '2-digit', month: 'long' })
}

/** "lun. 21 sept. 2026" — compact, for dense tables. */
export function formatStudioShortDate(value: string | Date): string {
  return studioFormat(value, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

/** "21 septembre 2026" — no weekday, for subscription dates. */
export function formatStudioLongDate(value: string | Date): string {
  return studioFormat(value, { day: '2-digit', month: 'long', year: 'numeric' })
}

/** "21/09/2026 à 17:30" */
export function formatStudioDateTime(value: string | Date): string {
  return `${studioFormat(value, { day: '2-digit', month: '2-digit', year: 'numeric' })} à ${formatStudioTime(value)}`
}

/**
 * "Now", as a Date whose LOCAL components read as the studio's wall clock.
 *
 * Comparisons like `now >= sundayAt17` are written against a Date's local
 * getters, so they only mean "17:00 at the studio" if `now` carries the
 * studio's wall clock. On a device in Morocco with current zone rules this is
 * the same as `new Date()`; on a device abroad, or one whose rules are stale,
 * it is not — which is exactly when the booking window used to open at the
 * wrong hour.
 *
 * The returned Date is a stand-in for comparing wall clocks, not a real
 * instant: do not send it to the database or subtract it from a real Date.
 */
export function studioNow(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TZ,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(corrected(new Date()))

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10)
  // Intl renders midnight as hour 24 in some ICU versions.
  const hour = get('hour') % 24

  return new Date(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
}
