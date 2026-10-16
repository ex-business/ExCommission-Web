import { randomBytes } from "node:crypto";
import { json, body } from "./http.mjs";
import { secretEquals } from "./security.mjs";
const sessions = new Map(),
  attempts = new Map();
export function session(req) {
  const id = /(?:^|;\s*)ec_session=([^;]+)/.exec(req.headers.cookie || "")?.[1];
  const s = sessions.get(id);
  if (s && s.expires > Date.now()) return { ...s, id };
  if (id) sessions.delete(id);
  return null;
}

export async function handleAuth(req, res, url, s) {
  if (url.pathname === "/auth/login" && req.method === "POST") {
    const ip = req.socket.remoteAddress;
    let attempt = attempts.get(ip);
    if (!attempt || attempt.until < Date.now())
      attempt = { count: 0, until: Date.now() + 60000 };
    if (attempt.count >= 10)
      return json(res, 429, {
        error: {
          code: "LOGIN_RATE_LIMIT",
          message: "尝试过于频繁，请稍后重试",
        },
      });
    const input = JSON.parse(await body(req));
    const role = ["operator", "approver"].includes(input.role)
      ? input.role
      : "";
    const password = process.env["WEB_" + role.toUpperCase() + "_PASSWORD"];
    if (!role || !secretEquals(input.password, password)) {
      attempt.count++;
      attempts.set(ip, attempt);
      return json(res, 401, {
        error: { code: "LOGIN_FAILED", message: "身份或本地登录口令错误" },
      });
    }
    if (s) sessions.delete(s.id);
    const id = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    sessions.set(id, { role, csrf, expires: Date.now() + 3600000 });
    attempts.delete(ip);
    res.setHeader(
      "Set-Cookie",
      `ec_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
    );
    return json(res, 200, { role, csrf, subject: "local-" + role });
  }
  if (url.pathname === "/auth/session") {
    if (!s)
      return json(res, 401, {
        error: { code: "LOGIN_REQUIRED", message: "请先登录" },
      });
    return json(res, 200, {
      role: s.role,
      csrf: s.csrf,
      subject: "local-" + s.role,
    });
  }
  if (url.pathname === "/auth/logout" && req.method === "POST") {
    if (!s || !secretEquals(req.headers["x-csrf-token"], s.csrf))
      return json(res, 403, { error: { code: "CSRF_REJECTED" } });
    sessions.delete(s.id);
    res.setHeader(
      "Set-Cookie",
      "ec_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: { code: "NOT_FOUND" } });
}
