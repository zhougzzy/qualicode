# QualiCode Sprint 0 交付记录

**日期**：2026-09-19  
**目标**：建立可联调的单仓库、数据契约和阶段状态机，冻结“研究文本不可变、编码注释可修订”的核心规则。

## 已完成

### 产品

- 确认文本后写入 `confirmedText`，并将 `textLocked` 设为 `true`。
- 锁定后不允许全文编辑；编码修订只能作用于单条编码。
- 每条编码同时保留锁定文本中的 `sourceQuote` 和研究者修订后的 `editedQuote`。
- 轴心编码确认后修改开放编码，会将轴心和选择性分析标记为 `stale`。
- 只有重新生成并确认上游分析，才能进入下一个分析阶段。

### 前端

- 创建 Next.js App Router 页面和研究流程侧栏。
- 创建模拟访谈会话，用于在没有真实文件解析和模型接口时验证流程。
- 创建文本核对、全文锁定、开放编码证据展示和单条编码修订入口。
- 使用 `sessionStorage` 保存当前标签页会话，刷新后可恢复。

### 后端

- 创建统一 `ApiResponse<T>` 响应结构和错误结构。
- 创建 `/api/convert`、`/api/analyze/open`、`/api/analyze/axial`、`/api/analyze/selective` 占位接口。
- 实现 `POST /api/codes/edit`：校验文本版本、原文证据和下游失效范围。
- 创建服务端环境变量读取模块，预留 `DEEPSEEK_API_KEY` 和访问码。

### 测试

- 添加状态机测试：文本锁定、文本编辑阻止、开放编码门禁、下游 stale 规则。
- 添加 `sessionStorage` 测试：正常读写、损坏快照清理、主动清除。
- 添加编码修订接口测试：证据校验和 stale 元数据。

## 统一联调契约

- 领域类型：`src/lib/domain-types.ts`
- 状态机：`src/lib/state-machine.ts`
- 浏览器会话：`src/lib/session-storage.ts`
- 状态 reducer：`src/lib/state.ts`
- API 响应：`src/lib/api-contract.ts`
- 编码修订接口：`src/app/api/codes/edit/route.ts`

## 尚未完成

项目依赖已经安装，`npm run typecheck` 已通过。`npm test` 和 `npm run build` 在当前 Windows 沙箱中启动 Vitest/esbuild 和 Next 编译器时触发 `spawn EPERM`，因此尚未完成运行时验收；环境允许子进程启动后必须补跑并修正编译或测试问题。

DOCX/PDF 解析、DeepSeek 调用、真实开放编码和 RAG/Agent 工作流不属于 Sprint 0，进入后续 Sprint。

## 教学要点

1. `confirmedText` 是研究证据层，不能因为标签修改而变化。
2. `CodeEdit` 是注释层的变更记录，既保存修改前证据，也保存修改后内容。
3. `stale` 是跨阶段依赖管理：上游变了，下游结果必须重新生成和确认。
4. 无数据库架构降低了存储成本，但要求前端携带完整会话，也不支持跨设备恢复。
