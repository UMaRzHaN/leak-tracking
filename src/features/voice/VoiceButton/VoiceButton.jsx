import { isNative } from "@/utils/platform";
import s from "./VoiceButton.module.scss";

export default function VoiceButton({ startVoiceInput, stopVoiceInput, dark }) {
  return (
    <button
      type="button"
      className={`${s.mic}${dark ? ` ${s.dark}` : ""}`}
      aria-label="Голосовой ввод"
      /* 📱 mobile */
      onClick={isNative ? startVoiceInput : undefined}
      /* 🖥 web */
      onMouseDown={!isNative ? startVoiceInput : undefined}
      onMouseUp={!isNative ? stopVoiceInput : undefined}
      onMouseLeave={!isNative ? stopVoiceInput : undefined}
      onTouchStart={!isNative ? startVoiceInput : undefined}
      onTouchEnd={!isNative ? stopVoiceInput : undefined}
    >
      🎙
    </button>
  );
}
