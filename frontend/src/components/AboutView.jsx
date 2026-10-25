import { formatDate, formatDateTime } from '../utils'

function AboutView({ info }) {
  return (
    <div className="card about">
      <h2>Data sources</h2>
      <ul>
        <li>
          <strong>Actual wind generation</strong>: Elexon BMRS <code>FUELHH</code> dataset, fuel type <code>WIND</code>,
          half-hourly. {info.actual_rows} half-hours from {formatDateTime(info.first_actual)} to{' '}
          {formatDateTime(info.last_actual)}.
        </li>
        <li>
          <strong>Wind forecasts</strong>: Elexon BMRS <code>WINDFOR</code> dataset, hourly values. {info.forecast_runs}{' '}
          forecast runs ({info.forecast_rows} rows) published from {formatDateTime(info.first_publish)} to{' '}
          {formatDateTime(info.last_publish)}.
        </li>
        <li>
          Forecast runs are published at these UK times each day: {info.publish_times_uk.join(', ')}.
          {info.extra_publish_runs.length > 0 && ' Extra runs: ' + info.extra_publish_runs.join(', ') + '.'}
        </li>
        <li>
          Each forecast run covers up to 21:00 two days ahead, and this end point only moves forward with the 02:30 run.
          So for a decision made before 02:30 there is no forecast yet for 22:00 and 23:00 of the delivery day. The app
          shows a warning and skips those hours.
        </li>
        <li>All times in the app are UK time (in January this is the same as GMT/UTC).</li>
      </ul>

      <h2>How the app works</h2>
      <ul>
        <li>
          A purchase decision is made on day D at the chosen <strong>decision time</strong> (default{' '}
          {info.default_decision_time} UK, before the GB day-ahead auctions close at 09:20 and 09:50). It covers the
          delivery day D+1.
        </li>
        <li>
          Decision days are {formatDate(info.first_decision_date)} to {formatDate(info.last_decision_date)}, so delivery
          days run from 2 Jan to 1 Feb 2026.
        </li>
        <li>
          For each delivery hour the app uses the <strong>latest forecast published at or before the decision time</strong>.
          Forecasts published later are never used, so this shows exactly what the team could have known.
        </li>
        <li>
          Forecasts are hourly and actuals are half-hourly. Each forecast hour is compared with the actual for the
          half-hour starting at the same time (matching on <code>startTime</code>).
        </li>
        <li>
          Error = forecast - actual. Metrics: MAE, RMSE, bias (mean error), WAPE (total absolute error / total actual)
          and P10 / P50 / P90 of the error.
        </li>
        <li>
          The "likely range" on the forecast chart is the forecast shifted by the January P10 and P90 errors for the same
          decision time.
        </li>
      </ul>

      <h2>Limitations of this pilot</h2>
      <ul>
        <li>Only national wind (no solar, demand or prices), as agreed for the pilot scope.</li>
        <li>
          The likely range is built from the same January data it is shown on (in-sample). For live use it should be
          built from past months only.
        </li>
        <li>
          Actual FUELHH wind is metered output, which can be reduced by curtailment. This may explain part of the
          positive bias, but it has not been checked here.
        </li>
        <li>Data is a saved snapshot downloaded from the Elexon API (it can be refreshed with the fetch script).</li>
      </ul>
    </div>
  )
}

export default AboutView
