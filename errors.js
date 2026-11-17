'use strict';

const got = require('got');

/**
 * Base class for all Shopify API errors. Inherits from got.RequestError
 * to ensure 100% backward compatibility with existing Got error handling.
 */
class ShopifyError extends got.RequestError {
  constructor(message, error = {}, self = {}) {
    super(message, error, self);
    this.name = 'ShopifyError';
  }
}

/**
 * Error class for Shopify HTTP/REST errors. Inherits from got.HTTPError.
 */
class ShopifyHttpError extends got.HTTPError {
  constructor(responseOrOptions = {}, options = {}) {
    const opts = {
      ...(typeof responseOrOptions === 'object' ? responseOrOptions : {}),
      ...options
    };
    const response = {
      statusCode: opts.statusCode || 500,
      headers: opts.headers || {},
      body: opts.body || {}
    };
    super(response);
    this.name = 'ShopifyHttpError';
    this.statusCode = response.statusCode;
    this.status = this.statusCode;
    this.requestId =
      opts.requestId || (response.headers && response.headers['x-request-id']);
    this.rateLimit = opts.rateLimit;
    this.detail = opts.detail;
    this.errors = opts.errors;
  }
}

/**
 * Error class for Shopify GraphQL errors.
 */
class ShopifyGraphQLError extends ShopifyError {
  constructor(message, options = {}) {
    super(message, options.error || {}, options.self || {});
    this.name = 'ShopifyGraphQLError';
    this.errors = options.errors || [];
    this.locations = options.locations;
    this.path = options.path;
    this.extensions = options.extensions;
    this.cost = options.cost;
    this.response = options.response;
  }
}

/**
 * Extracts human-readable error messages from Shopify REST response bodies.
 *
 * @param {*} body Response body from Shopify
 * @return {string} Extracted error message summary
 * @private
 */
function extractErrorMessage(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (body.error && typeof body.error === 'string') return body.error;
  if (typeof body.errors === 'string') return body.errors;
  if (Array.isArray(body.errors)) return body.errors.join(', ');
  if (typeof body.errors === 'object' && body.errors !== null) {
    return Object.entries(body.errors)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('; ');
  }
  return '';
}

/**
 * Decorates an HTTP error object with standardized Shopify error attributes.
 *
 * @param {Error} error The error to decorate
 * @return {Error} The decorated error
 */
function decorateHttpError(error) {
  if (error && error.response) {
    const res = error.response;
    error.statusCode = res.statusCode;
    error.status = res.statusCode;

    if (res.headers) {
      error.requestId = res.headers['x-request-id'];
      const limitHeader = res.headers['x-shopify-shop-api-call-limit'];
      if (limitHeader) {
        const parts = limitHeader.split('/').map(Number);
        error.rateLimit = {
          current: parts[0],
          max: parts[1],
          remaining: parts[1] - parts[0]
        };
      }
    }

    if (res.body) {
      const detail = extractErrorMessage(res.body);
      if (detail) {
        error.detail = detail;
      }
      if (res.body.errors !== undefined) {
        error.errors = res.body.errors;
      } else if (res.body.error !== undefined) {
        error.errors = res.body.error;
      }
    }

    if (error instanceof got.HTTPError) {
      Object.setPrototypeOf(error, ShopifyHttpError.prototype);
    }
  }

  return error;
}

/**
 * Checks if an error is a Shopify error.
 *
 * @param {*} error The candidate error
 * @return {boolean}
 */
function isShopifyError(error) {
  if (!error || typeof error !== 'object') return false;
  return (
    error instanceof ShopifyError ||
    error instanceof ShopifyHttpError ||
    error.name === 'ShopifyError' ||
    error.name === 'ShopifyHttpError' ||
    error.name === 'ShopifyGraphQLError' ||
    Boolean(error.requestId || error.detail)
  );
}

module.exports = {
  ShopifyError,
  ShopifyHttpError,
  ShopifyGraphQLError,
  decorateHttpError,
  extractErrorMessage,
  isShopifyError
};
