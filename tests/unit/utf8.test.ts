import { describe, expect, it } from 'vitest'
import { compareUtf8, sortByUtf8 } from '../../src/domain/utf8.ts'

describe('compareUtf8 UTF-8 字节序', () => {
  it('ASCII 与自然字典序一致', () => {
    expect(compareUtf8('a', 'b')).toBeLessThan(0)
    expect(compareUtf8('S1', 'S10')).toBeLessThan(0)
    expect(compareUtf8('S10', 'S2')).toBeLessThan(0) // 字节序，非数值序
    expect(compareUtf8('A', 'a')).toBeLessThan(0) // 'A'=0x41 < 'a'=0x61
  })

  it('是前缀时短者更小', () => {
    expect(compareUtf8('S1', 'S10')).toBeLessThan(0)
    expect(compareUtf8('abc', 'ab')).toBeGreaterThan(0)
  })

  it('非 ASCII 按 UTF-8 字节比较', () => {
    // '中' UTF-8 为 E4 B8 AD，首字节 0xE4 > 任意 ASCII
    expect(compareUtf8('a', '中')).toBeLessThan(0)
    // '中' E4.. < '开' E5 BC 80
    expect(compareUtf8('中', '开')).toBeLessThan(0)
  })

  it('sortByUtf8 稳定排序', () => {
    const ids = ['S10', 'S2', 'S1', 'a', '中']
    expect(sortByUtf8(ids, (x) => x)).toEqual(['S1', 'S10', 'S2', 'a', '中'])
  })
})
