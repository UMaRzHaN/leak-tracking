export async function compressImage(
  blob,
  { maxWidth = 1280, quality = 0.75 } = {},
) {
  return new Promise((resolve) => {
    const img = new Image();
    let url;
    try {
      url = URL.createObjectURL(blob);
    } catch {
      resolve(blob);
      return;
    }

    const cleanup = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Revoking an already invalid object URL must not block the fallback.
      }
    };
    const fallback = () => {
      cleanup();
      resolve(blob);
    };

    img.onload = () => {
      cleanup();
      try {
        if (!img.naturalWidth || !img.naturalHeight) {
          resolve(blob);
          return;
        }
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const width = Math.round(img.naturalWidth * scale);
        const height = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(blob);
          return;
        }
        context.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (output) => resolve(output ?? blob),
          "image/jpeg",
          quality,
        );
      } catch {
        resolve(blob);
      }
    };
    img.onerror = fallback;
    img.src = url;
  });
}
