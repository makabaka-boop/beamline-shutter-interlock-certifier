import { expect, test } from '@playwright/test'

/**
 * 唯一的一条端到端主流程（线性、单次）：
 * 非法导入被拒且保留空工作区 → 合法导入 → 认证得到可执行快门表 →
 * 规则/锁定变化立即使旧预览失效 → 采纳 → 下载稿与屏幕逐行一致 →
 * 改状态加锁定制造环状矛盾 → 认证给出可逐条指回原规则的冲突闭环。
 */

const BAD_DOCUMENT = `S1
S2
S1 OPEN X CLOSED
`

const VALID_DOCUMENT = `S1
S2
S3
S4
S1 OPEN S2 OPEN
S3 CLOSED S4 CLOSED
`

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('快门联锁主流程：导入、最小方案认证、失效、采纳下载、冲突见证', async ({ page }) => {
  // ---------- 1. 非法导入必须被整份拒绝，工作区保持为空 ----------
  await page.getByTestId('import-text').fill(BAD_DOCUMENT)
  await page.getByTestId('import-btn').click()
  await expect(page.getByTestId('import-errors')).toBeVisible()
  await expect(page.getByTestId('import-errors')).toContainText('未知快门')
  await expect(page.getByTestId('empty-hint')).toBeVisible()

  // ---------- 2. 合法导入：4 个快门、2 条规则 ----------
  await page.getByTestId('import-text').fill(VALID_DOCUMENT)
  await page.getByTestId('import-btn').click()
  await expect(page.getByTestId('import-ok')).toBeVisible()
  await expect(page.getByTestId('shutter-table')).toBeVisible()
  await expect(page.getByTestId('rule-item')).toHaveCount(2)

  // ---------- 3. 认证：CLOSED 优先字典序最小方案 ----------
  // R1 S1 OPEN∨S2 OPEN 在 CLOSED 优先下迫使 S2=OPEN；S1/S3/S4 保持 CLOSED。
  await page.getByTestId('cert-btn').click()
  const cert = page.getByTestId('cert-result')
  await expect(cert).toBeVisible()
  await expect(cert).toHaveAttribute('data-sat', 'true')

  const solutionTable = page.getByTestId('solution-table')
  await expect(solutionTable.locator('tr')).toHaveCount(5) // 表头 + 4 行
  const expectedSolution: Array<[string, string]> = [
    ['S1', 'CLOSED'],
    ['S2', 'OPEN'],
    ['S3', 'CLOSED'],
    ['S4', 'CLOSED'],
  ]
  for (const [id, state] of expectedSolution) {
    const row = solutionTable.locator('tbody tr').filter({
      has: page.locator('td', { hasText: new RegExp(`^${id}$`) }),
    })
    await expect(row).toHaveCount(1)
    await expect(row.locator('[data-testid="solution-state"]')).toHaveText(state)
  }
  // 改动清单相对全 CLOSED 当前表只有一项。
  await expect(page.getByTestId('change-list')).toContainText('S2：CLOSED → OPEN')

  // ---------- 4. 锁定变化立即使旧预览失效 ----------
  const s3Lock = page.getByTestId('shutter-row').filter({ hasText: 'S3' }).getByTestId('lock-toggle')
  await s3Lock.check()
  await expect(page.getByTestId('stale-banner')).toBeVisible()
  await expect(page.getByTestId('adopt-btn')).toBeDisabled()
  await expect(page.getByTestId('download-preview-btn')).toBeDisabled()
  // 锁定时状态选择器不可直接改。
  await expect(
    page.getByTestId('shutter-row').filter({ hasText: 'S3' }).getByTestId('state-select'),
  ).toBeDisabled()
  // 解除锁定不会自动“复活”旧预览，必须重新认证。
  await s3Lock.uncheck()
  await expect(page.getByTestId('stale-banner')).toBeVisible()
  await page.getByTestId('cert-btn').click()
  await expect(page.getByTestId('stale-banner')).toHaveCount(0)

  // ---------- 5. 采纳：快门表写入，出现已采纳标识 ----------
  await page.getByTestId('adopt-btn').click()
  await expect(page.getByTestId('adopted-banner')).toBeVisible()
  const s2Select = page
    .getByTestId('shutter-row')
    .filter({ hasText: 'S2' })
    .getByTestId('state-select')
  await expect(s2Select).toHaveValue('OPEN')

  // ---------- 6. 采纳稿下载内容必须与屏幕方案逐行一致 ----------
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-preview-btn').click(),
  ])
  expect(download.suggestedFilename()).toBe('shutter-certified.txt')
  const stream = await download.createReadStream()
  const content = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (c: Buffer) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.on('error', reject)
  })
  expect(content).toBe('S1\tCLOSED\nS2\tOPEN\nS3\tCLOSED\nS4\tCLOSED\n')

  // ---------- 7. 制造环状矛盾：S1、S2 都被锁定为 CLOSED，违反 R1 ----------
  // 先把采纳后为 OPEN 的 S2 改回 CLOSED（状态变化同样使旧预览失效），再锁定两扇。
  await s2Select.selectOption('CLOSED')
  await expect(page.getByTestId('stale-banner')).toBeVisible()
  await page
    .getByTestId('shutter-row')
    .filter({ hasText: 'S1' })
    .getByTestId('lock-toggle')
    .check()
  await page
    .getByTestId('shutter-row')
    .filter({ hasText: 'S2' })
    .getByTestId('lock-toggle')
    .check()
  await page.getByTestId('cert-btn').click()

  // ---------- 8. 冲突闭环：最小冲突快门 S1，双向见证，每步指回出处 ----------
  await expect(cert).toHaveAttribute('data-sat', 'false')
  await expect(page.getByTestId('conflict-id')).toHaveText('S1')

  const paths = page.getByTestId('witness-path')
  await expect(paths).toHaveCount(2)

  // OPEN→CLOSED：锁定直接禁止 OPEN，一步闭环。
  const openToClosed = paths.nth(0)
  await expect(openToClosed).toContainText('假设 S1 = OPEN')
  await expect(openToClosed.locator('.witness-step')).toHaveCount(1)
  await expect(openToClosed).toContainText('S1 = CLOSED')
  await expect(openToClosed).toContainText('锁定')

  // CLOSED→OPEN：S1 CLOSED 经规则 #1 逼出 S2 OPEN，锁定逼回 S2 CLOSED，
  // 再经规则 #1 得到 S1 OPEN——每个规则步都指回原规则编号。
  const closedToOpen = paths.nth(1)
  await expect(closedToOpen).toContainText('假设 S1 = CLOSED')
  await expect(closedToOpen.locator('.witness-step')).toHaveCount(3)
  await expect(closedToOpen).toContainText('规则 #1')
  const ruleBackRefs = closedToOpen.getByText('规则 #1')
  await expect(ruleBackRefs).toHaveCount(2)
  await expect(closedToOpen.locator('.witness-step').last()).toContainText('S1 = OPEN')

  // 最终页面呈现的是可逐条复核的冲突闭环，而非可执行表。
  await expect(page.getByTestId('adopt-btn')).toHaveCount(0)
})
