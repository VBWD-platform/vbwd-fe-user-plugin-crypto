/**
 * S137 fe-user crypto pay-panel — API wrapper contract.
 *
 * The panel talks to the backend `crypto` plugin through two calls only:
 *   POST /plugins/crypto/create-charge  { invoice_id, coin }
 *   GET  /plugins/crypto/charges/<invoice_id>/status?coin=<coin>
 * (baseURL is `/api/v1`, so the `/api/v1` prefix is added by the client.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api', () => ({ api: { post: vi.fn(), get: vi.fn() } }));

import { api } from '@/api';
import { createCharge, getChargeStatus } from '../cryptoApi';

const post = api.post as ReturnType<typeof vi.fn>;
const get = api.get as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cryptoApi.createCharge', () => {
  it('POSTs create-charge with the exact { invoice_id, coin } payload', async () => {
    post.mockResolvedValue({ charge_id: 'ch-1', coin: 'BTC' });

    await createCharge('inv-123', 'BTC');

    expect(post).toHaveBeenCalledWith('/plugins/crypto/create-charge', {
      invoice_id: 'inv-123',
      coin: 'BTC',
    });
  });

  it('returns the parsed charge body from the client', async () => {
    const charge = {
      charge_id: 'ch-1',
      address: 'bc1qexample',
      uri: 'bitcoin:bc1qexample?amount=0.001',
      crypto_amount: '0.00100000',
      coin: 'BTC',
      rate: '65000.00',
      rate_source: 'mock',
      status: 'awaiting',
      expires_at: '2026-07-14T12:15:00Z',
      rate_expires_at: '2026-07-14T12:05:00Z',
      status_url: '/api/v1/plugins/crypto/charges/inv-123/status?coin=BTC',
    };
    post.mockResolvedValue(charge);

    await expect(createCharge('inv-123', 'BTC')).resolves.toEqual(charge);
  });
});

describe('cryptoApi.getChargeStatus', () => {
  it('GETs the per-invoice status endpoint with the coin query param', async () => {
    get.mockResolvedValue({ status: 'awaiting' });

    await getChargeStatus('inv-123', 'ETH');

    expect(get).toHaveBeenCalledWith(
      '/plugins/crypto/charges/inv-123/status?coin=ETH',
    );
  });
});
