import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

function pngChunk(name, bytes) {
  const type = Buffer.from(name);
  const chunk = Buffer.alloc(bytes.length + 12);
  chunk.writeUInt32BE(bytes.length);
  type.copy(chunk, 4);
  bytes.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, bytes])), 8 + bytes.length);
  return chunk;
}

function icon(size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  const stride = 1 + size * 4;
  const pixels = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const column = (x + 0.5) / size;
      const row = (y + 0.5) / size;
      const page = column > 0.25 && column < 0.78 && row > 0.2 && row < 0.8;
      const margin = page && column > 0.38 && column < 0.46;
      const color = margin ? [214, 104, 75] : page ? [249, 242, 219] : [44, 58, 50];
      pixels.set([...color, 255], y * stride + 1 + x * 4);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function writeIcons(directory) {
  await mkdir(directory, { recursive: true });
  await Promise.all([16, 32, 48, 128].map((size) =>
    writeFile(join(directory, `margin-${size}.png`), icon(size)),
  ));
}
