import {externalFetch} from "./external-gateway.mjs";
import {
  opsEnabled,
  loginOps,
  refreshOps,
  logoutOps,
  opsPublicSettings,
  opsView,
  OpsError,
} from "./ops-identity.mjs";
import { randomBytes } from "node:crypto";
import { json, body } from "./http.mjs";
import { secretEquals } from "./security.mjs";
import {
  memberLoginURL,
  sourceLogin,
  revokeSourceToken,
} from "./member-source.mjs";
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
  if (url.pathname === "/auth/config" && req.method === "GET")
    return json(
      res,
      200,
      url.searchParams.get("role") === "member"
        ? { ops: opsEnabled(), require_otp: false }
        : await opsPublicSettings(),
    );
  if (s?.ops && !["/auth/login", "/auth/logout"].includes(url.pathname)) {
    const previous = sessions.get(s.id);
    try {
      const next = await refreshOps(s);
      // 身份查询返回前可能已切站或退出；仅更新仍是原对象的会话，禁止旧响应覆盖新状态。
      if (sessions.get(s.id) !== previous)
        return json(res, 409, {
          error: {
            code: "SITE_CONTEXT_CHANGED",
            message: "会话已更新，请刷新页面",
          },
        });
      s = next;
      sessions.set(s.id, s);
    } catch (e) {
      if (
        sessions.get(s.id) === previous &&
        e instanceof OpsError &&
        [401, 403].includes(e.status)
      )
        sessions.delete(s.id);
      return json(res, e instanceof OpsError ? e.status : 503, {
        error: {
          code: "LOGIN_REQUIRED",
          message: e instanceof OpsError ? e.message : "运营身份服务暂不可用",
        },
      });
    }
  }
  if (url.pathname === "/auth/site" && req.method === "POST") {
    if (!s?.ops || !secretEquals(req.headers["x-csrf-token"], s.csrf))
      return json(res, 403, { error: { code: "CSRF_REJECTED" } });
    const input = JSON.parse(await body(req));
    const previous = sessions.get(s.id);
    try {
      const next = await refreshOps(s, input.site_id);
      if (sessions.get(s.id) !== previous)
        return json(res, 409, {
          error: {
            code: "SITE_CONTEXT_CHANGED",
            message: "会话已更新，请刷新页面",
          },
        });
      next.csrf = randomBytes(24).toString("hex");
      sessions.set(s.id, next);
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, e instanceof OpsError ? e.status : 503, {
        error: {
          code: "PERMISSION_DENIED",
          message: e instanceof OpsError ? e.message : "运营身份服务暂不可用",
        },
      });
    }
  }
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
    let role = ["operator", "approver", "member"].includes(input.role)
      ? input.role
      : "";
    const password = process.env["WEB_" + role.toUpperCase() + "_PASSWORD"];
    let backendToken,
      subject = "local-" + role;
    let valid =
      role &&
      role !== "member" &&
      !opsEnabled() &&
      secretEquals(input.password, password);
    let opsData;
    if (role && role !== "member" && opsEnabled()) {
      try {
        opsData = await loginOps(input);
        role = opsData.role;
        subject = opsData.subject;
        backendToken = opsData.backendToken;
        valid = true;
      } catch (e) {
        attempt.count++;
        attempts.set(ip, attempt);
        return json(res, e instanceof OpsError ? e.status : 503, {
          error: {
            code: "LOGIN_FAILED",
            message: e instanceof OpsError ? e.message : "运营身份服务暂不可用",
          },
        });
      }
    }
    if (
      role === "member" &&
      typeof input.username === "string" &&
      input.username.length <= 128 &&
      typeof input.password === "string" &&
      input.password.length <= 1024
    ) {
      const backend = process.env.BACKEND_URL || "http://127.0.0.1:18080";
      // 配置真实会员来源后只使用该来源验证，失败不能回退为其他同名账号。
      const source = await memberLoginURL();
      let token;
      if (source) {
        token = await sourceLogin(source, input.username, input.password);
      } else {
        const result = await externalFetch(new URL("/v1/auth/login", backend), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: input.username,
            password: input.password,
          }),
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        if (result.ok) token = (await result.json()).access_token;
      }
      if (typeof token === "string") {
        const me = await externalFetch(new URL("/v1/auth/me", backend), {
          headers: { Authorization: "Bearer " + token },
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        if (me.ok) {
          const p = await me.json();
          valid =
            typeof p.member_user_id === "string" &&
            p.member_user_id !== "" &&
            p.permissions?.includes("member:read");
          if (valid) {
            backendToken = token;
            subject = p.subject_id;
          }
        }
      }
      // 来源认证成功而佣金侧拒绝时，撤销未被接受的令牌，不能留下可复用会话。
      if (!valid && source && token)
        await revokeSourceToken(token).catch(() => {});
    }
    if (!valid) {
      attempt.count++;
      attempts.set(ip, attempt);
      return json(res, 401, {
        error: { code: "LOGIN_FAILED", message: "身份或本地登录口令错误" },
      });
    }
    if (s) sessions.delete(s.id);
    const id = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    sessions.set(id, {
      ...opsData,
      role,
      csrf,
      subject,
      backendToken,
      expires: Date.now() + 3600000,
    });
    attempts.delete(ip);
    res.setHeader(
      "Set-Cookie",
      `ec_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
    );
    return json(res, 200, opsView({ ...opsData, role, csrf, subject }));
  }
  if (url.pathname === "/auth/session") {
    if (!s)
      return json(res, 401, {
        error: { code: "LOGIN_REQUIRED", message: "请先登录" },
      });
    return json(res, 200, opsView(s));
  }
  if (url.pathname === "/auth/logout" && req.method === "POST") {
    if (!s || !secretEquals(req.headers["x-csrf-token"], s.csrf))
      return json(res, 403, { error: { code: "CSRF_REJECTED" } });
    sessions.delete(s.id);
    // 无论来源是否暂不可用，本地会话立即失效；令牌本身仍有固定短有效期。
    if (s.ops) await logoutOps(s).catch(() => {});
    else await revokeSourceToken(s.backendToken).catch(() => {});
    res.setHeader(
      "Set-Cookie",
      "ec_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: { code: "NOT_FOUND" } });
}
