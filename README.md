# 快门联锁认证工作台（Shutter Interlock Workbench）

同步辐射束线调试前，用于确认快门 OPEN/CLOSED 组合不会破坏联锁的**纯前端、离线**工作台。
不依赖任何后端或外部 CDN：TypeScript + React + Vite 构建为静态页面，
Docker Compose 以名为 `web` 的 nginx 服务托管。

## 启动

```bash
# 方式一：Docker Compose（推荐，产出 http://localhost:8080）
docker compose up --build

# 方式二：本地开发
npm install
npm run dev        # http://localhost:5173

# 方式三：本地预览生产构建
npm run build && npm run preview   # http://localhost:8080
```

## 数据模型与导入格式

每行按空白分词（ID 本身不得含空白）；空行与 `#` 开头的注释忽略。

- **快门声明**：1 个词，即快门 ID（2–300 个，唯一、大小写敏感）。
- **二元规则**：4 个词 `ID 状态 ID 状态`，状态仅允许 `OPEN` / `CLOSED`，
  至多 3000 条，含义为“两个文字至少一个成立”（2-子句）。
- **整份拒绝**：未知 ID、规则内重复引用同一快门、非法状态、重复 ID、
  词数无法识别、快门/规则数量越界——出现任一错误即拒绝整份导入，
  页面列出全部错误并**完整保留当前工作区**。

## 工作流

1. 在导入框粘贴/编辑文档 → **校验并导入**（快门表初始化为全 CLOSED）。
2. 在快门表中调整 OPEN/CLOSED；可对任意快门勾选**临时锁定**
  （锁定后取当前状态，认证时作为单元约束强制满足）。
3. **运行认证**：
   - **可行**：按 ID 的 **UTF-8 字节序**、每个快门 **CLOSED 优先**，
     给出**字典序最小的完整方案**，并列出相对当前表的改动；可一键**采纳**写入快门表。
   - **无解**：选择 ID（UTF-8 字节序）最小且 OPEN/CLOSED 两个文字
     处于同一强连通分量的快门，给出 `OPEN→CLOSED` 与 `CLOSED→OPEN`
     两条蕴含见证路径；**每一步都标注其出处**（原始规则编号 `#n`，
     或操作员锁定约束），可逐条回到规则复核。
4. **失效控制**：规则（重新导入）、锁定或快门状态一旦变化，旧认证预览
   立即标记失效，采纳与“下载认证采纳稿”按钮禁用，必须重新认证。
5. **下载**：当前快门表随时可下载；认证采纳稿仅在预览有效时可下载，
   文件内容（`ID<TAB>状态`，按 UTF-8 字节序）与屏幕方案**逐行一致**。

## 求解器（src/domain/solver.ts）

- 每个快门两个文字节点；规则 `a∨b` 产生蕴含边 `¬a→b`、`¬b→a`，
  锁定产生单元边 `¬s→s`。
- 用迭代 Kosaraju 求强连通分量（SCC）：任一快门的正反文字同 SCC 即无解。
- 字典序最小方案：变量按 UTF-8 字节序，依次尝试 CLOSED；在已确定前缀上
  追加该假设并复查 SCC，可行即提交并沿蕴含边传播连带决定的快门，
  否则取 OPEN。这是 2-SAT 字典序最优解的标准精确算法。
- 见证路径在蕴含图上 BFS 求最短路径，边携带原规则序号，保证每步可溯源。

## 测试

```bash
npm test          # Vitest 单元测试（含小规模穷举）
npm run e2e       # Playwright，仅一条端到端主流程
```

- `tests/unit/solver.exhaustive.test.ts`：n=3 时枚举**全部 4096 种规则组合 ×
  全部锁定组合**（约 3.7 万实例），逐一与独立暴力解核对可行性、
  字典序最小完整方案、改动清单；无解时在独立重建的蕴含图上 BFS 验证
  双向可达性、冲突快门最小性，并逐步验证见证边真实存在且指回正确出处。
- `tests/unit/parse.test.ts`：各类整份拒绝情形与合法边界。
- `tests/unit/utf8.test.ts`：UTF-8 字节序（含非 ASCII、前缀关系）。
- `tests/e2e/main-flow.spec.ts`：单条线性主流程——非法导入被拒保留空工作区 →
  合法导入 → 认证最小方案 → 锁定/状态变化使旧预览失效 → 采纳 →
  下载稿与屏幕逐行一致 → 制造环状矛盾 → 冲突闭环双向见证逐条指回原规则。

> 注：在无 root 的精简容器中运行 Playwright 若报 `libnspr4.so` 等缺失，
> 可用 `apt download` 取对应架构的 Debian 运行库解包到用户目录，
> 再以 `LD_LIBRARY_PATH=<库目录> npm run e2e` 运行；应用本身不需要这些库。

## 目录

```
src/domain/      类型、UTF-8 序、导入解析、2-SAT 求解器、导出
src/components/  见证路径与认证结果面板
src/App.tsx      工作台状态容器（原子导入、失效控制、采纳与下载）
tests/unit/      Vitest（含穷举）
tests/e2e/       Playwright 单主流程
Dockerfile / nginx.conf / docker-compose.yml   web 静态服务
```
