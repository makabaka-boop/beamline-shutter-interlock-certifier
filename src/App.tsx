import { useMemo, useState } from 'react'
import { parseImport } from './domain/parse'
import type { ImportError } from './domain/parse'
import type { CertResult, Rule, ShutterState } from './domain/types'
import { compareUtf8, sortByUtf8 } from './domain/utf8'
import { solve2Sat } from './domain/solver'
import { downloadTextFile, renderTableText } from './domain/export'
import { SAMPLE_DOCUMENT } from './domain/sample'
import { CertResultPanel } from './components/CertResultPanel'

const emptyWorkspace = () => ({
  shutters: [] as string[],
  rules: [] as Rule[],
  states: {} as Record<string, ShutterState>,
  locked: new Set<string>(),
})

interface Preview {
  result: CertResult
}

export default function App() {
  const [workspace, setWorkspace] = useState(emptyWorkspace)
  const [importText, setImportText] = useState(SAMPLE_DOCUMENT)
  const [importErrors, setImportErrors] = useState<ImportError[]>([])
  const [importOkNote, setImportOkNote] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [stale, setStale] = useState(false)
  const [adopted, setAdopted] = useState(false)

  const orderedShutters = useMemo(
    () => sortByUtf8(workspace.shutters, (id) => id),
    [workspace.shutters],
  )

  const lockedStates: Record<string, ShutterState> = {}
  for (const id of workspace.locked) lockedStates[id] = workspace.states[id]

  const markChanged = () => {
    if (preview) setStale(true)
    setAdopted(false)
  }

  const handleImport = () => {
    const parsed = parseImport(importText)
    if (!parsed.ok) {
      // 任何错误都拒绝整份导入，完整保留当前工作区。
      setImportErrors(parsed.errors)
      setImportOkNote('')
      return
    }
    const ids = sortByUtf8(parsed.document.shutterIds, (id) => id)
    const states: Record<string, ShutterState> = {}
    for (const id of ids) states[id] = 'CLOSED'
    setWorkspace({ shutters: ids, rules: parsed.document.rules, states, locked: new Set() })
    setImportErrors([])
    setImportOkNote(
      `导入成功：${ids.length} 个快门、${parsed.document.rules.length} 条规则。快门表已初始化为全 CLOSED。`,
    )
    // 导入属于工作区变更，旧预览立即失效。
    setPreview(null)
    setStale(false)
    setAdopted(false)
  }

  const runCertification = () => {
    if (workspace.shutters.length === 0) return
    const result = solve2Sat({
      ids: orderedShutters,
      rules: workspace.rules,
      lockedStates,
      currentStates: workspace.states,
    })
    setPreview({ result })
    setStale(false)
    setAdopted(false)
  }

  const adoptSolution = () => {
    if (!preview || !preview.result.satisfiable) return
    const assignment = preview.result.assignment
    setWorkspace((ws) => ({ ...ws, states: { ...assignment } }))
    setAdopted(true)
    // 采纳使快门表与预览一致；预览本身仍有效（锁定与规则未变）。
    setStale(false)
  }

  const toggleLock = (id: string) => {
    setWorkspace((ws) => {
      const locked = new Set(ws.locked)
      if (locked.has(id)) locked.delete(id)
      else locked.add(id)
      return { ...ws, locked }
    })
    markChanged()
  }

  const setState = (id: string, state: ShutterState) => {
    setWorkspace((ws) => ({ ...ws, states: { ...ws.states, [id]: state } }))
    markChanged()
  }

  const downloadTable = () => {
    if (workspace.shutters.length === 0) return
    downloadTextFile('shutter-table.txt', renderTableText(workspace.states))
  }

  const downloadPreview = () => {
    if (!preview?.result.satisfiable || stale) return
    downloadTextFile('shutter-certified.txt', renderTableText(preview.result.assignment))
  }

  return (
    <main className="app">
      <header>
        <h1>同步辐射束线 · 快门联锁认证工作台</h1>
        <p className="subtitle">
          纯前端离线工作台。规则为二元子句（两文字至少一个成立）；认证基于蕴含图精确裁决，
          可行时给出按 UTF-8 字节序、CLOSED 优先的字典序最小完整方案，无解时给出可逐条复核的冲突闭环。
        </p>
      </header>

      <section className="panel" data-testid="import-panel">
        <h2>1. 导入快门与规则</h2>
        <p className="muted">
          每行一个快门 ID；规则为四词一行 “ID 状态 ID 状态”，# 开头为注释。
          未知 ID、规则内重复快门或非法状态将拒绝整份导入并保留当前工作区。
        </p>
        <textarea
          data-testid="import-text"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={12}
          spellCheck={false}
        />
        <div className="row">
          <button type="button" className="primary" data-testid="import-btn" onClick={handleImport}>
            校验并导入
          </button>
        </div>
        {importErrors.length > 0 && (
          <div className="banner error" data-testid="import-errors">
            <strong>导入被拒绝，当前工作区未改动：</strong>
            <ul>
              {importErrors.map((err, i) => (
                <li key={i}>
                  {err.line > 0 ? `第 ${err.line} 行：` : ''}
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {importOkNote && (
          <div className="banner ok" data-testid="import-ok">
            {importOkNote}
          </div>
        )}
      </section>

      <section className="panel" data-testid="workspace-panel">
        <div className="section-head">
          <h2>2. 快门表与临时锁定</h2>
          <div className="row">
            <button
              type="button"
              data-testid="cert-btn"
              className="primary"
              onClick={runCertification}
              disabled={workspace.shutters.length === 0}
            >
              运行认证
            </button>
            <button
              type="button"
              data-testid="download-current-btn"
              onClick={downloadTable}
              disabled={workspace.shutters.length === 0}
            >
              下载当前快门表
            </button>
            <button
              type="button"
              data-testid="download-preview-btn"
              onClick={downloadPreview}
              disabled={!(preview?.result.satisfiable && !stale)}
            >
              下载认证采纳稿
            </button>
          </div>
        </div>

        {workspace.shutters.length === 0 ? (
          <p className="muted" data-testid="empty-hint">
            工作区为空：在上方粘贴或编辑快门/规则文档后点击“校验并导入”。
          </p>
        ) : (
          <>
            <table className="data-table" data-testid="shutter-table">
              <thead>
                <tr>
                  <th>快门 ID</th>
                  <th>当前状态</th>
                  <th>临时锁定</th>
                </tr>
              </thead>
              <tbody>
                {orderedShutters.map((id) => {
                  const isLocked = workspace.locked.has(id)
                  return (
                    <tr key={id} data-testid="shutter-row">
                      <td>{id}</td>
                      <td>
                        <select
                          value={workspace.states[id]}
                          data-testid="state-select"
                          disabled={isLocked}
                          onChange={(e) => setState(id, e.target.value as ShutterState)}
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="CLOSED">CLOSED</option>
                        </select>
                        {isLocked && <span className="lock-note">（已锁定，需先解锁才能改状态）</span>}
                      </td>
                      <td>
                        <label className="lock-toggle">
                          <input
                            type="checkbox"
                            data-testid="lock-toggle"
                            checked={isLocked}
                            onChange={() => toggleLock(id)}
                          />
                          锁定为 {workspace.states[id]}
                        </label>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <h3>已导入规则（{workspace.rules.length} 条，至少一个文字成立）</h3>
            <ol className="rule-list" data-testid="rule-list">
              {workspace.rules
                .slice()
                .sort((x, y) => x.index - y.index || compareUtf8(x.aId, y.aId))
                .map((rule) => (
                  <li key={rule.index} data-testid="rule-item">
                    <span className="rule-index">#{rule.index}</span>{' '}
                    {rule.aId} {rule.aState}　∨　{rule.bId} {rule.bState}
                  </li>
                ))}
            </ol>
          </>
        )}
      </section>

      <section className="panel" data-testid="cert-section">
        <h2>3. 认证结果</h2>
        {!preview ? (
          <p className="muted" data-testid="no-preview">
            尚未运行认证。可先勾选若干“临时锁定”，再点击“运行认证”。
          </p>
        ) : (
          <CertResultPanel
            result={preview.result}
            rules={workspace.rules}
            stale={stale}
            adopted={adopted}
            onAdopt={adoptSolution}
          />
        )}
      </section>
    </main>
  )
}
