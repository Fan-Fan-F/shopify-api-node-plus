# 改进计划 CHANGES

本项目基于 `MONEI/Shopify-api-node`
进行二次开发增强（路线 A），在维持原有 API 完全向下兼容的前提下，针对原项目的架构已知缺陷、缺少现代 Shopify 关键功能（Webhook 验证与 GraphQL
Bulk Operations）以及错误处理不够结构化等痛点，制定以下实质性改进计划：

---

### 1. 修复已废弃 `url.parse()` 并全面迁移至 WHATWG URL API

- **问题与现状**：原项目在 Link 分页头解析（`parseLinkHeader`）和 202 异步轮询重定向中依赖已废弃的 Node.js 核心模块
  `url.parse()`，在 Node.js 20+ 环境运行时会触发
  `[DEP0169] DeprecationWarning`，且旧版解析器在边界 URL 和安全性上有已知风险。
- **改进方案**：
  - 将 `parseLinkHeader` 以及 202 重定向 URL 处理逻辑平滑重构为基于标准 WHATWG
    `new URL()` 实现；
  - 完整保留 `link.next.query` 和 `link.previous.query`
    对象格式，彻底消除 Node.js 运行期 Deprecation 警告。

### 2. 补齐 Shopify Webhook 验证、头解析与中间件套件

- **问题与现状**：原项目 `webhook` 模块仅支持 REST
  CRUD 订阅，没有提供任何 Webhook 校验与接收工具。Shopify 生产应用必须对接收到的 Webhook 进行 HMAC-SHA256 签名比对，否则极易遭受伪造攻击。
- **改进方案**：
  - 新增安全防时序攻击的 Webhook 签名验证方法（`shopify.webhook.verify` 与
    `Shopify.verifyWebhook`），底层使用 `crypto.timingSafeEqual`；
  - 新增标准 Webhook 头解析方法（`shopify.webhook.parseHeaders` 与
    `Shopify.parseWebhookHeaders`），自动归一化提取
    `topic`、`shop`、`webhookId`、`apiVersion`、`hmac`；
  - 新增 Express / Connect /
    HTTP 标准兼容的 Webhook 中间件处理器（`shopify.webhook.createHandler`），一站式完成验签与事件派发。

### 3. 补齐 GraphQL Bulk Operations（批量操作）完整支持

- **问题与现状**：对于大规模数据拉取与批量写入，Shopify 官方已全面推荐使用 GraphQL
  Bulk
  Operations，原项目的 REST 分页在处理海量商品/订单时极易触发限流且效率低下，原项目完全缺少对批量操作的封装。
- **改进方案**：
  - 新增 `resources/bulk-operation.js` 并注册为 `shopify.bulkOperation`；
  - 支持
    `runQuery(query)`（提交批量查询）、`runMutation(mutation, stagedUploadPath)`（提交批量变更）、`getCurrent()`（查询当前进行中的批量任务）、`get(id)`（获取指定任务）、`cancel(id)`（取消任务）；
  - 内置 `poll(id, options)` 状态轮询助手与 `parseJsonl(data, options)`
    解析器（支持将 Shopify 返回的 JSONL 文本/流解析为结构化数据，并支持依据
    `__parentId` 自动反归一化树状嵌套）。

### 4. 规范化结构化错误处理体系（Normalized Error Handling）

- **问题与现状**：原项目 REST 请求直接抛出 Got 的原始
  `got.HTTPError`，错误消息通常仅为通用
  `Response code 422 (Unprocessable Entity)`，将 Shopify 返回的真实业务原因（`body.errors`
  / `body.error`）掩盖在底层；GraphQL 请求则使用
  `new Error(errors[0].message)`，丢弃了其他可能并存的 GraphQL 错误及详细路径。
- **改进方案**：
  - 设计结构化错误体系：定义
    `ShopifyError`、`ShopifyHttpError`、`ShopifyGraphQLError`；
  - 为 REST 请求挂载 `beforeError`
    钩子，自动提取解析 Shopify 的具体错误详情（`error.detail`、`error.errors`、`error.requestId`、`error.statusCode`、`error.rateLimit`），同时继承保持
    `got.HTTPError` 实例属性，确保 100% 向后兼容；
  - GraphQL 错误完整保留所有错误列表、locations、path 与 extensions。

### 5. 完善 TypeScript 类型定义与 Webhook 事件主题

- **问题与现状**：原项目的 `types/index.d.ts`
  缺少批量操作、Webhook 验签、结构化错误以及近年来 Shopify 引入的多个 Webhook
  Topics（如 `BULK_OPERATIONS_FINISH`、`SUBSCRIPTION_CONTRACTS_CREATE` 等）。
- **改进方案**：
  - 在 `types/index.d.ts` 中补全 `bulkOperation` 模块及其输入/输出参数接口定义；
  - 补充 `webhook` 验证方法、头解析方法、中间件配置类型定义；
  - 扩展 `WebhookTopic` 枚举；
  - 补充导出 `ShopifyError`、`ShopifyHttpError`、`ShopifyGraphQLError`
    类型定义。

---

## 自测记录

- **测试环境**：Linux x86_64, Node.js v24.22.1, npm 10.9.4
- **自测命令与结果**：
  1. `npm install --ignore-scripts`: 依赖安装成功，378 packages added，exit code
     0。
  2. `npm test`: 全量单元测试与代码覆盖率（c8 +
     mocha）执行，覆盖所有 74 个测试套件（包括原项目全量回归测试及新增的
     `test/bulk-operation.test.js`、`test/webhook-utils.test.js`、`test/errors.test.js`）。全部通过（571 个测试用例），0 失败，成功消除
     `[DEP0169] DeprecationWarning`，exit code 0。
  3. `npm run test:types`: 使用 `tsd` 对 `types/index.d.ts` 和
     `types/index.test-d.ts`
     执行静态类型断言检查（包含新增的 bulkOperation、webhook 工具方法及结构化错误类定义），全部通过，0 错误，exit
     code 0。
  4. `npm run lint`: 执行
     `eslint . && prettier --check --ignore-path .gitignore "**/*.{json,md,ts,yaml,yml}"`，代码风格检查全部通过，exit
     code 0。
  5. **核心流程验证**：
     - 实例初始化：正常创建客户端实例，正确暴露
       `bulkOperation`、`webhook`、`ShopifyError`、`ShopifyHttpError`、`ShopifyGraphQLError`；
     - Webhook 校验：时序安全签名比对 `shopify.webhook.verify`
       验证通过，头信息标准化提取 `shopify.webhook.parseHeaders` 正常；
     - Bulk Operations：批量查询与变更发起、任务轮询
       `poll`、JSONL 数据解析与树状嵌套 `parseJsonl(data, { nest: true })`
       流程走通；
     - 错误捕获与修饰：REST 请求报错自动挂载 `error.detail`
       与状态码，GraphQL 报错抛出结构化 `ShopifyGraphQLError`
       且与原有捕获完全兼容。
