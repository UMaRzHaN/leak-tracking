import QuickActions from "../components/QuickActions/QuickActions";
import RecentLeaks from "../components/RecentLeaks/RecentLeaks";

export default function MainPage({ setPage, setGpsEnabled, gpsEnabled, data }) {
  return (
    <div style={{ margin: 10 }}>
      <QuickActions
        setPage={setPage}
        setGpsEnabled={setGpsEnabled}
        gpsEnabled={gpsEnabled}
      />
      <RecentLeaks
        leaks={[
          {
            id: 1,
            title: "Valve E-23",
            level: "high",
            levelLabel: "High Leak",
            location: "Line 5",
            time: "5 mins ago",
          },
          {
            id: 2,
            title: "Pump F-12",
            level: "medium",
            levelLabel: "Medium Leak",
            location: "Zone 2",
            time: "Today",
          },
          {
            id: 3,
            title: "Tank 7A",
            level: "low",
            levelLabel: "Low Leak",
            location: "Line 3",
            time: "Yesterday",
          },
        ]}
        onSelect={(leak) => console.log("open leak", leak)}
        onViewAll={() => setPage("history")}
      />
    </div>
  );
}
