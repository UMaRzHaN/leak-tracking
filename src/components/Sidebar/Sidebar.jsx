export default function Sidebar({ leaks, onSelect }) {
  const groupedByStation = leaks.reduce((acc, leak) => {
    const station = leak.station ?? "Без станции";
    if (!acc[station]) acc[station] = [];
    acc[station].push(leak);
    return acc;
  }, {});

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Project</h3>
        <small>Vema S.A.</small>
      </div>

      {Object.entries(groupedByStation).map(([station, stationLeaks]) => (
        <div key={station}>
          <div className="layer-title">☑ {station}</div>

          {stationLeaks.map((leak) => (
            <div
              key={leak.id}
              className="leak-item"
              onClick={() => onSelect(leak)}
            >
              <span className="leak-dot" />
              {leak.leak_id}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
    