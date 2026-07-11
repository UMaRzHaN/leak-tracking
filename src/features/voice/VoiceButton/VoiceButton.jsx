import { useLanguage } from "@/app/hooks/useLanguage";
import { isNative } from "@/utils/platform";
import s from "./VoiceButton.module.scss";

export default function VoiceButton({ startVoiceInput, stopVoiceInput, dark }) {
  const { lang } = useLanguage();

  return (
    <button
      type="button"
      className={`${s.mic}${dark ? ` ${s.dark}` : ""}`}
      aria-label={lang === "ru" ? "Голосовой ввод" : "Voice input"}
      onClick={isNative ? startVoiceInput : undefined}
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
