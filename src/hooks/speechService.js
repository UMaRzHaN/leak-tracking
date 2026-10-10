import { appError } from "@/utils/appError";
import { isNative } from "@/utils/platform";
import { getSpeechLocale } from "@/utils/locale";

/*
 * Сеанс распознавания в браузере: сам объект, накопленный текст и признак
 * конца. Текст держит сеанс, а не модуль: следующий сеанс, начатый до
 * конца предыдущего, не должен стирать его последние слова.
 */
let webSession = /** @type {any} */ (null);

// Сколько ждём onend после stop(): браузер, не приславший его вовсе, не
// должен навсегда держать кнопку в «слушаю».
const STOP_TIMEOUT_MS = 1500;

export const startSpeechRecognition = async (language) => {
  const speechLocale = getSpeechLocale(language);

  if (isNative) {
    // Плагин подтягивается по нажатию, а не при загрузке приложения: чанк
    // Capacitor общий на все плагины, и статический импорт затаскивал
    // распознавание речи на первый экран вместе с камерой и сканером.
    const { SpeechRecognition } =
      await import("@capacitor-community/speech-recognition");
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") {
      throw appError("MIC_DENIED", "Нет доступа к микрофону");
    }

    const result = await SpeechRecognition.start({
      language: speechLocale,
      popup: true,
    });

    return result?.matches?.[0] || null;
  }

  const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechAPI) {
    throw appError("VOICE_UNSUPPORTED", "Голосовой ввод не поддерживается");
  }

  const recognition = new SpeechAPI();
  recognition.lang = speechLocale;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  const session = {
    recognition,
    text: "",
    ended: false,
    /** @type {(() => void) | null} */
    onEnded: null,
  };
  const finish = () => {
    session.ended = true;
    session.onEnded?.();
  };

  recognition.onresult = (event) => {
    session.text = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ");
  };
  recognition.onend = finish;
  recognition.onerror = finish;

  webSession = session;
  recognition.start();
  return null;
};

/*
 * stop() у браузера не мгновенный: последние слова он дораспознаёт и присылает
 * уже после него, а onend — только когда всё прислано. Отдавать текст сразу
 * после stop() значило терять конец фразы — «задвижка тридцать» вместо
 * «задвижка тридцать два».
 */
export const stopSpeechRecognition = async () => {
  if (isNative) return null;

  const session = webSession;
  if (!session) return null;
  webSession = null;

  await new Promise((resolve) => {
    if (session.ended) {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(resolve, STOP_TIMEOUT_MS);
    session.onEnded = () => {
      clearTimeout(timer);
      resolve(undefined);
    };
    session.recognition.stop();
  });

  return session.text || null;
};
