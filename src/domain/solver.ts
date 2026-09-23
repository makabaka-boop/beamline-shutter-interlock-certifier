/**
 * 基于蕴含图的精确 2-SAT 裁决。
 *
 * 变量为快门，文字 (id, OPEN) / (id, CLOSED)，互非即同一快门的另一状态。
 * 规则 a∨b 产生两条蕴含 ¬a→b、¬b→a；锁定快门到状态 s 产生单元子句 s，
 * 即 ¬s→s。
 *
 * 可行性由强连通分量（SCC）裁决；可行时用“逐变量加约束 + SCC 复查”的
 * 标准算法求 CLOSED 优先、ID 按 UTF-8 字节序的字典序最小完整方案。
 * 不可行时定位正反文字同 SCC 且 ID 最小的快门，并给出双向最短蕴含见证。
 */
import type {
  CertResult,
  CertSatResult,
  CertUnsatResult,
  ChangeEntry,
  EdgeOrigin,
  Rule,
  ShutterState,
  WitnessStep,
} from './types'

interface Edge {
  to: number
  origin: EdgeOrigin
}

interface Graph {
  n: number
  adj: Edge[][]
  radj: number[][]
}

const lockOrigin: EdgeOrigin = { kind: 'lock' }
const ruleOrigin = (ruleIndex: number): EdgeOrigin => ({ kind: 'rule', ruleIndex })

/** 文字节点编号：偶数 = 该快门 OPEN，奇数 = CLOSED；异或 1 即取反。 */
function litNode(varIndex: number, state: ShutterState): number {
  return varIndex * 2 + (state === 'CLOSED' ? 1 : 0)
}

function nodeState(node: number): ShutterState {
  return (node & 1) === 1 ? 'CLOSED' : 'OPEN'
}

export function buildGraph(
  ids: string[],
  rules: Rule[],
  locks: Record<string, ShutterState>,
): { graph: Graph; indexOf: Map<string, number> } {
  const indexOf = new Map<string, number>()
  ids.forEach((id, i) => indexOf.set(id, i))
  const n = ids.length * 2
  const adj: Edge[][] = Array.from({ length: n }, () => [])
  const radj: number[][] = Array.from({ length: n }, () => [])

  const addEdge = (u: number, v: number, origin: EdgeOrigin) => {
    adj[u].push({ to: v, origin })
    radj[v].push(u)
  }

  // 边的插入顺序是规则序号顺序、每条规则先 ¬a→b 再 ¬b→a；
  // BFS 按邻接表顺序展开，因此最短见证路径在并列时也是确定的。
  for (const rule of rules) {
    const a = litNode(indexOf.get(rule.aId)!, rule.aState)
    const b = litNode(indexOf.get(rule.bId)!, rule.bState)
    addEdge(a ^ 1, b, ruleOrigin(rule.index))
    addEdge(b ^ 1, a, ruleOrigin(rule.index))
  }
  for (const [id, state] of Object.entries(locks)) {
    const l = litNode(indexOf.get(id)!, state)
    addEdge(l ^ 1, l, lockOrigin)
  }
  return { graph: { n, adj, radj }, indexOf }
}

/** 迭代 Kosaraju，避免大图上的递归栈溢出；返回 comp（同 SCC 编号相同）。 */
export function computeScc(graph: Graph): Int32Array {
  const { n, adj, radj } = graph
  const visited = new Uint8Array(n)
  const cursor = new Int32Array(n)
  const order: number[] = []

  for (let start = 0; start < n; start++) {
    if (visited[start]) continue
    visited[start] = 1
    const stack = [start]
    while (stack.length > 0) {
      const v = stack[stack.length - 1]
      if (cursor[v] < adj[v].length) {
        const w = adj[v][cursor[v]++].to
        if (!visited[w]) {
          visited[w] = 1
          stack.push(w)
        }
      } else {
        order.push(v)
        stack.pop()
      }
    }
  }

  const comp = new Int32Array(n).fill(-1)
  let compCount = 0
  for (let k = n - 1; k >= 0; k--) {
    const start = order[k]
    if (comp[start] !== -1) continue
    comp[start] = compCount
    const stack = [start]
    while (stack.length > 0) {
      const v = stack.pop()!
      for (const w of radj[v]) {
        if (comp[w] === -1) {
          comp[w] = compCount
          stack.push(w)
        }
      }
    }
    compCount++
  }
  return comp
}

