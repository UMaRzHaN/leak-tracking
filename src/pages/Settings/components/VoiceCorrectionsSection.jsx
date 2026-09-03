import { useId, useState } from "react";
import s from "../Settings.module.scss";
import { useLanguage } from "@/app/hooks/useLanguage";
import { MAX_VOICE_CORRECTIONS } from "@/features/voice/utils/voiceCorrections";

/**
 * Поправки к распознанной речи.
 *
 * Список правится здесь, а не в коде, потому что находят такие пары в поле:
 * распознаватель ошибается по-своему на каждом объекте, и до сих пор каждая
 * новая пара ждала релиза. Живут они при проекте и уезжают вместе с архивом —
 * найденное одним обходчиком достаётся всей бригаде.
 */
export default function VoiceCorrectionsSection({
  activeProject,
  corrections = /** @type {{from: string, to: string}[]} */ ([]),
  onSave,
}) {
  const { t } = useLanguage();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const fromId = useId();
  const toId = useId();

  if (!activeProject) return null;

  const trimmedFrom = from.trim();
  const trimmedTo = to.trim();
  const canAdd =
    trimmedFrom.length > 0 &&
    trimmedTo.length > 0 &&
    trimmedFrom.toLowerCase() !== trimmedTo.toLowerCase() &&
    corrections.length < MAX_VOICE_CORRECTIONS;

  const handleAdd = () => {
    if (!canAdd) return;
    onSave?.([...corrections, { from: trimmedFrom, to: trimmedTo }]);
    setFrom("");
    setTo("");
  };

  const handleRemove = (index) => {
    onSave?.(corrections.filter((_, position) => position !== index));
  };

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{t("settings.voice.title")}</h2>
      </div>

      <p className={s.voiceHint}>{t("settings.voice.hint")}</p>

      <div className={s.voiceForm}>
        <label className={s.voiceField} htmlFor={fromId}>
          <span className={s.voiceLabel}>{t("settings.voice.heard")}</span>
          <input
            id={fromId}
            className={s.voiceInput}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            placeholder={t("settings.voice.heardPlaceholder")}
          />
        </label>
        <label className={s.voiceField} htmlFor={toId}>
          <span className={s.voiceLabel}>{t("settings.voice.written")}</span>
          <input
            id={toId}
            className={s.voiceInput}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder={t("settings.voice.writtenPlaceholder")}
          />
        </label>
        <button
          type="button"
          className={s.voiceAdd}
          disabled={!canAdd}
          onClick={handleAdd}
        >
          {t("settings.voice.add")}
        </button>
      </div>

      {corrections.length === 0 ? (
        <p className={s.voiceEmpty}>{t("settings.voice.empty")}</p>
      ) : (
        <ul className={s.voiceList}>
          {corrections.map((correction, index) => (
            <li key={`${correction.from}-${index}`} className={s.voiceRow}>
              <span className={s.voiceRowText}>
                <strong>{correction.from}</strong> → {correction.to}
              </span>
              <button
                type="button"
                className={s.voiceRemove}
                onClick={() => handleRemove(index)}
                aria-label={t("settings.voice.remove", {
                  from: correction.from,
                })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
