/**
 * 导入文档解析。
 *
 * 纯文本、按行组织、以空白分词（ID 本身不得含空白）：
 *   - 空行忽略；第一个非空白字符为 # 的行视为注释
 *   - 1 个词：快门声明（ID）
 *   - 4 个词：二元规则 `ID 状态 ID 状态`，状态仅允许 OPEN / CLOSED
 *   - 其他词数：整份导入拒绝
 *
 * 任何一处错误都拒绝整份导入（返回全部错误信息，由调用方保留当前工作区）：
 * 未知 ID、规则内重复快门、非法状态、重复声明、数量越界等。
 */
import type { Rule, ShutterState } from './types'

export const MIN_SHUTTERS = 2
export const MAX_SHUTTERS = 300
export const MAX_RULES = 3000

export interface ParsedDocument {
  shutterIds: string[]
  rules: Rule[]
}

export interface ImportError {
  line: number
  message: string
}

export type ParseResult =
  | { ok: true; document: ParsedDocument }
  | { ok: false; errors: ImportError[] }

type LineKind =
  | { kind: 'shutter'; line: number; id: string }
  | { kind: 'rule'; line: number; aId: string; aState: ShutterState; bId: string; bState: ShutterState }
  | { kind: 'error'; line: number; message: string }

function isState(token: string): token is ShutterState {
  return token === 'OPEN' || token === 'CLOSED'
}

export function parseImport(text: string): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/)
  const parsed: LineKind[] = []
  const errors: ImportError[] = []

  lines.forEach((rawLine, i) => {
    const line = i + 1
    const trimmed = rawLine.trim()
    if (trimmed === '' || trimmed.startsWith('#')) return
    const tokens = trimmed.split(/\s+/)

    if (tokens.length === 1) {
      parsed.push({ kind: 'shutter', line, id: tokens[0] })
      return
    }

    if (tokens.length === 4) {
      const [aId, aStateTok, bId, bStateTok] = tokens
      if (!isState(aStateTok) || !isState(bStateTok)) {
        parsed.push({
          kind: 'error',
          line,
          message: `非法状态：状态只允许 OPEN 或 CLOSED（收到 “${!isState(aStateTok) ? aStateTok : bStateTok}”）`,
        })
        return
      }
      if (aId === bId) {
        parsed.push({ kind: 'error', line, message: `规则 ${line} 重复引用同一快门 “${aId}”，一条规则必须涉及两个不同快门` })
        return
      }
      parsed.push({ kind: 'rule', line, aId, aState: aStateTok, bId, bState: bStateTok })
      return
    }

    parsed.push({
      kind: 'error',
      line,
      message: `第 ${line} 行无法识别：快门声明为 1 个词，二元规则为 “ID 状态 ID 状态” 共 4 个词（收到 ${tokens.length} 个词）`,
    })
  })

  const shutterIds: string[] = []
  const declaredIds = new Set<string>()
  const ruleOrigins: Array<{ line: number; aId: string; aState: ShutterState; bId: string; bState: ShutterState }> = []

  for (const item of parsed) {
    if (item.kind === 'error') {
      errors.push({ line: item.line, message: item.message })
      continue
    }
    if (item.kind === 'shutter') {
      if (declaredIds.has(item.id)) {
        errors.push({ line: item.line, message: `快门 ID “${item.id}” 重复声明（第 ${item.line} 行），所有 ID 必须唯一` })
      } else {
        declaredIds.add(item.id)
        shutterIds.push(item.id)
      }
      continue
    }
    ruleOrigins.push(item)
  }

  // 语法与重复声明错误优先；语义校验在“没有前述错误”时才有确定的行号意义。
  for (const r of ruleOrigins) {
    if (!declaredIds.has(r.aId)) {
      errors.push({ line: r.line, message: `规则引用了未知快门 “${r.aId}”，请先声明该 ID` })
    }
    if (!declaredIds.has(r.bId)) {
      errors.push({ line: r.line, message: `规则引用了未知快门 “${r.bId}”，请先声明该 ID` })
    }
  }

  if (shutterIds.length < MIN_SHUTTERS || shutterIds.length > MAX_SHUTTERS) {
    errors.push({
      line: 0,
      message: `快门数量必须在 ${MIN_SHUTTERS} 至 ${MAX_SHUTTERS} 之间（当前 ${shutterIds.length} 个）`,
    })
  }
  if (ruleOrigins.length > MAX_RULES) {
    errors.push({ line: 0, message: `规则数量不得超过 ${MAX_RULES} 条（当前 ${ruleOrigins.length} 条）` })
  }

  if (errors.length > 0) {
    errors.sort((x, y) => (x.line - y.line) || x.message.localeCompare(y.message))
    return { ok: false, errors }
  }

  const rules: Rule[] = ruleOrigins.map((r, i) => ({
    index: i + 1,
    aId: r.aId,
    aState: r.aState,
    bId: r.bId,
    bState: r.bState,
  }))
  return { ok: true, document: { shutterIds, rules } }
}
