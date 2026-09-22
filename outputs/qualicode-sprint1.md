# QualiCode Sprint 1 交付记录

**日期**：2026-09-19  
**目标**：完成 `.docx` 和文字型 `.pdf` 上传、纯文本提取、用户核对和确认锁定。

## 已完成

### 产品

- 第一版只支持 `.docx` 和文字型 `.pdf`。
- 扫描版 PDF 明确提示不支持 OCR，不会静默返回空文本。
- 文件解析完成后先进入文本核对阶段，用户可以修改转写文本。
- 点击“确认文本并锁定”后写入 `confirmedText`，全文编辑入口消失。
- 解析警告会在核对页面展示，便于研究者判断段落、MIME 或文档质量问题。

### 后端

- `POST /api/convert` 接收单个 `multipart/form-data` 文件。
- 使用 `mammoth.extractRawText` 解析 DOCX。
- 使用 `pdf-parse` 解析文字型 PDF，并返回页数。
- 统一换行符，清理尾随空格和过多空行，不做自动语义纠错。
- 限制单文件 10 MB、提取文本 50,000 字符。
- 扩展名和 MIME 类型双重校验，响应设置 `Cache-Control: no-store`。
- 原始文件只存在于请求内存中，不写入服务器目录、数据库或对象存储。

### 前端

- 新增上传控件和转换中状态。
- 上传成功后自动进入纯文本核对页面。
- 支持刷新后恢复核对文本和解析警告。
- 保留模拟访谈入口，便于没有测试文件时验证后续阶段。

### 测试

- 新增 DOCX/PDF 真实解析测试样例。
- 新增 API multipart 上传测试。
- 覆盖空文件、扩展名不支持、MIME 不匹配、文件过大和空提取文本。
- 直接 Node 冒烟测试已验证 mammoth 能提取 DOCX、pdf-parse 能提取 PDF。

## 主要文件

- 解析器：[document-parser.ts](../src/lib/document-parser.ts)
- 上传接口：[route.ts](../src/app/api/convert/route.ts)
- 上传组件：[UploadPanel.tsx](../src/components/UploadPanel.tsx)
- 解析测试：[document-parser.test.ts](../tests/document-parser.test.ts)
- 接口测试：[convert-route.test.ts](../tests/convert-route.test.ts)

## 验证状态

- `npm run typecheck`：通过。
- DOCX/PDF 第三方库 Node 冒烟测试：通过。
- `npm test` 和 `npm run build`：当前沙箱启动 Vitest/esbuild、Next 编译器时触发 `spawn EPERM`，待正常本地或 CI 环境补跑。

## 教学要点

1. `multipart/form-data` 适合浏览器直接上传文件，不需要先把文件转成 Base64。
2. `ArrayBuffer`/`Buffer` 只在请求期间存在，解析结果返回后不依赖服务端会话。
3. 文档解析器和 Route Handler 分离，后续可替换 PDF 库而不改变前端接口。
4. 解析阶段不自动纠正原文，研究者核对阶段负责决定转写文本是否可用于后续编码。
