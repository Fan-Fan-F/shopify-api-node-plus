describe('Shopify#bulkOperation', () => {
  'use strict';

  const expect = require('chai').expect;
  const common = require('./common');

  const shopify = common.shopify;
  const scope = common.scope;

  afterEach(() => expect(scope.pendingMocks()).to.deep.equal([]));

  it('initiates a bulk query operation with runQuery', () => {
    const query = '{ products { edges { node { id title } } } }';
    const mockOp = {
      id: 'gid://shopify/BulkOperation/102938',
      status: 'CREATED',
      errorCode: null,
      createdAt: '2026-11-17T00:00:00Z',
      completedAt: null,
      objectCount: '0',
      fileSize: null,
      url: null,
      partialDataUrl: null
    };

    scope.post('/admin/api/graphql.json').reply(200, {
      data: {
        bulkOperationRunQuery: {
          bulkOperation: mockOp,
          userErrors: []
        }
      }
    });

    return shopify.bulkOperation.runQuery(query).then((res) => {
      expect(res).to.deep.equal(mockOp);
    });
  });

  it('rejects runQuery if query is invalid', () => {
    return shopify.bulkOperation.runQuery('').catch((err) => {
      expect(err).to.be.an.instanceof(TypeError);
    });
  });

  it('throws an error if runQuery returns userErrors', () => {
    scope.post('/admin/api/graphql.json').reply(200, {
      data: {
        bulkOperationRunQuery: {
          bulkOperation: null,
          userErrors: [
            {
              field: ['query'],
              message: 'A bulk operation is already in progress'
            }
          ]
        }
      }
    });

    return shopify.bulkOperation.runQuery('{ products }').catch((err) => {
      expect(err.message).to.equal('A bulk operation is already in progress');
      expect(err.userErrors).to.be.an('array');
    });
  });

  it('initiates a bulk mutation with runMutation', () => {
    const mutation =
      'mutation call($input: ProductInput!) { productCreate(input: $input) { product { id } } }';
    const stagedUploadPath = 'tmp/staged/data.jsonl';
    const mockOp = {
      id: 'gid://shopify/BulkOperation/203948',
      status: 'CREATED',
      errorCode: null,
      createdAt: '2026-11-17T00:00:00Z',
      completedAt: null,
      objectCount: '0',
      fileSize: null,
      url: null,
      partialDataUrl: null
    };

    scope.post('/admin/api/graphql.json').reply(200, {
      data: {
        bulkOperationRunMutation: {
          bulkOperation: mockOp,
          userErrors: []
        }
      }
    });

    return shopify.bulkOperation
      .runMutation(mutation, stagedUploadPath)
      .then((res) => {
        expect(res).to.deep.equal(mockOp);
      });
  });

  it('rejects runMutation on invalid arguments', () => {
    return shopify.bulkOperation
      .runMutation('', 'path')
      .catch((err) => {
        expect(err).to.be.an.instanceof(TypeError);
        return shopify.bulkOperation.runMutation('mutation', '');
      })
      .catch((err) => {
        expect(err).to.be.an.instanceof(TypeError);
      });
  });

  it('throws an error if runMutation returns userErrors', () => {
    scope.post('/admin/api/graphql.json').reply(200, {
      data: {
        bulkOperationRunMutation: {
          bulkOperation: null,
          userErrors: [
            {
              field: ['stagedUploadPath'],
              message: 'Invalid path'
            }
          ]
        }
      }
    });

    return shopify.bulkOperation
      .runMutation('mutation', 'path')
      .catch((err) => {
        expect(err.message).to.equal('Invalid path');
      });
  });

  it('gets current bulk operation with getCurrent', () => {
    const mockOp = {
      id: 'gid://shopify/BulkOperation/102938',
      status: 'RUNNING',
      errorCode: null,
      createdAt: '2026-11-17T00:00:00Z',
      completedAt: null,
      objectCount: '150',
      fileSize: null,
      url: null,
      partialDataUrl: null
    };

    scope.post('/admin/api/graphql.json').reply(200, {
      data: {
        currentBulkOperation: mockOp
      }
    });

    return shopify.bulkOperation.getCurrent('QUERY').then((res) => {
      expect(res).to.deep.equal(mockOp);
    });
  });

  it('gets bulk operation by ID with get', () => {
    const id = 'gid://shopify/BulkOperation/102938';
    const mockOp = {
      id,
      status: 'COMPLETED',
      errorCode: null,
      createdAt: '2026-11-17T00:00:00Z',
      completedAt: '2026-11-17T00:01:00Z',
      objectCount: '500',
      fileSize: '102400',
      url: 'https://storage.googleapis.com/shopify/results.jsonl',
      partialDataUrl: null
    };

    scope.post('/admin/api/graphql.json').reply(200, {
      data: {
        node: mockOp
      }
    });

    return shopify.bulkOperation.get(id).then((res) => {
      expect(res).to.deep.equal(mockOp);
    });
  });

  it('rejects get if ID is invalid', () => {
    return shopify.bulkOperation.get('').catch((err) => {
      expect(err).to.be.an.instanceof(TypeError);
    });
  });

  it('cancels a bulk operation with cancel', () => {
    const id = 'gid://shopify/BulkOperation/102938';
    scope.post('/admin/api/graphql.json').reply(200, {
      data: {
        bulkOperationCancel: {
          bulkOperation: {
            id,
            status: 'CANCELING'
          },
          userErrors: []
        }
      }
    });

    return shopify.bulkOperation.cancel(id).then((res) => {
      expect(res).to.deep.equal({
        id,
        status: 'CANCELING'
      });
    });
  });

  it('rejects cancel if ID is invalid', () => {
    return shopify.bulkOperation.cancel('').catch((err) => {
      expect(err).to.be.an.instanceof(TypeError);
    });
  });

  it('throws an error if cancel returns userErrors', () => {
    scope.post('/admin/api/graphql.json').reply(200, {
      data: {
        bulkOperationCancel: {
          bulkOperation: null,
          userErrors: [
            {
              field: ['id'],
              message: 'Bulk operation not found'
            }
          ]
        }
      }
    });

    return shopify.bulkOperation
      .cancel('gid://shopify/BulkOperation/1')
      .catch((err) => {
        expect(err.message).to.equal('Bulk operation not found');
      });
  });

  it('parses JSONL formatted text into objects (flat mode)', () => {
    const jsonl =
      '{"id":"gid://shopify/Product/1","title":"Item 1"}\n{"id":"gid://shopify/Product/2","title":"Item 2"}\n';
    const parsed = shopify.bulkOperation.parseJsonl(jsonl);
    expect(parsed).to.deep.equal([
      { id: 'gid://shopify/Product/1', title: 'Item 1' },
      { id: 'gid://shopify/Product/2', title: 'Item 2' }
    ]);
  });

  it('handles empty or null JSONL input gracefully', () => {
    expect(shopify.bulkOperation.parseJsonl(null)).to.deep.equal([]);
    expect(shopify.bulkOperation.parseJsonl('')).to.deep.equal([]);
  });

  it('parses JSONL and nests child records when nest: true', () => {
    const jsonl = [
      JSON.stringify({ id: 'gid://shopify/Product/1', title: 'T-Shirt' }),
      JSON.stringify({
        id: 'gid://shopify/ProductVariant/10',
        title: 'Red',
        __parentId: 'gid://shopify/Product/1'
      }),
      JSON.stringify({
        id: 'gid://shopify/ProductVariant/11',
        title: 'Blue',
        __parentId: 'gid://shopify/Product/1'
      })
    ].join('\n');

    const nested = shopify.bulkOperation.parseJsonl(Buffer.from(jsonl), {
      nest: true
    });
    expect(nested).to.have.lengthOf(1);
    expect(nested[0].title).to.equal('T-Shirt');
    expect(nested[0].__children).to.have.lengthOf(2);
    expect(nested[0].__children[0].title).to.equal('Red');
    expect(nested[0].__children[1].title).to.equal('Blue');
  });

  it('polls bulk operation until completion', () => {
    const id = 'gid://shopify/BulkOperation/102938';
    const runningOp = {
      id,
      status: 'RUNNING'
    };
    const completedOp = {
      id,
      status: 'COMPLETED',
      url: 'https://example.com/download.jsonl'
    };

    scope.post('/admin/api/graphql.json').reply(200, {
      data: { node: runningOp }
    });
    scope.post('/admin/api/graphql.json').reply(200, {
      data: { node: completedOp }
    });

    return shopify.bulkOperation
      .poll(id, { interval: 10, timeout: 1000 })
      .then((res) => {
        expect(res.status).to.equal('COMPLETED');
        expect(res.url).to.equal('https://example.com/download.jsonl');
      });
  });

  it('throws an error when polling times out', () => {
    const id = 'gid://shopify/BulkOperation/102938';
    scope.post('/admin/api/graphql.json').reply(200, {
      data: { node: { id, status: 'RUNNING' } }
    });

    return shopify.bulkOperation
      .poll(id, { interval: 50, timeout: 20 })
      .catch((err) => {
        expect(err.message).to.include('timed out');
        expect(err.operation.status).to.equal('RUNNING');
      });
  });
});
