require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const ordersPath = path.join(__dirname, 'orders.json');

function readOrders() {
  try {
    if (!fs.existsSync(ordersPath)) return {};
    return JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
  } catch (error) {
    console.error('Could not read orders.json:', error);
    return {};
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 100);
}

function validHex(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

// Stripe needs the raw request body for webhook signature verification.
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;

  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('Webhook secret is not configured');
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Stripe webhook verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  const orders = readOrders();
  const session = event.data.object;
  const orderId = session.metadata?.orderId;

  if (orderId && orders[orderId]) {
    if (event.type === 'checkout.session.completed') {
      orders[orderId].status = session.payment_status === 'paid' ? 'PAID' : 'UNPAID';
      orders[orderId].stripePaymentStatus = session.payment_status;
      orders[orderId].updatedAt = new Date().toISOString();
      writeOrders(orders);
    }

    if (event.type === 'checkout.session.expired') {
      orders[orderId].status = 'EXPIRED';
      orders[orderId].updatedAt = new Date().toISOString();
      writeOrders(orders);
    }
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ success: false, error: 'Stripe is not configured on the server.' });
    }

    const username = cleanText(req.body.username, 'ImperialShroom');
    const followText = cleanText(req.body.followText, 'NEW FOLLOWER');
    const animationStyle = cleanText(req.body.animationStyle, 'pop');
    const accentColor = cleanText(req.body.accentColor, '#67e08a');
    const allowedStyles = ['pop', 'slide', 'zoom', 'shake'];

    if (!allowedStyles.includes(animationStyle)) {
      return res.status(400).json({ success: false, error: 'Invalid animation style.' });
    }
    if (!validHex(accentColor)) {
      return res.status(400).json({ success: false, error: 'Invalid accent colour.' });
    }

    const orderId = crypto.randomUUID();
    const orders = readOrders();
    orders[orderId] = {
      orderId,
      status: 'UNPAID',
      username,
      followText,
      animationStyle,
      accentColor,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    writeOrders(orders);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: { name: 'Shroom Alerts - Custom Stream Alert' },
          unit_amount: 100
        },
        quantity: 1
      }],
      metadata: { orderId },
      success_url: `${PUBLIC_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_URL}/cancel.html?order_id=${encodeURIComponent(orderId)}`
    });

    orders[orderId].stripeSessionId = session.id;
    writeOrders(orders);

    res.json({ success: true, checkoutUrl: session.url, orderId });
  } catch (error) {
    console.error('Checkout creation failed:', error);
    res.status(500).json({ success: false, error: 'Could not create the Stripe checkout session.' });
  }
});

app.get('/api/payment-status', async (req, res) => {
  try {
    const sessionId = cleanText(req.query.session_id);
    if (!sessionId) return res.status(400).json({ success: false, error: 'Missing session_id.' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === 'paid';
    const orderId = session.metadata?.orderId;
    const orders = readOrders();

    if (orderId && orders[orderId]) {
      orders[orderId].status = paid ? 'PAID' : 'UNPAID';
      orders[orderId].stripePaymentStatus = session.payment_status;
      orders[orderId].updatedAt = new Date().toISOString();
      writeOrders(orders);
    }

    res.json({ success: true, paid, status: paid ? 'PAID' : 'UNPAID', orderId: orderId || null });
  } catch (error) {
    console.error('Payment status check failed:', error);
    res.status(500).json({ success: false, error: 'Could not verify payment.' });
  }
});

app.get('/api/order/:orderId', (req, res) => {
  const order = readOrders()[req.params.orderId];
  if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
  res.json({ success: true, order });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'Not found.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Shroom Alerts server running on port ${PORT}`));
