export default function MobileSheet({ open, leaks, onClose, onSelect }) {
  const station = leaks[0]?.station ?? "Station";

  return (
    <div className={`sheet ${open ? "open" : ""}`}>
      <div className="sheet-handle" onClick={onClose} />

      <div className="sheet-header">
        <h3>{station}</h3>
        <span>{leaks.length} leaks</span>
      </div>

      <div className="sheet-list">
        {leaks.map((leak) => (
          <div
            key={leak.id}
            className="sheet-item"
            onClick={() => onSelect(leak)}
          >
            <span className="dot" />
            Leak ID: {leak.leak_id}
          </div>
        ))}
      </div>
    </div>
  );
}
