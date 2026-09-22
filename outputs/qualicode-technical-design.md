# QualiCode 技术方案设计

**版本**：0.2 MVP
**日期**：2026-09-19
**对应 PRD**：[qualicode-prd.md](./qualicode-prd.md)
**状态**：Sprint 6 已实现轴心与选择性编码 API、证据复核、确认门禁和受限单步 workflow。

## 1. 技术目标

技术方案围绕四个约束设计：

1. 最小 MVP，优先验证“文件转文本 → 用户核对 → AI 分阶段编码”；
2. 尽量不引入数据库、对象存储和长期向量库；
3. 前后端接口和数据模型先统一，方便四个角色联调；
4. 让 RAG、Agent 和 AI 评估在真实项目中可解释、可测试、可教学。

## 2. 推荐技术栈

### 2.1 应用层

- 前端：React + TypeScript；
- 全栈框架：Next.js App Router；
- 服务端接口：Next.js Route Handlers；
- 样式：CSS Modules 或局部 CSS，避免引入过多 UI 依赖；
- 图标：Lucide React；
- 校验：Zod；
- 测试：Vitest/Node 测试 + Playwright；
- 部署候选：Vercel 或其他支持 Next.js 无状态函数的平台。

### 2.2 文件处理

- `.docx`：`mammoth` 提取纯文本；
- 文字型 `.pdf`：PDF 文本解析适配器，首选 `pdf-parse` 或 `pdfjs-dist`，在 Sprint 1 通过真实样本验证；
- 不支持扫描版 PDF OCR；
- 文件只作为请求内存中的 `ArrayBuffer/Buffer` 处理，不落盘。

### 2.3 AI 服务

- 第一版模型：DeepSeek API；
- 服务端通过 `fetch` 调用模型 API；
- API Key 仅存在服务端环境变量；
- 输出采用结构化 JSON；
- 使用 Zod 做响应校验；
- 模型输出不通过前端直接转发或暴露密钥。

## 3. 总体架构

```text
┌──────────────────────────────┐
│          浏览器前端            │
│                              │
│ 上传 / 文本核对 / 划词编码       │
│ 阶段状态 / sessionStorage      │
│ 结果预览 / 浏览器端下载          │
└───────────────┬──────────────┘
                │ HTTPS JSON / multipart
┌───────────────▼──────────────┐
│       Next.js Route Handlers  │
│                              │
│ /api/convert                 │
│ /api/analyze/open            │
│ /api/evidence/search         │
│ /api/analyze/axial           │
│ /api/codes/edit              │
│ /api/analyze/axial          │
│ /api/analyze/selective       │
│ /api/health                  │
└───────┬──────────────┬───────┘
        │              │
        │              └──────────────┐
        │                             │
┌───────▼──────────┐          ┌───────▼──────────┐
│ 文件解析适配器      │          │ AI Workflow       │
│ DOCX / PDF       │          │ RAG + Agent       │
└──────────────────┘          └───────┬──────────┘
                                      │
                              ┌───────▼──────────┐
                              │ DeepSeek API      │
                              └──────────────────┘
```

## 4. 无状态和数据生命周期

### 4.1 请求处理原则

每个接口都应该是无状态的：

- 请求携带当前阶段所需的文本和编码；
- 服务端请求内构建临时对象；
- 返回结构化结果；
- 请求结束后不依赖服务端内存继续恢复；
- 不使用服务器本地目录保存上传文件；
- 不使用数据库存储会话。

这样做的代价是：轴心和选择性编码请求需要携带当前文本及已确认编码，可能增加请求体大小，但能最大限度减少存储成本和隐私风险。

### 4.2 浏览器会话模型

```ts
interface SessionSnapshot {
  schemaVersion: 1;
  sessionId: string;
  stage: Stage;
  document: SourceDocument | null;
  draftText: string;
  confirmedText: string;
  textVersion: string;
  textLocked: boolean;
  parseWarnings: ParseWarning[];
  openCodes: CodeLabel[];
  codeEditHistory: CodeEdit[];
  axialAnalysis: AxialAnalysis | null;
  selectiveAnalysis: SelectiveAnalysis | null;
  axialFreshness: AnalysisFreshness;
  selectiveFreshness: AnalysisFreshness;
  updatedAt: string;
}
```

