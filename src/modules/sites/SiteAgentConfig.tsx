import { useRef, useState } from "react";
import type { Session } from "../../auth/Login";
import { request, ApiError } from "../../lib/api";
export function SiteAgentConfig({
  session,
  onExpired,
  onApproval,
}: {
  session: Session;
  onExpired: () => void;
  onApproval: (id: string) => void;
}) {
  const [current, setCurrent] = useState<any>(null),
    [options, setOptions] = useState<any[]>([]),
    [enabled, setEnabled] = useState(false),
    [plan, setPlan] = useState(""),
    [venues, setVenues] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [totp, setTotp] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [approval, setApproval] = useState("");
  const last = useRef({ text: "", key: "" });
  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    await guard(async () => {
      const [c, o] = await Promise.all([
        request("/v1/site-agent-config"),
        request("/v1/site-agent-options"),
      ]);
      setCurrent(c.data);
      setEnabled(c.data.enabled);
      setPlan(c.data.plan_id);
      setVenues(c.data.venue_ids);
      setOptions(o.data.rows);
    });
  }
  async function save() {
    if (!current) return;
    await guard(async () => {
      const body = {
        enabled,
        plan_id: plan,
        venue_ids: venues,
        expected_revision: current.revision,
        reason,
      };
      const text = JSON.stringify(body);
      if (last.current.text !== text)
        last.current = { text, key: crypto.randomUUID() };
      const r = await request("/v1/site-agent-config-requests", {
        method: "POST",
        body,
        csrf: session.csrf,
        key: last.current.key,
        totp,
      });
      setApproval(r.data.approval_id);
      setTotp("");
    });
  }
  const choices = options.filter((o) => o.event_type !== "MILESTONE_REACHED");
  const plans = [...new Set(choices.map((o) => o.plan_id) as string[])];
  if (current?.plan_id && !plans.includes(current.plan_id))
    plans.push(current.plan_id);
  const venueChoices = [
    ...new Set([...choices.map((o) => o.venue_id), ...venues]),
  ];
  return (
    <section aria-label="站点代理配置">
      <h2>站点代理配置</h2>
      <button disabled={busy} onClick={load}>
        读取站点配置
      </button>
      {error && <p role="alert">{error}</p>}
      {current && (
        <>
          <p>
            当前状态：
            {current.configured
              ? current.enabled
                ? "已开启"
                : "已关闭"
              : "未配置，沿用通用策略"}{" "}
            · 版本 {current.revision}
          </p>
          <label>
            <input
              type="checkbox"
              aria-label="启用站点代理"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            启用代理奖励及领取
          </label>
          <label>
            代理佣金方案
            <select
              aria-label="代理佣金方案"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="">请选择已发布方案</option>
              {plans.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>参与场馆</legend>
            {venueChoices.map((v) => (
              <label key={v}>
                <input
                  type="checkbox"
                  aria-label={"场馆 " + v}
                  checked={venues.includes(v)}
                  onChange={(e) =>
                    setVenues((old) =>
                      e.target.checked
                        ? [...old, v]
                        : old.filter((x) => x !== v),
                    )
                  }
                />
                {v}
              </label>
            ))}
          </fieldset>
          <label>
            变更原因
            <input
              aria-label="站点配置变更原因"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {(!session.ops || session.require_otp) && (
            <label>
              谷歌验证码
              <input
                aria-label="谷歌验证码"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
              />
            </label>
          )}
          <p>
            提交申请后由独立审批人确认生效。关闭后停止新的奖励与领取，已发生的付款结果仍正常核验。
          </p>
          <button
            disabled={
              busy ||
              !plan ||
              !reason ||
              ((!session.ops || session.require_otp) &&
                !/^\d{6}$/.test(totp)) ||
              (enabled && !venues.length)
            }
            onClick={save}
          >
            提交站点配置审批
          </button>
        </>
      )}
      {approval && (
        <p>
          已提交审批：{approval}{" "}
          <button onClick={() => onApproval(approval)}>打开站点配置审批</button>
        </p>
      )}
    </section>
  );
}
