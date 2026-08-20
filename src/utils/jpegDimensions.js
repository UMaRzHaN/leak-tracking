// Reading a photo's dimensions from its JPEG header, without decoding it.
//
// The point is to answer one question cheaply: would compressImage actually
// change this file? Decoding a multi-megabyte JPEG into an <img>, drawing it to
// a canvas and re-encoding it costs real time on a phone, and for a photo the
// app itself exported it produces the same picture it started with. The header
// says so in a few hundred bytes.

// SOF markers carry the frame size. C4/C8/CC are DHT/JPG/DAC — same 0xC0 range,
// different payload — and must not be read as a frame header.
function isFrameMarker(marker) {
  return (
    marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
  );
}

// Enough for a header carrying an EXIF thumbnail; a frame header further in
// than this is unusual enough to be worth a normal compression pass instead.
const HEADER_BYTES = 256 * 1024;

function parseJpegHeader(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    // Fill bytes: any number of 0xFF may precede a marker.
    let marker = bytes[offset + 1];
    let markerOffset = offset + 1;
    while (marker === 0xff && markerOffset + 1 < bytes.length) {
      markerOffset += 1;
      marker = bytes[markerOffset];
    }
    // Standalone markers without a length field.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset = markerOffset + 1;
      continue;
    }
    if (markerOffset + 2 >= bytes.length) return null;
    const length = (bytes[markerOffset + 1] << 8) | bytes[markerOffset + 2];
    if (length < 2) return null;

    if (isFrameMarker(marker)) {
      const frame = markerOffset + 3;
      if (frame + 4 >= bytes.length) return null;
      const height = (bytes[frame + 1] << 8) | bytes[frame + 2];
      const width = (bytes[frame + 3] << 8) | bytes[frame + 4];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    // Start of scan: pixel data follows, so no frame header is coming.
    if (marker === 0xda) return null;
    offset = markerOffset + 1 + length;
  }
  return null;
}

/**
 * The pixel size a JPEG blob declares, or null when the blob is not a JPEG or
 * its frame header is not within the first {@link HEADER_BYTES}.
 *
 * @param {Blob} blob
 * @returns {Promise<{width: number, height: number}|null>}
 */
export async function readJpegDimensions(blob) {
  if (!(blob instanceof Blob)) return null;
  try {
    const head = blob.slice(0, HEADER_BYTES);
    const buffer =
      typeof head.arrayBuffer === "function" ? await head.arrayBuffer() : null;
    return buffer ? parseJpegHeader(new Uint8Array(buffer)) : null;
  } catch {
    // An unreadable header is not a failure here — the caller compresses as
    // usual, which is what it would have done anyway.
    return null;
  }
}
