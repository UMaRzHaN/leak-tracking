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
        leaks={data}
        onSelect={(leak) => console.log("open leak", leak)}
        onViewAll={() => setPage("db")}
      />
    </div>
  );
}