保存策略：

- 每次状态变更后节流写入 `sessionStorage`；
- `confirmedText` 在确认后只读；单条编码修订保存到编码记录，不回写全文；
- 轴心编码完成后修改开放编码，标记 `axialAnalysis` 和 `selectiveAnalysis` 为 stale；
- 页面加载时尝试恢复；
- JSON 解析失败时清除损坏快照并提示；
- 超过浏览器存储配额时提示导出，不把数据上传到其他存储；
- 关闭标签页后数据自然失效。

状态约束：

- `textLocked` 只能在文本核对完成时从 `false` 变为 `true`；
- `textLocked === true` 时，任何前端全文编辑动作都必须被拒绝；
- 单条编码修订只更新 `CodeLabel` 和 `CodeEdit`，不得更新 `confirmedText`；
- 如果修改发生在轴心编码完成后，`axialFreshness` 和 `selectiveFreshness` 变为 `stale`；
- `selectiveFreshness.status !== "confirmed"` 时，选择性编码入口不可用。

## 5. 前端模块设计

```text
src/
  app/
    page.tsx
    layout.tsx
    globals.css
    api/
      convert/route.ts
      analyze/open/route.ts
      analyze/axial/route.ts
      analyze/selective/route.ts
  components/
    WorkspaceShell.tsx
    UploadPanel.tsx
    TextReviewPanel.tsx
    CodingWorkspace.tsx
    CodeEditDialog.tsx
    OriginalEvidencePanel.tsx
    StaleAnalysisBanner.tsx
    CodeList.tsx
    AxialAnalysisPanel.tsx
    SelectiveAnalysisPanel.tsx
    ExportPanel.tsx
    PrivacyNotice.tsx
  lib/
    domain-types.ts
    session-storage.ts
    span-anchoring.ts
    api-client.ts
    export-result.ts
```

### 5.1 状态管理

第一版不引入 Redux。使用：

- React `useReducer` 管理工作区状态；
- `useEffect` + `sessionStorage` 做持久化；
- API 请求使用显式的 loading/error 状态；
- 复杂逻辑放入 `lib/`，避免页面组件承担全部业务逻辑。

### 5.2 文本高亮和单条编码修订

编码对象使用字符偏移量：

```ts
interface TextSpan {
  id: string;
  start: number;
  end: number;
  quote: string;
  textVersion: string;
  codeIds: string[];
}
```

重要约定：JavaScript 的 `start/end` 按 UTF-16 code units 计算。前端和后端必须对换行符进行同样的规范化，编码后不得偷偷修改 `confirmedText`。

高亮渲染先按 `start/end` 排序，再处理：

- 不重叠片段；
- 完全包含；
- 部分重叠；
- 同一片段多个标签。

MVP 对部分重叠采用“原文高亮 + 标签堆叠”策略，不尝试把重叠片段拆成复杂 DOM 嵌套。

确认文本后，全文阅读区使用只读渲染，不再提供全文编辑器。用户点击某一条编码后打开 `CodeEditDialog`，同时看到锁定文本中的原文片段、当前开放编码、AI 解释和修订字段。修订只更新编码对象，不修改 `confirmedText`。

## 6. 后端 API 设计

统一响应：

```ts
interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    requestId: string;
  } | null;
}
```

### 6.1 `POST /api/convert`

请求：`multipart/form-data`

```text
file: File
```

响应：

```ts
interface ConvertResult {
  document: SourceDocument;
  rawExtractedText: string;
  warnings: ParseWarning[];
}
```

约束：

- 扩展名和 MIME 双重校验；
- 文件大小上限；
- 只支持一个文件；
- 设置 `Cache-Control: no-store`；
- 不把原始文件名直接拼入服务器路径；
- 不记录文件内容到日志。

### 6.2 `POST /api/codes/edit`

该接口用于校验和保存单条编码修订，不修改全文。

请求：

