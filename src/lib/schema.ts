import spec from "../../contracts/openapi.json";
import type { Schema } from "../types";
export { spec };
export function resolveSchema(s: Schema | undefined): Schema {
  return s?.$ref
    ? resolveSchema(
        s.$ref
          .split("/")
          .slice(1)
          .reduce((a: any, k: string) => a[k], spec),
      )
    : s || {};
}
export function initial(schema: Schema, depth = 0): any {
  const s = resolveSchema(schema);
  if (depth > 10) return {};
  if ("const" in s) return s.const;
  if (s.default !== undefined) return s.default;
  if (s.anyOf?.some((x: Schema) => x.type === "null")) return null;
  if (s.oneOf || s.anyOf) return initial((s.oneOf || s.anyOf)[0], depth + 1);
  if (s.enum) return s.enum[0];
  if (s.type === "object")
    return Object.fromEntries(
      (s.required || []).map((k: string) => [
        k,
        initial(s.properties[k], depth + 1),
      ]),
    );
  if (s.type === "array")
    return Array.from({ length: s.minItems || 0 }, () =>
      initial(s.items, depth + 1),
    );
  if (s.type === "integer") return s.minimum || 0;
  if (s.type === "boolean") return false;
  if (s.type === "null") return null;
  return "";
}
