import {PagedTable} from '../../../components/PagedTable';
import { useState, useRef } from "react";
import { request } from "../../../lib/api";
import { amount } from "../../affiliate/money";
import { useMemberLocale } from "./locale";
export function CommissionCalculator({
  scale,
  currency,
  depth = 3,
  endpoint = "/v1/me/affiliate/calculator",
  revision,
}: {
  scale: number;
  currency: string;
  depth?: number;
  endpoint?: string;
  revision?: number;
}) {
  const { t } = useMemberLocale();
  const [members, setMembers] = useState("0"),
    [values, setValues] = useState(() =>
      Array.from({ length: depth }, () => "0"),
    ),
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
    setResult(null);
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
      const q = new URLSearchParams({ qualified_members: members });
      minor.forEach((v) => q.append("layer_minor", v));
      const r = await request(endpoint + "?" + q);
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
      {revision !== undefined && (
        <p>
          {t("规则版本")} {revision} · {currency} · {t("返佣层级")} {depth}
        </p>
      )}
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
          <div className="table-wrap">
            <PagedTable>
              <thead>
                <tr>
                  <th>{t("层级")}</th>
                  <th>{t("有效业务量")}</th>
                  <th>{t("计算方式")}</th>
                  <th>{t("预计佣金")}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  result.estimate.layers ||
                  result.estimate.layer_commission_minor.map(
                    (v: string, i: number) => ({
                      depth: i + 1,
                      valid_bet_minor: "0",
                      algorithm: "PROPORTIONAL",
                      rate_ppm: result.estimate.rates_ppm[i],
                      commission_minor: v,
                    }),
                  )
                ).map((row: any) => (
                  <tr key={row.depth}>
                    <td>{row.depth}</td>
                    <td>
                      {amount(row.valid_bet_minor, scale)} {currency}
                    </td>
                    <td>
                      {t(
                        (
                          {
                            PROPORTIONAL: "比例",
                            FIXED: "固定金额",
                            TIERED: "阶梯累进",
                            FORMULA: "公式",
                          } as Record<string, string>
                        )[row.algorithm] || row.algorithm,
                      )}
                      {row.algorithm === "PROPORTIONAL"
                        ? ` ${amount(String(row.rate_ppm), 4)}%`
                        : ""}
                    </td>
                    <td>
                      {amount(row.commission_minor, scale)} {currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PagedTable>
          </div>
          {result.estimate.next_level && (
            <p>
              {t("距离下一级")} Lv{result.estimate.next_level.level}：
              {t("还需有效人数")} {result.estimate.next_level.missing_members}，
              {t("还需有效业务量")}{" "}
              {amount(
                result.estimate.next_level.missing_valid_bet_minor,
                scale,
              )}{" "}
              {currency}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
