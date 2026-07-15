/**
 * S137 fe-user crypto pay-panel — the panel view.
 *
 * Covers: coin selector derives from provided config (not a hardcoded list),
 * create-charge on confirm, charge render (address + amount + QR from uri),
 * countdown + expiry -> re-quote, and the live-status poll state machine
 * (awaiting -> detected -> settled routes to the confirmation page;
 * underpaid stays; overpaid treated as paid; expired shows expired state).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const { createCharge, getChargeStatus, routerPush, routeQuery } = vi.hoisted(() => ({
  createCharge: vi.fn(),
  getChargeStatus: vi.fn(),
  routerPush: vi.fn(),
  routeQuery: { invoice: 'inv-1' } as { invoice?: string },
}));
vi.mock('../cryptoApi', () => ({
  createCharge: (...args: unknown[]) => createCharge(...args),
  getChargeStatus: (...args: unknown[]) => getChargeStatus(...args),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ push: routerPush }),
}));

import CryptoPayView from '../CryptoPayView.vue';

const POLL_INTERVAL_MS = 1000;

function makeCharge(overrides: Record<string, unknown> = {}) {
  return {
    charge_id: 'ch-1',
    address: 'bc1qexampleaddress',
    uri: 'bitcoin:bc1qexampleaddress?amount=0.00100000',
    crypto_amount: '0.00100000',
    coin: 'BTC',
    rate: '65000.00',
    rate_source: 'mock',
    status: 'awaiting',
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    rate_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    status_url: '/api/v1/plugins/crypto/charges/inv-1/status?coin=BTC',
    ...overrides,
  };
}

function makeStatus(overrides: Record<string, unknown> = {}) {
  return {
    status: 'awaiting',
    confirmations: 0,
    confirmations_required: 3,
    coin: 'BTC',
    crypto_amount: '0.00100000',
    address: 'bc1qexampleaddress',
    uri: 'bitcoin:bc1qexampleaddress?amount=0.00100000',
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    tx_hash: null,
    ...overrides,
  };
}

function mountPanel(coins?: Array<{ code: string; label: string }>) {
  return mount(CryptoPayView, {
    props: {
      pollIntervalMs: POLL_INTERVAL_MS,
      ...(coins ? { coins } : {}),
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { CryptoQrCode: { props: ['value'], template: '<div class="qr-stub" :data-uri="value" />' } },
    },
  });
}

async function confirmCoin(wrapper: ReturnType<typeof mountPanel>) {
  await wrapper.find('[data-test="confirm-coin"]').trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  routeQuery.invoice = 'inv-1';
  getChargeStatus.mockResolvedValue(makeStatus());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CryptoPayView — coin selector', () => {
  it('lists exactly the coins provided by config/props (no hardcoded coin list)', () => {
    const wrapper = mountPanel([{ code: 'XMR', label: 'Monero' }]);
    const options = wrapper.findAll('[data-test="coin-option"]');
    expect(options).toHaveLength(1);
    expect(options[0].text()).toContain('Monero');
    expect(wrapper.html()).not.toContain('Bitcoin');
  });
});

describe('CryptoPayView — create charge', () => {
  it('calls create-charge for the selected coin and renders address, amount and QR', async () => {
    createCharge.mockResolvedValue(makeCharge());
    const wrapper = mountPanel([{ code: 'BTC', label: 'Bitcoin' }]);

    await confirmCoin(wrapper);

    expect(createCharge).toHaveBeenCalledWith('inv-1', 'BTC');
    expect(wrapper.text()).toContain('bc1qexampleaddress');
    expect(wrapper.text()).toContain('0.00100000');
    const qr = wrapper.find('.qr-stub');
    expect(qr.exists()).toBe(true);
    expect(qr.attributes('data-uri')).toBe('bitcoin:bc1qexampleaddress?amount=0.00100000');
  });
});

describe('CryptoPayView — countdown and expiry', () => {
  it('shows a countdown then flips to an expired state offering a re-quote', async () => {
    vi.useFakeTimers();
    createCharge.mockResolvedValue(
      makeCharge({ expires_at: new Date(Date.now() + 3 * 1000).toISOString() }),
    );
    const wrapper = mountPanel([{ code: 'BTC', label: 'Bitcoin' }]);
    await confirmCoin(wrapper);

    expect(wrapper.find('[data-test="countdown"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(4000);

    expect(wrapper.find('[data-test="expired"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="requote"]').exists()).toBe(true);

    // Re-quote re-calls create-charge.
    createCharge.mockResolvedValue(makeCharge());
    await wrapper.find('[data-test="requote"]').trigger('click');
    await flushPromises();
    expect(createCharge).toHaveBeenCalledTimes(2);
  });
});

describe('CryptoPayView — status poll state machine', () => {
  it('awaiting -> detected -> settled routes to the confirmation page', async () => {
    vi.useFakeTimers();
    createCharge.mockResolvedValue(makeCharge());
    getChargeStatus
      .mockResolvedValueOnce(makeStatus({ status: 'awaiting' }))
      .mockResolvedValueOnce(makeStatus({ status: 'detected', confirmations: 1, confirmations_required: 3 }))
      .mockResolvedValueOnce(makeStatus({ status: 'settled', confirmations: 3, confirmations_required: 3 }));

    const wrapper = mountPanel([{ code: 'BTC', label: 'Bitcoin' }]);
    await confirmCoin(wrapper);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(wrapper.text()).toContain('awaiting');

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(wrapper.text()).toContain('1');
    expect(wrapper.text()).toContain('3');

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(routerPush).toHaveBeenCalledWith({
      name: 'checkout-confirmation',
      query: { invoice_id: 'inv-1' },
    });
  });

  it('underpaid shows a top-up hint and does NOT route away', async () => {
    vi.useFakeTimers();
    createCharge.mockResolvedValue(makeCharge());
    getChargeStatus.mockResolvedValue(makeStatus({ status: 'underpaid' }));

    const wrapper = mountPanel([{ code: 'BTC', label: 'Bitcoin' }]);
    await confirmCoin(wrapper);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(wrapper.find('[data-test="underpaid"]').exists()).toBe(true);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('overpaid is treated as paid and routes to the confirmation page', async () => {
    vi.useFakeTimers();
    createCharge.mockResolvedValue(makeCharge());
    getChargeStatus.mockResolvedValue(makeStatus({ status: 'overpaid' }));

    const wrapper = mountPanel([{ code: 'BTC', label: 'Bitcoin' }]);
    await confirmCoin(wrapper);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(routerPush).toHaveBeenCalledWith({
      name: 'checkout-confirmation',
      query: { invoice_id: 'inv-1' },
    });
  });

  it('a status of expired flips the panel to the expired state', async () => {
    vi.useFakeTimers();
    createCharge.mockResolvedValue(makeCharge());
    getChargeStatus.mockResolvedValue(makeStatus({ status: 'expired' }));

    const wrapper = mountPanel([{ code: 'BTC', label: 'Bitcoin' }]);
    await confirmCoin(wrapper);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(wrapper.find('[data-test="expired"]').exists()).toBe(true);
    expect(routerPush).not.toHaveBeenCalled();
  });
});
