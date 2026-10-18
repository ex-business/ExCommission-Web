import type { Program } from "./programModel";
// 查询版本带审批和发布时间等只读字段；申请、预检和试算只发送白名单，不能把查询对象原样回写。
export function programRequest(form: Program) {
  const {
    program_id,
    name,
    expected_revision,
    state,
    effective_from,
    reason,
    match,
    config,
  } = form;
  return {
    program_id,
    name,
    expected_revision,
    state,
    effective_from,
    reason,
    match,
    config,
  };
}
