import { useState, useRef } from "react";
import { request, ApiError } from "../../lib/api";
import type { Session } from "../../auth/Login";
import { amount } from "./money";
import "./business.css";
type Row = Record<string, any>;
export function AgentRewardSwitch({
  session,
  onExpired,
}: {
  session: Session;
  onExpired: () => void;
}) {
  const [user, setUser] = useState(""),
    [gate, setGate] = useState<Row | null>(null),
    [reason, setReason] = useState(""),
    [totp, setTotp] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const attempt = useRef({ body: "", key: "" });
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    await run(async () => {
      setGate(
        (
          await request(
            "/v1/affiliate/agents/" +
              encodeURIComponent(user.trim()) +
              "/reward-switch",
          )
        ).data,
      );
      setConfirmed(false);
      setNotice("");
    });
  }
  async function change() {
    if (!gate || !confirmed) return;
    await run(async () => {
      const body = {
        enabled: !gate.enabled,
        expected_revision: gate.revision,
        reason: reason.trim(),
        confirmed,
      };
      const signature = JSON.stringify([user, body]);
      if (attempt.current.body !== signature)
        attempt.current = { body: signature, key: crypto.randomUUID() };
      try {
        setGate(
          (
            await request(
              "/v1/affiliate/agents/" +
                encodeURIComponent(user.trim()) +
                "/reward-switch",
              {
                method: "POST",
                body,
                csrf: session.csrf,
                key: attempt.current.key,
                totp,
              },
            )
          ).data,
        );
        setNotice("代理奖励开关已更新");
        setConfirmed(false);
      } finally {
        setTotp("");
      }
    });
  }
  return (
    <section className="af-admin af-card">
      <h2>单代理奖励开关</h2>
      <p>
        暂停会停止三类奖励新增，并禁止领取已有待领奖励；代理入口与历史记录保留。重新开启后只累计新开启区间的业务。
      </p>
      <form
        className="af-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          会员编号
          <input
            value={user}
            onChange={(e) => {
              setUser(e.target.value);
              setGate(null);
            }}
            required
          />
        </label>
        <button disabled={busy}>读取状态</button>
      </form>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {gate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void change();
          }}
        >
          <p>
            当前状态：<strong>{gate.enabled ? "已开启" : "已暂停"}</strong> ·
            最近开启时间 {new Date(gate.enabled_since).toLocaleString()}
          </p>
          <label>
            操作原因
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={128}
            />
          </label>
          <label>
            本人谷歌验证码
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totp}
              onChange={(e) =>
                setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              pattern="[0-9]{6}"
              required
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            确认
            {gate.enabled ? "暂停三类奖励和领取" : "重新开启，关闭区间不追补"}
          </label>
          <button
            className="primary"
            disabled={busy || !confirmed || session.role !== "operator"}
          >
            {gate.enabled ? "确认暂停" : "确认重新开启"}
          </button>
        </form>
      )}
    </section>
  );
}
export function BusinessSourceStatus({ onExpired }: { onExpired: () => void }) {
  const [day, setDay] = useState(
      new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    ),
    [daily, setDaily] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    setBusy(true);
    try {
      setDaily((await request("/v1/affiliate/daily/" + day)).data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setDaily(null);
      setError(
        e instanceof ApiError && e.status === 404
          ? "该业务日尚未冻结，请先核对所有受信来源的日结水位。"
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="af-admin">
      <section className="af-card">
        <h2>代理日结与来源状态</h2>
        <p>
          来源完成清单核对后冻结最终等级和三层计佣；到站点当地次日 01:00
          自动结算并进入待审核。来源未完整不会提前关账。
        </p>
        <form
          className="af-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <label>
            站点业务日期
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              required
            />
          </label>
          <button disabled={busy}>查看日结</button>
        </form>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {daily && (
          <>
            <p>
              {daily.status === "SETTLED"
                ? "已结算，等待独立审核"
                : "最终等级与佣金已冻结，等待01点结算"}{" "}
              · {daily.configuration.config.timezone} · 配置版本{" "}
              {daily.configuration.revision}
            </p>
            <p>
              冻结时间 {new Date(daily.frozen_at).toLocaleString()} · 结算时间{" "}
              {daily.settled_at
                ? new Date(daily.settled_at).toLocaleString()
                : "待处理"}
            </p>
            <h3>受信来源水位</h3>
            {daily.watermarks.map((m: Row) => (
              <p key={m.source_id}>
                {m.source_id} · {m.fact_count} 笔 · 已核对完整
              </p>
            ))}
            <div className="af-table">
              <table>
                <thead>
                  <tr>
                    <th>代理</th>
                    <th>最终等级</th>
                    <th>有效人数</th>
                    <th>三层有效业务量</th>
                    <th>计算佣金</th>
                    <th>参与状态</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.results.map((r: Row) => (
                    <tr key={r.agent_id}>
                      <td>{r.agent_id}</td>
                      <td>Lv{r.calculation.level}</td>
                      <td>{r.calculation.qualified_members}</td>
                      <td>
                        {amount(
                          r.calculation.valid_bet_minor,
                          daily.configuration.config.currency_scale,
                        )}
                      </td>
                      <td>
                        {amount(
                          r.calculation.commission_minor,
                          daily.configuration.config.currency_scale,
                        )}
                      </td>
                      <td>{r.eligible ? "参与" : "未参与奖励"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <section className="af-card">
        <h3>真实注册与模拟业务来源</h3>
        <p>
          注册和登录由 ex-member-sandbox
          提供。成功充值、成功提现和已结算业务量通过独立来源适配器签名投递；会员不能自行申报金额。
        </p>
        <p>
          本地管理员可使用该项目的 affiliate_business_source.py
          登记模拟业务并提交来源日结清单。它保留原订单及
          outbox，失败重试不变更订单，关账后迟到事实单独保留待调整。
        </p>
        <p>
          此页面只查询结果，不能代替来源声明完整，也不能更改服务时间或强制提前结算。
        </p>
      </section>
    </div>
  );
}
