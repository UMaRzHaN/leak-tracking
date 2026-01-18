import { useLeaksMap } from "../hooks/useLeaksMap";

export default function LeaksMap({ leaks, mapApiRef }) {
  const { mapRef } = useLeaksMap({ leaks, mapApiRef });

  return <div ref={mapRef} className="map-canvas" />;
}
