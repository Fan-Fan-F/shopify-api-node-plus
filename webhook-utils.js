'use strict';

const crypto = require('crypto');

/**
 * Verifies the HMAC-SHA256 signature of an incoming Shopify webhook payload.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 *
 * @param {string|Buffer} rawBody The raw request body as a string or Buffer
 * @param {string} hmacHeader The X-Shopify-Hmac-Sha256 header value
 * @param {string} secret The shared app secret / API password
 * @return {boolean} True if signature is valid, false otherwise
 */
function verifyWebhook(rawBody, hmacHeader, secret) {
  if (
    rawBody === null ||
    rawBody === undefined ||
    !hmacHeader ||
    !secret ||
    typeof hmacHeader !== 'string' ||
    typeof secret !== 'string'
  ) {
    return false;
  }

  try {
    const inputBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(String(rawBody), 'utf8');

    const generatedHash = crypto
      .createHmac('sha256', secret)
      .update(inputBuffer)
      .digest('base64');

    const hashBuffer = Buffer.from(generatedHash, 'utf8');
    const headerBuffer = Buffer.from(hmacHeader, 'utf8');

    if (hashBuffer.length !== headerBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(hashBuffer, headerBuffer);
  } catch {
    return false;
  }
}

/**
 * Extracts and normalizes standard Shopify webhook headers.
 *
 * @param {Object} headers HTTP request headers (case-insensitive keys)
 * @return {Object} Normalized webhook headers object
 */
function parseWebhookHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return {
      topic: undefined,
      hmac: undefined,
      shop: undefined,
      apiVersion: undefined,
      webhookId: undefined
    };
  }

  const getHeader = (name) => {
    const lower = name.toLowerCase();
    for (const [key, val] of Object.entries(headers)) {
      if (key.toLowerCase() === lower) {
        return Array.isArray(val) ? val[0] : val;
      }
    }
    return undefined;
  };

  return {
    topic: getHeader('x-shopify-topic'),
    hmac: getHeader('x-shopify-hmac-sha256'),
    shop: getHeader('x-shopify-shop-domain'),
    apiVersion: getHeader('x-shopify-api-version'),
    webhookId: getHeader('x-shopify-webhook-id')
  };
}

/**
 * Creates an HTTP middleware function for Express / Connect / HTTP handlers
 * to verify and handle incoming Shopify webhooks.
 *
 * @param {Object} options Handler configuration
 * @param {string} [options.secret] Webhook secret (defaults to instance secret/password)
 * @param {Function} [options.onWebhook] Webhook receiver callback (data, req, res)
 * @param {Function} [options.onError] Error handler callback (err, req, res, next)
 * @param {Shopify} [defaultShopifyInstance] Optional fallback Shopify instance
 * @return {Function} Standard middleware (req, res, next)
 */
function createWebhookHandler(options = {}, defaultShopifyInstance) {
  return function webhookMiddleware(req, res, next) {
    const headers = parseWebhookHeaders(req.headers);
    const instance = defaultShopifyInstance || (this && this.shopify);
    const secret =
      options.secret ||
      (instance &&
        instance.options &&
        (instance.options.secret ||
          instance.options.password ||
          instance.options.apiKey));

    const handlePayload = (rawBody) => {
      const rawBuffer = Buffer.isBuffer(rawBody)
        ? rawBody
        : Buffer.from(rawBody || '', 'utf8');

      if (!verifyWebhook(rawBuffer, headers.hmac, secret)) {
        const err = new Error('Invalid webhook signature');
        err.statusCode = 401;
        if (options.onError) return options.onError(err, req, res, next);
        if (res.status && typeof res.status === 'function') {
          return res.status(401).send('Unauthorized');
        }
        res.statusCode = 401;
        return res.end('Unauthorized');
      }

      let parsedBody = req.body;
      if (typeof rawBody === 'string' || Buffer.isBuffer(rawBody)) {
        try {
          parsedBody = JSON.parse(rawBuffer.toString('utf8'));
        } catch {
          // If body is not JSON, leave as is
        }
      }

      const webhookData = {
        topic: headers.topic,
        shop: headers.shop,
        webhookId: headers.webhookId,
        apiVersion: headers.apiVersion,
        body: parsedBody,
        rawBody: rawBuffer,
        headers
      };

      if (options.onWebhook) {
        try {
          const result = options.onWebhook(webhookData, req, res);
          if (result && typeof result.then === 'function') {
            result.catch((err) => {
              if (options.onError) options.onError(err, req, res, next);
              else if (next) next(err);
            });
          }
        } catch (err) {
          if (options.onError) options.onError(err, req, res, next);
          else if (next) next(err);
        }
      } else if (res.status && typeof res.status === 'function') {
        res.status(200).send('OK');
      } else {
        res.statusCode = 200;
        res.end('OK');
      }
    };

    if (req.rawBody) {
      handlePayload(req.rawBody);
    } else if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
      handlePayload(req.body);
    } else {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        handlePayload(Buffer.concat(chunks));
      });
      req.on('error', (err) => {
        if (options.onError) options.onError(err, req, res, next);
        else if (next) next(err);
      });
    }
  };
}

module.exports = {
  verifyWebhook,
  parseWebhookHeaders,
  createWebhookHandler
};
