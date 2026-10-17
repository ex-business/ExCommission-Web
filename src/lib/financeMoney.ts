// 金额展示与解析独立于审核页面，复用方不再加载整页；保持既有精度和校验语义。
const precision: Record<string, number> = { USD: 2, BTC: 8, POINT: 0 };
export function displayMoney(value: string, currency: string) {
  const e = precision[currency];
  if (e === undefined) return value + " " + currency;
  const s = value.padStart(e + 1, "0");
  return (e ? s.slice(0, -e) + "." + s.slice(-e) : s) + " " + currency;
}
export function minorMoney(value: string, currency: string) {
  const e = precision[currency];
  if (e === undefined) throw new Error("当前币种精度未知");
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("请输入正数金额");
  const [a, b = ""] = value.split(".");
  if (b.length > e) throw new Error("金额小数位超出币种精度");
  const n = BigInt(a + b.padEnd(e, "0"));
  if (n <= 0n) throw new Error("金额必须大于零");
  return n.toString();
}
