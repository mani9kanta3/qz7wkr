import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getAccuracy } from '../api'
import { formatDate, formatMW, formatNumber, formatPercent } from '../utils'
import StatCard from './StatCard'

function AccuracyView({ decisionTime }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    getAccuracy(decisionTime)
      .then((result) => setData(result))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [decisionTime])

  if (error) return <div className="error-box">{error}</div>
  if (!data) return <div className="loading">Calculating accuracy...</div>
  const overall = data.overall
  if (!overall) return <div className="warning-box">No forecast and actual pairs found for this decision time.</div>

  // find which horizon buckets the day-ahead decisions fall in, to shade them on the chart
  const dayAhead = data.day_ahead_horizon
  const shadedBuckets = data.horizon.filter((b) => b.to_hours > dayAhead.min && b.from_hours < dayAhead.max)
  // same range on both axes of the scatter chart so the "perfect forecast" line is at 45 degrees
  const scatterMax = Math.ceil(Math.max(...data.scatter.map((p) => Math.max(p.forecast, p.actual))) / 5000) * 5000
  const scatterTicks = []
  for (let tick = 0; tick <= scatterMax; tick += 5000) {
    scatterTicks.push(tick)
  }

  return (
    <div className={loading ? 'fade' : ''}>
      <p className="intro">
        Every January decision made at <strong>{data.decision_time}</strong> UK time, compared with what the wind actually did
        on the delivery day ({formatDate(data.first_delivery_date)} to {formatDate(data.last_delivery_date)},{' '}
        {data.hours_used} hours). Error = forecast - actual, so a positive error means less wind than forecast.
      </p>
      {data.hours_missing > 0 && (
        <div className="warning-box">{data.hours_missing} hours were skipped because no forecast covered them yet at this decision time (or the actual was missing). See the Data & method tab.</div>
      )}

      <div className="stat-grid">
        <StatCard title="Mean absolute error" value={formatMW(overall.mae)} note={'average actual ' + formatMW(overall.actual_avg)} highlight />
        <StatCard title="WAPE" value={formatPercent(overall.wape)} note="total abs. error / total actual" />
        <StatCard title="RMSE" value={formatMW(overall.rmse)} note="punishes big misses more" />
        <StatCard title="Bias (mean error)" value={formatMW(overall.bias)} note={overall.bias > 0 ? 'forecast too high on average' : 'forecast too low on average'} />
        <StatCard title="P90 shortfall" value={formatMW(overall.p90)} note="9 in 10 hours: shortfall below this" />
        <StatCard title="Worst shortfall" value={formatMW(overall.max_shortfall)} note={'worst surplus ' + formatMW(overall.max_surplus)} />
      </div>

      <div className="takeaway">
        <h3>What this means for buying</h3>
        <ul>
          <li>
            On a typical hour the day-ahead wind forecast was off by about <strong>{formatMW(overall.mae)}</strong> (
            {formatPercent(overall.wape)} of actual wind).
          </li>
          <li>
            {overall.bias > 0 ? (
              <>
                The forecast was <strong>too high by {formatMW(overall.bias)}</strong> on average, so relying on it as-is
                would have meant buying too little power from the market.
              </>
            ) : (
              <>
                The forecast was <strong>too low by {formatMW(-overall.bias)}</strong> on average, so relying on it as-is
                would have meant buying more power than needed.
              </>
            )}
          </li>
          <li>
            In 90% of hours the wind shortfall was below <strong>{formatMW(overall.p90)}</strong>. Holding roughly this
            much extra cover would have protected against all but the worst 10% of hours.
          </li>
          <li>
            Median error was {formatMW(overall.p50)} and 80% of hourly errors were between {formatMW(overall.p10)} and{' '}
            {formatMW(overall.p90)}.
          </li>
        </ul>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Daily average: forecast vs actual</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.daily} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={3} />
              <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} width={60} />
              <Tooltip formatter={(value) => formatMW(value)} />
              <Legend />
              <Line dataKey="forecast_avg" name="Forecast (avg)" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              <Line dataKey="actual_avg" name="Actual (avg)" stroke="#16a34a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2>Daily error</h2>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data.daily} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={3} />
              <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} width={60} />
              <Tooltip formatter={(value) => formatMW(value)} />
              <Legend />
              <ReferenceLine y={0} stroke="#6b7280" />
              <Bar dataKey="mae" name="MAE" fill="#93c5fd" />
              <Line dataKey="bias" name="Bias" stroke="#dc2626" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2>Error by hour of the delivery day</h2>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data.by_hour} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
              <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} width={60} />
              <Tooltip formatter={(value) => formatMW(value)} />
              <Legend />
              <ReferenceLine y={0} stroke="#6b7280" />
              <Bar dataKey="mae" name="MAE" fill="#93c5fd" />
              <Line dataKey="bias" name="Bias" stroke="#dc2626" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2>How often each error size happened</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.histogram} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="from" tickFormatter={formatNumber} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} width={40} allowDecimals={false} />
              <Tooltip labelFormatter={(value) => formatNumber(value) + ' to ' + formatNumber(value + 500) + ' MW'} formatter={(value) => [value + ' hours', 'Count']} />
              <ReferenceLine x={0} stroke="#6b7280" />
              <Bar dataKey="count" name="Hours" fill="#1d4ed8" />
            </BarChart>
          </ResponsiveContainer>
          <p className="chart-note">Bars show forecast - actual in 500 MW steps. Right of 0 = less wind than forecast.</p>
        </div>

        <div className="card">
          <h2>Error vs forecast horizon</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.horizon} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} width={60} />
              <Tooltip formatter={(value) => formatMW(value)} />
              <Legend />
              {shadedBuckets.length > 0 && (
                <ReferenceArea
                  x1={shadedBuckets[0].label}
                  x2={shadedBuckets[shadedBuckets.length - 1].label}
                  fill="#fde68a"
                  fillOpacity={0.4}
                />
              )}
              <Line dataKey="mae" name="MAE" stroke="#1d4ed8" strokeWidth={2} />
              <Line dataKey="rmse" name="RMSE" stroke="#7c3aed" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <p className="chart-note">
            Horizon = hours between forecast publish time and the target hour (all forecast runs, not just decision ones).
            Yellow = horizons used by {data.decision_time} day-ahead decisions ({dayAhead.min}h to {dayAhead.max}h ahead).
          </p>
        </div>

        <div className="card">
          <h2>Forecast vs actual (each hour)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" dataKey="forecast" name="Forecast" tickFormatter={formatNumber} tick={{ fontSize: 11 }} domain={[0, scatterMax]} ticks={scatterTicks} label={{ value: 'Forecast (MW)', position: 'insideBottom', offset: -5, fontSize: 12 }} />
              <YAxis type="number" dataKey="actual" name="Actual" tickFormatter={formatNumber} tick={{ fontSize: 11 }} width={60} domain={[0, scatterMax]} ticks={scatterTicks} />
              <Tooltip formatter={(value) => formatMW(value)} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: scatterMax, y: scatterMax }]} stroke="#6b7280" strokeDasharray="4 4" />
              <Scatter data={data.scatter} fill="#1d4ed8" fillOpacity={0.4} />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="chart-note">Dashed line = perfect forecast. Points below it = less wind than forecast.</p>
        </div>
      </div>
    </div>
  )
}

export default AccuracyView
