/**
 * Localises a failure reported by the Android plugin.
 *
 * The plugin tags each failure with a stable code and still sends its own
 * Russian text. The code is what gets translated; the text is the fallback,
 * used when a code is absent — which happens when the message came from a
 * peer device running a build that predates the codes.
 */
export function localSyncErrorText(error, t) {
  const code = error?.code;
  if (!code) return error?.message ?? "";
  const key = `syncErrors.${code}`;
  const translated = t(key);
  return translated === key ? (error?.message ?? code) : translated;
}
