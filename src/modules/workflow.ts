import { spec, initial, type Operation } from "../catalog";
import type { Seed } from "./OperationPanel";
export function nextActions(
  op: Operation,
  r: any,
  p: any,
  b: any,
): { title: string; seed: Seed }[] {
  if (!r) return [];
  const a: { title: string; seed: Seed }[] = [];
  const hash = r.object_hash || r.content_hash || r.draft_hash;
  const rev = r.revision ?? r.expected_revision;
  if (op.title === "读取草稿" || op.title === "读取方案") {
    const source = r.draft || r.document || r;
    const draft = Object.fromEntries(
      Object.keys(spec.components.schemas.PlanDraft.properties)
        .filter((k) => k in source)
        .map((k) => [k, source[k]]),
    );
    if (draft.plan_id)
      a.push({
        title: "修订草稿",
        seed: {
          params: { id: p.id },
          body: { draft, expected_revision: r.revision ?? draft.revision },
        },
      });
    if (r.draft_hash)
      a.push({
        title: "试算验证",
        seed: {
          body: {
            draft_hash: r.draft_hash,
            business_facts: initial(spec.components.schemas.Facts),
            ancestors: [],
            qualification_facts: {},
          },
        },
      });
  }
  if (op.title === "审批详情") {
    if (r.status === "PENDING" || r.approval_status === "PENDING")
      a.push({
        title: "审批决定",
        seed: {
          params: { id: p.id },
          body: {
            decision: "APPROVE",
            expected_revision: rev,
            object_hash: hash,
            reason: "",
          },
        },
      });
    if (
      r.execution_status === "FAILED" &&
      (r.status === "APPROVED" || r.approval_status === "APPROVED")
    )
      a.push({
        title: "恢复审批执行",
        seed: {
          params: { id: p.id },
          body: {
            expected_revision: rev,
            object_hash: hash,
            reason: "",
            evidence_ref: "",
          },
        },
      });
  }
  if (op.title === "结算详情" && hash)
    a.push({
      title: "提交结算审批",
      seed: {
        params: { id: p.id },
        body: { expected_revision: rev, content_hash: hash },
      },
    });
  if ((op.title === "审计日志" || op.title === "历史祖先链") && r.next_cursor)
    a.push({
      title: op.title,
      seed: {
        params: {
          ...p,
          cursor: r.next_cursor,
          ...(r.as_of ? { as_of: r.as_of } : {}),
        },
      },
    });
  if (op.title === "导出详情")
    a.push({ title: "下载快照", seed: { params: { id: p.id } } });
  if (op.title === "付款详情")
    a.push({ title: "核验原付款", seed: { params: { id: p.id }, body: {} } });
  if (op.title === "创建方案" && r.plan_id)
    a.push({ title: "读取草稿", seed: { params: { id: r.plan_id } } });
  if (op.title === "试算验证" && r.simulation_id && b?.draft_hash)
    a.push({
      title: "申请发布",
      seed: {
        body: {
          expected_revision: undefined,
          draft_hash: b.draft_hash,
          simulation_id: r.simulation_id,
          effective_from: "",
          reason: "",
        },
      },
    });
  return a;
}