```ts
interface CodeEditRequest {
  text: string;
  textVersion: string;
  codeId: string;
  originalQuote: string;
  editedQuote?: string;
  editedLabel?: string;
  currentStage: "OPEN_REVIEW" | "AXIAL_REVIEW" | "SELECTIVE_CODING";
}
```

服务端必须验证：

- `originalQuote` 仍然存在于 `text`；
- `textVersion` 与请求文本一致；
- `editedQuote` 不能被伪装成全文修改；
- 如果 `currentStage` 已经完成轴心编码，响应必须返回下游失效提示；
- 原始证据和修订内容都进入 `CodeEdit` 记录。

响应：

```ts
interface CodeEditResult {
  code: CodeLabel;
  edit: CodeEdit;
  invalidatedStages: ("AXIAL" | "SELECTIVE")[];
  beforeStage: "OPEN_REVIEW" | "AXIAL_REVIEW" | "SELECTIVE_CODING";
}
```

### 6.3 `POST /api/evidence/search`

请求携带已锁定文本、textVersion、查询词和可选 Top-K。服务端在请求内构建 chunks，执行关键词/中文双字符检索，返回证据片段；不写入持久化存储。

### 6.4 `POST /api/analyze/open`

请求：

```ts
interface OpenCodingRequest {
  text: string;
  textLocked: true;
  textVersion: string;
  researchQuestion?: string;
  options?: {
    maxSuggestions: number;
    language: "zh-CN";
  };
}
```

响应：

```ts
interface OpenCodingResult {
  suggestions: CodingSuggestion[];
  unanchoredSuggestions: CodingSuggestion[];
  usage?: ModelUsage;
}
```

### 6.5 `POST /api/analyze/axial`

请求：

```ts
interface AxialCodingRequest {
  text: string;
  textLocked: true;
  textVersion: string;
  confirmedOpenCodes: CodeLabel[];
  researchQuestion?: string;
}
```

响应：

```ts
interface AxialAnalysis {
  categories: AxialCategory[];
  relationHypotheses: RelationHypothesis[];
  counterEvidence: Evidence[];
  reviewQuestions: string[];
}
```

### 6.6 `POST /api/analyze/selective`

请求：

```ts
interface SelectiveCodingRequest {
  text: string;
  textLocked: true;
  textVersion: string;
  confirmedOpenCodes: CodeLabel[];
  confirmedAxialAnalysis: AxialAnalysis;
  researchQuestion?: string;
}
```

响应：

```ts
interface SelectiveAnalysis {
  coreCategory: string;
  storyline: string;
  propositions: string[];
  relationHypotheses: RelationHypothesis[];
  evidenceIds: string[];
  contradictions: Evidence[];
  unanchoredEvidence: UnanchoredEvidence[];
  reviewQuestions: string[];
  generatedAt: string;
}
```

Sprint 6 的实现约束：

- 请求必须携带 `textLocked: true`、匹配的 `textVersion`、状态为 `accepted/edited` 的开放编码和已确认轴心分析；
- 服务端重新校验开放编码原文位置、轴心类别/关系引用和轴心反例证据；
- 选择性输出包含核心类别、理论故事线、工作命题、关系假设、支持证据、矛盾证据和研究者复核问题；
- 所有关系统一标记为 `hypothesis`，不能直接表达为已验证因果关系；
- 服务端在请求内执行临时 Top-K 检索，并最多调用 DeepSeek 一次，超时边界为 45 秒；
- 无法定位的模型证据进入 `unanchoredEvidence`，不会伪造原文高亮。

## 7. 文档解析方案

### 7.1 DOCX

处理步骤：

```text
ArrayBuffer
  → mammoth.extractRawText
  → 换行规范化
  → 空行压缩
  → 生成段落/来源信息
  → 返回纯文本
```

MVP 不保留 Word 样式，因为研究分析对象是可核对的纯文本。后续如需保留表格和说话人，可增加段落元数据。

### 7.2 PDF

处理步骤：

```text
ArrayBuffer
  → 逐页提取文本
  → 页面间插入换行
  → 清除明显页眉页脚噪声
  → 保留页码映射
  → 返回纯文本和警告
```

