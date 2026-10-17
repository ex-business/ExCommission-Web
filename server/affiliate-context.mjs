import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";

// 由已获确认的会员领取代理显式调用；沿用既有会话和CSRF校验，不注册新入口。
export function affiliateClaimContext(req, session, uri, raw, authorization) {
  const key = process.env.AFFILIATE_CLIENT_CONTEXT_KEY;
  const tenant = process.env.LOCAL_TENANT,
    app = process.env.LOCAL_APP;
  const ip = req.socket.remoteAddress;
  if (
    !key ||
    key.length < 32 ||
    !tenant ||
    !app ||
    !session.subject ||
    !isIP(ip)
  )
    throw new Error("奖励领取来源校验尚未配置");
  const at = String(Math.floor(Date.now() / 1000));
  const bodyHash = createHash("sha256").update(raw).digest("hex");
  const tokenHash = createHash("sha256").update(authorization).digest("hex");
  const parts = [
    "affiliate-client-v1",
    tenant,
    app,
    session.subject,
    tokenHash,
    req.method,
    uri,
    req.headers["idempotency-key"],
    at,
    ip,
    bodyHash,
  ];
  if (
    parts.some(
      (part) =>
        typeof part !== "string" || part.includes("\n") || part.includes("\r"),
    )
  )
    throw new Error("奖励领取上下文无效");
  return {
    "X-Affiliate-Client-IP": ip,
    "X-Affiliate-Client-Time": at,
    "X-Affiliate-Body-SHA256": bodyHash,
    "X-Affiliate-Client-Signature": createHmac("sha256", key)
      .update(parts.join("\n"))
      .digest("hex"),
  };
}
