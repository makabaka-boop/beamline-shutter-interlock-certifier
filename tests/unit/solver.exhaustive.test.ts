import { describe, expect, it } from 'vitest'
import { solve2Sat } from '../../src/domain/solver.ts'
import type { Rule, ShutterState } from '../../src/domain/types.ts'

const STATES: ShutterState[] = ['OPEN', 'CLOSED']

/** 枚举 n 个快门的全部完整赋值，顺序即字典顺序（OPEN < CLOSED，ID 升序）。 */
function enumerateAssignments(n: number): Record<string, ShutterState>[] {
  const ids = Array.from({ length: n }, (_, i) => `S${i + 1}`)
  const total = 1 << n
  const out: Record<string, ShutterState>[] = []
  for (let mask = 0; mask < total; mask++) {
    const a: Record<string, ShutterState> = {}
    for (let i = 0; i < n; i++) {
      // S1 为最高位（变化最慢），保证数值递增即字典序；
      // 位为 0 → CLOSED（优先），为 1 → OPEN。
      a[ids[i]] = (mask >> (n - 1 - i)) & 1 ? 'OPEN' : 'CLOSED'
    }
    out.push(a)
  }
  return out
}

function satisfies(
  assignment: Record<string, ShutterState>,
  rules: Rule[],
): boolean {
  for (const r of rules) {
    const okA = assignment[r.aId] === r.aState
    const okB = assignment[r.bId] === r.bState
    if (!okA && !okB) return false
  }
  return true
}

/** 重新独立地暴力求解：返回首个满足规则与锁定的字典序赋值，无则 null。 */
function bruteForce(
  ids: string[],
  rules: Rule[],
  locked: Record<string, ShutterState>,
): Record<string, ShutterState> | null {
  const n = ids.length
  for (const assignment of enumerateAssignments(n)) {
    let lockedOk = true
    for (const [id, s] of Object.entries(locked)) {
      if (assignment[id] !== s) lockedOk = false
    }
    if (lockedOk && satisfies(assignment, rules)) return assignment
  }
  return null
}

/** 所有可能的二元规则（两个不同快门 × 两个状态）。 */
function allPossibleRules(n: number): Rule[] {
  const ids = Array.from({ length: n }, (_, i) => `S${i + 1}`)
  const rules: Rule[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (const sa of STATES) {
        for (const sb of STATES) {
          rules.push({ index: 0, aId: ids[i], aState: sa, bId: ids[j], bState: sb })
        }
      }
    }
  }
  return rules
}

/** 只保留规则中“真正起约束作用”的不同子句（去重语义等价写法 a∨b 与 b∨a）。 */
function distinctClauses(n: number): Rule[] {
  const seen = new Set<string>()
  const out: Rule[] = []
  for (const r of allPossibleRules(n)) {
    const key = JSON.stringify([r.aId, r.aState, r.bId, r.bState])
    const swapped = JSON.stringify([r.bId, r.bState, r.aId, r.aState])
    if (!seen.has(key) && !seen.has(swapped)) {
      seen.add(key)
      out.push(r)
    }
  }
  return out
}

function indexRules(rules: Rule[]): Rule[] {
  return rules.map((r, i) => ({ ...r, index: i + 1 }))
}

const neg = (s: ShutterState): ShutterState => (s === 'OPEN' ? 'CLOSED' : 'OPEN')
const nodeKey = (id: string, s: ShutterState) => `${id}|${s}`

/** 独立于求解器，从规则与锁定重建蕴含邻接表。 */
function edgesOf(
  rules: Rule[],
  locked: Record<string, ShutterState>,
): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  const add = (aId: string, aState: ShutterState, bId: string, bState: ShutterState) => {
    const u = nodeKey(aId, aState)
    const v = nodeKey(bId, bState)
    if (!adj.has(u)) adj.set(u, [])
    adj.get(u)!.push(v)
  }
  for (const r of rules) {
    add(r.aId, neg(r.aState), r.bId, r.bState)
    add(r.bId, neg(r.bState), r.aId, r.aState)
  }
  for (const [id, s] of Object.entries(locked)) add(id, neg(s), id, s)
  return adj
}