/** 在给定额外强制文字下求 SCC；假设通过“¬l→l”单元边表达。 */
function sccWithAssumptions(
  graph: Graph,
  forced: Array<{ node: number }>,
): Int32Array {
  if (forced.length === 0) return computeScc(graph)
  const { n, adj, radj } = graph
  const localAdj: Edge[][] = adj.map((edges) => edges.slice())
  const localRadj: number[][] = radj.map((ns) => ns.slice())
  for (const { node } of forced) {
    localAdj[node ^ 1].push({ to: node, origin: lockOrigin })
    localRadj[node].push(node ^ 1)
  }
  return computeScc({ n, adj: localAdj, radj: localRadj })
}

function isConsistent(comp: Int32Array, varCount: number): boolean {
  for (let i = 0; i < varCount; i++) {
    if (comp[i * 2] === comp[i * 2 + 1]) return false
  }
  return true
}

/**
 * 从假设文字集合沿蕴含边传播，标记所有被强制为真的文字节点。
 * 若同时到达某快门的正反文字，立即报告矛盾。
 */
function propagate(
  graph: Graph,
  seedNodes: number[],
  assigned: Array<ShutterState | null>,
): { reached: Uint8Array; contradiction: boolean } {
  const { n, adj } = graph
  const reached = new Uint8Array(n)
  const queue: number[] = []
  for (const node of seedNodes) {
    if (!reached[node]) {
      reached[node] = 1
      queue.push(node)
    }
  }
  let contradiction = false
  let head = 0
  while (head < queue.length) {
    const u = queue[head++]
    const varIndex = u >> 1
    const state = nodeState(u)
    if (assigned[varIndex] !== null && assigned[varIndex] !== state) contradiction = true
    if (reached[u ^ 1]) contradiction = true
    for (const edge of adj[u]) {
      if (!reached[edge.to]) {
        reached[edge.to] = 1
        queue.push(edge.to)
      }
    }
  }
  return { reached, contradiction }
}

/** BFS 最短蕴含路径，邻接表顺序决定并列时的确定性选择；返回节点序列。 */
function shortestPath(graph: Graph, source: number, target: number): number[] | null {
  const { adj } = graph
  const parent = new Int32Array(graph.n).fill(-1)
  const queue = [source]
  parent[source] = source
  let head = 0
  while (head < queue.length) {
    const u = queue[head++]
    if (u === target) break
    for (const edge of adj[u]) {
      if (parent[edge.to] === -1) {
        parent[edge.to] = u
        queue.push(edge.to)
      }
    }
  }
  if (parent[target] === -1) return null
  const path: number[] = []
  let cur = target
  while (cur !== source) {
    path.push(cur)
    cur = parent[cur]
  }
  path.push(source)
  path.reverse()
  return path
}

/** 找到 BFS 中从 prev 走向 node 的那条边及其出处。 */
function edgeOriginBetween(graph: Graph, prev: number, node: number): EdgeOrigin {
  const edge = graph.adj[prev].find((e) => e.to === node)
  if (!edge) throw new Error(`蕴含图中缺少边 ${prev}→${node}`)
  return edge.origin
}

