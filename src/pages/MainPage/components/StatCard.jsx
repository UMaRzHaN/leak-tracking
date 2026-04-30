import s from "../MainPage.module.scss";

export default function StatCard({ value, label, accent, active, onClick }) {
  return (
    <button
      className={`${s.statCard} ${active ? s.statActive : ""}`}
      style={{ "--accent": accent }}
      onClick={onClick}
    >
      <span className={s.statVal}>{value}</span>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statBar} />
    </button>
  );
}
