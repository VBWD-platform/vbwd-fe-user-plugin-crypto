import type { IPlugin, IPlatformSDK } from 'vbwd-view-component';
import { registerCheckoutPaymentMethod } from '@/registries/checkoutPaymentMethods';
import en from './locales/en.json';

/**
 * fe-user `crypto` plugin — the non-custodial on-chain pay panel (S137).
 *
 * When checkout selects the backend payment-method `code = "crypto"`, core's
 * agnostic dispatcher follows the ``redirectPath`` registered here and hops to
 * ``/pay/crypto``. The panel then drives the flow: create a charge, render the
 * address + QR, count down the rate lock, and poll status until settled.
 *
 * Named export per house convention (the pluginLoader falls back to the first
 * named export with ``.install``). No core / fe-core edits.
 */
export const cryptoPaymentPlugin: IPlugin = {
  name: 'crypto',
  version: '1.0.0',
  description: 'Non-custodial on-chain crypto payment — pay direct to the merchant wallet',
  _active: false,

  install(sdk: IPlatformSDK) {
    sdk.addRoute({
      path: '/pay/crypto',
      name: 'crypto-payment',
      component: () => import('./CryptoPayView.vue'),
      meta: { requiresAuth: true, noLayout: true },
    });

    sdk.addTranslations('en', en);

    // Agnostic post-checkout dispatch: hop to the pay panel after the invoice
    // is created. Core checkout never names the ``crypto`` method itself.
    registerCheckoutPaymentMethod('crypto', {
      redirectPath: (invoiceId) => `/pay/crypto?invoice=${invoiceId}`,
    });
  },

  activate() {
    this._active = true;
  },
  deactivate() {
    this._active = false;
  },
};

export default cryptoPaymentPlugin;
