export const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};
export async function body(req) {
  let s = "";
  for await (const c of req) {
    s += c;
    if (Buffer.byteLength(s) > 1048576) throw new Error("BODY_TOO_LARGE");
  }
  return s;
}
