/** 快门联锁工作台的核心领域类型。 */

export type ShutterState = 'OPEN' | 'CLOSED'

export interface Shutter {
  /** 快门唯一 ID，任意不含空白的非空文本（大小写敏感）。 */
  id: string
}

/**
 * 一条二元规则的两个文字，含义：a 与 b 至少一个成立。
 * 若同一规则引用了同一快门两次，属于非法重复，导入阶段即拒绝。
 */
export interface Rule {
  /** 规则在导入文档中的序号，从 1 开始，用于每一步指回原规则。 */
  index: number
  aId: string
  aState: ShutterState
  bId: string
  bState: ShutterState
}

export interface Workspace {
  /** 快门数组，按 ID 的 UTF-8 字节序规范排列。 */
  shutters: string[]
  rules: Rule[]
  /** 当前快门表：id -> 状态。 */
  states: Record<string, ShutterState>
  /** 被临时锁定的快门集合（锁定时强制取当前状态）。 */
  locked: Set<string>
}

export interface ChangeEntry {
  id: string
  from: ShutterState
  to: ShutterState
}

/** 一条蕴含边的出处：原始二元规则或操作员锁定约束。 */
export type EdgeOrigin =
  | { kind: 'rule'; ruleIndex: number }
  | { kind: 'lock' }

export interface WitnessStep {
  /** 该步起点文字所断言的快门与状态。 */
  fromShutterId: string
  fromState: ShutterState
  /** 该步终点文字所断言的快门与状态。 */
  shutterId: string
  toState: ShutterState
  origin: EdgeOrigin
}

export interface CertSatResult {
  satisfiable: true
  assignment: Record<string, ShutterState>
  changes: ChangeEntry[]
}

export interface CertUnsatResult {
  satisfiable: false
  /** 与正反文字同处一个强连通分量、且 ID（UTF-8 字节序）最小的快门。 */
  conflictId: string
  /** 假设 OPEN 时推出 CLOSED 的见证路径。 */
  pathOpenToClosed: WitnessStep[]
  /** 假设 CLOSED 时推出 OPEN 的见证路径。 */
  pathClosedToOpen: WitnessStep[]
}

export type CertResult = CertSatResult | CertUnsatResult
