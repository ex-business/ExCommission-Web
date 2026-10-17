import { useState, useRef } from "react";
import { request } from "../../../lib/api";
import { amount } from "../../affiliate/money";
import { useMemberLocale } from "./locale";
export function CommissionCalculator({
  scale,
  currency,
}: {
  scale: number;
  currency: string;
}) {
  const { t } = useMemberLocale();
  const [members, setMembers] = useState("0"),
    [values, setValues] = useState(["0", "0", "0"]),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  // 输入变化后作废旧响应，防止慢请求把过期预估重新显示出来。
  const invalidate = () => {
    generation.current++;
    setResult(null);
    setError("");
  };
  async function calculate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const serial = ++generation.current;
    setBusy(true);
    try {
      const minor = values.map((v) => {
        if (!/^\d+(\.\d+)?$/.test(v)) throw Error(t("请输入有效金额"));
        const [a, b = ""] = v.split(".");
        if (b.length > scale) throw Error(t("金额小数位超过主货币精度"));
        const n = BigInt(a + b.padEnd(scale, "0"));
        if (n.toString().length > 38) throw Error(t("金额超出范围"));
        return n.toString();
      });
      const q = new URLSearchParams({
        qualified_members: members,
        level1_minor: minor[0],
        level2_minor: minor[1],
        level3_minor: minor[2],
      });
      const r = await request("/v1/me/affiliate/calculator?" + q);
      if (serial === generation.current) setResult(r.data);
    } catch (e) {
      if (serial === generation.current) setError(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="member-card" aria-label={t("佣金计算器")}>
      <h2>{t("佣金计算器")}</h2>
      <p>
        {t(
          "使用已发布规则预估，业务量须已扣除去重及无效订单。实际收益以日结和审核为准。",
        )}
      </p>
      <form onSubmit={calculate}>
        <label>
          {t("有效直属人数")}
          <input
            aria-label={t("有效直属人数")}
            type="number"
            min={0}
            max={1000000000}
            step={1}
            required
            value={members}
            onChange={(e) => {
              invalidate();
              setMembers(e.target.value);
            }}
          />
        </label>
        {values.map((v, i) => (
          <label key={i}>
            {t("第{depth}层业务量", { depth: i + 1 })} ({currency})
            <input
              aria-label={t("第{depth}层业务量", { depth: i + 1 })}
              inputMode="decimal"
              required
              value={v}
              onChange={(e) => {
                invalidate();
                setValues(values.map((n, j) => (j === i ? e.target.value : n)));
              }}
            />
          </label>
        ))}
        <button disabled={busy} type="submit">
          {t(busy ? "计算中…" : "计算预估佣金")}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status">
          <p>
            {t("预计等级")} Lv{result.estimate.level} · {t("规则版本")}{" "}
            {result.config_revision}
          </p>
          <strong>
            {t("预计佣金")} {amount(result.estimate.commission_minor, scale)}{" "}
            {currency}
          </strong>
          <p>
            {result.estimate.layer_commission_minor
              .map((v: string) => amount(v, scale))
              .join(" / ")}
          </p>
        </div>
      )}
    </section>
  );
}