不要在解析阶段做激进的自动纠错。转换后的文本必须由用户核对，AI 语义理解用于编码，不用于悄悄篡改研究材料。

## 8. 语义片段定位方案

模型不可靠地生成字符偏移量，因此不要让模型直接决定 `start/end`。采用以下流程：

编码修订同样不能直接修改全文。`originalQuote` 永远来自锁定的 `confirmedText`；如果研究者需要修正转写语义，保存为 `editedQuote`（研究者修订片段），并在 UI 中并列显示原文和修订内容。`editedQuote` 不是新的研究全文，不会替换 `confirmedText`；它只属于该条编码的修订记录。

```text
模型返回 quote + label + reason
  ↓
服务端在 confirmedText 中查找 quote
  ↓
精确匹配成功：生成 start/end
  ↓
精确匹配失败：统一空白后匹配
  ↓
仍失败：返回 unanchoredSuggestion
  ↓
前端显示“无法自动定位，请手动划选”
```

模型提示要求：

- `quote` 必须逐字复制输入文本；
- 不要改正标点后再输出 quote；
- 不要将多个不连续片段合并成一个 quote；
- 如果只理解了语义但不能定位，明确返回 `needsManualSelection: true`。

后续迭代可以增加基于上下文的模糊定位，但 MVP 不让模糊匹配直接覆盖原文。

## 9. RAG 方案

### 9.1 MVP RAG 定义

第一版 RAG 采用“临时证据检索 + 大模型生成”，不依赖长期向量数据库。

```text
confirmedText
  → 按段落和长度切分 chunks
  → 为每个 chunk 生成稳定 ID
  → 使用字符 n-gram/关键词建立临时倒排索引
  → 根据编码、类别或关系检索证据
  → 将 Top-K 证据放进模型上下文
  → 生成带证据的分析结果
```

这是低成本的词法/字符检索 RAG。它不是最终的语义向量检索，但具备完整的“检索增强生成”闭环，并更适合中文转写错误、无外部向量服务和无存储约束。

### 9.2 Chunk 规则

建议初始参数：

- 优先按段落切分；
- 单块目标 500～900 个中文字符；
- 相邻块重叠 80～120 个字符；
- 每个 chunk 保存 `chunkId/start/end/text`；
- 单次检索返回 Top-K 3～8 个证据片段。

参数必须通过测试样本调整，不在第一版声称适用于所有访谈。

### 9.3 后续语义检索

如果词法检索不足，再考虑：

- 增加本地 embedding 模型；
- 接入独立 embedding 服务；
- 使用外部向量数据库。

这三项都会增加部署体积、成本或隐私边界，不放在 MVP 的关键路径上。

## 10. Agent / Workflow 方案

### 10.1 设计原则

第一版采用受限阶段式 Agent，而不是让模型自由执行任意操作。每个阶段具有：

- 固定输入；
- 固定工具；
- 固定 JSON 输出；
- 最大调用次数；
- 用户确认节点；
- 失败和重试边界。

### 10.2 工作流

```text
OpenCodingWorkflow
  1. splitText
  2. retrieveLocalContext
  3. suggestOpenCodes
  4. anchorQuotes
  5. validateOutput

AxialCodingWorkflow
  1. clusterConfirmedCodes
  2. retrieveEvidenceForClusters
  3. generateAxialRelations
  4. detectCounterEvidence
  5. validateOutput

SelectiveCodingWorkflow
  1. retrieveEvidenceForCategories
  2. proposeCoreCategories
  3. generateStoryline
  4. listContradictions
  5. validateOutput
```

### 10.3 Agent 工具边界

```ts
interface AgentTool {
  name:
    | "retrieve_evidence"
    | "get_confirmed_codes"
    | "find_counter_evidence";
  description: string;
  inputSchema: unknown;
  execute: (input: unknown) => Promise<unknown>;
}
```

Agent 不允许：

- 访问文件系统以外的任意路径；
- 执行 Shell 命令；
- 访问 API Key；
- 自己决定跳过用户确认；
- 修改原始访谈文本；
- 无限循环调用模型。

## 11. DeepSeek 客户端设计

