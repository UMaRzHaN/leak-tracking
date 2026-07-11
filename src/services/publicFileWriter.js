import { registerPlugin } from "@capacitor/core";

const PublicFileWriter = registerPlugin("PublicFileWriter");

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function writePublicFile({ folder, fileName, blob, mimeType }) {
  const data = await blobToBase64(blob);
  return PublicFileWriter.write({
    folder,
    fileName,
    data,
    mimeType: mimeType || blob.type || "application/octet-stream",
  });
}
