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
