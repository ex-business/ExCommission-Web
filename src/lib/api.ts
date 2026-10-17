export type ApiOptions = {
  method?: string;
  body?: unknown;
  csrf?: string;
  key?: string;
  totp?: string;
};
const messages: Record<string, string> = {
  IMMUTABLE_AFFILIATE_CONFIG: "主货币、统计范围和时区在启用后不可更改。",
  IMMUTABLE_REWARD_STEPS: "已配置的奖励阶梯不可改写，可追加新阶梯。",
  SCHEDULED_CONFIG_EXISTS: "已有待生效配置，请等待生效后再修改。",
  UNKNOWN_VENUE_TYPE: "请选择站点目录中的场馆类型。",
  SITE_AGENT_DISABLED: "代理奖励与领取已暂停，请稍后再试。",
  STATE_CONFLICT: "当前状态不允许此操作，已有邀请归属不能更改。",
  REVISION_CONFLICT: "记录已更新，请刷新后重试。",
  STALE_APPROVAL: "审核依据已更新，请刷新并重新确认。",
  INSUFFICIENT_BALANCE: "可用佣金余额不足。",
  FUNDS_FROZEN: "相关佣金暂被冻结，请联系管理员。",
  PERMISSION_DENIED: "当前账号暂无此操作权限。",
  NOT_FOUND: "记录不存在或不属于当前账号。",
  TOTP_REQUIRED: "请输入本人谷歌验证码。",
  TOTP_INVALID: "谷歌验证码不正确或已过期。",
  TOTP_REPLAY: "此验证码已用于其他操作，请等待新验证码。",
  TOTP_RATE_LIMITED: "验证码尝试过于频繁，请稍后重试。",
  TOTP_NOT_CONFIGURED: "尚未配置本人谷歌验证，请联系管理员完成绑定。",
};
export class ApiError extends Error {
  data: any;
  status = 0;
  requestId: string | null = null;
}
export async function request(
  path: string,
  { method = "GET", body, csrf, key, totp }: ApiOptions = {},
) {
  const target = path.startsWith("/v1/") ? "/api" + path : path;
  const r = await fetch(target, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(totp ? { "X-TOTP-Code": totp } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = r.headers.get("content-type") || "";
  const data = type.includes("json") ? await r.json() : await r.text();
  if (!r.ok) {
    const e = new ApiError(
      messages[data?.error?.code] || data?.error?.message || "请求未完成",
    );
    e.data = data;
    e.status = r.status;
    e.requestId = r.headers.get("x-request-id") || data?.request_id;
    throw e;
  }
  return {
    data: data?.data ?? data,
    requestId: r.headers.get("x-request-id"),
    type,
  };
}
export function resourceLinks(data: any) {
  const found: { field: string; id: string; title: string; section: string }[] =
    [];
  const mapping: Record<string, string[]> = {
    approval_id: ["审批详情", "审批中心"],
    plan_id: ["读取方案", "方案管理"],
    agent_id: ["代理详情", "代理与关系"],
    event_id: ["事件详情", "佣金计算"],
    task_id: ["计算任务", "佣金计算"],
    calculation_task_id: ["计算任务", "佣金计算"],
    statement_id: ["结算详情", "结算管理"],
    payment_id: ["付款详情", "付款与对账"],
    export_id: ["导出详情", "快照导出"],
    risk_id: ["冻结详情", "风控与异常"],
    debt_id: ["债务详情", "退款与调整"],
    entitlement_id: ["权益明细", "账户与流水"],
    refund_task_id: ["退款详情", "退款与调整"],
    job_id: ["同步结果", "用户与来源"],
  };
  function walk(v: any, depth = 0) {
    if (depth > 5 || !v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (
        mapping[k] &&
        typeof x === "string" &&
        !found.some((a) => a.id === x && a.field === k)
      )
        found.push({
          field: k,
          id: x,
          title: mapping[k][0],
          section: mapping[k][1],
        });
      else if (typeof x === "object") walk(x, depth + 1);
    }
  }
  walk(data);
  return found;
}
