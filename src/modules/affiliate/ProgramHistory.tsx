import { states, programMoney } from "./programModel";
// 停止方案只读历史仍保留；不同方案和币种逐笔显示，不把待审核视为已到账。
export function ProgramHistory({
  data,
  onApproval,
}: {
  data: any;
  onApproval: (id: string) => void;
}) {
  return (
    <section className="panel">
      <h2>版本与运行记录</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>方案</th>
              <th>版本</th>
              <th>状态</th>
              <th>生效时间</th>
              <th>审批</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {data.versions.map((v: any) => (
              <tr key={`${v.program_id}-${v.revision}`}>
                <td>{v.name}</td>
                <td>{v.revision}</td>
                <td>{states[v.state]}</td>
                <td>{new Date(v.effective_from).toLocaleString()}</td>
                <td>
                  <button onClick={() => onApproval(v.approval_id)}>
                    查看
                  </button>
                </td>
                <td>{v.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>奖励与佣金记录</h3>
      <p>
        按方案保留待审核、待领取、已领取和取消记录；金额分别显示原币种。
        {data.rewards_truncated
          ? "当前显示最近1000笔，完整记录可到代理业务奖励查询。"
          : ""}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>方案 / 版本</th>
              <th>会员</th>
              <th>类型</th>
              <th>金额</th>
              <th>状态</th>
              <th>生成时间</th>
            </tr>
          </thead>
          <tbody>
            {(data.rewards || []).map((r: any) => (
              <tr key={r.reward_id}>
                <td>
                  {r.program_id} / {r.config_revision}
                </td>
                <td>{r.user_id}</td>
                <td>
                  {{
                    REFERRAL: "推荐奖励",
                    INVITEE: "受邀奖励",
                    COMMISSION: "日结佣金",
                  }[r.kind as "REFERRAL"] || r.kind}
                </td>
                <td>
                  {programMoney(
                    r.amount_minor,
                    r.currency,
                    r.program_configuration.config.currency_scale,
                  )}
                </td>
                <td>
                  {{
                    PENDING_REVIEW: "待审核",
                    CLAIMABLE: "待领取",
                    CLAIMED: "已领取",
                    CANCELLED: "已取消",
                  }[r.status as "CLAIMED"] || r.status}
                </td>
                <td>{new Date(r.unlocked_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>日结记录</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>方案 / 版本</th>
              <th>业务日</th>
              <th>状态</th>
              <th>计算结果</th>
            </tr>
          </thead>
          <tbody>
            {data.days.map((d: any) => (
              <tr key={`${d.program_id}-${d.revision}-${d.daily.business_day}`}>
                <td>
                  {d.program_id} / {d.revision}
                </td>
                <td>{d.daily.business_day}</td>
                <td>已结算，佣金待审核</td>
                <td>
                  {d.daily.results
                    .filter(
                      (r: any) =>
                        r.eligible && r.calculation.commission_minor !== "0",
                    )
                    .map(
                      (r: any) =>
                        `${r.calculation.user_id}: ${programMoney(r.calculation.commission_minor, d.daily.configuration.config.currency, d.daily.configuration.config.currency_scale)}`,
                    )
                    .join("；") || "无应付佣金"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>事件命中记录</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>来源 / 原业务单</th>
              <th>业务时间</th>
              <th>命中方案 / 版本</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {data.receipts.map((r: any) => (
              <tr key={`${r.source_id}-${r.business_id}`}>
                <td>
                  {r.source_id} / {r.business_id}
                </td>
                <td>{new Date(r.business_time).toLocaleString()}</td>
                <td>
                  {r.decisions
                    .filter((d: any) => d.selected)
                    .map((d: any) => `${d.program_id} / ${d.revision}`)
                    .join("；") || "无"}
                </td>
                <td>
                  {r.decisions.some(
                    (d: any) =>
                      d.reason === "STOPPED_OR_SUPERSEDED_NO_BACKFILL",
                  )
                    ? "历史区间保留，不补算"
                    : r.decisions.some((d: any) => d.selected)
                      ? "已参与计算"
                      : "未命中"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
