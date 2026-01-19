import "./Footer.scss";
export default function Header({ setPage, page }) {
  return (
    <footer className="bottom-nav">
      <button
        className={`nav-item ${page === "map" ? "active" : ""}`}
        onClick={() => setPage("map")}
      >
        <span className="nav-icon">🗺️</span>
        <span className="nav-label">Map</span>
      </button>
      <button
        className={`nav-item ${page === "" ? "active" : ""}`}
        onClick={() => setPage("")}
      >
        <span className="nav-icon">🏠</span>
        <span className="nav-label">Home</span>
      </button>

      <button
        className={`nav-item ${page === "settings" ? "active" : ""}`}
        onClick={() => setPage("settings")}
      >
        <span className="nav-icon">⚙️</span>
        <span className="nav-label">Settings</span>
      </button>
    </footer>
  );
}
