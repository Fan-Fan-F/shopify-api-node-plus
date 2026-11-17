'use strict';

const assign = require('lodash/assign');

const base = require('../mixins/base');
const {
  verifyWebhook,
  parseWebhookHeaders,
  createWebhookHandler
} = require('../webhook-utils');

/**
 * Creates a Webhook instance.
 *
 * @param {Shopify} shopify Reference to the Shopify instance
 * @constructor
 * @public
 */
function Webhook(shopify) {
  this.shopify = shopify;

  this.name = 'webhooks';
  this.key = 'webhook';
}

assign(Webhook.prototype, base);

/**
 * Verifies the HMAC-SHA256 signature of an incoming webhook payload.
 *
 * @param {string|Buffer} rawBody The raw request payload
 * @param {string} hmacHeader The X-Shopify-Hmac-Sha256 header value
 * @param {string} [secret] Shared secret (defaults to instance password/secret)
 * @return {boolean} True if signature is valid
 * @public
 */
Webhook.prototype.verify = function verify(rawBody, hmacHeader, secret) {
  const secretToUse =
    secret ||
    (this.shopify &&
      this.shopify.options &&
      (this.shopify.options.secret ||
        this.shopify.options.password ||
        this.shopify.options.apiKey));
  return verifyWebhook(rawBody, hmacHeader, secretToUse);
};

/**
 * Extracts and normalizes standard Shopify webhook headers.
 *
 * @param {Object} headers HTTP request headers
 * @return {Object} Normalized webhook headers object
 * @public
 */
Webhook.prototype.parseHeaders = function parseHeaders(headers) {
  return parseWebhookHeaders(headers);
};

/**
 * Creates an Express / Connect / HTTP middleware for handling webhooks.
 *
 * @param {Object} options Middleware configuration options
 * @return {Function} Standard middleware function
 * @public
 */
Webhook.prototype.createHandler = function createHandler(options) {
  return createWebhookHandler(options, this.shopify);
};

module.exports = Webhook;
