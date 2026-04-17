import DodoPayments from 'dodopayments';

const client = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY,
  environment: process.env.DODO_PAYMENTS_ENV || 'test_mode', 
});

export default async function handler(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const dynamicReturnUrl = `${protocol}://${host}/success`;

    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: 'pdt_0NctNNHsYBD5I2J03QqEA', quantity: 1 }], 
      customer: { email: req.body.email, name: req.body.name },
      return_url: dynamicReturnUrl,
    });

    res.status(200).json({ url: session.checkout_url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}