function reachesLiteral(
  adj: Map<string, string[]>,
  n: number,
  fromId: string,
  fromState: ShutterState,
  toId: string,
  toState: ShutterState,
): boolean {
  void n
  const start = nodeKey(fromId, fromState)
  const target = nodeKey(toId, toState)
  const seen = new Set<string>([start])
  const queue = [start]
  let head = 0
  while (head < queue.length) {
    const u = queue[head++]
    if (u === target) return true
    for (const v of adj.get(u) ?? []) {
      if (!seen.has(v)) {
        seen.add(v)
        queue.push(v)
      }
    }
  }
  return false
}

/** 在测试侧重放见证路径：每一步必须沿一条真实蕴含边，并能指回其出处。 */
function verifyWitness(
  steps: {
    fromShutterId: string
    fromState: ShutterState
    shutterId: string
    toState: ShutterState
    origin: { kind: string; ruleIndex?: number }
  }[],
  startState: ShutterState,
  endState: ShutterState,
  conflictId: string,
  rules: Rule[],
  locked: Record<string, ShutterState>,
) {
  // 重建蕴含边集合（键 uVar/uState -> vVar/vState -> origin）。
  const edges = new Map<string, string>()
  const add = (
    aId: string,
    aState: ShutterState,
    bId: string,
    bState: ShutterState,
    origin: string,
  ) => {
    edges.set(`${aId}|${aState}->${bId}|${bState}`, origin)
  }
  const neg = (s: ShutterState): ShutterState => (s === 'OPEN' ? 'CLOSED' : 'OPEN')
  for (const r of rules) {
    add(r.aId, neg(r.aState), r.bId, r.bState, `rule:${r.index}`)
    add(r.bId, neg(r.bState), r.aId, r.aState, `rule:${r.index}`)
  }
  for (const [id, s] of Object.entries(locked)) {
    add(id, neg(s), id, s, 'lock')
  }

  // 路径起点是对冲突快门的假设。
  let curId = conflictId
  let curState = startState
  for (const step of steps) {
    expect(step.fromShutterId).toBe(curId)
    const key = `${curId}|${curState}->${step.shutterId}|${step.toState}`
    const origin = edges.get(key)
    expect(origin, `见证边 ${key} 必须真实存在`).toBeTruthy()
    expect(step.fromState).toBe(curState)
    if (step.origin.kind === 'rule') {
      expect(origin).toBe(`rule:${step.origin.ruleIndex}`)
      const rule = rules[step.origin.ruleIndex! - 1]
      expect(rule).toBeDefined()
    } else {
      expect(step.origin.kind).toBe('lock')
      expect(origin).toBe('lock')
      expect(locked[step.shutterId]).toBe(step.toState)
    }
    curId = step.shutterId
    curState = step.toState
  }
  expect(curId).toBe(conflictId)
  expect(curState).toBe(endState)
}

