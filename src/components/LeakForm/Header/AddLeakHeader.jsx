import VoiceButton from "../../VoiceButton/VoiceButton";
import s from "./AddLeakHeader.module.scss";

export default function AddLeakHeader({
  setPage,
  stopVoiceInput,
  startVoiceInput,
}) {
  return (
    <header className={s.appBar}>
      <div className={s.left}>
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
      </div>

      <div className={s.center}>
        <div className={s.appBarTitle}>Добавить утечку</div>
      </div>

      <div className={s.right}>
        <VoiceButton
          startVoiceInput={startVoiceInput}
          stopVoiceInput={stopVoiceInput}
        />
      </div>
    </header>
  );
}
