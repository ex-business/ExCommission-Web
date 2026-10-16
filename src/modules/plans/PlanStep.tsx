import { SchemaField } from "../../components/SchemaField";
export const steps = [
  [
    "基础与路由",
    [
      "plan_id",
      "name",
      "revision",
      "standard_version",
      "route",
      "currency",
      "calendar_version",
    ],
  ],
  ["参与与等级", ["agent_policy", "scope", "grade_definitions"]],
  ["收益规则", ["rules", "event_budget_minor"]],
  ["结算策略", ["settlement_policy"]],
] as const;
import { spec } from "../../catalog";
export function PlanStep({
  draft,
  changeDraft,
  step,
}: {
  draft: any;
  changeDraft: (v: any) => void;
  step: number;
}) {
  const schema = spec.components.schemas.PlanDraft;
  return (
    <div className="form-grid">
      {steps[step][1].map((k) => (
        <div
          className={
            ["object", "array"].includes((schema.properties as any)[k].type)
              ? "wide"
              : ""
          }
          key={k}
        >
          <SchemaField
            schema={(schema.properties as any)[k]}
            name={k}
            value={draft[k]}
            required
            onChange={(v) => changeDraft({ ...draft, [k]: v })}
          />
        </div>
      ))}
    </div>
  );
}
