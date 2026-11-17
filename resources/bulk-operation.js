'use strict';

/**
 * Creates a BulkOperation instance.
 *
 * @param {Shopify} shopify Reference to the Shopify instance
 * @constructor
 * @public
 */
function BulkOperation(shopify) {
  this.shopify = shopify;
}

/**
 * Initiates a GraphQL bulk query operation.
 *
 * @param {string} query The GraphQL query string to execute in bulk
 * @return {Promise<Object>} The initiated bulkOperation object
 * @public
 */
BulkOperation.prototype.runQuery = function runQuery(query) {
  if (!query || typeof query !== 'string') {
    return Promise.reject(new TypeError('Query must be a non-empty string'));
  }

  const escapedQuery = JSON.stringify(query);
  const mutation = `mutation {
    bulkOperationRunQuery(
      query: ${escapedQuery}
    ) {
      bulkOperation {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        fileSize
        url
        partialDataUrl
      }
      userErrors {
        field
        message
      }
    }
  }`;

  return this.shopify.graphql(mutation).then((res) => {
    const data = res.bulkOperationRunQuery;
    if (data.userErrors && data.userErrors.length > 0) {
      const err = new Error(data.userErrors[0].message);
      err.userErrors = data.userErrors;
      throw err;
    }
    return data.bulkOperation;
  });
};

/**
 * Initiates a GraphQL bulk mutation operation.
 *
 * @param {string} mutation The GraphQL mutation string to execute in bulk
 * @param {string} stagedUploadPath Staged upload path containing JSONL input data
 * @return {Promise<Object>} The initiated bulkOperation object
 * @public
 */
BulkOperation.prototype.runMutation = function runMutation(
  mutation,
  stagedUploadPath
) {
  if (!mutation || typeof mutation !== 'string') {
    return Promise.reject(new TypeError('Mutation must be a non-empty string'));
  }
  if (!stagedUploadPath || typeof stagedUploadPath !== 'string') {
    return Promise.reject(
      new TypeError('stagedUploadPath must be a non-empty string')
    );
  }

  const escapedMutation = JSON.stringify(mutation);
  const escapedPath = JSON.stringify(stagedUploadPath);
  const gql = `mutation {
    bulkOperationRunMutation(
      mutation: ${escapedMutation},
      stagedUploadPath: ${escapedPath}
    ) {
      bulkOperation {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        fileSize
        url
        partialDataUrl
      }
      userErrors {
        field
        message
      }
    }
  }`;

  return this.shopify.graphql(gql).then((res) => {
    const data = res.bulkOperationRunMutation;
    if (data.userErrors && data.userErrors.length > 0) {
      const err = new Error(data.userErrors[0].message);
      err.userErrors = data.userErrors;
      throw err;
    }
    return data.bulkOperation;
  });
};

/**
 * Retrieves the current bulk operation.
 *
 * @param {string} [type] Optional type filter: 'QUERY' or 'MUTATION'
 * @return {Promise<Object>} The current bulk operation or null
 * @public
 */
BulkOperation.prototype.getCurrent = function getCurrent(type) {
  const typeArg = type ? `(type: ${type})` : '';
  const query = `query {
    currentBulkOperation${typeArg} {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
      partialDataUrl
    }
  }`;

  return this.shopify.graphql(query).then((res) => res.currentBulkOperation);
};

/**
 * Retrieves a bulk operation by its GraphQL ID.
 *
 * @param {string} id The GraphQL ID of the bulk operation
 * @return {Promise<Object>} The bulk operation object
 * @public
 */
BulkOperation.prototype.get = function get(id) {
  if (!id || typeof id !== 'string') {
    return Promise.reject(new TypeError('ID must be a non-empty string'));
  }

  const query = `query {
    node(id: ${JSON.stringify(id)}) {
      ... on BulkOperation {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        fileSize
        url
        partialDataUrl
      }
    }
  }`;

  return this.shopify.graphql(query).then((res) => res.node);
};

