# Stripe backend setup

The existing `index.html` was intentionally left unchanged.

## Files added

- `server.js` - Express server, checkout endpoint, webhook endpoint and payment-status endpoint.
- `package.json` - Node dependencies and start script.
- `orders.json` - local order status store for a traditional Node host.
- `success.html` - verifies the checkout session through the server.
- `cancel.html` - checkout cancellation page.
- `env.example.txt` - environment variable template.

## Local setup

1. Install Node.js.
2. Run `npm install`.
3. Copy `env.example.txt` to a local `.env` file.
4. Put your Stripe secret key and webhook signing secret in `.env`.
5. Set `PUBLIC_URL` to the public URL of the Node server.
6. Run `npm start`.

## Stripe webhook

Create a Stripe webhook pointing to:

`https://YOUR-DOMAIN/api/stripe-webhook`

Enable `checkout.session.completed` and `checkout.session.expired`.

Never commit `.env` or Stripe secret keys to GitHub.

## Important

GitHub Pages can host the existing static `index.html`, but it cannot run `server.js`. The payment backend needs a Node-compatible host.
