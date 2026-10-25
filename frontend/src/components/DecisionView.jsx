import { useEffect, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getForecast } from '../api'
import { addDays, formatDate, formatGWh, formatMW, formatNumber } from '../utils'
import StatCard from './StatCard'

function DecisionView({ info, decisionTime }) {
  const [decisionDate, setDecisionDate] = useState(info.first_decision_date)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showActual, setShowActual] = useState(true)
  const [showRange, setShowRange] = useState(true)
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    getForecast(decisionDate, decisionTime)
      .then((result) => setData(result))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [decisionDate, decisionTime])

  const isFirst = decisionDate === info.first_decision_date
  const isLast = decisionDate === info.last_decision_date

  // the chart needs the range as [low, high] for the shaded area
  const chartData = data
    ? data.points.map((p) => ({ ...p, range: p.low !== null ? [p.low, p.high] : null }))
    : []

  return (
    <div>
      <div className="toolbar">
        <button disabled={isFirst} onClick={() => setDecisionDate(addDays(decisionDate, -1))}>
          ← Previous day
        </button>
        <label>
          Decision day:{' '}
          <select value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)}>
            {info.decision_dates.map((d) => (
              <option key={d} value={d}>
                {formatDate(d)}
              </option>
            ))}
          </select>
        </label>
        <button disabled={isLast} onClick={() => setDecisionDate(addDays(decisionDate, 1))}>
          Next day →
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && !data && <div className="loading">Loading forecast...</div>}

      {data && (
        <div className={loading ? 'fade' : ''}>
          <div className="decision-banner">
            <div>
              <span className="banner-label">Decision</span>
              <strong>
                {formatDate(data.decision_date)} at {data.decision_time}
              </strong>
            </div>
            <div className="banner-arrow">→</div>
            <div>
              <span className="banner-label">Delivery day</span>
              <strong>{formatDate(data.delivery_date)}</strong>
            </div>
            <div>
              <span className="banner-label">Latest forecast available</span>
              <strong>
                {data.forecast_publish_labels.length > 0
                  ? 'Published ' + data.forecast_publish_labels.join(', ')
                  : 'None'}
              </strong>
            </div>
            {data.next_publish_label && (
              <div className="banner-next">Next forecast run: {data.next_publish_label}</div>
            )}
          </div>

          {data.summary && data.summary.hours_with_forecast < data.summary.hours_total && (
            <div className="warning-box">
              Forecast only covers {data.summary.hours_with_forecast} of {data.summary.hours_total} hours for this day.
            </div>
          )}

          {data.summary ? (
            <div className="stat-grid">
              <StatCard title="Average forecast" value={formatMW(data.summary.forecast_avg)} highlight />
              <StatCard
                title="Peak forecast"
                value={formatMW(data.summary.forecast_max)}
                note={'at ' + data.summary.forecast_max_time}
              />
              <StatCard
                title="Lowest forecast"
                value={formatMW(data.summary.forecast_min)}
                note={'at ' + data.summary.forecast_min_time}
              />
              <StatCard
                title="Forecast wind energy"
                value={formatGWh(data.summary.forecast_energy_mwh)}
                note="sum of hourly forecast"
              />
              {showActual && (
                <StatCard
                  title="Actual average (hindsight)"
                  value={formatMW(data.summary.actual_avg)}
                  note={data.day_metrics ? 'MAE for this day: ' + formatMW(data.day_metrics.mae) : ''}
                />
              )}
            </div>
          ) : (
            <div className="warning-box">No forecast was published before this decision time.</div>
          )}

          <div className="card">
            <div className="card-header">
              <h2>Hourly wind generation for {formatDate(data.delivery_date)}</h2>
              <div className="checkboxes">
                <label>
                  <input type="checkbox" checked={showRange} onChange={(e) => setShowRange(e.target.checked)} /> Likely
                  range
                </label>
                <label>
                  <input type="checkbox" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} /> Show
                  actual
                </label>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} width={60} label={{ value: 'MW', angle: -90, position: 'insideLeft' }} />
                <Tooltip content={<ForecastTooltip showActual={showActual} />} />
                <Legend />
                {showRange && (
                  <Area
                    dataKey="range"
                    name="Likely range (P10-P90)"
                    stroke="none"
                    fill="#93c5fd"
                    fillOpacity={0.35}
                    isAnimationActive={false}
                  />
                )}
                <Line dataKey="forecast" name="Forecast" stroke="#1d4ed8" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                {showActual && (
                  <Line
                    dataKey="actual"
                    name="Actual"
                    stroke="#16a34a"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>

            {showRange && (
              <p className="chart-note">
                Likely range = forecast adjusted by the January P10-P90 error spread for a {data.decision_time} decision
                (actual wind fell inside this band in about 80% of January hours).
                {data.range_note.p90 > Math.abs(data.range_note.p10) &&
                  ' Because forecasts ran high in January, the band sits mostly below the forecast line.'}
              </p>
            )}
          </div>

          <div className="card">
            <button className="link-button" onClick={() => setShowTable(!showTable)}>
              {showTable ? 'Hide hourly table' : 'Show hourly table'}
            </button>
            {showTable && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hour (UK)</th>
                      <th>Forecast (MW)</th>
                      <th>Likely range (MW)</th>
                      {showActual && <th>Actual (MW)</th>}
                      {showActual && <th>Error (MW)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.points.map((p) => (
                      <tr key={p.time}>
                        <td>{p.label}</td>
                        <td>{formatNumber(p.forecast)}</td>
                        <td>{p.low !== null ? formatNumber(p.low) + ' - ' + formatNumber(p.high) : '-'}</td>
                        {showActual && <td>{formatNumber(p.actual)}</td>}
                        {showActual && <td className={p.error === null ? '' : p.error > 0 ? 'neg' : 'pos'}>{formatNumber(p.error)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {showActual && <p className="chart-note">Error = forecast - actual. Positive (red) means less wind than forecast.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ForecastTooltip({ active, payload, label, showActual }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  return (
    <div className="tooltip">
      <div className="tooltip-title">{label} UK</div>
      <div>Forecast: {formatMW(p.forecast)}</div>
      {p.low !== null && (
        <div>
          Likely range: {formatNumber(p.low)} - {formatNumber(p.high)} MW
        </div>
      )}
      {showActual && <div>Actual: {formatMW(p.actual)}</div>}
      {showActual && p.error !== null && <div>Error: {formatMW(p.error)}</div>}
    </div>
  )
}

export default DecisionView
