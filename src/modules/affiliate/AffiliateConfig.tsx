import { useRef, useState } from "react";
import type { Session } from "../../auth/Login";
import { ApiError, request } from "../../lib/api";

type Condition = { deposit_minor: string; valid_bet_minor: string };
type Level = {
  level: number;
  qualified_members: number;
  daily_valid_bet_minor: string;
  rates_ppm: number[];
};
type Step = { step: number; additional_members: number; reward_minor: string };
type Config = {
  enabled: boolean;
  currency: string;
  currency_scale: number;
  timezone: string;
  grade_period: string;
  grade_condition: Condition;
  referral_condition: Condition;
  invitee_condition: Condition;
  invitee_reward_minor: string;
  levels: Level[];
  steps: Step[];
  venue_type_ids: string[];
};
const blank = (): Config => ({
  enabled: false,
  currency: "MXN",
  currency_scale: 2,
  timezone: "UTC",
  grade_period: "DAY",
  grade_condition: { deposit_minor: "", valid_bet_minor: "" },
  referral_condition: { deposit_minor: "", valid_bet_minor: "" },
  invitee_condition: { deposit_minor: "", valid_bet_minor: "" },
  invitee_reward_minor: "",
  levels: [
    {
      level: 0,
      qualified_members: 0,
      daily_valid_bet_minor: "0",
      rates_ppm: [0, 0, 0],
    },
  ],
  steps: [{ step: 1, additional_members: 1, reward_minor: "" }],
  venue_type_ids: [],
});
export function AffiliateConfig({
  session,
  onExpired,
  onApproval,
}: {
  session: Session;
  onExpired: () => void;
  onApproval: (id: string) => void;
}) {
  const [state, setState] = useState<any>(null),
    [config, setConfig] = useState<Config>(blank),
    [venues, setVenues] = useState<any[]>([]),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [approval, setApproval] = useState(""),
    [reviewID, setReviewID] = useState(""),
    [review, setReview] = useState<any>(null);
  const last = useRef({ body: "", key: "" });
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "操作未完成");
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    await run(async () => {
      const [a, b] = await Promise.all([
        request("/v1/affiliate/config"),
        request("/v1/affiliate/venue-types"),
      ]);
      setState(a.data);
      setConfig(
        structuredClone(
          a.data.scheduled?.config || a.data.current?.config || blank(),
        ),
      );
      setVenues(b.data.rows);
      setApproval("");
    });
  }
  function patch(key: keyof Config, value: any) {
    setConfig((c) => ({ ...c, [key]: value }));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!state) return;
    await run(async () => {
      const body = { config, expected_revision: state.revision, reason };
      const text = JSON.stringify(body);
      if (last.current.body !== text)
        last.current = { body: text, key: crypto.randomUUID() };
      const r = await request("/v1/affiliate/config-requests", {
        method: "POST",
        body,
        csrf: session.csrf,
        key: last.current.key,
      });
      setApproval(r.data.approval_id);
      setReviewID(r.data.approval_id);
    });
  }
  const fixed = !!state?.configured;
  const unit = `最小货币单位（${config.currency}，${config.currency_scale}位小数）`;
  return (
    <section aria-label="推荐返佣配置">
      <h2>推荐返佣配置</h2>
      <p>
        配置等级、三层比例及推荐和受邀奖励；金额使用{unit}，例如两位小数时 5000
        表示 50.00。
      </p>
      <button disabled={busy} onClick={load}>
        读取推荐返佣配置
      </button>
      {error && <p role="alert">{error}</p>}
      <div>
        <label>
          待审核配置编号
          <input
            aria-label="待审核配置编号"
            value={reviewID}
            onChange={(e) => setReviewID(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !reviewID}
          onClick={() =>
            run(async () => {
              const r = await request(
                "/v1/affiliate/config-requests/" + encodeURIComponent(reviewID),
              );
              setReview(r.data);
            })
          }
        >
          核对待审核配置
        </button>
      </div>
      {review && (
        <section aria-label="待审核配置明细">
          <h3>待审核配置明细</h3>
          <p>
            申请人：{review.applicant_id} · 状态：{review.approval_status} ·
            原因：{review.change.reason}
          </p>
          <ConfigSummary config={review.change.config} />
          <button onClick={() => onApproval(review.approval_id)}>
            前往审批决定
          </button>
        </section>
      )}

      {state && (
        <>
          <p>
            当前：
            {state.configured
              ? state.current.config.enabled
                ? "已开启"
                : "已关闭"
              : "尚未配置"}{" "}
            · 修订 {state.revision}
          </p>
          {state.scheduled && (
            <p role="status">
              已有次日生效配置，生效时间：{state.scheduled.effective_from}
              。生效前暂不能继续修改。
            </p>
          )}
          <form onSubmit={save}>
            <fieldset disabled={busy || !!state.scheduled}>
              <legend>站点与统计周期</legend>
              <label>
                <input
                  aria-label="开启推荐返佣"
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => patch("enabled", e.target.checked)}
                />
                开启推荐返佣
              </label>
              <label>
                主货币
                <input
                  aria-label="推荐返佣主货币"
                  required
                  disabled={fixed}
                  value={config.currency}
                  onChange={(e) => patch("currency", e.target.value)}
                />
              </label>
              <label>
                货币小数位
                <input
                  type="number"
                  min="0"
                  max="8"
                  required
                  disabled={fixed}
                  value={config.currency_scale}
                  onChange={(e) =>
                    patch("currency_scale", Number(e.target.value))
                  }
                />
              </label>
              <label>
                站点时区
                <input
                  aria-label="站点统计时区"
                  required
                  disabled={fixed}
                  value={config.timezone}
                  onChange={(e) => patch("timezone", e.target.value)}
                />
              </label>
              <label>
                代理有效会员统计范围
                <select
                  disabled={fixed}
                  value={config.grade_period}
                  onChange={(e) => patch("grade_period", e.target.value)}
                >
                  <option value="DAY">自然日</option>
                  <option value="WEEK">自然周（周一开始）</option>
                  <option value="MONTH">自然月</option>
                  <option value="LIFETIME">永久</option>
                </select>
              </label>
              <p>
                货币、精度、时区和统计范围在首次生效后固定。等级人数只算直属达标会员，日有效投注包含下线三层。
              </p>
            </fieldset>
            {(
              [
                ["grade_condition", "代理等级有效会员条件"],
                ["referral_condition", "推荐奖励有效会员条件"],
                ["invitee_condition", "受邀会员奖励条件"],
              ] as const
            ).map(([key, title]) => (
              <fieldset disabled={busy || !!state.scheduled} key={key}>
                <legend>{title}</legend>
                <label>
                  累计成功充值
                  <input
                    aria-label={`${title}充值`}
                    required
                    inputMode="numeric"
                    pattern="[1-9][0-9]{0,37}"
                    value={config[key].deposit_minor}
                    onChange={(e) =>
                      patch(key, {
                        ...config[key],
                        deposit_minor: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  累计有效投注
                  <input
                    aria-label={`${title}有效投注`}
                    required
                    inputMode="numeric"
                    pattern="[1-9][0-9]{0,37}"
                    value={config[key].valid_bet_minor}
                    onChange={(e) =>
                      patch(key, {
                        ...config[key],
                        valid_bet_minor: e.target.value,
                      })
                    }
                  />
                </label>
                <p>两项均达标，按首次同时满足时间记录；三套条件分别统计。</p>
              </fieldset>
            ))}
            <fieldset disabled={busy || !!state.scheduled}>
              <legend>代理等级与三层返佣</legend>
              <p>
                比例为百万分比，2500 表示
                0.25%。同一业务日全部投注使用当日最终等级结算。
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>等级</th>
                      <th>有效会员人数</th>
                      <th>日有效投注</th>
                      <th>1级比例</th>
                      <th>2级比例</th>
                      <th>3级比例</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.levels.map((v, i) => (
                      <tr key={i}>
                        <td>Lv{i}</td>
                        <td>
                          <input
                            aria-label={`Lv${i}人数`}
                            type="number"
                            min="0"
                            max="1000000000"
                            required
                            value={v.qualified_members}
                            onChange={(e) =>
                              patch(
                                "levels",
                                config.levels.map((x, n) =>
                                  n === i
                                    ? {
                                        ...x,
                                        qualified_members: Number(
                                          e.target.value,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Lv${i}日有效投注`}
                            required
                            inputMode="numeric"
                            pattern="(0|[1-9][0-9]{0,37})"
                            value={v.daily_valid_bet_minor}
                            onChange={(e) =>
                              patch(
                                "levels",
                                config.levels.map((x, n) =>
                                  n === i
                                    ? {
                                        ...x,
                                        daily_valid_bet_minor: e.target.value,
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        </td>
                        {[0, 1, 2].map((depth) => (
                          <td key={depth}>
                            <input
                              aria-label={`Lv${i}第${depth + 1}层比例`}
                              type="number"
                              min="0"
                              max="1000000"
                              required
                              value={v.rates_ppm[depth]}
                              onChange={(e) =>
                                patch(
                                  "levels",
                                  config.levels.map((x, n) =>
                                    n === i
                                      ? {
                                          ...x,
                                          rates_ppm: x.rates_ppm.map((r, k) =>
                                            k === depth
                                              ? Number(e.target.value)
                                              : r,
                                          ),
                                        }
                                      : x,
                                  ),
                                )
                              }
                            />
                          </td>
                        ))}
                        <td>
                          {i > 0 && i === config.levels.length - 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                patch("levels", config.levels.slice(0, -1))
                              }
                            >
                              删除末级
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                disabled={config.levels.length >= 100}
                onClick={() => {
                  const p = config.levels.at(-1)!;
                  patch("levels", [
                    ...config.levels,
                    {
                      ...p,
                      level: config.levels.length,
                      qualified_members: p.qualified_members + 1,
                      rates_ppm: [...p.rates_ppm],
                    },
                  ]);
                }}
              >
                添加代理等级
              </button>
            </fieldset>
            <fieldset disabled={busy || !!state.scheduled}>
              <legend>推荐奖励阶梯</legend>
              <p>
                人数是每档新增人数，例如 1、3、8 依次需要累计 1、4、12
                人。生效的已有阶梯不可改写，可追加。
              </p>
              {config.steps.map((s, i) => (
                <div key={s.step}>
                  <strong>阶梯 {s.step}</strong>
                  <label>
                    新增有效会员
                    <input
                      aria-label={`阶梯${s.step}新增人数`}
                      type="number"
                      min="1"
                      max="1000000000"
                      required
                      disabled={i < (state.current?.config.steps.length || 0)}
                      value={s.additional_members}
                      onChange={(e) =>
                        patch(
                          "steps",
                          config.steps.map((x, n) =>
                            n === i
                              ? {
                                  ...x,
                                  additional_members: Number(e.target.value),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    奖励金额
                    <input
                      aria-label={`阶梯${s.step}奖励`}
                      required
                      inputMode="numeric"
                      pattern="[1-9][0-9]{0,37}"
                      disabled={i < (state.current?.config.steps.length || 0)}
                      value={s.reward_minor}
                      onChange={(e) =>
                        patch(
                          "steps",
                          config.steps.map((x, n) =>
                            n === i
                              ? { ...x, reward_minor: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
              <button
                type="button"
                disabled={config.steps.length >= 100}
                onClick={() =>
                  patch("steps", [
                    ...config.steps,
                    {
                      step: config.steps.length + 1,
                      additional_members:
                        Math.max(
                          ...config.steps.map((x) => x.additional_members),
                        ) + 1,
                      reward_minor: "",
                    },
                  ])
                }
              >
                添加推荐阶梯
              </button>
              <label>
                受邀会员本人一次性奖励
                <input
                  aria-label="受邀本人奖励金额"
                  required
                  inputMode="numeric"
                  pattern="[1-9][0-9]{0,37}"
                  value={config.invitee_reward_minor}
                  onChange={(e) =>
                    patch("invitee_reward_minor", e.target.value)
                  }
                />
              </label>
            </fieldset>
            <fieldset disabled={busy || !!state.scheduled}>
              <legend>参与游戏场馆类型</legend>
              {venues.map((v) => (
                <label key={v.venue_type_id}>
                  <input
                    type="checkbox"
                    aria-label={`返佣场馆${v.name}`}
                    checked={config.venue_type_ids.includes(v.venue_type_id)}
                    onChange={(e) =>
                      patch(
                        "venue_type_ids",
                        e.target.checked
                          ? [...config.venue_type_ids, v.venue_type_id]
                          : config.venue_type_ids.filter(
                              (x) => x !== v.venue_type_id,
                            ),
                      )
                    }
                  />
                  {v.name}
                </label>
              ))}
              <p>
                请选择至少一种；仅所选类型的已结算有效投注参与达标与佣金统计。
              </p>
            </fieldset>
            <label>
              变更原因
              <input
                required
                maxLength={128}
                aria-label="推荐返佣变更原因"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <p>
              提交后由另一位有权人员审核。首次批准立即生效，后续配置按站点次日零点生效，当前日计算使用原配置。
            </p>
            <button
              disabled={
                busy ||
                !!state.scheduled ||
                !config.venue_type_ids.length ||
                session.role !== "operator"
              }
            >
              提交推荐返佣配置审批
            </button>
          </form>
        </>
      )}
      {approval && (
        <div role="status">
          <p>已提交审批：{approval}，尚未生效。</p>
          <button onClick={() => onApproval(approval)}>
            打开推荐返佣配置审批
          </button>
        </div>
      )}
    </section>
  );
}

function ConfigSummary({ config: c }: { config: Config }) {
  const period: Record<string, string> = {
    DAY: "自然日",
    WEEK: "自然周",
    MONTH: "自然月",
    LIFETIME: "永久",
  };
  const names: Record<string, string> = {
    SPORTS: "体育",
    ESPORTS: "电竞",
    LIVE: "真人",
    LOTTERY: "彩票",
    POKER: "棋牌",
    SLOTS: "电子",
    FISHING: "捕鱼",
  };
  return (
    <>
      <p>
        推荐返佣：{c.enabled ? "开启" : "关闭"} · {c.currency} · 小数位{" "}
        {c.currency_scale} · {c.timezone} · {period[c.grade_period]}
      </p>
      <p>以下金额均为最小货币单位。</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>达标类型</th>
              <th>累计充值</th>
              <th>累计有效投注</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["等级", c.grade_condition],
                ["推荐奖励", c.referral_condition],
                ["受邀奖励", c.invitee_condition],
              ] as const
            ).map(([name, t]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{t.deposit_minor}</td>
                <td>{t.valid_bet_minor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>等级</th>
              <th>人数</th>
              <th>日有效投注</th>
              <th>1层比例</th>
              <th>2层比例</th>
              <th>3层比例</th>
            </tr>
          </thead>
          <tbody>
            {c.levels.map((l) => (
              <tr key={l.level}>
                <td>Lv{l.level}</td>
                <td>{l.qualified_members}</td>
                <td>{l.daily_valid_bet_minor}</td>
                {l.rates_ppm.map((r, i) => (
                  <td key={i}>{r / 10000}%</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        {c.steps.map((s) => (
          <li key={s.step}>
            阶梯{s.step}：新增{s.additional_members}人，奖励{s.reward_minor}
          </li>
        ))}
      </ul>
      <p>
        受邀本人奖励：{c.invitee_reward_minor}；参与场馆：
        {c.venue_type_ids.map((id) => names[id] || id).join("、")}
      </p>
    </>
  );
}
