import { randomBytes, createHmac } from "node:crypto";
import { json, body } from "./http.mjs";
import { secretEquals } from "./security.mjs";
import { affiliateClaimContext } from "./affiliate-context.mjs";
export async function handleProxy(req, res, url, s, routes) {
  if (!s)
    return json(res, 401, {
      error: { code: "LOGIN_REQUIRED", message: "登录已过期，请重新登录" },
    });
  if (
    !["GET", "HEAD"].includes(req.method) &&
    !secretEquals(req.headers["x-csrf-token"], s.csrf)
  )
    return json(res, 403, {
      error: { code: "CSRF_REJECTED", message: "会话校验失败" },
    });
  const path = url.pathname.slice(4);
  if (!routes.some((x) => x.method === req.method && x.re.test(path)))
    return json(res, 404, {
      error: { code: "UNKNOWN_OPERATION", message: "接口不在 V1 契约中" },
    });
  // 回调只接受渠道系统发起，不开放浏览器签名代理。
  if (path.startsWith("/v1/payment-callbacks/"))
    return json(res, 403, {
      error: {
        code: "CHANNEL_ONLY",
        message: "付款回调仅由受信渠道提交；管理端可核验原付款",
      },
    });
  if (s.role === "member" && !path.startsWith("/v1/me/"))
    return json(res, 403, {
      error: { code: "PERMISSION_DENIED", message: "会员仅可访问本人的佣金" },
    });
  const headers = {
    Authorization:
      "Bearer " +
      (s.backendToken ||
        process.env["LOCAL_" + s.role.toUpperCase() + "_TOKEN"]),
    "X-Request-ID": randomBytes(16).toString("hex"),
  };
  if (req.headers["x-totp-code"] !== undefined) {
    const code = req.headers["x-totp-code"];
    if (typeof code !== "string" || !/^\d{6}$/.test(code))
      return json(res, 400, { error: { code: "INVALID_TOTP_FORMAT" } });
    headers["X-TOTP-Code"] = code;
  }
  let raw;
  if (req.method !== "GET") {
    raw = await body(req);
    headers["Content-Type"] = "application/json";
    const key = req.headers["idempotency-key"];
    if (!key || !/^[\x20-\x7E]{1,128}$/.test(key))
      return json(res, 400, {
        error: { code: "IDEMPOTENCY_REQUIRED", message: "缺少有效的幂等键" },
      });
    headers["Idempotency-Key"] = key;
    // 仅为会员本人领取签名；IP取实际连接，身份取服务端会话，绝不透传浏览器伪造的上下文。
    // 签名绑定原始正文和查询路径，后端仍独立校验权限、幂等及奖励状态。
    if (req.method === "POST" && path === "/v1/me/affiliate/claims" && s.role === "member") {
      Object.assign(headers, affiliateClaimContext(req, s, path + url.search, raw, headers.Authorization));
    }
    if (path === "/v1/member-statistics") {
      if (s.role !== "operator")
        return json(res, 403, { error: { code: "PERMISSION_DENIED" } });
      headers["X-Source-Signature"] = createHmac(
        "sha256",
        process.env.LOCAL_SOURCE_KEY,
      )
        .update(raw)
        .digest("hex");
    }
    if (path === "/v1/events" || path === "/v1/refunds") {
      if (s.role !== "operator")
        return json(res, 403, {
          error: {
            code: "PERMISSION_DENIED",
            message: "仅申请身份可提交本地来源事实",
          },
        });
      const data = JSON.parse(raw);
      if (data.source_id !== "sandbox")
        return json(res, 400, {
          error: { code: "SANDBOX_ONLY", message: "当前只允许 sandbox 来源" },
        });
      headers["X-Source-Signature"] = createHmac(
        "sha256",
        process.env.LOCAL_SOURCE_KEY,
      )
        .update(raw)
        .digest("hex");
    }
  }
  const upstream = await fetch(
    new URL(
      path + url.search,
      process.env.BACKEND_URL || "http://127.0.0.1:18080",
    ),
    {
      method: req.method,
      headers,
      body: raw,
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    },
  );
  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") || "application/json",
    ...(upstream.headers.get("content-disposition")
      ? { "Content-Disposition": upstream.headers.get("content-disposition") }
      : {}),
    "X-Request-ID":
      upstream.headers.get("x-request-id") || headers["X-Request-ID"],
  });
  return res.end(Buffer.from(await upstream.arrayBuffer()));
}
