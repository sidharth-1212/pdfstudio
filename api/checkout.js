import DodoPayments from 'dodopayments';

const isLocal = process.env.NODE_ENV !== 'production';

const isLive = !isLocal && process.env.DODO_PAYMENTS_ENV === 'live_mode';

const client = new DodoPayments({
  bearerToken: isLive ? process.env.DODO_PAYMENTS_API_KEY : 'bIRBvkbvsmsPunfa.bEqq-xD692wiUHMfSu6PiawABvmYC_jXg6dWwlr9yUhx_b_1',
  environment: isLive ? 'live_mode' : 'test_mode',
});

export default async function handler(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const dynamicReturnUrl = `${protocol}://${host}/success`;

    const targetProductId = isLive 
      ? 'pdt_0NctJmE1VBlXTsIoD8Sue'
      : 'pdt_0NctNNHsYBD5I2J03QqEA';

    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: targetProductId, quantity: 1 }], 
      customer: { email: req.body.email, name: req.body.name },
      return_url: dynamicReturnUrl,
    });

    res.status(200).json({ url: session.checkout_url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}