环境变量：

```text
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=...
DEEPSEEK_BASE_URL=...
```

封装：

```ts
interface LlmClient {
  completeJson<T>(input: JsonCompletionInput): Promise<T>;
}
```

客户端必须实现：

- 超时；
- 有限重试；
- 非 2xx 错误转换；
- JSON 解析；
- Zod 校验；
- 模型输出过长截断提示；
- 不把请求正文写入日志；
- `Cache-Control: no-store`。

提示词分层：

```text
system：研究方法、证据原则、输出格式和安全边界
context：当前文本块或 RAG 检索证据
user：当前阶段任务和研究问题
```

## 12. 统一领域类型

```ts
type Stage =
  | "UPLOAD"
  | "TEXT_REVIEW"
  | "OPEN_CODING"
  | "OPEN_REVIEW"
  | "AXIAL_CODING"
  | "AXIAL_REVIEW"
  | "SELECTIVE_CODING"
  | "EXPORT";

interface SourceDocument {
  id: string;
  fileName: string;
  fileType: "docx" | "pdf";
  sizeBytes: number;
  pageCount?: number;
  rawExtractedText: string;
}

interface CodeLabel {
  id: string;
  sourceQuote: string;
  editedQuote?: string;
  sourceSpan: TextSpan;
  name: string;
  kind: "open" | "axial" | "selective";
  status: "suggested" | "accepted" | "edited" | "deleted";
  explanation: string;
  confidence: "low" | "medium" | "high";
  spans: TextSpan[];
  evidenceIds: string[];
  editHistory: CodeEdit[];
}

interface CodeEdit {
  id: string;
  codeId: string;
  originalQuote: string;
  editedQuote?: string;
  originalLabel: string;
  editedLabel?: string;
  editedAt: string;
  invalidatedStages: ("AXIAL" | "SELECTIVE")[];
  beforeStage: "OPEN_REVIEW" | "AXIAL_REVIEW" | "SELECTIVE_CODING";
}

interface Evidence {
  id: string;
  chunkId?: string;
  start: number;
  end: number;
  quote: string;
  relevance: string;
}

interface AnalysisFreshness {
  status: "fresh" | "stale" | "confirmed";
  invalidatedByEditId?: string;
}

interface RelationHypothesis {
  id: string;
  sourceCodeId?: string;
  targetCodeId?: string;
  relation: "condition" | "process" | "strategy" | "consequence" | "association";
  statement: string;
  evidenceIds: string[];
  confidence: "low" | "medium" | "high";
  status: "hypothesis" | "confirmed" | "rejected";
}
```

## 13. 隐私和安全设计

### 13.1 必须实现

- API Key 只在服务端环境变量；
- 前端 bundle 不包含 API Key；
- 解析和分析接口禁用缓存；
- 不记录请求正文、原文和模型上下文；
- 限制文件大小和文本长度；
- 限制单次模型调用次数；
- 接口设置超时；
- 错误信息不返回密钥、完整 prompt 或访谈全文；
- 临时对象请求结束后释放；
- 页面提供脱敏提示和第三方模型声明；
- 下载由浏览器端生成，不提供公开下载 URL。

### 13.2 公开站点的资源滥用风险

因为第一版没有账号体系，公开网址可能被他人反复调用，消耗 DeepSeek 余额。部署前必须在以下方案中选择至少一个：

1. 共享访问码；
2. 仅开放示例数据，真实材料需要访问码；
3. 要求用户填写自己的 API Key，并仅在浏览器使用；
4. 增加账户、验证码或外部限流服务。

MVP 推荐方案：**共享访问码 + 每次请求硬性大小/次数限制**。它成本最低，也不会引入数据库。

## 14. 测试方案

### 14.1 单元测试

- DOCX 文本提取；
- PDF 文本提取；
- 文件扩展名和大小校验；
- 换行规范化；
- `quote` 精确定位；
- 无法定位时的降级；
- 重叠高亮计算；
- 状态机跃迁；
- `sessionStorage` 读写和损坏恢复；
- Zod 响应校验；
- Markdown/JSON 导出。

### 14.2 集成测试

