const preparedPhotoBlobs = new WeakSet();

export function markPhotoPrepared(blob) {
  if (blob instanceof Blob) preparedPhotoBlobs.add(blob);
  return blob;
}

export function isPhotoPrepared(blob) {
  return blob instanceof Blob && preparedPhotoBlobs.has(blob);
}
