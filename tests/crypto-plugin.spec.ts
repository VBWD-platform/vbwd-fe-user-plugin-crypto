/**
 * S137 fe-user crypto pay-panel — plugin registration.
 *
 * Named export, a `/pay/crypto` route, and a checkout dispatch entry bound to
 * the backend payment-method code `crypto` (redirect to the pay panel after
 * the invoice is created). Core checkout stays agnostic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { registerCheckoutPaymentMethod } = vi.hoisted(() => ({
  registerCheckoutPaymentMethod: vi.fn(),
}));
vi.mock('@/registries/checkoutPaymentMethods', () => ({
  registerCheckoutPaymentMethod,
}));
vi.mock('@/api', () => ({ api: { post: vi.fn(), get: vi.fn() } }));

import { cryptoPaymentPlugin } from '../index';

interface FakeRoute {
  path: string;
  name: string;
  component: unknown;
  meta?: Record<string, unknown>;
}

function installPlugin() {
  const routes: FakeRoute[] = [];
  const translations: Record<string, unknown> = {};
  const sdk = {
    addRoute: (route: FakeRoute) => routes.push(route),
    addTranslations: (locale: string, messages: unknown) => {
      translations[locale] = messages;
    },
  };
  cryptoPaymentPlugin.install(sdk as never);
  return { routes, translations };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cryptoPaymentPlugin', () => {
  it('is a named-export plugin with an install() function', () => {
    expect(cryptoPaymentPlugin.name).toBe('crypto');
    expect(typeof cryptoPaymentPlugin.install).toBe('function');
  });

  it('registers the /pay/crypto pay-panel route', () => {
    const { routes } = installPlugin();
    const payRoute = routes.find((route) => route.path === '/pay/crypto');
    expect(payRoute).toBeTruthy();
    expect(payRoute?.meta?.requiresAuth).toBe(true);
  });

  it('binds the checkout dispatch entry to method code "crypto" via redirectPath', () => {
    installPlugin();
    expect(registerCheckoutPaymentMethod).toHaveBeenCalledTimes(1);
    const [code, entry] = registerCheckoutPaymentMethod.mock.calls[0];
    expect(code).toBe('crypto');
    expect(entry.redirectPath('inv-9')).toBe('/pay/crypto?invoice=inv-9');
  });

  it('registers English translations', () => {
    const { translations } = installPlugin();
    expect(translations.en).toBeTruthy();
  });
});
