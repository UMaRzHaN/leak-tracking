import { useLeaksMap } from "../../hooks/useLeaksMap";

export default function LeaksMap({ leaks, mapApiRef, onClick }) {
  const { mapRef, locateMe } = useLeaksMap({ leaks, mapApiRef });

  return (
    <div className="map-wrapper">
      <div ref={mapRef} className="map-canvas" />
      <button className="fab fab--search" onClick={onClick}>
        🔍
      </button>
      <button className="fab fab--locate" onClick={locateMe}>
        📍
      </button>
    </div>
  );
}
