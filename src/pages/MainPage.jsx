import { useState } from "react";
import QuickActions from "../components/QuickActions/QuickActions";
import RecentLeaks from "../components/RecentLeaks/RecentLeaks";
import LeakDetailsSheet from "../components/LeakDetailsSheet/LeakDetailsSheet";
import { save } from "../services/saveJSON";
import { useProject } from "../app/settings/ProjectContext";

export default function MainPage({
  setPage,
  setGpsEnabled,
  gpsEnabled,
  data,
  setData,
}) {
  const [activeLeak, setActiveLeak] = useState(null);
  const { project } = useProject();

  return (
    <div>
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
            save(updated, setData, project).catch((err) =>
              console.error("Error saving leak:", err),
            );
            setActiveLeak(null);
          }}
        />
      )}
    </div>
  );
}
