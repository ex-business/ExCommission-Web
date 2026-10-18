import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/modules/affiliate/money.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { amount, rewardScale, currencyScale } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
test("并行方案按原权益精度显示金额，BTC不套用USD精度", () => {
  assert.equal(
    amount(
      "100000000",
      rewardScale(
        {
          currency: "BTC",
          program_configuration: { config: { currency_scale: 8 } },
        },
        2,
      ),
    ),
    "1.00000000",
  );
  assert.equal(amount("50", rewardScale({ currency: "USD" }, 8)), "0.50");
  assert.equal(currencyScale("BTC", 2), 8);
  assert.equal(
    amount("99999999999999999999999999999999999999", 8),
    "999999999999999999999999999999.99999999",
  );
  assert.equal(
    rewardScale(
      {
        currency: "CUSTOM",
        program_configuration: { config: { currency_scale: 6 } },
      },
      2,
    ),
    6,
  );
});
