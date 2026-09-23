import { describe, expect, it } from 'vitest'
import { parseImport } from '../../src/domain/parse.ts'

function expectErrors(text: string) {
  const r = parseImport(text)
  expect(r.ok).toBe(false)
  return r.ok ? null : r.errors
}

describe('parseImport 导入校验', () => {
  it('接受合法文档并按出现顺序编号规则', () => {
    const r = parseImport('A\nB\nC\nA OPEN B CLOSED\n# comment\nC closed B OPEN\n')
    // 注意 closed 小写应为非法状态
    expect(r.ok).toBe(false)

    const ok = parseImport('A\nB\nC\nA OPEN B CLOSED\n# comment\nC CLOSED B OPEN\n')
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.document.shutterIds).toEqual(['A', 'B', 'C'])
    expect(ok.document.rules.map((x) => x.index)).toEqual([1, 2])
    expect(ok.document.rules[0]).toMatchObject({ aId: 'A', aState: 'OPEN', bId: 'B', bState: 'CLOSED' })
  })

  it('拒绝未知 ID', () => {
    const errors = expectErrors('A\nB\nA OPEN X CLOSED\n')
    expect(errors?.some((e) => e.message.includes('未知快门'))).toBe(true)
  })

  it('拒绝规则内重复快门', () => {
    const errors = expectErrors('A\nB\nA OPEN A CLOSED\n')
    expect(errors?.some((e) => e.message.includes('重复引用同一快门'))).toBe(true)
  })

  it('拒绝非法状态（大小写严格）', () => {
    const errors = expectErrors('A\nB\nA open B CLOSED\n')
    expect(errors?.some((e) => e.message.includes('非法状态'))).toBe(true)
  })

  it('拒绝重复声明的快门 ID', () => {
    const errors = expectErrors('A\nB\nA\nA OPEN B OPEN\n')
    expect(errors?.some((e) => e.message.includes('重复声明'))).toBe(true)
  })

  it('拒绝词数无法识别的行', () => {
    const errors = expectErrors('A\nB\nA OPEN B\n')
    expect(errors?.length).toBeGreaterThan(0)
  })

  it('快门数量越界时拒绝', () => {
    const one = parseImport('A\n')
    expect(one.ok).toBe(false)
    const many = Array.from({ length: 301 }, (_, i) => `S${i}`).join('\n')
    expect(parseImport(many).ok).toBe(false)
  })

  it('规则超过 3000 条时拒绝', () => {
    const decl = ['A', 'B'].join('\n') + '\n'
    const rules = Array.from({ length: 3001 }, () => 'A OPEN B OPEN').join('\n')
    // 允许重复规则，但总数超限
    expect(parseImport(decl + rules).ok).toBe(false)
  })

  it('允许重复规则本身', () => {
    const r = parseImport('A\nB\nA OPEN B OPEN\nA OPEN B OPEN\n')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.document.rules).toHaveLength(2)
  })

  it('空行与 # 注释被忽略，CRLF 可解析', () => {
    const r = parseImport('# header\r\nA\r\n\r\nB\r\nA CLOSED B OPEN\r\n')
    expect(r.ok).toBe(true)
  })
})
