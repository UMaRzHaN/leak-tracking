import { LocalSync } from "@/services/sync/localSyncPlugin";

/**
 * Передача архива в нативную часть без base64.
 *
 * Мост Capacitor возит строки, поэтому архив, идущий через него, приходится
 * кодировать: 4 байта трафика на каждые 3 байта архива, плюс кодирование в JS и
 * декодирование в Java. Канал веб-сообщений принимает ArrayBuffer как есть.
 *
 * Ответ на каждый кусок — не вежливость, а сдерживание: без него JS успевает
 * поставить в очередь весь архив целиком, и он оказывается в памяти дважды.
 */
function createArchiveChannel(channel) {
  const pending = [];
  const onMessage = (event) => {
    const waiting = pending.shift();
    if (!waiting) return;
    const text = String(event?.data ?? "");
    if (text.startsWith("ok")) {
      waiting.resolve(Number(text.slice(3)) || 0);
      return;
    }
    waiting.reject(
      new Error(
        text.replace(/^error\s*/, "") ||
          "Канал передачи архива отклонил данные",
      ),
    );
  };
  channel.addEventListener("message", onMessage);

  return {
    send(payload) {
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
        try {
          channel.postMessage(payload);
        } catch (error) {
          pending.pop();
          reject(error);
        }
      });
    },
    close() {
      channel.removeEventListener("message", onMessage);
      const abandoned = pending.splice(0, pending.length);
      for (const waiting of abandoned) {
        waiting.reject(new Error("Канал передачи архива закрыт"));
      }
    },
  };
}

/** Канал, если эта сборка WebView его поддерживает, иначе null. */
export async function openArchiveChannel(token) {
  try {
    const info = await LocalSync.getArchiveUploadChannel();
    if (!info?.available || typeof info.name !== "string") return null;
    const target = globalThis[info.name];
    if (typeof target?.postMessage !== "function") return null;

    const channel = createArchiveChannel(target);
    try {
      await channel.send(`begin ${token}`);
    } catch (error) {
      channel.close();
      throw error;
    }
    return channel;
  } catch {
    // Канала нет или он не открылся — остаётся base64, он работает везде.
    return null;
  }
}
