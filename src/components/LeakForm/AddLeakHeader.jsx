import VoiceButton from "../VoiceButton/VoiceButton";
import s from "./AddLeakHeader.module.scss";

export default function AddLeakHeader({
  setPage,
  stopVoiceInput,
  startVoiceInput,
}) {
  return (
    <header className={s.appBar}>
      <button
        className={s.backButton}
        type="button"
        onClick={() => {
          stopVoiceInput?.();
          setPage("");
        }}
      >
        ←
      </button>

      <div className={s.appBarTitle}>Добавить утечку</div>

      <VoiceButton
        startVoiceInput={startVoiceInput}
        stopVoiceInput={stopVoiceInput}
      />
    </header>
  );
}
