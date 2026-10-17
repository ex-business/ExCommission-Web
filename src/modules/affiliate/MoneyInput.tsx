import { useEffect, useRef, useState } from "react";
import { amount } from "./money";
// 保留输入中的小数点与末尾零，只有有效数值才写入配置的最小单位字段，避免边输入边重排光标。
export function MoneyInput({
  value,
  scale,
  onChange,
  disabled,
  label,
  allowZero = false,
  maxMinor,
}: {
  value: string;
  scale: number;
  onChange: (minor: string) => void;
  disabled?: boolean;
  label: string;
  allowZero?: boolean;
  maxMinor?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const initial = value === "" ? "" : amount(value, scale);
  const [draft, setDraft] = useState(initial),
    emitted = useRef(value),
    previousScale = useRef(scale);
  useEffect(() => {
    if (value !== emitted.current || scale !== previousScale.current) {
      setDraft(value === "" ? "" : amount(value, scale));
      input.current?.setCustomValidity("");
      emitted.current = value;
      previousScale.current = scale;
    }
  }, [value, scale]);
  return (
    <input
      ref={input}
      aria-label={label}
      required
      disabled={disabled}
      inputMode="decimal"
      value={draft}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        let valid = /^\d+(\.\d*)?$/.test(text);
        const [whole = "", fraction = ""] = text.split(".");
        valid = valid && fraction.length <= scale;
        if (valid) {
          const n = BigInt(whole + fraction.padEnd(scale, "0"));
          valid =
            (allowZero || n > 0n) &&
            n.toString().length <= 38 &&
            (!maxMinor || n <= BigInt(maxMinor));
          if (valid) {
            emitted.current = n.toString();
            onChange(n.toString());
          }
        }
        e.target.setCustomValidity(
          valid
            ? ""
            : `请输入${allowZero ? "非负" : "正"}数，最多${scale}位小数`,
        );
      }}
      onBlur={(e) => {
        if (e.target.checkValidity() && emitted.current !== "")
          setDraft(amount(emitted.current, scale));
      }}
    />
  );
}
