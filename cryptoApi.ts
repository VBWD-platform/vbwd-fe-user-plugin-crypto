/**
 * S137 fe-user crypto pay-panel — thin API wrapper.
 *
 * The panel drives the non-custodial on-chain flow through the backend
 * `crypto` plugin using two calls only. The shared API client's baseURL is
 * `/api/v1`, so paths here are relative to that prefix.
 *
 * Keeping the HTTP surface in one module (DRY / single source) lets the view
 * depend on named functions it can mock, rather than on the client directly.
 */
import { api } from '@/api';

const CRYPTO_API_PREFIX = '/plugins/crypto';

/** Lifecycle of an on-chain charge as reported by the backend. */
export type CryptoChargeStatusCode =
  | 'awaiting'
  | 'detected'
  | 'settled'
  | 'underpaid'
  | 'overpaid'
  | 'expired';

/** Payload returned by `create-charge` (amounts are decimal strings). */
export interface CryptoCharge {
  charge_id: string;
  address: string;
  uri: string;
  crypto_amount: string;
  coin: string;
  rate: string;
  rate_source: string;
  status: CryptoChargeStatusCode;
  expires_at: string;
  rate_expires_at: string;
  status_url: string;
}

/** Payload returned by the status poll endpoint. */
export interface CryptoChargeStatus {
  status: CryptoChargeStatusCode;
  confirmations: number;
  confirmations_required: number;
  coin: string;
  crypto_amount: string;
  address: string;
  uri: string;
  expires_at: string;
  tx_hash: string | null;
}

/** Create (or re-quote) an on-chain charge for the given invoice and coin. */
export function createCharge(invoiceId: string, coin: string): Promise<CryptoCharge> {
  return api.post<CryptoCharge>(`${CRYPTO_API_PREFIX}/create-charge`, {
    invoice_id: invoiceId,
    coin,
  });
}

/** Poll the current on-chain settlement status for an invoice + coin. */
export function getChargeStatus(
  invoiceId: string,
  coin: string,
): Promise<CryptoChargeStatus> {
  const query = new URLSearchParams({ coin }).toString();
  return api.get<CryptoChargeStatus>(
    `${CRYPTO_API_PREFIX}/charges/${invoiceId}/status?${query}`,
  );
}
