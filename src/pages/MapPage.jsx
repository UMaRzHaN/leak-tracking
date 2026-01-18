import { useRef, useState } from "react";
import LeaksMap from "../components/LeaksMap";
import MobileSheet from "../components/MobileSheet";
import MobileSearchButton from "../components/MobileSearchButton";

export default function MapPage({ leaks }) {
  const mapApiRef = useRef(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="map-mobile-wrapper">
      <LeaksMap leaks={leaks} mapApiRef={mapApiRef} />

      <MobileSearchButton onClick={() => setOpen(true)} />

      <MobileSheet
        open={open}
        leaks={leaks}
        onClose={() => setOpen(false)}
        onSelect={(leak) => {
          mapApiRef.current?.focus(leak);
          setOpen(false);
        }}
      />
    </div>
  );
}
