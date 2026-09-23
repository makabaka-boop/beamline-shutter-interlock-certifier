/**
 * 按 ID 的 UTF-8 字节序比较字符串。
 * 与字典序的差异主要体现在非 ASCII 字符上（如 '中' 的字节大于 'a'），
 * 全部规格中的“最小 ID”均以此比较为准。
 */
export function compareUtf8(a: string, b: string): number {
  const ba = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  const len = Math.min(ba.length, bb.length)
  for (let i = 0; i < len; i++) {
    if (ba[i] !== bb[i]) return ba[i] - bb[i]
  }
  return ba.length - bb.length
}

export function sortByUtf8<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((x, y) => compareUtf8(key(x), key(y)))
}
