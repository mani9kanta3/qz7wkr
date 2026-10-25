// Empty by default, so calls go to the same site (/api/...).
// Set VITE_API_URL if the backend runs somewhere else.
const API_URL = import.meta.env.VITE_API_URL || ''

async function getJson(path) {
  const response = await fetch(API_URL + path)
  if (!response.ok) {
    let message = 'Request failed (' + response.status + ')'
    try {
      const body = await response.json()
      if (body.detail) {
        message = typeof body.detail === 'string' ? body.detail : 'Invalid input'
      }
    } catch (e) {
      // body was not JSON, keep the default message
    }
    throw new Error(message)
  }
  return response.json()
}

export function getInfo() {
  return getJson('/api/info')
}

export function getForecast(decisionDate, decisionTime) {
  return getJson('/api/forecast?decision_date=' + decisionDate + '&decision_time=' + encodeURIComponent(decisionTime))
}

export function getAccuracy(decisionTime) {
  return getJson('/api/accuracy?decision_time=' + encodeURIComponent(decisionTime))
}
