import LeakCardCompact from "../../components/LeakCardCompact/LeakCardCompact";

export default function DataBaseList({
  data,
  onRemove,
  onOpenDetails,
}) {
  if (!data.length) {
    return <div style={{ padding: 16, color: "#999" }}>Нет данных</div>;
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      {data.map((row) => (
        <LeakCardCompact
          key={row.id}
          leak={row}
          onRemove={onRemove}
          onOpenDetails={onOpenDetails}
        />
      ))}
    </div>
  );
}
