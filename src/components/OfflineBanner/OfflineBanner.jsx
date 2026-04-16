import s from "./OfflineBanner.module.scss";

export default function OfflineBanner() {
  return (
    <div className={s.banner} role="alert">
      <span className={s.icon}>📵</span>
      <span className={s.text}>Нет подключения — данные сохраняются локально</span>
    </div>
  );
}
