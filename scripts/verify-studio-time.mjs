/**
 * Cross-device check for the studio clock.
 *
 *   node --experimental-strip-types scripts/verify-studio-time.mjs
 *
 * Every class time in the app is an absolute instant rendered through
 * lib/utils/studio-time. The property that matters is that the rendering does
 * not depend on the machine doing it — not the member's phone, not the admin's
 * laptop, not the server. This runs the real module under a spread of device
 * timezones and asserts the answers are identical.
 *
 * It exists because that property was broken twice and neither break was
 * caught by reading the code: the first time a timezone name was resolved from
 * each runtime's own zone database, the second time several render paths were
 * simply missed. Both would have failed here on the first run.
 */
const { formatStudioTime, formatStudioDate, studioWallClockFromISO, studioWallClockToISO, studioNow } =
  await import('../lib/utils/studio-time.ts')

const CLASS_START = '2026-09-22T17:30:00Z'
const CLASS_END   = '2026-09-22T18:30:00Z'
const ZONES = ['Africa/Casablanca', 'UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati']

let failures = 0
const check = (label, got, want) => {
  const ok = got === want
  if (!ok) { failures++; console.log(`   FAIL  ${label}: got ${got}, expected ${want}`) }
}

for (const tz of ZONES) {
  process.env.TZ = tz
  check(`${tz} start time`,   formatStudioTime(CLASS_START), '17:30')
  check(`${tz} end time`,     formatStudioTime(CLASS_END),   '18:30')
  check(`${tz} date`,         formatStudioDate(CLASS_START), 'mardi 22 septembre 2026')

  // The wall-clock view drives grid bucketing, hour rows and the booking window.
  const wc = studioWallClockFromISO(CLASS_START)
  check(`${tz} bucketing hour`,  wc.getHours(), 17)
  check(`${tz} weekday`,         wc.getDay(), 2)
  check(`${tz} day key`,
    `${wc.getFullYear()}-${String(wc.getMonth() + 1).padStart(2, '0')}-${String(wc.getDate()).padStart(2, '0')}`,
    '2026-09-22')

  // The write path: an admin typing 17:30 into the schedule form.
  const typed = new Date('2026-10-05T17:30')
  check(`${tz} stores`,      studioWallClockToISO(typed).slice(11, 16), '17:30')
  check(`${tz} round-trips`, formatStudioTime(studioWallClockToISO(typed)), '17:30')
}

const clocks = new Set()
for (const tz of ZONES) { process.env.TZ = tz; const n = studioNow(); clocks.add(`${n.getHours()}:${n.getMinutes()}`) }
check('studioNow agrees across devices', clocks.size, 1)

console.log(failures === 0
  ? `✅ studio clock: ${ZONES.length * 8 + 1} checks passed across ${ZONES.length} device timezones`
  : `❌ studio clock: ${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
