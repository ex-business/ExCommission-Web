import { useState } from "react";
import { initial, label, resolveSchema, type Schema } from "../catalog";
type Props = {
  schema: Schema;
  value: any;
  onChange: (v: any) => void;
  name: string;
  required?: boolean;
  depth?: number;
};
function branchIndex(options: Schema[], value: any): number {
  const i = options.findIndex((raw) => {
    const s = resolveSchema(raw);
    if (s.type === "null") return value === null;
    if (s.const !== undefined) return s.const === value;
    if (s.enum) return s.enum.includes(value);
    if (s.properties && value && typeof value === "object")
      return (
        Object.entries(s.properties).every(([k, r]) => {
          const p = resolveSchema(r as Schema);
          return (
            (!p.enum && !("const" in p)) ||
            p.enum?.includes(value[k]) ||
            p.const === value[k]
          );
        }) && (s.required || []).every((k: string) => k in value)
      );
    return s.type === typeof value;
  });
  return i < 0 ? 0 : i;
}
function JsonField({
  value,
  onChange,
  name,
}: Pick<Props, "value" | "onChange" | "name">) {
  const [text, setText] = useState(JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState("");
  return (
    <label className="field wide">
      {label(name)}
      <textarea
        aria-label={label(name)}
        value={text}
        rows={8}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError("");
          } catch {
            onChange(undefined);
            setError("JSON 格式不正确，修正后才能使用新内容");
          }
        }}
      />
      {error && (
        <span role="alert" className="error-text">
          {error}
        </span>
      )}
      <small>按代理编号填写对应信息。</small>
    </label>
  );
}
export function SchemaField({
  schema,
  value,
  onChange,
  name,
  required = false,
  depth = 0,
}: Props) {
  const s = resolveSchema(schema);
  const title = label(name);
  const nullable = s.anyOf?.find((x: Schema) => x.type === "null");
  if (nullable) {
    const nonNull = s.anyOf.find((x: Schema) => x.type !== "null");
    return (
      <div className="nullable">
        <label className="check">
          <input
            type="checkbox"
            checked={value === null}
            onChange={(e) =>
              onChange(e.target.checked ? null : initial(nonNull))
            }
          />
          {title}：
          {name === "event_budget_minor"
            ? "按基数隐含总预算（仅比例规则）"
            : name === "new_parent_id"
              ? "根代理"
              : name === "effective_to"
                ? "持续有效"
                : name === "expected_previous_evaluation"
                  ? "首次评估"
                  : "空值 / 无限制"}
        </label>
        {value !== null && (
          <SchemaField
            {...{ schema: nonNull, value, onChange, name, required, depth }}
          />
        )}
      </div>
    );
  }
  const options = s.oneOf || s.anyOf;
  if (options) {
    const index = branchIndex(options, value);
    const names = options.map((raw: Schema, i: number) => {
      const b = resolveSchema(raw);
      for (const key of [
        "algorithm_id",
        "type",
        "draft_hash",
        "plan_version_id",
        "logic",
        "metric",
        "timezone",
        "component_type",
        "currencies",
      ]) {
        if (b.properties?.[key])
          return b.properties[key].enum?.join(" / ") || label(key);
      }
      return `结构 ${i + 1}`;
    });
    return (
      <fieldset className="nested">
        <legend>{title}</legend>
        <label className="field">
          配置类型
          <select
            aria-label={title + "配置类型"}
            value={index}
            onChange={(e) => onChange(initial(options[Number(e.target.value)]))}
          >
            {names.map((n: string, i: number) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <SchemaField
          schema={options[index]}
          value={value}
          onChange={onChange}
          name={name}
          required={required}
          depth={depth + 1}
        />
      </fieldset>
    );
  }
  if (s.const !== undefined || s.type === "null")
    return (
      <label className="field">
        {title}
        <input aria-label={title} value={String(s.const ?? "null")} readOnly />
        <small>固定设置</small>
      </label>
    );
  if (s.type === "object" && s.properties)
    return (
      <fieldset className={"nested " + (depth === 0 ? "root-fields" : "")}>
        <legend>{title}</legend>
        <div className="form-grid">
          {Object.entries(s.properties).map(([k, sub]) => {
            const req = s.required?.includes(k);
            const present = value && k in value;
            return (
              <div
                key={k}
                className={
                  ["object", "array"].includes(
                    resolveSchema(sub as Schema).type,
                  ) || resolveSchema(sub as Schema).oneOf
                    ? "wide"
                    : ""
                }
              >
                {!req && (
                  <label className="check optional">
                    <input
                      type="checkbox"
                      checked={!!present}
                      onChange={(e) => {
                        const next = { ...value };
                        if (e.target.checked) next[k] = initial(sub as Schema);
                        else delete next[k];
                        onChange(next);
                      }}
                    />
                    填写{label(k)}
                  </label>
                )}
                {(req || present) && (
                  <SchemaField
                    schema={sub as Schema}
                    value={value?.[k]}
                    onChange={(v) => onChange({ ...value, [k]: v })}
                    name={k}
                    required={req}
                    depth={depth + 1}
                  />
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
    );
  if (s.type === "object")
    return <JsonField key={name} {...{ value, onChange, name }} />;
  if (s.type === "array") {
    const rows = Array.isArray(value) ? value : [];
    return (
      <fieldset className="nested array">
        <legend>
          {title} <span className="muted">{rows.length} 项</span>
        </legend>
        {rows.map((v: any, i: number) => (
          <div className="array-row" key={i}>
            <SchemaField
              schema={s.items || {}}
              value={v}
              onChange={(n) =>
                onChange(rows.map((x: any, j: number) => (j === i ? n : x)))
              }
              name={title + " " + (i + 1)}
              required
              depth={depth + 1}
            />
            <button
              type="button"
              className="danger-text"
              aria-label={"移除" + title + (i + 1)}
              onClick={() =>
                onChange(rows.filter((_: any, j: number) => i !== j))
              }
            >
              移除
            </button>
          </div>
        ))}
        {s.maxItems !== 0 && (
          <button
            type="button"
            className="secondary"
            onClick={() => onChange([...rows, initial(s.items || {})])}
          >
            ＋ 添加{title}
          </button>
        )}
        {rows.length === 0 && <small>当前为空集合</small>}
      </fieldset>
    );
  }
  if (s.enum)
    return (
      <label className="field">
        {title}
        {required && <b>*</b>}
        <select
          aria-label={title}
          value={value ?? s.enum[0]}
          onChange={(e) => onChange(e.target.value)}
        >
          {s.enum.map((x: string) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
    );
  if (s.type === "boolean")
    return (
      <label className="check">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {title}
      </label>
    );
  return (
    <label className="field">
      {title}
      {required && <b>*</b>}
      <input
        aria-label={title}
        value={value ?? ""}
        type={s.type === "integer" ? "number" : "text"}
        min={s.minimum}
        max={s.maximum}
        maxLength={s.maxLength}
        required={required}
        placeholder={
          s.format === "date-time"
            ? "2026-10-16T00:00:00Z"
            : s.pattern?.includes("[0-9]")
              ? "使用十进制字符串，避免精度损失"
              : ""
        }
        onChange={(e) =>
          onChange(
            s.type === "integer"
              ? e.target.value === ""
                ? undefined
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
      {s.format === "date-time" && (
        <small>UTC，使用 Z 后缀；起点含、终点不含</small>
      )}
      {name.includes("minor") && (
        <small>USD: 100 = 1.00 · BTC: 100000000 = 1 · POINT: 1 = 1</small>
      )}
    </label>
  );
}
