# QualiCode

QualiCode 是一个面向心理学访谈质性研究的 AI 辅助编码工具。项目按扎根理论的阶段顺序组织工作流：文本核对、开放编码、轴心编码、选择性编码和结果导出。

## 当前状态

Sprint 0 至 Sprint 7 已完成基础实现：

- Next.js App Router + React + TypeScript；
- `sessionStorage` 会话恢复；
- `confirmedText` 锁定规则；
- 单条开放编码修订和原文证据保留；
- 轴心/选择性分析的 `stale` 失效规则；
- 统一 API 响应结构；
- `POST /api/codes/edit` 契约和基础测试；
- 模拟访谈会话，用于验证底层流程。
- `POST /api/convert` 文件转换接口；
- `mammoth` DOCX 纯文本提取；
- `pdf-parse` 文字型 PDF 提取和页数识别；
- 文件扩展名、MIME、大小、空文本和扫描版 PDF 校验；
- 上传后的纯文本核对页面和解析警告展示。
- 锁定文本上的人工语义片段划选、高亮、重叠编码、编辑、软删除和恢复。
- 开放编码完成与确认门禁，确认前不能进入轴心编码。
- 两页产品界面：首页介绍项目并提供上传入口；工作台顶部固定文件栏，按文本读取、文本确认、DeepSeek 分析、结果复核顺序展示内容。
- `POST /api/analyze/open`：服务端调用 DeepSeek 进行开放编码，要求引用能定位回锁定原文；无法定位的建议单独列出，不直接伪造高亮。
- DeepSeek 分析必须由用户明确点击确认，API Key 只从服务端 `DEEPSEEK_API_KEY` 读取。
- 开放编码建议支持逐条接受、修改、删除和确认门禁。
- 临时 Chunk、Top-K 证据检索和 `POST /api/evidence/search` 已接入，检索结果不持久化。
- `POST /api/analyze/axial` 已接入，支持类别、关系假设、反例、证据定位和 stale 复核。
- `POST /api/analyze/selective` 已接入，支持核心类别、理论故事线、工作命题、关系假设、支持证据、矛盾证据和研究者复核问题。
- 选择性编码采用受限单步 workflow：每次请求最多一次 DeepSeek 调用、45 秒超时、临时 Top-K 证据上下文和服务端证据定位。
- 选择性编码确认后才进入 `EXPORT`；上游开放编码修改会使轴心和选择性结果 stale，并回到轴心复核入口。
- `EXPORT` 阶段支持浏览器端 Markdown/JSON 导出；只有确认选择性编码后才能下载，导出只包含已确认的开放编码，并附带隐私边界和研究限制说明。
- 工作台提供“清除并返回首页”，用于删除当前标签页中的文本、编码、证据和分析结果。
- 可通过服务端 `QUALICODE_ACCESS_CODE` 开启共享访问码；访问凭证只以 HttpOnly Cookie 保存，不进入前端 bundle；访问码验证增加单实例限流。
- 上传、证据检索、编码编辑和 AI 分析接口提供单实例内存限流；`/api/health` 提供脱敏健康检查。

## 本地启动

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`，点击“上传访谈文件”进入工作台。未配置 `DEEPSEEK_API_KEY` 时，文本读取、确认和导出仍可验证，分析接口会明确返回配置提示。

### 环境变量

复制 `.env.example` 为 `.env.local`，按需填写服务端变量：

```bash
DEEPSEEK_API_KEY=your-server-side-key
DEEPSEEK_MODEL=deepseek-chat
QUALICODE_ACCESS_CODE=optional-shared-code
```

`.env.local`、本地构建产物、依赖目录、运行日志和 `work/` 内部过程记录不会提交到仓库。请不要把真实访谈材料、个人信息或 API 密钥提交到 Git。

## 常用命令

```bash
npm run typecheck
npm test
npm run build
```

## 隐私边界

第一版不建立业务数据库、云端文件存储或长期向量数据库。浏览器会话只写入当前标签页的 `sessionStorage`，关闭标签页后不会跨设备恢复；共用电脑上完成工作后应主动清除当前会话。点击 DeepSeek 分析后，访谈文本会发送给配置的第三方模型服务，产品页面必须明确展示这一点，不能宣传绝对的“云端零存储”。Markdown/JSON 导出由浏览器本地生成，不提供服务端下载 URL；导出文件仍可能包含敏感原文，需要研究者自行加密、管理和删除。
