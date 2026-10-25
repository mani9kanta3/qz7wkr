function StatCard({ title, value, note, highlight }) {
  return (
    <div className={highlight ? 'stat-card highlight' : 'stat-card'}>
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}

export default StatCard
