import { useState } from "react";
import QuickActions from "../components/QuickActions/QuickActions";
import RecentLeaks from "../components/RecentLeaks/RecentLeaks";
import LeakDetailsSheet from "../components/LeakDetailsSheet/LeakDetailsSheet";
import { saveProjectData } from "../services/saveProjectData";
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

  const handleSaveLeak = async (updatedLeak) => {
    try {
      const updated = data.map((r) =>
        r.id === updatedLeak.id ? updatedLeak : r,
      );

      setData(updated);
      await saveProjectData(project, updated);
    } catch (err) {
      console.error("Error saving leak:", err);
    } finally {
      setActiveLeak(null);
    }
  };

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
          onSave={handleSaveLeak}
        />
      )}
    </div>
  );
}
