describe('Shopify#webhook-utils', () => {
  'use strict';

  const expect = require('chai').expect;
  const crypto = require('crypto');
  const Shopify = require('..');
  const common = require('./common');

  const shopify = common.shopify;
  const secret = 'hush-test-secret';

  function sign(payload, key = secret) {
    return crypto.createHmac('sha256', key).update(payload).digest('base64');
  }

  describe('verifyWebhook', () => {
    it('returns true for a valid signature', () => {
      const payload = JSON.stringify({ id: 12345, name: 'Sample' });
      const hmac = sign(payload);

      expect(Shopify.verifyWebhook(payload, hmac, secret)).to.be.true;
      expect(shopify.webhook.verify(payload, hmac, secret)).to.be.true;
    });

    it('returns true when rawBody is a Buffer', () => {
      const payload = Buffer.from('{"id":12345}');
      const hmac = sign(payload);

      expect(Shopify.verifyWebhook(payload, hmac, secret)).to.be.true;
      expect(shopify.webhook.verify(payload, hmac, secret)).to.be.true;
    });

    it('returns false for tampered body or invalid signature', () => {
      const payload = '{"id":12345}';
      const hmac = sign(payload);

      expect(Shopify.verifyWebhook('{"id":99999}', hmac, secret)).to.be.false;
      expect(Shopify.verifyWebhook(payload, 'invalid-signature', secret)).to.be
        .false;
      expect(Shopify.verifyWebhook(payload, hmac, 'wrong-secret')).to.be.false;
    });

    it('returns false for missing or null parameters', () => {
      expect(Shopify.verifyWebhook(null, 'hmac', secret)).to.be.false;
      expect(Shopify.verifyWebhook('body', '', secret)).to.be.false;
      expect(Shopify.verifyWebhook('body', 'hmac', '')).to.be.false;
    });
  });

  describe('parseWebhookHeaders', () => {
    it('extracts case-insensitive headers correctly', () => {
      const rawHeaders = {
        'X-Shopify-Topic': 'orders/create',
        'X-Shopify-Hmac-Sha256': 'abc123hmac==',
        'X-Shopify-Shop-Domain': 'test-shop.myshopify.com',
        'X-Shopify-Api-Version': '2024-01',
        'X-Shopify-Webhook-Id': 'wh-998877'
      };

      const parsed = Shopify.parseWebhookHeaders(rawHeaders);
      expect(parsed).to.deep.equal({
        topic: 'orders/create',
        hmac: 'abc123hmac==',
        shop: 'test-shop.myshopify.com',
        apiVersion: '2024-01',
        webhookId: 'wh-998877'
      });
      expect(shopify.webhook.parseHeaders(rawHeaders)).to.deep.equal(parsed);
    });

    it('handles missing headers gracefully', () => {
      const parsed = Shopify.parseWebhookHeaders({});
      expect(parsed.topic).to.be.undefined;
      expect(parsed.hmac).to.be.undefined;
      expect(Shopify.parseWebhookHeaders(null)).to.be.an('object');
    });
  });

  describe('createWebhookHandler', () => {
    it('verifies signature and passes payload to onWebhook callback', (done) => {
      const rawBody = JSON.stringify({ id: 101, title: 'Order #101' });
      const hmac = sign(rawBody);

      const req = {
        headers: {
          'x-shopify-topic': 'orders/create',
          'x-shopify-hmac-sha256': hmac,
          'x-shopify-shop-domain': 'test.myshopify.com'
        },
        rawBody
      };

      const res = {
        statusCode: 0,
        end: () => {}
      };

      const handler = shopify.webhook.createHandler({
        secret,
        onWebhook: (data) => {
          expect(data.topic).to.equal('orders/create');
          expect(data.shop).to.equal('test.myshopify.com');
          expect(data.body).to.deep.equal({ id: 101, title: 'Order #101' });
          done();
        }
      });

      handler(req, res);
    });

    it('responds with 401 when signature is invalid', (done) => {
      const req = {
        headers: {
          'x-shopify-topic': 'orders/create',
          'x-shopify-hmac-sha256': 'invalid-hmac'
        },
        rawBody: '{"id":101}'
      };

      let statusCalled = 0;
      const res = {
        status: (code) => {
          statusCalled = code;
          return {
            send: (body) => {
              expect(statusCalled).to.equal(401);
              expect(body).to.equal('Unauthorized');
              done();
            }
          };
        }
      };

      const handler = Shopify.createWebhookHandler({ secret });
      handler(req, res);
    });
  });
});
