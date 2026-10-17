import type { CommissionPolicy, Formula } from "./CommissionPolicyEditor";
import { amount } from "./money";
import { useMemberLocale } from "../member/affiliate/locale";
export function CommissionRuleSummary({
  policy,
  level,
  scale,
  currency,
}: {
  policy?: CommissionPolicy;
  level: number;
  scale: number;
  currency: string;
}) {
  const { t } = useMemberLocale();
  const grade = policy?.grades.find((g) => g.level === level);
  if (!grade) return null;
  const expression = (f: Formula): string => {
    if (f.op === "CONST") return f.value || "0";
    if (["VOLUME", "MEMBERS", "DEPTH"].includes(f.op))
      return t(
        (
          {
            VOLUME: "本层有效业务量",
            MEMBERS: "有效直属人数",
            DEPTH: "当前层级",
          } as Record<string, string>
        )[f.op],
      );
    const a = f.args?.map(expression) || [];
    if (f.op === "MIN" || f.op === "MAX")
      return `${t(f.op === "MIN" ? "取较小值" : "取较大值")}(${a.join(", ")})`;
    return `(${a[0]} ${({ ADD: "+", SUB: "−", MUL: "×", DIV: "÷" } as Record<string, string>)[f.op]} ${a[1]})`;
  };
  return (
    <div>
      {grade.layers.map((r, i) => (
        <div key={i}>
          {t("第{depth}层业务量", { depth: i + 1 })}：
          {r.algorithm === "PROPORTIONAL"
            ? `${amount(String(r.rate_ppm || 0), 4)}%`
            : r.algorithm === "FIXED"
              ? `${t("固定金额")} ${amount(r.fixed_minor || "0", scale)} ${currency}`
              : r.algorithm === "TIERED"
                ? `${t("阶梯累进")} ${r.tiers?.map((x) => `${amount(x.from_minor, scale)}–${x.to_minor ? amount(x.to_minor, scale) : "∞"} ${currency}: ${amount(String(x.rate_ppm), 4)}%`).join("；")}`
                : `${t("公式")} ${r.formula ? expression(r.formula) : ""}`}
          {r.cap_minor !== undefined &&
            ` · ${t("上限")} ${amount(r.cap_minor, scale)} ${currency}`}
        </div>
      ))}
    </div>
  );
}
