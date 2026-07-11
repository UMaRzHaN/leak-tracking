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
 * Returns a command string if the utterance is a short navigation command,
 * or null if it's regular field dictation.
 * Short-utterance guard (<= 4 words) prevents false positives in field values.
 */
export function parseVoiceCommand(text, language) {
  if (!text) return null;

  const norm = text.toLowerCase().trim();
  if (norm.split(/\s+/).length > 4) return null;

  for (const { pattern, command } of getCommandSets(language)) {
    if (pattern.test(norm)) return command;
  }

  return null;
}
