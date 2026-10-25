export function formatMW(value) {
  if (value === null || value === undefined) return '-'
  return Math.round(value).toLocaleString('en-GB') + ' MW'
}

export function formatNumber(value) {
  if (value === null || value === undefined) return '-'
  return Math.round(value).toLocaleString('en-GB')
}

// MWh -> GWh with one decimal
export function formatGWh(mwh) {
  if (mwh === null || mwh === undefined) return '-'
  return (mwh / 1000).toFixed(1) + ' GWh'
}

export function formatPercent(value) {
  if (value === null || value === undefined) return '-'
  return value.toFixed(1) + '%'
}

// "2026-01-11" -> "Sun 11 Jan 2026"
export function formatDate(isoDate) {
  const date = new Date(isoDate + 'T12:00:00Z')
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/London',
  })
}

// "2026-01-05T11:30:00Z" -> "05 Jan 2026, 11:30" (UK time)
export function formatDateTime(isoDateTime) {
  if (!isoDateTime) return '-'
  return new Date(isoDateTime).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })
}

// "2026-01-11" -> "2026-01-12"
export function addDays(isoDate, days) {
  const date = new Date(isoDate + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function isValidTime(text) {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(text)
}
