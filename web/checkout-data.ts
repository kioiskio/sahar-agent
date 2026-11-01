import { api, ApiError, type CheckoutOrder } from './api';

export async function readCheckout(orderId: string, token: string, signal: AbortSignal): Promise<CheckoutOrder> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
      const data = token ? await api.getPaymentOrder(orderId, token, bounded) : await api.getDemoCheckout(orderId, bounded);
      if (!data.order || data.order.id !== orderId || typeof data.order.status !== 'string' || !Number.isSafeInteger(data.order.amount_cents)) throw new Error('Checkout could not be loaded. Please try again.');
      return data.order;
    } catch (error) {
      if (signal.aborted || attempt === 1 || (error instanceof ApiError && error.status < 500 && error.status !== 408 && error.status !== 429)) throw error;
      // Only read-only requests are retried. Approval and capture stay explicit.
      await new Promise<void>(resolve => setTimeout(resolve, 700));
      signal.throwIfAborted();
    }
  }
  throw new Error('Checkout could not be loaded. Please try again.');
}
