import type { CertResult, Rule } from '../domain/types'
import { sortByUtf8 } from '../domain/utf8'
import { WitnessPath } from './WitnessPath'

/**
 * 认证结果：
 * - 可行：给出 CLOSED 优先的字典序最小完整快门表、改动清单与“采纳”动作；
 * - 无解：给出最小冲突快门与 OPEN→CLOSED、CLOSED→OPEN 两条可逐条复核的闭环。
 */
export function CertResultPanel({
  result,
  rules,
  stale,
  adopted,
  onAdopt,
}: {
  result: CertResult
  rules: Rule[]
  stale: boolean
  adopted: boolean
  onAdopt: () => void
}) {
  if (result.satisfiable) {
    const ids = sortByUtf8(Object.keys(result.assignment), (id) => id)
    return (
      <section className="panel cert-panel sat" data-testid="cert-result" data-sat="true">
        <h3>认证通过：存在满足全部规则与锁定的完整方案</h3>
        {stale && (
          <div className="banner warning" data-testid="stale-banner">
            规则或锁定（或快门状态）在上次认证后发生变化，下表为旧预览，已失效——请重新运行认证。
          </div>
        )}
        {adopted && !stale && (
          <div className="banner ok" data-testid="adopted-banner">
            该方案已采纳，当前快门表与下表一致。
          </div>
        )}
        <div className="cert-columns">
          <div>
            <h4>字典序最小完整方案（CLOSED 优先）</h4>
            <table className="data-table" data-testid="solution-table">
              <thead>
                <tr>
                  <th>快门 ID</th>
                  <th>建议状态</th>
                </tr>
              </thead>
              <tbody>
                {ids.map((id) => (
                  <tr key={id}>
                    <td>{id}</td>
                    <td data-testid="solution-state">{result.assignment[id]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4>相对当前表的改动（{result.changes.length} 项）</h4>
            {result.changes.length === 0 ? (
              <p className="muted" data-testid="no-change">无需改动，当前快门表已经是该方案。</p>
            ) : (
              <ul className="change-list" data-testid="change-list">
                {result.changes.map((c) => (
                  <li key={c.id}>
                    <strong>{c.id}</strong>：{c.from} → {c.to}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <button
          type="button"
          className="primary"
          data-testid="adopt-btn"
          onClick={onAdopt}
          disabled={stale}
        >
          采纳该方案（写入快门表）
        </button>
      </section>
    )
  }

  return (
    <section className="panel cert-panel unsat" data-testid="cert-result" data-sat="false">
      <h3>认证不通过：规则与锁定互相矛盾，不存在可行快门表</h3>
      {stale && (
        <div className="banner warning" data-testid="stale-banner">
          规则或锁定（或快门状态）在上次认证后发生变化，以下闭环为旧见证，已失效——请重新运行认证。
        </div>
      )}
      <p>
        按 ID 的 UTF-8 字节序，最小的自相矛盾快门为{' '}
        <strong data-testid="conflict-id">{result.conflictId}</strong>
        ：假设 OPEN 能推出 CLOSED，假设 CLOSED 又能推出 OPEN，形成闭环。每一步都可回到原规则复核：
      </p>
      <div className="witness-columns">
        <WitnessPath
          title={`假设 ${result.conflictId} = OPEN，推出 ${result.conflictId} = CLOSED`}
          steps={result.pathOpenToClosed}
          rules={rules}
        />
        <WitnessPath
          title={`假设 ${result.conflictId} = CLOSED，推出 ${result.conflictId} = OPEN`}
          steps={result.pathClosedToOpen}
          rules={rules}
        />
      </div>
      <p className="muted">
        请解除该闭环涉及的某个锁定，或修改规则后重新导入、再次认证。
      </p>
    </section>
  )
}
