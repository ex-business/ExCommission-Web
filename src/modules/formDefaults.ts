import { initial, planTemplate, type Operation } from "../catalog";
export const notes: Record<string, string> = {
  审批决定:
    "请先查询审批详情，核对内容和版本。申请人不能审批自己的申请，批准后请查看执行结果。",
  创建沙箱付款:
    "只能支付已批准结算单的可用金额。结果未知时，请核验原付款单，不要重新付款。",
  核验原付款: "查询原付款单的处理结果。结果确认前，款项仍保持占用。",
  提交累计退款:
    "请填写截至本次的累计退款基数，并核对原业务时间、币种和业务类型。",
  申请事实更正:
    "请填写完整的更正信息，保留原业务时间和类型。审批通过后生成新版本，历史记录仍保留。",
  冻结权益: "冻结后，相应余额将限制使用。有多个冻结原因时，需要分别解除。",
  申请解除冻结:
    "解除后，剩余可用余额转回待结算，需要重新审批。退款处理中产生的限制由退款流程解除。",
  创建导出: "导出内容按生成时的数据保存，24 小时后过期。过期后请重新创建导出。",
  申请发布:
    "请先完成当前草稿的试算，再提交发布申请。审批通过后，请检查发布结果。",
  接收沙箱事件:
    "当前只接收本地测试来源。缺少所需历史资料时，计算任务会暂停，补齐资料后可继续处理。",
};
export function defaults(op: Operation) {
  if (op.title === "创建方案") return structuredClone(planTemplate);
  const s = op.requestBody?.content?.["application/json"]?.schema;
  const b = s ? initial(s) : undefined;
  if (b && typeof b === "object") {
    if ("source_id" in b) b.source_id = "sandbox";
    if ("mapping_version_id" in b) b.mapping_version_id = "1";
    if ("channel_id" in b) b.channel_id = "sandbox";
  }
  return b;
}
