import { List } from "react-window";

export default function VirtualizedLeakList({
  items,
  height = 600,
  itemHeight = 116,
  renderItem,
}) {
  return (
    <List
      height={height}
      rowCount={items.length}
      rowHeight={itemHeight}
      rowComponent={({ index, style }) => (
        <div style={style}>
          {renderItem(items[index], index)}
        </div>
      )}
      width="100%"
    />
  );
}