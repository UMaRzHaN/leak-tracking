import { useState } from "react";
import QuickActions from "../components/QuickActions/QuickActions";
import RecentLeaks from "../components/RecentLeaks/RecentLeaks";
import LeakDetailsSheet from "../components/LeakCardCompact/LeakDetailsSheet";
import { save } from "../utils/saveJSON";

export default function MainPage({
  setPage,
  setGpsEnabled,
  gpsEnabled,
  data,
  setData,
}) {
  const [activeLeak, setActiveLeak] = useState(null);

  return (
    <div style={{ margin: 10 }}>
      <QuickActions
        setPage={setPage}
        setGpsEnabled={setGpsEnabled}
        gpsEnabled={gpsEnabled}
      />
      <RecentLeaks
        leaks={data}
        onOpenDetails={setActiveLeak}
        onViewAll={() => setPage("db")}
        setActiveLeak={setActiveLeak}
      />
      {activeLeak && (
        <LeakDetailsSheet
          leak={activeLeak}
          onClose={() => setActiveLeak(null)}
          onSave={(updatedLeak) => {
            const updated = data.map((r) =>
              r.id === updatedLeak.id ? updatedLeak : r,
            );
            save(updated, setData);
            setActiveLeak(null);
          }}
        />
      )}
    </div>
  );
}
