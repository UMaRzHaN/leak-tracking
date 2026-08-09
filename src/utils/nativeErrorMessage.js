/*
 * Ошибки Capacitor приходят как { message, code } и не наследуют Error, поэтому
 * `String(error)` даёт "[object Object]". Собираем из них одну строку для тоста:
 * текст плагина плюс код, по которому ошибку можно найти в логе и в issues.
 */
export function formatNativeError(error) {
  if (!error) return null;

  const message = String(error.message ?? error).trim();
  if (!message || message === "[object Object]") return null;

  const code = String(error.code ?? "").trim();
  return code && !message.includes(code) ? `${message} (${code})` : message;
}