describe('2-SAT 小规模穷举（n=3：全部 2^12 规则组合 × 全部锁定）', () => {
  const n = 3
  const ids = Array.from({ length: n }, (_, i) => `S${i + 1}`)
  const clauses = distinctClauses(n)
  expect(clauses.length).toBe(12)

  const lockMasks: Record<string, ShutterState>[] = [{}]
  for (const id of ids) {
    for (const s of STATES) {
      lockMasks.push({ [id]: s })
    }
  }
  for (const a of ids) {
    for (const b of ids) {
      if (a < b) lockMasks.push({ [a]: 'OPEN', [b]: 'CLOSED' })
    }
  }

  const total = 1 << clauses.length
  let checked = 0
  for (let mask = 0; mask < total; mask++) {
    const picked: Rule[] = []
    for (let k = 0; k < clauses.length; k++) {
      if ((mask >> k) & 1) picked.push(clauses[k])
    }
    const rules = indexRules(picked)
    for (const locked of lockMasks) {
      const current: Record<string, ShutterState> = {}
      for (const id of ids) current[id] = 'CLOSED'
      const result = solve2Sat({ ids, rules, lockedStates: locked, currentStates: current })
      const expected = bruteForce(ids, rules, locked)

      if (expected === null) {
        expect(result.satisfiable, '暴力无解时求解器必须判 UNSAT').toBe(false)
        if (!result.satisfiable) {
          expect(result.conflictId).toBeDefined()
          verifyWitness(result.pathOpenToClosed, 'OPEN', 'CLOSED', result.conflictId, rules, locked)
          verifyWitness(result.pathClosedToOpen, 'CLOSED', 'OPEN', result.conflictId, rules, locked)
          // 独立预言：在由规则/锁定独立重建的蕴含图上直接 BFS，
          // 正反同 SCC ⇔ OPEN→CLOSED 与 CLOSED→OPEN 双向可达。
          for (const id of ids) {
            const reaches = (from: ShutterState, to: ShutterState) =>
              reachesLiteral(edgesOf(rules, locked), n, id, from, id, to)
            const isConflict = reaches('OPEN', 'CLOSED') && reaches('CLOSED', 'OPEN')
            if (id < result.conflictId) {
              expect(isConflict, `更小的快门 ${id} 不应是冲突快门`).toBe(false)
            }
            if (id === result.conflictId) {
              expect(isConflict, '报告的冲突快门必须正反同 SCC').toBe(true)
            }
          }
        }
      } else {
        expect(result.satisfiable, '暴力有解时求解器必须判 SAT').toBe(true)
        if (result.satisfiable) {
          expect(result.assignment).toEqual(expected)
          expect(satisfies(result.assignment, rules)).toBe(true)
          // 锁定必须被严格满足。
          for (const [id, s] of Object.entries(locked)) {
            expect(result.assignment[id]).toBe(s)
          }
          // 改动清单与当前表严格一致。
          for (const c of result.changes) {
            expect(current[c.id]).toBe(c.from)
            expect(result.assignment[c.id]).toBe(c.to)
          }
        }
      }
      checked++
    }
  }

  it('覆盖了全部 4096 × 9 种组合', () => {
    expect(checked).toBe(total * lockMasks.length)
  })
})

describe('2-SAT 见证在锁定导致的无解上也成立', () => {
  it('单元冲突（快门被同时要求 OPEN 与 CLOSED）给出闭环', () => {
    // S1 OPEN ∨ S2 OPEN，锁定 S1=CLOSED、S2=CLOSED 即矛盾
    const rules = indexRules([
      { index: 0, aId: 'S1', aState: 'OPEN', bId: 'S2', bState: 'OPEN' },
    ])
    const result = solve2Sat({
      ids: ['S1', 'S2'],
      rules,
      lockedStates: { S1: 'CLOSED', S2: 'CLOSED' },
      currentStates: { S1: 'CLOSED', S2: 'CLOSED' },
    })
    expect(result.satisfiable).toBe(false)
    if (result.satisfiable) return
    expect(result.conflictId).toBe('S1')
    verifyWitness(result.pathOpenToClosed, 'OPEN', 'CLOSED', 'S1', rules, {
      S1: 'CLOSED',
      S2: 'CLOSED',
    })
    verifyWitness(result.pathClosedToOpen, 'CLOSED', 'OPEN', 'S1', rules, {
      S1: 'CLOSED',
      S2: 'CLOSED',
    })
  })

  it('n=4 链状矛盾：E2E 场景的求解器侧核对', () => {
    const rules = indexRules([
      { index: 0, aId: 'S1', aState: 'OPEN', bId: 'S2', bState: 'OPEN' },
      { index: 0, aId: 'S1', aState: 'CLOSED', bId: 'S2', bState: 'OPEN' },
      { index: 0, aId: 'S1', aState: 'OPEN', bId: 'S2', bState: 'CLOSED' },
    ])
    const r = solve2Sat({
      ids: ['S1', 'S2', 'S3', 'S4'],
      rules,
      lockedStates: { S1: 'CLOSED' },
      currentStates: { S1: 'CLOSED', S2: 'OPEN', S3: 'CLOSED', S4: 'CLOSED' },
    })
    expect(r.satisfiable).toBe(false)
    if (!r.satisfiable) {
      expect(r.conflictId).toBe('S1')
      verifyWitness(r.pathOpenToClosed, 'OPEN', 'CLOSED', 'S1', rules, { S1: 'CLOSED' })
      verifyWitness(r.pathClosedToOpen, 'CLOSED', 'OPEN', 'S1', rules, { S1: 'CLOSED' })
    }
  })
})
