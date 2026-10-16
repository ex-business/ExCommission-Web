import * as validators from "../generated/validators.js";
import keys from "../generated/validator-keys.json";
import type { Schema } from "../types";
type ValidationFunction = ((data: unknown) => boolean) & {
  errors?: {
    instancePath: string;
    message?: string;
    params: { missingProperty?: string };
  }[];
};
export function validate(schema: Schema, value: unknown): string[] {
  const name = (keys as Record<string, string>)[JSON.stringify(schema)];
  const fn = (validators as unknown as Record<string, ValidationFunction>)[
    name
  ];
  if (!fn) return ["输入结构未登记，请更新契约并重新构建"];
  if (fn(value)) return [];
  return (fn.errors || [])
    .slice(0, 8)
    .map(
      (e) =>
        `${e.instancePath || "表单"} ${e.message}${e.params.missingProperty ? "：" + e.params.missingProperty : ""}`,
    );
}
