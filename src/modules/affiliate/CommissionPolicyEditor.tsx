import { MoneyInput } from "./MoneyInput";
export type Formula = { op: string; value?: string; args?: Formula[] };
export type LayerRule = {
  algorithm: string;
  rate_ppm?: number;
  fixed_minor?: string;
  tiers?: { from_minor: string; to_minor?: string; rate_ppm: number }[];
  formula?: Formula;
  cap_minor?: string;
};
export type CommissionPolicy = {
  depth: number;
  grades: { level: number; layers: LayerRule[] }[];
};
type Level = { level: number; rates_ppm: number[] };
const proportional = (rate = 0): LayerRule => ({
  algorithm: "PROPORTIONAL",
  rate_ppm: rate,
});
export function alignPolicy(
  policy: CommissionPolicy,
  levels: Level[],
): CommissionPolicy {
  return {
    ...policy,
    grades: levels.map((level) => ({
      level: level.level,
      layers: Array.from(
        { length: policy.depth },
        (_, i) =>
          policy.grades.find((g) => g.level === level.level)?.layers[i] ||
          proportional(level.rates_ppm[i] || 0),
      ),
    })),
  };
}
const formulaNames: Record<string, string> = {
  VOLUME: "本层有效业务量",
  MEMBERS: "有效直属人数",
  DEPTH: "当前层级",
  CONST: "常量",
  ADD: "加",
  SUB: "减",
  MUL: "乘",
  DIV: "除",
  MIN: "取较小值",
  MAX: "取较大值",
};
function FormulaEditor({
  value,
  onChange,
  label,
  depth = 0,
}: {
  value: Formula;
  onChange: (v: Formula) => void;
  label: string;
  depth?: number;
}) {
  const binary = ["ADD", "SUB", "MUL", "DIV", "MIN", "MAX"];
  return (
    <div className="formula-editor">
      <label>
        {label}
        <select
          aria-label={label}
          value={value.op}
          onChange={(e) => {
            const op = e.target.value;
            onChange(
              binary.includes(op)
                ? { op, args: [{ op: "VOLUME" }, { op: "CONST", value: "1" }] }
                : op === "CONST"
                  ? { op, value: "0" }
                  : { op },
            );
          }}
        >
          {Object.entries(formulaNames)
            .filter(([op]) => depth < 10 || !binary.includes(op))
            .map(([op, name]) => (
              <option key={op} value={op}>
                {name}
              </option>
            ))}
        </select>
      </label>
      {value.op === "CONST" && (
        <label>
          非负整数常量
          <input
            aria-label={`${label}常量`}
            inputMode="numeric"
            pattern="[0-9]{1,38}"
            required
            value={value.value || "0"}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
          />
        </label>
      )}
      {value.args?.map((a, i) => (
        <FormulaEditor
          key={i}
          label={`${label}·${i === 0 ? "左项" : "右项"}`}
          value={a}
          depth={depth + 1}
          onChange={(n) =>
            onChange({
              ...value,
              args: value.args!.map((x, k) => (k === i ? n : x)),
            })
          }
        />
      ))}
    </div>
  );
}
export function CommissionPolicyEditor({
  value,
  levels,
  scale,
  currency,
  onChange,
}: {
  value?: CommissionPolicy;
  levels: Level[];
  scale: number;
  currency: string;
  onChange: (p: CommissionPolicy | undefined) => void;
}) {
  const policy = value ? alignPolicy(value, levels) : undefined;
  const patch = (g: number, i: number, rule: LayerRule) => {
    if (policy)
      onChange({
        ...policy,
        grades: policy.grades.map((x) =>
          x.level !== g
            ? x
            : { ...x, layers: x.layers.map((r, k) => (k === i ? rule : r)) },
        ),
      });
  };
  return (
    <section className="commission-policy">
      <label>
        <input
          type="checkbox"
          checked={!!policy}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? alignPolicy({ depth: 3, grades: [] }, levels)
                : undefined,
            )
          }
        />
        启用扩展返佣规则
      </label>
      <p>
        {policy
          ? "按等级和物理层级分别计算；没有有效业务量的层级不发佣金。新规则随独立审批发布，历史结果保持。"
          : "沿用原三层比例规则。"}
      </p>
      {policy && (
        <>
          <label>
            返佣层级数
            <input
              aria-label="返佣层级数"
              type="number"
              min="1"
              max="64"
              step="1"
              required
              value={policy.depth}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= 64)
                  onChange(alignPolicy({ ...policy, depth: n }, levels));
              }}
            />
          </label>
          {policy.grades.map((g) => (
            <details key={g.level} open={g.level === 0}>
              <summary>
                Lv{g.level} · {policy.depth}层规则
              </summary>
              {g.layers.map((r, i) => (
                <fieldset key={i}>
                  <legend>第{i + 1}层</legend>
                  <label>
                    计算方式
                    <select
                      aria-label={`Lv${g.level}第${i + 1}层计算方式`}
                      value={r.algorithm}
                      onChange={(e) => {
                        const a = e.target.value;
                        patch(
                          g.level,
                          i,
                          a === "FIXED"
                            ? { algorithm: a, fixed_minor: "0" }
                            : a === "TIERED"
                              ? {
                                  algorithm: a,
                                  tiers: [{ from_minor: "0", rate_ppm: 0 }],
                                }
                              : a === "FORMULA"
                                ? {
                                    algorithm: a,
                                    formula: { op: "CONST", value: "0" },
                                  }
                                : proportional(),
                        );
                      }}
                    >
                      <option value="PROPORTIONAL">比例</option>
                      <option value="FIXED">固定金额</option>
                      <option value="TIERED">阶梯累进</option>
                      <option value="FORMULA">受限公式</option>
                    </select>
                  </label>
                  {r.algorithm === "PROPORTIONAL" && (
                    <label>
                      比例（%）
                      <MoneyInput
                        label={`Lv${g.level}第${i + 1}层比例`}
                        scale={4}
                        allowZero
                        maxMinor="1000000"
                        value={String(r.rate_ppm || 0)}
                        onChange={(v) =>
                          patch(g.level, i, { ...r, rate_ppm: Number(v) })
                        }
                      />
                    </label>
                  )}
                  {r.algorithm === "FIXED" && (
                    <label>
                      本层固定佣金（{currency}）
                      <MoneyInput
                        label={`Lv${g.level}第${i + 1}层固定佣金`}
                        scale={scale}
                        allowZero
                        value={r.fixed_minor || "0"}
                        onChange={(v) =>
                          patch(g.level, i, { ...r, fixed_minor: v })
                        }
                      />
                    </label>
                  )}
                  {r.algorithm === "TIERED" && (
                    <>
                      <p>各区间分别计佣后汇总，左含右不含；最后一档无上限。</p>
                      {r.tiers!.map((t, n) => (
                        <div className="tier-fields" key={n}>
                          <label>
                            起点（{currency}）
                            <MoneyInput
                              label={`Lv${g.level}第${i + 1}层第${n + 1}档起点`}
                              scale={scale}
                              allowZero
                              disabled
                              value={t.from_minor}
                              onChange={() => {}}
                            />
                          </label>
                          {t.to_minor !== undefined && (
                            <label>
                              终点（{currency}）
                              <MoneyInput
                                label={`Lv${g.level}第${i + 1}层第${n + 1}档终点`}
                                scale={scale}
                                value={t.to_minor}
                                onChange={(v) =>
                                  patch(g.level, i, {
                                    ...r,
                                    tiers: r.tiers!.map((x, k) =>
                                      k === n
                                        ? { ...x, to_minor: v }
                                        : k === n + 1
                                          ? { ...x, from_minor: v }
                                          : x,
                                    ),
                                  })
                                }
                              />
                            </label>
                          )}
                          <label>
                            比例（%）
                            <MoneyInput
                              label={`Lv${g.level}第${i + 1}层第${n + 1}档比例`}
                              scale={4}
                              allowZero
                              maxMinor="1000000"
                              value={String(t.rate_ppm)}
                              onChange={(v) =>
                                patch(g.level, i, {
                                  ...r,
                                  tiers: r.tiers!.map((x, k) =>
                                    k === n ? { ...x, rate_ppm: Number(v) } : x,
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={r.tiers!.length >= 64}
                        onClick={() => {
                          const rows = r.tiers!.map((x) => ({ ...x }));
                          const last = rows[rows.length - 1];
                          const edge = (
                            BigInt(last.from_minor) +
                            100n * 10n ** BigInt(scale)
                          ).toString();
                          last.to_minor = edge;
                          rows.push({ from_minor: edge, rate_ppm: 0 });
                          patch(g.level, i, { ...r, tiers: rows });
                        }}
                      >
                        添加阶梯
                      </button>
                      {r.tiers!.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const rows = r
                              .tiers!.slice(0, -1)
                              .map((x) => ({ ...x }));
                            delete rows[rows.length - 1].to_minor;
                            patch(g.level, i, { ...r, tiers: rows });
                          }}
                        >
                          删除末档
                        </button>
                      )}
                    </>
                  )}
                  {r.algorithm === "FORMULA" && (
                    <>
                      <p>
                        金额变量和结果按最小货币单位计算；仅允许白名单算术，发布前校验除零、负结果和金额范围。复杂公式建议设置本层佣金上限。
                      </p>
                      <FormulaEditor
                        label={`Lv${g.level}第${i + 1}层公式`}
                        value={r.formula!}
                        onChange={(formula) =>
                          patch(g.level, i, { ...r, formula })
                        }
                      />
                    </>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={r.cap_minor !== undefined}
                      onChange={(e) => {
                        const n = { ...r };
                        if (e.target.checked) n.cap_minor = "0";
                        else delete n.cap_minor;
                        patch(g.level, i, n);
                      }}
                    />
                    限制本层佣金上限
                  </label>
                  {r.cap_minor !== undefined && (
                    <label>
                      上限（{currency}）
                      <MoneyInput
                        label={`Lv${g.level}第${i + 1}层佣金上限`}
                        scale={scale}
                        allowZero
                        value={r.cap_minor}
                        onChange={(v) =>
                          patch(g.level, i, { ...r, cap_minor: v })
                        }
                      />
                    </label>
                  )}
                </fieldset>
              ))}
            </details>
          ))}
        </>
      )}
    </section>
  );
}
