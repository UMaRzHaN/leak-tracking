export default function PhotoModal({ open, item, onClose }) {
  if (!open) return null;

  return (
    <div className="photo-modal" onClick={onClose}>
      {item.photo && !item.photoSrc && (
        <div style={{ marginTop: 8, opacity: 0.6 }}>
          📷 Фото доступно только в мобильном приложении
        </div>
      )}
      {item.photoSrc && <img src={item.photoSrc} alt="Утечка" />}
      <div style={{ color: "#000000", marginTop: 6 }}>
        путь к фото: {String(item.photo)}
      </div>
    </div>
  );
}
