/** 首次打开工作台时放入导入框的示例文档，用户可直接“导入”或改写。 */
export const SAMPLE_DOCUMENT = `# 快门声明（每行一个 ID）
S1
S2
S3
S4

# 二元规则：ID 状态 ID 状态（两文字至少一个成立）
S1 CLOSED S2 OPEN
S2 CLOSED S1 OPEN
S3 CLOSED S4 CLOSED
`
