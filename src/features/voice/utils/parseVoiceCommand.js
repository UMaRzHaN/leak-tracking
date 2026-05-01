const COMMANDS = [
  { pattern: /следующий\s+шаг|вперёд/, command: "next" },
  { pattern: /назад|предыдущий\s+шаг/,  command: "back" },
  { pattern: /сохранить|записать|готово|сохрани/, command: "save" },
  { pattern: /очистить|сбросить/,        command: "clear" },
];

/**
 * Returns a command string if the utterance is a short navigation command,
 * or null if it's regular field dictation.
 * Short-utterance guard (≤ 4 words) prevents false positives in field values.
 */
export function parseVoiceCommand(text) {
  if (!text) return null;
  const norm = text.toLowerCase().trim();
  if (norm.split(/\s+/).length > 4) return null;
  for (const { pattern, command } of COMMANDS) {
    if (pattern.test(norm)) return command;
  }
  return null;
}
