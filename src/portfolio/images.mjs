// Проверка реального типа и размеров изображений по сигнатурам (не по расширению и не по Content-Type).
export const MAX_PIXELS = 10000;

function jpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  const keep = [buf.subarray(0, 2)];
  let i = 2, w = 0, h = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    let m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd9) break;
    if (m >= 0xd0 && m <= 0xd7 || m === 0x01) { keep.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    const seg = buf.subarray(i, i + 2 + len);
    const sof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (sof) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); }
    // Метаданные (EXIF/XMP с геометками и комментарии) выбрасываем; ICC (E2), JFIF (E0) и Adobe (EE) оставляем.
    const meta = m === 0xe1 || (m >= 0xe3 && m <= 0xed) || m === 0xef || m === 0xfe;
    if (!meta) keep.push(seg);
    i += 2 + len;
    if (m === 0xda) { keep.push(buf.subarray(i)); i = buf.length; break; } // начало данных изображения: остаток как есть
  }
  if (!w || !h) return null;
  return { ext: "jpg", width: w, height: h, data: Buffer.concat(keep) };
}
function png(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 33 || sig.some((b, k) => buf[k] !== b) || buf.toString("latin1", 12, 16) !== "IHDR") return null;
  return { ext: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), data: buf };
}
function webp(buf) {
  if (buf.length < 30 || buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WEBP") return null;
  const kind = buf.toString("latin1", 12, 16); let w = 0, h = 0;
  if (kind === "VP8 ") { w = buf.readUInt16LE(26) & 0x3fff; h = buf.readUInt16LE(28) & 0x3fff; }
  else if (kind === "VP8L") { if (buf[20] !== 0x2f) return null; const b = buf.readUInt32LE(21); w = (b & 0x3fff) + 1; h = ((b >> 14) & 0x3fff) + 1; }
  else if (kind === "VP8X") { w = buf.readUIntLE(24, 3) + 1; h = buf.readUIntLE(27, 3) + 1; }
  else return null;
  return { ext: "webp", width: w, height: h, data: buf };
}

export function inspectImage(buf) {
  const r = jpeg(buf) || png(buf) || webp(buf);
  if (!r) return { error: "Допустимы только изображения JPEG, PNG и WebP" };
  if (r.width < 16 || r.height < 16 || r.width > MAX_PIXELS || r.height > MAX_PIXELS) return { error: "Недопустимый размер изображения (от 16 до 10000 px)" };
  return { image: r };
}