- 上传 → 转文本 → 返回结果；
- 开放编码接口使用模型 mock；
- 编码修订不允许修改 `confirmedText`；
- 轴心编码后开放编码修订会使轴心/选择性结果标记为 stale；
- 轴心编码必须只能使用确认后的开放编码；
- 选择性编码必须只能使用确认后的轴心编码；
- DeepSeek 超时/错误/非法 JSON 的处理。

### 14.3 E2E 测试

- 上传示例 DOCX；
- 上传示例 PDF；
- 修改并确认文本；
- 接受、修改和删除开放编码；
- 编辑一条编码时查看原文证据；
- 轴心编码后编辑开放编码，确认下游失效并重新运行；
- 阶段按钮门禁；
- 刷新后恢复；
- 新浏览器上下文不恢复旧会话；
- 下载结果；
- API Key 不出现在页面源码或网络响应中。

### 14.4 AI 质量评估

准备 3～5 份虚构或公开许可的脱敏访谈样本，建立人工参考编码集，评估：

- 语义片段定位成功率；
- 编码标签可接受率；
- 证据支持率；
- 过度编码率；
- 反例召回率；
- 非因果化表述合规率；
- 平均响应时间；
- 每份材料的估算调用成本。

## 15. 部署设计

推荐先部署为一个 Next.js 应用：

```text
GitHub repository
  → 自动构建
  → Next.js serverless routes
  → 环境变量注入 DeepSeek Key
  → HTTPS 公开网址
```

部署注意：

- 不依赖本地持久化目录；
- 不依赖进程内长期缓存；
- 解析接口只接收小文件；
- 上传和 AI 接口设置 `no-store`；
- 配置开发、预览、生产三套环境变量；
- README 写明第三方 API 数据流和已知限制。

## 16. 技术教学节点

每个 Sprint 需要配套一份教学说明：

- Sprint 0：单仓库、接口契约和状态机；
- Sprint 1：multipart 上传、DOCX/PDF 解析和临时内存处理；
- Sprint 2：React `useReducer`、文本偏移量和高亮渲染；
- Sprint 3：Prompt、DeepSeek API、JSON 输出和 Schema 校验；
- Sprint 4：Chunk、倒排索引、Top-K 检索和证据增强生成；
- Sprint 5：轴心类别、关系假设、证据复核和 stale 失效；
- Sprint 6：选择性编码、核心类别、理论故事线、受限单步 workflow 和用户确认；
- Sprint 7：导出、共享访问码、限流、费用保护、公开部署和 AI 质量评估。

## 17. 技术决策记录

### ADR-001：不使用业务数据库

**决定**：第一版不使用数据库。

**原因**：满足低成本和不持久化要求，降低部署复杂度。

**代价**：无法跨设备恢复、无法保存项目历史，前端请求需要携带当前上下文。

### ADR-002：使用 `sessionStorage`

**决定**：使用 `sessionStorage` 而非 `localStorage` 或 IndexedDB。

**原因**：满足同一标签页刷新保留，关闭标签页后清除。

**代价**：容量有限，关闭标签页后无法恢复。

### ADR-003：先使用本地词法 RAG

**决定**：MVP 使用字符 n-gram/关键词的临时检索，不接长期向量库。

**原因**：零额外存储成本、部署简单、适合中文转写错误。

**代价**：语义检索能力低于成熟 embedding 方案，后续需要评估升级。

### ADR-004：受限 Agent Workflow

**决定**：Agent 只在固定阶段调用有限工具，不做完全自主循环。

**原因**：可解释、可测试、成本可控，符合研究者确认流程。

**代价**：灵活性低于通用 Agent 框架，但更适合 MVP。

## 18. 方案结论

第一版的核心不是堆叠多个 AI 框架，而是把以下闭环做稳：

```text
可信文本
  → 研究者核对
  → 有证据的开放编码
  → 研究者确认
  → 有证据的轴心关系
  → 研究者确认
  → 选择性编码假设
```

RAG 负责让分析回到访谈证据，Agent 负责把多个分析步骤按阶段串起来，研究者始终保留最终判断权。










