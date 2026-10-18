import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Config } from "./AffiliateConfig";
import { MoneyInput } from "./MoneyInput";
import { CommissionPolicyEditor } from "./CommissionPolicyEditor";
import { RiskRules } from "./RiskRules";
import {
  type Program,
  states,
  modes,
  localTime,
  programMoney,
} from "./programModel";
type Props = {
  form: Program;
  writable: boolean;
  busy: boolean;
  patch: (value: Partial<Program>) => void;
  config: (value: Partial<Config>) => void;
  currencies: { code: string; currency_scale: number }[];
  venues: { venue_type_id: string; name: string }[];
  check: () => Promise<void>;
  submit: () => Promise<void>;
  simulate: () => Promise<void>;
  onApproval: (id: string) => void;
  approval: string;
  preview: { next_revision: number } | null;
  members: string;
  setMembers: Dispatch<SetStateAction<string>>;
  volumes: string[];
  setVolumes: Dispatch<SetStateAction<string[]>>;
  estimate: { amount_minor?: string; commission_minor?: string } | null;
};
// 编辑器只维护待申请内容；线上状态由独立审批和生效时间决定。
export function ProgramEditor({
  form,
  writable,
  busy,
  patch,
  config,
  currencies,
  venues,
  check,
  submit,
  onApproval,
  approval,
  preview,
  members,
  setMembers,
  volumes,
  setVolumes,
  simulate,
  estimate,
}: Props) {
  const root = useRef<HTMLElement>(null);
  const [scopeDraft, setScopeDraft] = useState({
    sources: form.match.sources.join(","),
    member_ids: form.match.member_ids.join(","),
  });
  useEffect(() => {
    setScopeDraft({
      sources: form.match.sources.join(","),
      member_ids: form.match.member_ids.join(","),
    });
  }, [form.program_id, form.expected_revision]);
  // 金额输入保留无效草稿时不会更新业务值；提交前强制检查原生有效性，避免误发布上一次金额。
  function inputsValid() {
    const invalid = root.current?.querySelector<HTMLInputElement>(
      "input:invalid,select:invalid",
    );
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  }
  return (
    <section ref={root} className="panel">
      <h2>{form.expected_revision ? "方案变更" : "新建方案"}</h2>
      <fieldset disabled={!writable || busy}>
        <div className="program-grid">
          <label>
            方案编号
            <input
              required
              value={form.program_id}
              disabled={!!form.expected_revision}
              onChange={(e) => patch({ program_id: e.target.value })}
            />
          </label>
          <label>
            方案名称
            <input
              required
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label>
            发布后状态
            <select
              value={form.state}
              onChange={(e) => patch({ state: e.target.value })}
            >
              {Object.entries(states).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            生效时间（本机时区）
            <input
              required
              type="datetime-local"
              value={localTime(form.effective_from)}
              onChange={(e) =>
                e.target.value &&
                patch({
                  effective_from: new Date(e.target.value).toISOString(),
                })
              }
            />
          </label>
          <label>
            币种
            <select
              value={form.config.currency}
              disabled={!!form.expected_revision}
              onChange={(e) => {
                const c = currencies.find((x) => x.code === e.target.value);
                config({
                  currency: e.target.value,
                  currency_scale: c?.currency_scale ?? 2,
                });
              }}
            >
              {(currencies.length
                ? currencies
                : [{ code: form.config.currency }]
              ).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            结算时区
            <input
              disabled={!!form.expected_revision}
              value={form.config.timezone}
              onChange={(e) => config({ timezone: e.target.value })}
            />
          </label>
          <label>
            人数统计周期
            <select
              disabled={!!form.expected_revision}
              value={form.config.grade_period}
              onChange={(e) => config({ grade_period: e.target.value })}
            >
              <option value="DAY">日</option>
              <option value="WEEK">周</option>
              <option value="MONTH">月</option>
              <option value="LIFETIME">累计</option>
            </select>
          </label>
          <label>
            命中规则
            <select
              value={form.match.mode}
              onChange={(e) =>
                patch({
                  match: {
                    ...form.match,
                    mode: e.target.value,
                    group: e.target.value === "STACK" ? "" : form.match.group,
                  },
                })
              }
            >
              {Object.entries(modes).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {form.match.mode !== "STACK" && (
            <>
              <label>
                规则组
                <input
                  required
                  value={form.match.group}
                  onChange={(e) =>
                    patch({
                      match: { ...form.match, group: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                优先级（数值越大越优先）
                <input
                  required
                  type="number"
                  value={form.match.priority}
                  onChange={(e) =>
                    patch({
                      match: {
                        ...form.match,
                        priority: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </>
          )}
          {(
            [
              ["sources", "来源编号"],
              ["member_ids", "会员编号"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}（逗号分隔，留空为全部）
              <input
                value={scopeDraft[key]}
                onChange={(e) => {
                  setScopeDraft((v) => ({ ...v, [key]: e.target.value }));
                  patch({
                    match: {
                      ...form.match,
                      [key]: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  });
                }}
              />
            </label>
          ))}
          <label>
            业务类型
            <select
              value={
                form.match.event_types.length === 1
                  ? form.match.event_types[0]
                  : ""
              }
              onChange={(e) =>
                patch({
                  match: {
                    ...form.match,
                    event_types: e.target.value ? [e.target.value] : [],
                  },
                })
              }
            >
              <option value="">充值及投注</option>
              <option value="DEPOSIT_SUCCEEDED">充值</option>
              <option value="BET_SETTLED">投注</option>
            </select>
          </label>
        </div>
        <h3>达标条件与奖励</h3>
        <div className="program-grid">
          {(
            [
              ["grade_condition", "有效会员"],
              ["referral_condition", "推荐奖励"],
              ["invitee_condition", "受邀奖励"],
            ] as const
          ).map(([key, label]) => (
            <fieldset key={key}>
              <legend>{label}</legend>
              {(
                [
                  ["deposit_minor", "累计充值"],
                  ["valid_bet_minor", "有效投注"],
                ] as const
              ).map(([field, name]) => (
                <label key={field}>
                  {name}（{form.config.currency}）
                  <MoneyInput
                    label={`${label} · ${name}`}
                    value={form.config[key][field]}
                    scale={form.config.currency_scale}
                    onChange={(v) =>
                      config({ [key]: { ...form.config[key], [field]: v } })
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <label>
          受邀奖励（{form.config.currency}）
          <MoneyInput
            label="金额"
            value={form.config.invitee_reward_minor}
            scale={form.config.currency_scale}
            onChange={(v) => config({ invitee_reward_minor: v })}
          />
        </label>
        <h3>推荐阶梯</h3>
        {form.config.steps.map((s, i) => (
          <div className="program-row" key={i}>
            <label>
              新增达标人数
              <input
                required
                type="number"
                min="1"
                value={s.additional_members}
                onChange={(e) =>
                  config({
                    steps: form.config.steps.map((x, n) =>
                      n === i
                        ? {
                            ...x,
                            additional_members: Number(e.target.value),
                          }
                        : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              奖励金额（{form.config.currency}）
              <MoneyInput
                label="金额"
                value={s.reward_minor}
                scale={form.config.currency_scale}
                onChange={(v) =>
                  config({
                    steps: form.config.steps.map((x, n) =>
                      n === i ? { ...x, reward_minor: v } : x,
                    ),
                  })
                }
              />
            </label>
            <button
              onClick={() =>
                config({
                  steps: form.config.steps
                    .filter((_, n) => n !== i)
                    .map((x, n) => ({ ...x, step: n + 1 })),
                })
              }
            >
              删除
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            config({
              steps: [
                ...form.config.steps,
                {
                  step: form.config.steps.length + 1,
                  additional_members: 1,
                  reward_minor: "100",
                },
              ],
            })
          }
        >
          添加阶梯
        </button>
        <h3>等级条件与基础比例</h3>
        {form.config.levels.map((l, i) => (
          <div className="program-row" key={i}>
            <label>
              等级 {l.level} · 有效人数
              <input
                required
                type="number"
                value={l.qualified_members}
                onChange={(e) =>
                  config({
                    levels: form.config.levels.map((x, n) =>
                      n === i
                        ? {
                            ...x,
                            qualified_members: Number(e.target.value),
                          }
                        : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              日有效投注
              <MoneyInput
                label="日有效投注"
                allowZero
                value={l.daily_valid_bet_minor}
                scale={form.config.currency_scale}
                onChange={(v) =>
                  config({
                    levels: form.config.levels.map((x, n) =>
                      n === i ? { ...x, daily_valid_bet_minor: v } : x,
                    ),
                  })
                }
              />
            </label>
            {l.rates_ppm.map((r, k) => (
              <label key={k}>
                第{k + 1}层（%）
                <input
                  required
                  type="number"
                  step="0.0001"
                  value={r / 10000}
                  onChange={(e) =>
                    config({
                      levels: form.config.levels.map((x, n) =>
                        n === i
                          ? {
                              ...x,
                              rates_ppm: x.rates_ppm.map((v, j) =>
                                j === k
                                  ? Math.round(Number(e.target.value) * 10000)
                                  : v,
                              ),
                            }
                          : x,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <button
              onClick={() =>
                config({
                  levels: form.config.levels
                    .filter((_, n) => n !== i)
                    .map((x, n) => ({ ...x, level: n })),
                })
              }
            >
              删除
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            config({
              levels: [
                ...form.config.levels,
                {
                  level: form.config.levels.length,
                  qualified_members:
                    (form.config.levels[form.config.levels.length - 1]
                      ?.qualified_members || 0) + 1,
                  daily_valid_bet_minor: "0",
                  rates_ppm: [0, 0, 0],
                },
              ],
            })
          }
        >
          添加等级
        </button>
        <label>
          适用场馆
          <select
            multiple
            value={form.config.venue_type_ids}
            onChange={(e) =>
              config({
                venue_type_ids: Array.from(
                  e.target.selectedOptions,
                  (x) => x.value,
                ),
              })
            }
          >
            {venues.map((v) => (
              <option key={v.venue_type_id} value={v.venue_type_id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <CommissionPolicyEditor
          value={form.config.commission_policy}
          levels={form.config.levels}
          scale={form.config.currency_scale}
          currency={form.config.currency}
          onChange={(v) => config({ commission_policy: v })}
        />
        <RiskRules
          value={form.config.risk_rules || []}
          onChange={(v) => config({ risk_rules: v })}
        />
        <label>
          变更说明
          <input
            required
            value={form.reason}
            onChange={(e) => patch({ reason: e.target.value })}
          />
        </label>
      </fieldset>
      <div className="program-toolbar">
        <button
          disabled={busy || !writable}
          onClick={() => {
            if (inputsValid()) void check();
          }}
        >
          发布预检
        </button>
        <button
          className="primary"
          disabled={busy || !writable || !preview}
          onClick={() => {
            if (inputsValid()) void submit();
          }}
        >
          提交独立审批
        </button>
        {approval && (
          <button onClick={() => onApproval(approval)}>查看审批</button>
        )}
      </div>
      {preview && (
        <p role="status">
          预检通过：{states[form.state]}，版本 {preview.next_revision}
          ；历史权益保留，旧区间不自动补结算。
        </p>
      )}
      <h3>方案试算</h3>
      <div className="program-row">
        <label>
          有效直属人数
          <input
            required
            type="number"
            min="0"
            value={members}
            onChange={(e) => setMembers(e.target.value)}
          />
        </label>
        {Array.from(
          { length: form.config.commission_policy?.depth || 3 },
          (_, i) => (
            <label key={i}>
              第{i + 1}层业务量（{form.config.currency}）
              <input
                inputMode="decimal"
                value={volumes[i] || "0"}
                onChange={(e) =>
                  setVolumes((v) => {
                    const next = [...v];
                    next[i] = e.target.value;
                    return next;
                  })
                }
              />
            </label>
          ),
        )}
        <button
          disabled={busy}
          onClick={() => {
            if (inputsValid()) void simulate();
          }}
        >
          计算预估佣金
        </button>
      </div>
      {estimate && (
        <p>
          预计佣金：
          {programMoney(
            estimate.amount_minor || estimate.commission_minor || "0",
            form.config.currency,
            form.config.currency_scale,
          )}
          ，仅预览。
        </p>
      )}
    </section>
  );
}
