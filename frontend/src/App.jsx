import { useEffect, useState } from 'react'
import { getInfo } from './api'
import { isValidTime } from './utils'
import DecisionView from './components/DecisionView'
import AccuracyView from './components/AccuracyView'
import AboutView from './components/AboutView'

const TABS = [
  { id: 'forecast', label: 'Day-ahead forecast' },
  { id: 'accuracy', label: 'Forecast accuracy' },
  { id: 'about', label: 'Data & method' },
]

function App() {
  const [tab, setTab] = useState('forecast')
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [timeInput, setTimeInput] = useState('09:00')
  const [decisionTime, setDecisionTime] = useState('09:00')

  useEffect(() => {
    getInfo()
      .then((data) => setInfo(data))
      .catch((err) => setError(err.message))
  }, [])

  function handleTimeChange(event) {
    const value = event.target.value
    setTimeInput(value)
    // only send valid times to the backend
    if (isValidTime(value)) {
      setDecisionTime(value)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="header-inner">
          <div>
            <h1>Wind Forecast Desk</h1>
            <p className="subtitle">
              GB national wind generation: forecasts vs actuals for day-ahead purchase decisions in January 2026
            </p>
          </div>

          <div className="time-picker">
            <label htmlFor="decision-time">Decision time (UK)</label>
            <input id="decision-time" type="time" value={timeInput} onChange={handleTimeChange} />
            <span className="time-hint">GB day-ahead auctions close 09:20 (EPEX) and 09:50 (N2EX)</span>
            {!isValidTime(timeInput) && <span className="time-error">Enter a time like 09:00</span>}
          </div>
        </div>

        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {error && <div className="error-box">Could not reach the backend: {error}</div>}
        {!info && !error && <div className="loading">Loading...</div>}

        {info && tab === 'forecast' && <DecisionView info={info} decisionTime={decisionTime} />}
        {info && tab === 'accuracy' && <AccuracyView decisionTime={decisionTime} />}
        {info && tab === 'about' && <AboutView info={info} />}
      </main>

      <footer className="footer">Data: Elexon BMRS (FUELHH and WINDFOR datasets). Pilot version.</footer>
    </div>
  )
}

export default App
