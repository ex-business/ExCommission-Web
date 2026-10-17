export type RiskRule = {
  rule_id: string;
  enabled: boolean;
  dimension: string;
  period: string;
  window_days: number;
  scope: string;
  missing_identity: string;
  effective_from: string;
  effective_until?: string;
};
export function RiskRules({
  value,
  onChange,
}: {
  value: RiskRule[];
  onChange: (v: RiskRule[]) => void;
}) {
  const patch = (i: number, key: keyof RiskRule, v: any) =>
    onChange(value.map((r, n) => (n === i ? { ...r, [key]: v } : r)));
  return (
    <fieldset>
      <legend>IP、设备与共享账户去重</legend>
      <p>
        默认不启用。仅使用受信来源的识别摘要，按规则顺序执行；每组首位有效投注会员计佣，同会员的后续投注继续计入。规则只影响生效区间的新计佣，不改写已冻结日结或历史奖励。
      </p>
      {value.map((r, i) => (
        <article className="member-card" key={i}>
          <label>
            规则编号
            <input
              required
              maxLength={64}
              value={r.rule_id}
              onChange={(e) => patch(i, "rule_id", e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={r.enabled}
              onChange={(e) => patch(i, "enabled", e.target.checked)}
            />
            启用规则
          </label>
          <label>
            识别维度
            <select
              value={r.dimension}
              onChange={(e) => patch(i, "dimension", e.target.value)}
            >
              <option value="IP">IP</option>
              <option value="DEVICE">设备</option>
              <option value="ACCOUNT">共享账户</option>
            </select>
          </label>
          <label>
            去重周期
            <select
              value={r.period}
              onChange={(e) => {
                const period = e.target.value;
                onChange(
                  value.map((v, n) =>
                    n === i
                      ? {
                          ...v,
                          period,
                          window_days: period === "CUSTOM_DAYS" ? 1 : 0,
                        }
                      : v,
                  ),
                );
              }}
            >
              {[
                ["DAY", "自然日"],
                ["WEEK", "自然周"],
                ["MONTH", "自然月"],
                ["LIFETIME", "永久"],
                ["CUSTOM_DAYS", "自定义天数"],
              ].map(([v, n]) => (
                <option value={v} key={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {r.period === "CUSTOM_DAYS" && (
            <label>
              每个周期天数
              <input
                type="number"
                min={1}
                max={36600}
                required
                value={r.window_days}
                onChange={(e) =>
                  patch(i, "window_days", Number(e.target.value))
                }
              />
            </label>
          )}
          <label>
            去重范围
            <select
              value={r.scope}
              onChange={(e) => patch(i, "scope", e.target.value)}
            >
              <option value="SITE">全站</option>
              <option value="BENEFICIARY">每个受益代理</option>
            </select>
          </label>
          <label>
            缺少识别信息
            <select
              value={r.missing_identity}
              onChange={(e) => patch(i, "missing_identity", e.target.value)}
            >
              <option value="DENY">不计佣并记录原因</option>
              <option value="ALLOW">允许计佣</option>
            </select>
          </label>
          <label>
            开始时间（UTC ISO）
            <input
              required
              value={r.effective_from}
              placeholder="2026-10-17T00:00:00Z"
              onChange={(e) => patch(i, "effective_from", e.target.value)}
            />
          </label>
          <label>
            结束时间（UTC ISO，可空）
            <input
              value={r.effective_until || ""}
              onChange={(e) => {
                const next = { ...r };
                if (e.target.value) next.effective_until = e.target.value;
                else delete next.effective_until;
                onChange(value.map((v, n) => (n === i ? next : v)));
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, n) => n !== i))}
          >
            删除规则
          </button>
        </article>
      ))}
      <button
        type="button"
        disabled={value.length >= 30}
        onClick={() =>
          onChange([
            ...value,
            {
              rule_id: crypto.randomUUID(),
              enabled: false,
              dimension: "IP",
              period: "DAY",
              window_days: 0,
              scope: "SITE",
              missing_identity: "DENY",
              effective_from: new Date().toISOString(),
            },
          ])
        }
      >
        添加去重规则
      </button>
    </fieldset>
  );
}