function pathToSteps(graph: Graph, nodePath: number[], ids: string[]): WitnessStep[] {
  const steps: WitnessStep[] = []
  for (let i = 1; i < nodePath.length; i++) {
    const u = nodePath[i - 1]
    const v = nodePath[i]
    steps.push({
      fromShutterId: ids[u >> 1],
      fromState: nodeState(u),
      shutterId: ids[v >> 1],
      toState: nodeState(v),
      origin: edgeOriginBetween(graph, u, v),
    })
  }
  return steps
}

export interface SolveInput {
  /** 已按 UTF-8 字节序排好的快门 ID。 */
  ids: string[]
  rules: Rule[]
  /** 锁定的快门 -> 被强制的状态。 */
  lockedStates: Record<string, ShutterState>
  /** 认证时的当前状态，用于计算“改动列表”。 */
  currentStates: Record<string, ShutterState>
}

export function solve2Sat(input: SolveInput): CertResult {
  const { ids, rules, lockedStates, currentStates } = input
  const { graph } = buildGraph(ids, rules, lockedStates)
  const varCount = ids.length
  const baseComp = computeScc(graph)

  if (!isConsistent(baseComp, varCount)) {
    // ID 最小且正反文字处于同一 SCC 的快门。ids 已按 UTF-8 字节序排列。
    let conflictVar = -1
    for (let i = 0; i < varCount; i++) {
      if (baseComp[i * 2] === baseComp[i * 2 + 1]) {
        conflictVar = i
        break
      }
    }
    const openNode = conflictVar * 2
    const closedNode = conflictVar * 2 + 1
    // 同 SCC 保证双向可达；每条边都携带原规则（或锁定）出处。
    const pOC = shortestPath(graph, openNode, closedNode)!
    const pCO = shortestPath(graph, closedNode, openNode)!
    const unsat: CertUnsatResult = {
      satisfiable: false,
      conflictId: ids[conflictVar],
      pathOpenToClosed: pathToSteps(graph, pOC, ids),
      pathClosedToOpen: pathToSteps(graph, pCO, ids),
    }
    return unsat
  }

  /**
   * 字典序最小方案：变量按 UTF-8 顺序，每个变量先尝试 CLOSED。
   * “尝试”= 在已确定文字之外再加入该假设并复查 2-SAT；可行即提交，否则 OPEN。
   * 提交时沿蕴含边传播所有被连带决定的快门，保证后续尝试不会破坏前缀最优。
   */
  const assigned: Array<ShutterState | null> = Array(varCount).fill(null)
  const forcedNodes: number[] = []

  const commit = (seed: number) => {
    const { reached } = propagate(graph, [...forcedNodes, seed], assigned)
    for (let node = 0; node < graph.n; node++) {
      if (!reached[node]) continue
      const varIndex = node >> 1
      if (assigned[varIndex] === null) {
        assigned[varIndex] = nodeState(node)
        forcedNodes.push(node)
      }
    }
  }

  for (let i = 0; i < varCount; i++) {
    if (assigned[i] !== null) continue
    for (const candidate of ['CLOSED', 'OPEN'] as ShutterState[]) {
      const node = litNode(i, candidate)
      const { contradiction } = propagate(graph, [...forcedNodes, node], assigned)
      if (contradiction) continue
      const comp = sccWithAssumptions(graph, forcedNodes.map((n) => ({ node: n })).concat({ node }))
      if (isConsistent(comp, varCount)) {
        commit(node)
        break
      }
    }
    if (assigned[i] === null) {
      // 理论上不可达：基础图可满足时，OPEN/CLOSED 至少有一个可行。
      throw new Error(`求解器内部错误：快门 ${ids[i]} 无法赋值`)
    }
  }

  const assignment: Record<string, ShutterState> = {}
  const changes: ChangeEntry[] = []
  ids.forEach((id, i) => {
    const to = assigned[i]!
    assignment[id] = to
    const from = currentStates[id]
    if (from !== undefined && from !== to) {
      changes.push({ id, from, to })
    }
  })

  const sat: CertSatResult = { satisfiable: true, assignment, changes }
  return sat
}
