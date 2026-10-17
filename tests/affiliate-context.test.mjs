import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { affiliateClaimContext } from "../server/affiliate-context.mjs";

test("领取上下文只采用实际连接IP，签名绑定会员、令牌、正文、路径与幂等键", () => {
  process.env.AFFILIATE_CLIENT_CONTEXT_KEY = "k".repeat(32);
  process.env.LOCAL_TENANT = "tenant";
  process.env.LOCAL_APP = "app";
  const request = {
    socket: { remoteAddress: "203.0.113.10" },
    method: "POST",
    headers: {
      "idempotency-key": "claim-key",
      "x-forwarded-for": "forged-ip",
      "x-affiliate-client-ip": "forged-ip",
    },
  };
  const session = { subject: "member-abc" },
    uri = "/v1/me/affiliate/claims",
    raw = '{"kind":"ALL"}',
    token = "Bearer ms_123";
  const result = affiliateClaimContext(request, session, uri, raw, token);
  assert.equal(result["X-Affiliate-Client-IP"], "203.0.113.10");
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const parts = [
    "affiliate-client-v1",
    "tenant",
    "app",
    "member-abc",
    hash(token),
    "POST",
    uri,
    "claim-key",
    result["X-Affiliate-Client-Time"],
    "203.0.113.10",
    hash(raw),
  ];
  assert.equal(
    result["X-Affiliate-Client-Signature"],
    createHmac("sha256", "k".repeat(32)).update(parts.join("\n")).digest("hex"),
  );
  assert.notEqual(
    result["X-Affiliate-Client-Signature"],
    affiliateClaimContext(request, session, uri, '{"kind":"INVITEE"}', token)[
      "X-Affiliate-Client-Signature"
    ],
  );
  request.socket.remoteAddress = "unknown";
  assert.throws(() => affiliateClaimContext(request, session, uri, raw, token));
});
