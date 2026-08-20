import { describe, expect, it } from "vitest";
import { readJpegDimensions } from "./jpegDimensions";

function segment(marker, payload) {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
}

function frame(width, height, marker = 0xc0) {
  return segment(marker, [
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    3,
  ]);
}

function jpeg(...parts) {
  return new Blob([new Uint8Array([0xff, 0xd8, ...parts.flat()])], {
    type: "image/jpeg",
  });
}

describe("readJpegDimensions", () => {
  it("reads the frame size of a baseline JPEG", async () => {
    await expect(readJpegDimensions(jpeg(frame(1280, 960)))).resolves.toEqual({
      width: 1280,
      height: 960,
    });
  });

  it("reads a progressive frame", async () => {
    await expect(
      readJpegDimensions(jpeg(frame(640, 480, 0xc2))),
    ).resolves.toEqual({ width: 640, height: 480 });
  });

  it("skips an EXIF segment before the frame", async () => {
    const exif = segment(0xe1, new Array(2048).fill(0x00));
    await expect(
      readJpegDimensions(jpeg(exif, frame(4032, 3024))),
    ).resolves.toEqual({ width: 4032, height: 3024 });
  });

  it("does not read a Huffman table as a frame", async () => {
    const huffman = segment(0xc4, [0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    await expect(
      readJpegDimensions(jpeg(huffman, frame(800, 600))),
    ).resolves.toEqual({ width: 800, height: 600 });
  });

  it("tolerates fill bytes before a marker", async () => {
    await expect(
      readJpegDimensions(jpeg([0xff, 0xff], frame(320, 240))),
    ).resolves.toEqual({ width: 320, height: 240 });
  });

  it("returns null when the scan starts before any frame header", async () => {
    await expect(
      readJpegDimensions(jpeg(segment(0xda, [0x01, 0x00]))),
    ).resolves.toBe(null);
  });

  it("returns null for a non-JPEG blob", async () => {
    await expect(
      readJpegDimensions(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])])),
    ).resolves.toBe(null);
    await expect(readJpegDimensions("not a blob")).resolves.toBe(null);
  });

  it("returns null for a truncated header", async () => {
    await expect(readJpegDimensions(jpeg([0xff, 0xc0, 0x00]))).resolves.toBe(
      null,
    );
  });
});
