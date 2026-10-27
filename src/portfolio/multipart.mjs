// Разбор multipart/form-data из буфера (без зависимостей), с жёсткими лимитами.
export function boundaryOf(contentType) {
  const m = /^multipart\/form-data;\s*boundary=(?:"([^"]{1,200})"|([^;\s]{1,200}))/i.exec(contentType || "");
  return m ? m[1] || m[2] : null;
}

export function parseMultipart(buf, boundary, { maxParts = 12 } = {}) {
  const dash = Buffer.from("--" + boundary), crlf = Buffer.from("\r\n\r\n");
  const parts = [];
  let pos = buf.indexOf(dash);
  while (pos >= 0) {
    const start = pos + dash.length;
    if (buf.subarray(start, start + 2).toString() === "--") break;
    const next = buf.indexOf(dash, start);
    if (next < 0) return { error: "bad multipart" };
    const part = buf.subarray(start + 2, next - 2); // отрезаем CRLF после границы и перед следующей
    const hEnd = part.indexOf(crlf);
    if (hEnd < 0) return { error: "bad multipart" };
    const head = part.subarray(0, hEnd).toString("utf8");
    const disp = /content-disposition:[^\r\n]*/i.exec(head);
    const name = disp && /\bname="([^"]*)"/i.exec(disp[0]);
    const file = disp && /\bfilename="([^"]*)"/i.exec(disp[0]);
    parts.push({ name: name ? name[1] : "", filename: file ? file[1] : null, data: part.subarray(hEnd + 4) });
    if (parts.length > maxParts) return { error: "too many parts" };
    pos = next;
  }
  return { parts };
}
