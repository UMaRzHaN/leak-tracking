import { useRef } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { isNative } from "@/utils/platform";
import s from "./VoiceButton.module.scss";

// Сколько после касания браузер может присылать эмулированные mouse-события.
const EMULATED_MOUSE_WINDOW_MS = 800;

export default function VoiceButton({ startVoiceInput, stopVoiceInput, dark }) {
  const { t } = useLanguage();
  /*
   * После touchend мобильный браузер досылает mousedown/mouseup ради старых
   * страниц. Сеанс к этому времени уже остановлен, и эмулированный mousedown
   * запускал второй — микрофон включался сам после того, как кнопку отпустили.
   * Mouse-события вскоре после касания — эхо касания, а не новое нажатие.
   */
  const lastTouchRef = useRef(0);

  const isTouchEcho = () =>
    Date.now() - lastTouchRef.current < EMULATED_MOUSE_WINDOW_MS;

  const onTouchStart = () => {
    lastTouchRef.current = Date.now();
    startVoiceInput();
  };
  const onTouchEnd = () => {
    lastTouchRef.current = Date.now();
    stopVoiceInput();
  };
  const onMouseDown = () => {
    if (!isTouchEcho()) startVoiceInput();
  };
  const onMouseUp = () => {
    if (!isTouchEcho()) stopVoiceInput();
  };

  return (
    <button
      type="button"
      className={`${s.mic}${dark ? ` ${s.dark}` : ""}`}
      aria-label={t("voice.buttonLabel")}
      onClick={isNative ? startVoiceInput : undefined}
      onMouseDown={!isNative ? onMouseDown : undefined}
      onMouseUp={!isNative ? onMouseUp : undefined}
      onMouseLeave={!isNative ? onMouseUp : undefined}
      onTouchStart={!isNative ? onTouchStart : undefined}
      onTouchEnd={!isNative ? onTouchEnd : undefined}
    >
      🎙
    </button>
  );
}
