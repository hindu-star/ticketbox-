const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API = 'https://api.paystack.co';

export async function initializeTransaction({
  email,
  amount,
  reference,
  metadata,
  callbackUrl,
  subaccount,
  bearer,
}) {
  const body = {
    email,
    amount: Math.round(amount * 100), // Paystack uses kobo
    reference,
    metadata,
    callback_url: callbackUrl,
  };

  // If a subaccount is provided, Paystack will split the payment automatically
  if (subaccount) body.subaccount = subaccount;
  
  // 'account' means the main platform (TicketBox) bears the Paystack transaction fee
  if (bearer) body.bearer = bearer;

  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message || 'Paystack init failed');
  return data.data;
}

export async function verifyTransaction(reference) {
  const res = await fetch(`${PAYSTACK_API}/transaction/verify/${reference}`, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
    },
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message || 'Verification failed');
  return data.data;
}

export function generateReference() {
  return `TB-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

export function calculateFee(subtotal) {
  const percent = Number(process.env.NEXT_PUBLIC_SERVICE_FEE_PERCENT) || 5;
  return Math.round((subtotal * percent) / 100);
}
