export type ApiOptions = {
  method?: string;
  body?: unknown;
  csrf?: string;
  key?: string;
  totp?: string;
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
  const r = await fetch(path, {
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
    const e = new ApiError(data?.error?.message || "请求未完成");
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