/**
 * Cancels a running bulk operation.
 *
 * @param {string} id The GraphQL ID of the bulk operation to cancel
 * @return {Promise<Object>} The cancelled bulk operation status
 * @public
 */
BulkOperation.prototype.cancel = function cancel(id) {
  if (!id || typeof id !== 'string') {
    return Promise.reject(new TypeError('ID must be a non-empty string'));
  }

  const mutation = `mutation {
    bulkOperationCancel(id: ${JSON.stringify(id)}) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }`;

  return this.shopify.graphql(mutation).then((res) => {
    const data = res.bulkOperationCancel;
    if (data.userErrors && data.userErrors.length > 0) {
      const err = new Error(data.userErrors[0].message);
      err.userErrors = data.userErrors;
      throw err;
    }
    return data.bulkOperation;
  });
};

/**
 * Parses JSONL (newline-delimited JSON) data into objects.
 *
 * @param {string|Buffer} data The raw JSONL string or Buffer
 * @param {Object} [options] Parsing options
 * @param {boolean} [options.nest=false] Whether to nest child records under parents using __parentId
 * @return {Array<Object>} Parsed objects
 * @public
 */
BulkOperation.prototype.parseJsonl = function parseJsonl(data, options = {}) {
  if (data === null || data === undefined) {
    return [];
  }

  const text = typeof data === 'string' ? data : data.toString('utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const items = lines.map((line) => JSON.parse(line));

  if (!options.nest) {
    return items;
  }

  // Nest children into parent objects based on __parentId
  const itemMap = new Map();
  const roots = [];

  for (const item of items) {
    itemMap.set(item.id, { ...item, __children: [] });
  }

  for (const item of items) {
    const mapped = itemMap.get(item.id);
    if (item.__parentId && itemMap.has(item.__parentId)) {
      const parent = itemMap.get(item.__parentId);
      parent.__children.push(mapped);
    } else {
      roots.push(mapped);
    }
  }

  return roots;
};

/**
 * Polls a bulk operation until it reaches a terminal state (COMPLETED, FAILED, CANCELED, EXPIRED).
 *
 * @param {string} [id] Optional operation ID; if omitted, checks current bulk operation
 * @param {Object} [options] Polling options
 * @param {number} [options.interval=2000] Interval in milliseconds between polls
 * @param {number} [options.timeout=600000] Maximum wait time in milliseconds
 * @return {Promise<Object>} Resolves with the terminal bulk operation object
 * @public
 */
BulkOperation.prototype.poll = function poll(id, options = {}) {
  const interval = options.interval || 2000;
  const timeout = options.timeout || 600000;
  const startTime = Date.now();
  let lastOperation = null;

  const check = () => {
    if (Date.now() - startTime >= timeout) {
      const timeoutErr = new Error(
        `Bulk operation polling timed out after ${timeout}ms`
      );
      if (lastOperation) timeoutErr.operation = lastOperation;
      return Promise.reject(timeoutErr);
    }

    const fetchOp = id ? this.get(id) : this.getCurrent();
    return fetchOp.then((operation) => {
      lastOperation = operation;
      if (!operation) {
        throw new Error('Bulk operation not found');
      }

      const terminalStatuses = new Set([
        'COMPLETED',
        'FAILED',
        'CANCELED',
        'EXPIRED'
      ]);

      if (terminalStatuses.has(operation.status)) {
        return operation;
      }

      if (Date.now() - startTime >= timeout) {
        const timeoutErr = new Error(
          `Bulk operation polling timed out after ${timeout}ms. Current status: ${operation.status}`
        );
        timeoutErr.operation = operation;
        throw timeoutErr;
      }

      return new Promise((resolve) => setTimeout(resolve, interval)).then(
        check
      );
    });
  };

  return check();
};

module.exports = BulkOperation;
