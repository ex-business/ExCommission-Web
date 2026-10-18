// 所有业务金额使用十进制字符串与BigInt；Number只用于0至100的进度条显示。
export function amount(value: string, scale = 2) {
  const text = String(value || "0"),
    negative = text.startsWith("-");
  const digits = (negative ? text.slice(1) : text).padStart(scale + 1, "0");
  return (
    (negative ? "-" : "") +
    (scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits)
  );
}
export function toMinor(value: string, scale: number) {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("请输入有效金额");
  const [whole, decimals = ""] = value.split(".");
  if (decimals.length > scale) throw new Error("金额小数位超过主货币精度");
  const n = BigInt(whole + decimals.padEnd(scale, "0"));
  if (n <= 0n || n.toString().length > 38) throw new Error("金额超出范围");
  return n.toString();
}
export function progressPercent(current: string, target: string) {
  const c = BigInt(current || "0"),
    t = BigInt(target || "1");
  return t === 0n ? 100 : Number((c * 100n) / t > 100n ? 100n : (c * 100n) / t);
}

// 并行方案逐笔采用冻结币种精度；公开投影无快照时兼容现有支持的币种，不能统一套用本站主币精度。
export function currencyScale(currency: string, fallback = 2) {
  const known: Record<string, number> = { USD: 2, BTC: 8, POINT: 0 };
  return known[currency] ?? fallback;
}
export function rewardScale(reward: Record<string, any>, fallback = 2) {
  return (
    reward.program_configuration?.config?.currency_scale ??
    currencyScale(reward.currency, fallback)
  );
}
