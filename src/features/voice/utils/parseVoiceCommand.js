const COMMAND_PATTERNS = {
  ru: [
    { pattern: /следующий\s+шаг|впер[её]д/, command: "next" },
    { pattern: /назад|предыдущий\s+шаг/, command: "back" },
    { pattern: /сохранить|записать|готово|сохрани/, command: "save" },
    { pattern: /очистить|сбросить/, command: "clear" },
  ],
  en: [
    { pattern: /next(?:\s+step)?|forward|continue/, command: "next" },
    { pattern: /back|previous(?:\s+step)?/, command: "back" },
    { pattern: /save|submit|done/, command: "save" },
    { pattern: /clear|reset/, command: "clear" },
  ],
};

function getCommandSets(language) {
  const current =
    String(language ?? "ru")
      .trim()
      .toLowerCase()
      .split("-")[0] === "en"
      ? "en"
      : "ru";
  const fallback = current === "ru" ? "en" : "ru";

  return [...COMMAND_PATTERNS[current], ...COMMAND_PATTERNS[fallback]];
}

/**
 * Returns a command string if the utterance is a navigation command and
 * nothing else, or null if it's regular field dictation.
 *
 * The whole phrase has to be the command. A substring match turned short
 * dictation into commands: «описание очистить фланец» wiped the form, and
 * «comment done» saved it half-filled.
 */
export function parseVoiceCommand(text, language) {
  if (!text) return null;

  // Распознаватель дописывает точку или восклицание: «Сохранить.» — та же
  // команда.
  const norm = text
    .toLowerCase()
    .replace(/[.,!?;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return null;

  for (const { pattern, command } of getCommandSets(language)) {
    if (new RegExp(`^(?:${pattern.source})$`).test(norm)) return command;
  }

  return null;
}
