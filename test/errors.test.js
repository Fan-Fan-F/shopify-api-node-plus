describe('Shopify#errors', () => {
  'use strict';

  const expect = require('chai').expect;
  const got = require('got');
  const common = require('./common');
  const {
    ShopifyError,
    ShopifyHttpError,
    ShopifyGraphQLError,
    extractErrorMessage,
    isShopifyError
  } = require('../errors');

  const shopify = common.shopify;
  const scope = common.scope;

  afterEach(() => expect(scope.pendingMocks()).to.deep.equal([]));

  describe('Error Classes & Hierarchy', () => {
    it('creates ShopifyError instances properly', () => {
      const err = new ShopifyError('Something failed');
      expect(err).to.be.an.instanceof(Error);
      expect(err).to.be.an.instanceof(ShopifyError);
      expect(err.name).to.equal('ShopifyError');
      expect(err.message).to.equal('Something failed');
    });

    it('creates ShopifyHttpError with structured details', () => {
      const err = new ShopifyHttpError('HTTP Failed', {
        statusCode: 422,
        requestId: 'req-12345',
        detail: 'title: is required',
        errors: { title: ['is required'] },
        rateLimit: { current: 39, max: 40, remaining: 1 }
      });

      expect(err).to.be.an.instanceof(got.HTTPError);
      expect(err).to.be.an.instanceof(ShopifyHttpError);
      expect(err.statusCode).to.equal(422);
      expect(err.requestId).to.equal('req-12345');
      expect(err.detail).to.equal('title: is required');
      expect(err.rateLimit.remaining).to.equal(1);
    });

    it('creates ShopifyGraphQLError with cost and query errors', () => {
      const errors = [
        {
          message: 'Field does not exist',
          locations: [{ line: 2, column: 5 }]
        }
      ];
      const err = new ShopifyGraphQLError(errors[0].message, {
        errors,
        locations: errors[0].locations,
        cost: { requestedQueryCost: 10, actualQueryCost: 5 }
      });

      expect(err).to.be.an.instanceof(ShopifyError);
      expect(err).to.be.an.instanceof(ShopifyGraphQLError);
      expect(err.errors).to.deep.equal(errors);
      expect(err.locations).to.deep.equal(errors[0].locations);
    });
  });

  describe('extractErrorMessage', () => {
    it('formats single error strings', () => {
      expect(extractErrorMessage({ error: 'Not found' })).to.equal('Not found');
      expect(extractErrorMessage({ errors: 'Unauthorized' })).to.equal(
        'Unauthorized'
      );
    });

    it('formats array of error messages', () => {
      expect(extractErrorMessage({ errors: ['err1', 'err2'] })).to.equal(
        'err1, err2'
      );
    });

    it('formats nested error object messages', () => {
      expect(
        extractErrorMessage({
          errors: {
            title: ["can't be blank"],
            price: 'must be positive'
          }
        })
      ).to.equal("title: can't be blank; price: must be positive");
    });

    it('returns empty string for null or empty body', () => {
      expect(extractErrorMessage(null)).to.equal('');
      expect(extractErrorMessage({})).to.equal('');
    });
  });

  describe('isShopifyError helper', () => {
    it('identifies shopify error objects', () => {
      expect(isShopifyError(new ShopifyError('test'))).to.be.true;
      expect(isShopifyError(new ShopifyHttpError('test'))).to.be.true;
      expect(isShopifyError(new ShopifyGraphQLError('test'))).to.be.true;
      expect(isShopifyError({ requestId: 'abc' })).to.be.true;
      expect(isShopifyError({ detail: 'abc' })).to.be.true;
      expect(isShopifyError(new Error('general'))).to.be.false;
      expect(isShopifyError(null)).to.be.false;
    });
  });

  describe('REST Error Decoration Integration', () => {
    it('decorates REST errors with statusCode, detail, and requestId', () => {
      scope.get('/admin/products/99999.json').reply(
        422,
        { errors: { title: ["can't be blank"] } },
        {
          'X-Request-Id': 'req-abc-999',
          'X-Shopify-Shop-Api-Call-Limit': '35/40'
        }
      );

      return shopify.product.get(99999).catch((err) => {
        expect(err.statusCode).to.equal(422);
        expect(err.requestId).to.equal('req-abc-999');
        expect(err.detail).to.equal("title: can't be blank");
        expect(err.rateLimit).to.deep.equal({
          current: 35,
          max: 40,
          remaining: 5
        });
      });
    });
  });

  describe('GraphQL Error Integration', () => {
    it('throws ShopifyGraphQLError with full error list on GraphQL failures', () => {
      const gqlErrors = [
        {
          message: 'Field "unknown" not found on type "Product"',
          locations: [{ line: 1, column: 10 }],
          path: ['products', 'unknown']
        }
      ];

      scope.post('/admin/api/graphql.json').reply(200, {
        errors: gqlErrors
      });

      return shopify.graphql('{ products { unknown } }').catch((err) => {
        expect(err).to.be.an.instanceof(ShopifyGraphQLError);
        expect(err.message).to.equal(
          'Field "unknown" not found on type "Product"'
        );
        expect(err.errors).to.deep.equal(gqlErrors);
        expect(err.locations).to.deep.equal(gqlErrors[0].locations);
        expect(err.path).to.deep.equal(['products', 'unknown']);
      });
    });
  });
});
