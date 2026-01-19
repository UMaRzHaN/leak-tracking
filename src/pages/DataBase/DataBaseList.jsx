import LeakCardCompact from "../../components/LeakCardCompact/LeakCardCompact";

export default function DataBaseList({
  data,
  onRemove,
  onOpenDetails,
  onOpenPhoto,
}) {
  if (!data.length) {
    return <div style={{ padding: 16, color: "#999" }}>Нет данных</div>;
  }

  return (
    <>
      {data.map((row) => (
        <LeakCardCompact
          key={row.id}
          leak={row}
          onRemove={onRemove}
          onOpenDetails={onOpenDetails}
          onOpenPhoto={onOpenPhoto}
        />
      ))}
    </>
  );
}
