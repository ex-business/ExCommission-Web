import { readFile } from "node:fs/promises";

// 凭据只从服务端私有文件读取；显式沙箱配置仅允许字面量回环地址。
async function configuration() {
  if (!process.env.MEMBER_SOURCE_FILE) return null;
  const c = JSON.parse(await readFile(process.env.MEMBER_SOURCE_FILE, "utf8"));
  for (const key of ["login_url", "revoke_url"]) {
    const u = new URL(c[key]);
    const loopback =
      /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(u.hostname) ||
      u.hostname === "[::1]";
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      (u.protocol !== "https:" &&
        !(c.local_sandbox === true && u.protocol === "http:" && loopback))
    )
      throw new Error("会员身份来源地址无效");
  }
  if (
    typeof c.client_id !== "string" ||
    !c.client_id ||
    c.client_id.includes(":") ||
    typeof c.client_secret !== "string" ||
    c.client_secret.length < 32
  )
    throw new Error("会员身份接入配置无效");
  return c;
}
const basic = (c) =>
  "Basic " +
  Buffer.from(c.client_id + ":" + c.client_secret).toString("base64");

export async function memberLoginURL() {
  const c = await configuration();
  return c;
}
export async function sourceLogin(c, username, password) {
  const result = await fetch(c.login_url, {
    method: "POST",
    headers: { Authorization: basic(c), "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) return null;
  const data = await result.json();
  return typeof data.access_token === "string" &&
    /^ms_[a-f0-9]{48}$/.test(data.access_token)
    ? data.access_token
    : null;
}
export async function revokeSourceToken(token) {
  if (!token?.startsWith("ms_")) return;
  const c = await configuration();
  if (!c) return;
  const result = await fetch(c.revoke_url, {
    method: "POST",
    headers: {
      Authorization: basic(c),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token }),
    redirect: "error",
    signal: AbortSignal.timeout(3000),
  });
  if (!result.ok) throw new Error("会员来源令牌撤销失败");
}
