import { readFile } from "node:fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";
const [apiFile, evidenceFile] = process.argv.slice(2);
if (!apiFile || !evidenceFile)
  throw Error("Provide OpenAPI and sanitized HTTP evidence paths");
const spec = JSON.parse(await readFile(apiFile, "utf8")),
  calls = JSON.parse(await readFile(evidenceFile, "utf8"));
const ajv = new Ajv({ strict: false, allErrors: true });
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
let bodies = 0,
  responses = 0;
for (const c of calls) {
  const operation = spec.paths[c.path_template]?.[c.method.toLowerCase()];
  if (!operation) throw Error("Undeclared operation " + c.path_template);
  const response =
    operation.responses[String(c.status)]?.content?.["application/json"]
      ?.schema;
  if (!response)
    throw Error("Undeclared response " + c.path_template + " " + c.status);
  const validate = ajv.compile(refs(response));
  if (!validate(c.response))
    throw Error(
      c.path_template + " response " + JSON.stringify(validate.errors),
    );
  responses++;
  const schema = operation.requestBody?.content?.["application/json"]?.schema;
  if (c.status < 400 && schema) {
    const valid = ajv.compile(refs(schema));
    if (!valid(c.request))
      throw Error(c.path_template + " request " + JSON.stringify(valid.errors));
    bodies++;
  }
}
console.log(
  JSON.stringify({
    status: "PASS",
    http_calls: calls.length,
    validated_request_bodies: bodies,
    validated_responses: responses,
  }),
);
