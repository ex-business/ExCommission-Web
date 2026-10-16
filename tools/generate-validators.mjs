import { readFile, writeFile, mkdir } from "node:fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import standalone from "ajv/dist/standalone/index.js";
const spec = JSON.parse(
  await readFile(new URL("../contracts/openapi.json", import.meta.url), "utf8"),
);
const ajv = new Ajv({
  strict: false,
  allErrors: true,
  code: { source: true, esm: true },
});
addFormats(ajv);
ajv.addSchema({ $id: "excommission", components: spec.components });
function refs(x) {
  if (Array.isArray(x)) return x.map(refs);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.entries(x).map(([k, v]) => [
        k,
        k === "$ref" && typeof v === "string" ? "excommission" + v : refs(v),
      ]),
    );
  return x;
}
const inputs = new Map();
for (const ops of Object.values(spec.paths))
  for (const op of Object.values(ops)) {
    const body = op.requestBody?.content?.["application/json"]?.schema;
    if (body) inputs.set(JSON.stringify(body), body);
    for (const p of op.parameters || [])
      if (p.in !== "header") inputs.set(JSON.stringify(p.schema), p.schema);
  }
const exports = {};
const keys = {};
let i = 0;
for (const [key, s] of inputs) {
  const name = "v" + i++;
  const id = "input-" + name;
  ajv.addSchema(refs(s), id);
  exports[name] = id;
  keys[key] = name;
}
let code = standalone(ajv, exports);
const imports = new Map();
code = code.replace(/require\("([^"]+)"\)(\.default)?/g, (_, path, def) => {
  const name = "runtime" + imports.size;
  imports.set(name, { path, def });
  return name;
});
code =
  [...imports]
    .map(
      ([name, { path, def }]) =>
        `import ${def ? name : "* as " + name} from '${path}.js';`,
    )
    .join("\n") +
  "\n" +
  code;
await mkdir(new URL("../src/generated/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../src/generated/validators.js", import.meta.url),
  code,
);
await writeFile(
  new URL("../src/generated/validator-keys.json", import.meta.url),
  JSON.stringify(keys),
);
await writeFile(
  new URL("../src/generated/validators.d.ts", import.meta.url),
  Object.keys(exports)
    .map(
      (n) =>
        `export const ${n}: ((data:unknown)=>boolean)&{errors?:{instancePath:string;message?:string;params:{missingProperty?:string}}[]};`,
    )
    .join("\n"),
);
console.log("已预编译 " + i + " 种输入结构，无需浏览器动态执行代码。");
