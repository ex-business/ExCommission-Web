import { initial, planTemplate, type Operation } from "../catalog";
export const notes: Record<string, string> = {
  审批决定:
    "批准表示授权，只有执行成功才表示业务已生效。申请人不能自审。请先读取审批详情核对摘要与修订号。",
  创建沙箱付款:
    "仅使用已批准结算单可用金额。未知结果请核验原付款，禁止换资金号重复付款。沙箱状态不代表真实银行到账。",
  核验原付款: "查询原 merchant_payment_id，不创建新付款，不释放未知付款占用。",
  提交累计退款:
    "填写累计退款基数，不是本次增量。原业务时间、币种与路由必须一致。",
  申请事实更正:
    "必须提供完整事实，保持原业务时点与路由。批准后追加修订，不覆盖历史。",
  冻结权益: "冻结限制原有余额，不增加金额桶。多个原因必须分别处理。",
  申请解除冻结:
    "解除后可用余额回待结算，必须重新结算审批；不得手工解除退款等待。",
  创建导出:
    "生成固定快照，下载重新鉴权，默认 24 小时过期。过期不能通过原幂等键重建。",
  申请发布:
    "试算证明必须对应当前草稿摘要。未来版本不覆盖历史，独立批准后检查实际执行状态。",
  接收沙箱事件:
    "仅本地 sandbox 来源，代理服务对原始请求字节签名。缺历史事实将挂起，不用当前数据补历史。",
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
