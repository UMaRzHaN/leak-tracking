import { useLanguage } from "@/app/hooks/useLanguage";
import Icon from "@/components/ui/Icon/Icon";
import s from "../Settings.module.scss";

const KINDS = ["backup", "report", "inventory"];

/**
 * Импорт данных (9a). Что за файл, приложение определяет само — по
 * содержимому, а не по кнопке, — поэтому «что загружаем» здесь подсказка о
 * допустимом, а не выбор. Разбор и конфликты — прежние обработчики настроек.
 */
export default function ImportSection({ importRef, busy, onImport }) {
  const { t } = useLanguage();
  return (
    <section className={s.importScreen}>
      <h2 className={s.groupCaption}>{t("importScreen.what")}</h2>
      <div className={s.groupCard}>
        {KINDS.map((kind) => (
          <div key={kind} className={s.groupRow}>
            <span className={s.kindDot} aria-hidden="true" />
            <span className={s.groupRowText}>
              <strong>{t(`importScreen.kinds.${kind}.title`)}</strong>
              <small>{t(`importScreen.kinds.${kind}.hint`)}</small>
            </span>
          </div>
        ))}
      </div>
      <p className={s.groupHint}>{t("importScreen.autoDetect")}</p>

      <h2 className={s.groupCaption}>{t("importScreen.where")}</h2>
      <button
        type="button"
        className={s.pickFile}
        disabled={busy}
        onClick={() => importRef.current?.click()}
      >
        <span className={s.pickIcon}>
          <Icon name="upload" size={22} strokeWidth={1.8} />
        </span>
        <span className={s.groupRowText}>
          <strong>
            {busy ? t("importScreen.importing") : t("importScreen.pick")}
          </strong>
          <small>{t("importScreen.pickHint")}</small>
        </span>
      </button>

      <input
        ref={importRef}
        type="file"
        accept=".xlsx,.zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip"
        style={{ display: "none" }}
        onChange={onImport}
      />
    </section>
  );
}
