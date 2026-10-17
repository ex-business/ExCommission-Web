import { secretEquals } from "./security.mjs";
export function opsEnabled() {
  return !!process.env.OPS_IDENTITY_URL;
}
function config() {
  const endpoint = new URL(process.env.OPS_IDENTITY_URL),
    origin = new URL(
      process.env.OPS_IDENTITY_ORIGIN || "http://127.0.0.1:19586",
    );
  for (const u of [endpoint, origin])
    if (
      u.protocol !== "http:" ||
      u.hostname !== "127.0.0.1" ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash
    )
      throw Error("运营身份接入必须为固定回环地址");
  return { endpoint, origin: origin.origin };
}
export class OpsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function call(path, session, csrf, body) {
  const { endpoint, origin } = config();
  const r = await fetch(new URL(path, endpoint), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(session ? { cookie: "ops_session=" + session } : {}),
      ...(body !== undefined
        ? {
            origin,
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf || "",
          }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  const data = await r.json();
  if (!r.ok)
    throw new OpsError(
      r.status,
      [401, 403, 429].includes(r.status)
        ? typeof data.error === "string"
          ? data.error
          : "运营身份校验失败"
        : "运营身份服务暂不可用",
    );
  return { data, response: r };
}
async function snapshot(session, selected) {
  const { data: me } = await call("/api/me", session);
  if (me.account.must_change_password)
    throw new OpsError(403, "请先在运营管理后台修改初始密码");
  const { data: sites } = await call("/api/sites", session);
  const allowed = (process.env.OPS_SITE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.length) throw new OpsError(503, "业务系统尚未配置运营站点");
  const granted = sites.filter(
    (s) =>
      s.active &&
      allowed.includes(s.id) &&
      me.grants.some((g) => g.site_id === s.id),
  );
  const site = selected || granted[0]?.id || "";
  if (!granted.some((s) => s.id === site))
    throw new OpsError(403, "尚未获得该站点的业务授权");
  const { data: settings } = await call("/api/security-settings");
  if (typeof settings.require_otp !== "boolean")
    throw Error("运营安全设置无效");
  const roles = me.grants.filter((g) => g.site_id === site).map((g) => g.role);
  return {
    ops: true,
    role: roles.includes("applicant")
      ? "operator"
      : roles.includes("approver")
        ? "approver"
        : "viewer",
    subject: "ops-" + me.account.id,
    name: me.account.name,
    site_id: site,
    sites: granted.map((s) => ({ id: s.id, name: s.name })),
    require_otp: settings.require_otp,
    opsSession: session,
    opsCSRF: me.csrf,
    backendToken:
      "ops1." +
      Buffer.from(JSON.stringify({ session, site_id: site })).toString(
        "base64url",
      ),
  };
}
export async function loginOps(input) {
  let session;
  try {
    const { response } = await call("/api/login", undefined, undefined, {
      username: input.username,
      password: input.password,
      ...(input.otp ? { otp: input.otp } : {}),
    });
    session = response.headers
      .getSetCookie()
      .map((v) => /^ops_session=([a-f0-9]{64});/.exec(v)?.[1])
      .find(Boolean);
    if (!session) throw Error("运营会话响应无效");
    return await snapshot(session);
  } catch (error) {
    if (session) await logoutOps({ opsSession: session }).catch(() => {});
    throw error;
  }
}
export async function refreshOps(s, site = s.site_id) {
  return { ...s, ...(await snapshot(s.opsSession, site)) };
}
export async function logoutOps(s) {
  if (!s.opsSession) return;
  const { data: me } = await call("/api/me", s.opsSession);
  await call("/api/logout", s.opsSession, me.csrf, {});
}
export async function opsPublicSettings() {
  if (!opsEnabled()) return { ops: false, require_otp: false };
  const { data } = await call("/api/security-settings");
  if (typeof data.require_otp !== "boolean") throw Error("运营安全设置无效");
  return { ops: true, require_otp: data.require_otp };
}
export function opsView(s) {
  return {
    role: s.role,
    csrf: s.csrf,
    subject: s.subject,
    ...(s.ops
      ? {
          ops: true,
          name: s.name,
          site_id: s.site_id,
          sites: s.sites,
          require_otp: s.require_otp,
        }
      : {}),
  };
}
export function opsSiteMatches(req, s) {
  return !s.ops || secretEquals(req.headers["x-ops-site-id"], s.site_id);
}
