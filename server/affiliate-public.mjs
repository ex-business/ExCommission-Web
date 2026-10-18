import {externalFetch} from "./external-gateway.mjs";
import { json } from "./http.mjs";
// 匿名入口只使用服务端固定身份及固定上游路径，不接收浏览器提供的站点或鉴权头。
export async function handleAffiliatePublic(req, res, url) {
  if (req.method !== "GET")
    return json(res, 405, { error: { code: "METHOD_NOT_ALLOWED" } });
  if (url.search) return json(res, 400, { error: { code: "INVALID_QUERY" } });
  const upstream = await externalFetch(
    new URL(
      "/v1/affiliate/public-presentation",
      process.env.BACKEND_URL || "http://127.0.0.1:18080",
    ),
    {
      headers: { Authorization: "Bearer " + process.env.LOCAL_OPERATOR_TOKEN },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!upstream.ok)
    return json(res, 503, { error: { code: "AFFILIATE_UNAVAILABLE" } });
  const { data } = await upstream.json();
  // 双层白名单，后端扩展管理字段也不能意外出现在匿名响应中。
  const out = { visible: data.visible === true };
  if (out.visible)
    for (const key of [
      "currency",
      "currency_scale",
      "invitee_reward_minor",
      "maximum_reward_minor",
      "maximum_rate_ppm",
    ])
      out[key] = data[key];
  if (out.visible) {
    out.social = (data.social || []).map(({ platform, enabled }) => ({
      platform,
      enabled,
    }));
    out.feed = {
      totals: data.feed?.totals || {},
      rows: (data.feed?.rows || [])
        .slice(0, 30)
        .map(
          ({
            member,
            kind,
            amount_minor,
            currency,
            claimed_at,
            avatar_url,
          }) => ({
            member,
            kind,
            amount_minor,
            currency,
            claimed_at,
            avatar_url,
          }),
        ),
    };
  }
  if (process.env.MEMBER_REGISTRATION_URL)
    out.registration_url = process.env.MEMBER_REGISTRATION_URL;
  return json(res, 200, { data: out });
}
