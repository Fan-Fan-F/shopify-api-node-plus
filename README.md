# shopify-api-node-plus

轻量、健壮且功能完备的 Shopify Node.js
SDK 增强版。在原项目小而稳的基础上，完整补齐现代 Shopify 开发不可或缺的 GraphQL
Bulk
Operations（批量操作）、防时序攻击的 Webhook 验证中间件、结构化错误处理与 Node.js
20+ WHATWG URL 标准化支持。

An enhanced, robust, and feature-complete Shopify API client for Node.js. Built
upon the lightweight foundation of the original library, fully upgraded with
GraphQL Bulk Operations, timing-safe Webhook verification middleware, structured
error normalization, and standard WHATWG URL compatibility for modern Node.js
runtimes.

---

## 目录 / Table of Contents

- [中文说明](#中文说明)
  - [功能与改进点](#功能与改进点)
  - [快速开始](#快速开始)
  - [来源与致谢](#来源与致谢)
  - [许可证](#许可证)
- [English Documentation](#english-documentation)
  - [Features & Enhancements](#features--enhancements)
  - [Quick Start](#quick-start)
  - [Source & Acknowledgments](#source--acknowledgments)
  - [License](#license)

---

## 中文说明

### 功能与改进点

本项目基于 `MONEI/Shopify-api-node` 展开 A 路线二次开发，所有改动保持原有 API
100% 向下兼容，逐条对应根目录 `CHANGES.md` 中的改进计划：

1. **废弃 API 现代化升级（修复 `url.parse()`）**
   - 原项目在 Link 分页头解析与 202 异步轮询中调用了 Node.js 官方已废弃的核心模块
     `url.parse()`，在 Node.js 20+ 环境运行时频繁产生
     `[DEP0169] DeprecationWarning`。
   - 全面迁移至标准 WHATWG `new URL()`
     API，消除运行期警告并增强 URL 解析的鲁棒性与安全性。

2. **完备的 Webhook 验签、头解析与中间件套件**
   - 原项目仅支持 Webhook 的 REST 增删查改订阅，缺乏生产应用接收 Webhook 所必须的验签逻辑。
   - 新增 `shopify.webhook.verify` 与静态方法
     `Shopify.verifyWebhook`，采用 Node.js 原生 `crypto.timingSafeEqual`
     防范时序旁路攻击。
   - 新增 `shopify.webhook.parseHeaders` 与
     `Shopify.parseWebhookHeaders`，自动规范化提取 Shopify 专有请求头（topic、shop、webhook
     ID、API 版本等）。
   - 新增 `shopify.webhook.createHandler` 与
     `Shopify.createWebhookHandler`，开箱即用兼容 Express、Connect 及 Node 原生 HTTP 服务。

3. **全功能 GraphQL Bulk Operations（批量操作）支持**
   - 彻底解决 REST API 在拉取/变更海量商品、订单时受限流严重、分页缓慢的痛点。
   - 新增 `shopify.bulkOperation` 资源模块，提供
     `runQuery`（提交批量查询）、`runMutation`（提交批量变更）、`getCurrent`（查询当前任务）、`get(id)`、`cancel(id)`。
   - 内置 `poll(id, options)` 状态轮询助手与 `parseJsonl(data, options)`
     解析器，支持从 Shopify 返回的 JSONL 数据中一键依据 `__parentId`
     自动反归一化重构出商品-变体层级树状结构。

4. **规范化结构化错误处理体系（Normalized Error Handling）**
   - 解决原库 REST 报错直接抛出通用 `got.HTTPError`（消息仅为
     `Response code 422...`，掩盖响应体内具体业务原因）的痛点。
   - 提供 `ShopifyError`、`ShopifyHttpError` 与 `ShopifyGraphQLError`
     错误层次，通过 Got 拦截钩子自动从响应提炼提取 `error.detail`（如
     `title: can't be blank`）、`error.errors`、`error.statusCode`、`error.requestId`
     以及限流统计 `error.rateLimit`。
   - 保持原有 `err instanceof got.HTTPError`
     继承链完全有效，既有业务代码零迁移成本。

5. **扩展 TypeScript 类型声明与 Webhook 事件主题**
   - 在 `types/index.d.ts` 中补全所有新增模块（`bulkOperation`、`webhook`
     验证工具、结构化错误类）的完整类型定义。
   - 补充 `WebhookTopic` 枚举，保持类型系统与最新 Shopify API 同步。

---

### 快速开始

#### 1. 安装

```bash
npm install shopify-api-node-plus
# 或者使用 npm 直接链接本地开发版本
```

#### 2. 初始化客户端

```javascript
const Shopify = require('shopify-api-node-plus');

// 适用于公共应用 / 自定义应用（OAuth Access Token）
const shopify = new Shopify({
  shopName: 'your-shop-name', // 仅填写店铺名或 your-shop-name.myshopify.com
  accessToken: 'shpat_your_access_token_placeholder',
  apiVersion: '2024-01'
});

// 适用于私有应用（API Key + Password）
const privateShopify = new Shopify({
  shopName: 'your-shop-name',
  apiKey: 'your_api_key_placeholder',
  password: 'shppa_your_password_placeholder',
  apiVersion: '2024-01'
});
```

#### 3. 基础 REST 与 GraphQL 请求

```javascript
async function example() {
  // 1. REST 请求示例（获取商品列表）
  const products = await shopify.product.list({ limit: 10 });
  console.log(`获取到 ${products.length} 个商品`);

  // 2. 原生 GraphQL 请求示例
  const result = await shopify.graphql(`
    query {
      shop {
        id
        name
        myshopifyDomain
      }
    }
  `);
  console.log('店铺信息:', result.shop.name);
}
```

#### 4. GraphQL Bulk Operations 批量操作

```javascript
async function bulkExample() {
  // 1. 发起批量查询操作
  const bulkOp = await shopify.bulkOperation.runQuery(`
    {
      products {
        edges {
          node {
            id
            title
            variants {
              edges {
                node {
                  id
                  title
                  price
                }
              }
            }
          }
        }
      }
    }
  `);
  console.log('批量操作已创建:', bulkOp.id, '当前状态:', bulkOp.status);

  // 2. 轮询直到操作完成
  const completed = await shopify.bulkOperation.poll(bulkOp.id, {
    interval: 2000,
    timeout: 300000
  });
  console.log('批量任务完成，下载 URL:', completed.url);

  // 3. 解析下载回来的 JSONL 数据（支持树状嵌套）
  const rawJsonl =
    '{"id":"gid://shopify/Product/1","title":"Demo"}\n{"id":"gid://shopify/ProductVariant/2","title":"Red","__parentId":"gid://shopify/Product/1"}';
  const nestedProducts = shopify.bulkOperation.parseJsonl(rawJsonl, {
    nest: true
  });
  console.log(
    '嵌套反归一化商品:',
    nestedProducts[0].title,
    '变体数:',
    nestedProducts[0].__children.length
  );
}
```

#### 5. Webhook 安全验证与中间件

```javascript
const express = require('express');
const app = express();

// 方式 A：在 Express 路由中使用中间件
app.post(
  '/api/webhooks',
  shopify.webhook.createHandler({
    secret: 'your_webhook_shared_secret',
    onWebhook: (data, req, res) => {
      console.log(`收到 Webhook [${data.topic}] 来自店铺 [${data.shop}]`);
      console.log('负载内容:', data.body);
      res.status(200).send('OK');
    },
    onError: (err, req, res) => {
      console.error('Webhook 验签失败:', err.message);
      res.status(401).send('Unauthorized');
    }
  })
);

// 方式 B：手动单点校验
const isValid = Shopify.verifyWebhook(
  rawRequestBody,
  req.headers['x-shopify-hmac-sha256'],
  'your_webhook_shared_secret'
);
```

#### 6. 结构化错误捕获

```javascript
try {
  await shopify.product.update(12345, { title: '' });
} catch (err) {
  // 原生属性与结构化增强属性并存
  console.error('HTTP 状态码:', err.statusCode); // e.g. 422
  console.error('Shopify 业务原因:', err.detail); // e.g. "title: can't be blank"
  console.error('请求 RequestId:', err.requestId); // e.g. "req-abc-123"
  console.error('调用频次统计:', err.rateLimit); // e.g. { current: 35, max: 40, remaining: 5 }
}
```

---

### 来源与致谢

本项目基于 Shopify-api-node（https://github.com/MONEI/Shopify-api-node）二次开发，原项目由
MONEI 以 MIT 许可证开源。

---

### 许可证

本项目沿用原许可证，采用 MIT 许可证开源，全文见根目录 [LICENSE](LICENSE)。

---

## English Documentation

### Features & Enhancements

`shopify-api-node-plus` is a secondary development based on
`MONEI/Shopify-api-node` (Route A). It retains 100% backward compatibility with
the original API while addressing critical pain points documented in
`CHANGES.md`:

1. **Modern WHATWG URL Migration (Deprecated `url.parse()` Fixed)**
   - Replaced legacy Node.js core `url.parse()` in Link header pagination and
     202 async polling redirect handling.
   - Completely resolves runtime `[DEP0169] DeprecationWarning` under Node.js
     20+ and improves URL parsing security.

2. **Comprehensive Webhook Verification & Middleware Suite**
   - Original library only provided REST CRUD subscriptions without incoming
     webhook verification tools.
   - Added `shopify.webhook.verify` and `Shopify.verifyWebhook` using
     `crypto.timingSafeEqual` to prevent timing attacks.
   - Added `shopify.webhook.parseHeaders` and `Shopify.parseWebhookHeaders` for
     standardized extraction of Shopify-specific headers (`topic`, `shop`,
     `webhookId`, `apiVersion`).
   - Added `shopify.webhook.createHandler` and `Shopify.createWebhookHandler`
     compatible with Express, Connect, and vanilla Node HTTP servers.

3. **Full-Featured GraphQL Bulk Operations**
   - Overcomes REST API rate-limiting hurdles when managing vast catalogs and
     high-volume order histories.
   - Added `shopify.bulkOperation` resource module supporting `runQuery`,
     `runMutation`, `getCurrent`, `get(id)`, and `cancel(id)`.
   - Included `poll(id, options)` for asynchronous completion polling and
     `parseJsonl(data, options)` with automatic hierarchy reconstruction via
     `__parentId`.

4. **Normalized & Structured Error Handling**
   - Solves the long-standing developer pain point where `got.HTTPError`
     conceals specific Shopify error messages behind generic `Response code 422`
     texts.
   - Introduced `ShopifyError`, `ShopifyHttpError`, and `ShopifyGraphQLError`
     error hierarchies.
   - Automatically populates `error.detail` (e.g. `title: can't be blank`),
     `error.errors`, `error.statusCode`, `error.requestId`, and
     `error.rateLimit` while maintaining 100% `instanceof got.HTTPError`
     compatibility.

5. **Expanded TypeScript Typings & Webhook Topics**
   - Fully declared types for `bulkOperation`, webhook helpers, and normalized
     error classes in `types/index.d.ts`.
   - Updated `WebhookTopic` definitions to align with modern Shopify webhook
     topics.

---

### Quick Start

#### 1. Installation

```bash
npm install shopify-api-node-plus
```

#### 2. Client Initialization

```javascript
const Shopify = require('shopify-api-node-plus');

// Public App / Custom App (OAuth Access Token)
const shopify = new Shopify({
  shopName: 'your-shop-name',
  accessToken: 'shpat_your_access_token_placeholder',
  apiVersion: '2024-01'
});

// Private App (API Key + Password)
const privateShopify = new Shopify({
  shopName: 'your-shop-name',
  apiKey: 'your_api_key_placeholder',
  password: 'shppa_your_password_placeholder',
  apiVersion: '2024-01'
});
```

#### 3. GraphQL Bulk Operations

```javascript
async function runBulkOperation() {
  const operation = await shopify.bulkOperation.runQuery(`
    {
      products {
        edges {
          node {
            id
            title
            variants {
              edges {
                node {
                  id
                  price
                }
              }
            }
          }
        }
      }
    }
  `);

  console.log('Initiated bulk operation:', operation.id);

  const completed = await shopify.bulkOperation.poll(operation.id, {
    interval: 2000,
    timeout: 300000
  });

  console.log('Bulk operation completed. JSONL URL:', completed.url);
}
```

#### 4. Webhook Verification Middleware

```javascript
const express = require('express');
const app = express();

app.post(
  '/api/webhooks',
  shopify.webhook.createHandler({
    secret: 'your_webhook_shared_secret',
    onWebhook: (data, req, res) => {
      console.log(`Received webhook for ${data.topic} on store ${data.shop}`);
      res.status(200).send('OK');
    },
    onError: (err, req, res) => {
      console.error('Invalid signature:', err.message);
      res.status(401).send('Unauthorized');
    }
  })
);
```

#### 5. Structured Error Handling

```javascript
try {
  await shopify.product.get(99999999);
} catch (err) {
  console.error('HTTP Status:', err.statusCode); // 404
  console.error('Error Details:', err.detail); // "Not Found"
  console.error('Shopify Request ID:', err.requestId); // e.g. "req-abc-123"
  console.error('Call Limits:', err.rateLimit); // { current: 1, max: 40, remaining: 39 }
}
```

---

### Source & Acknowledgments

本项目基于 Shopify-api-node（https://github.com/MONEI/Shopify-api-node）二次开发，原项目由
MONEI 以 MIT 许可证开源。

_(English: This project is a secondary development based on Shopify-api-node
(https://github.com/MONEI/Shopify-api-node), originally open-sourced by MONEI
under the MIT License.)_

---

### License

沿用原许可证，全文见根目录 [LICENSE](LICENSE)。

_(Licensed under the MIT License. See [LICENSE](LICENSE) for the complete
text.)_
