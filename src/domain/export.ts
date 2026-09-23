import type { ShutterState } from './types'
import { sortByUtf8 } from './utf8'

/**
 * 生成与屏幕快门表逐行一致的纯文本下载稿：
 * 按 ID 的 UTF-8 字节序，每行 “ID\t状态”，不含任何屏幕之外的附加内容。
 */
export function renderTableText(table: Record<string, ShutterState>): string {
  const rows = sortByUtf8(Object.entries(table), ([id]) => id)
  return `${rows.map(([id, state]) => `${id}\t${state}`).join('\n')}\n`
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
