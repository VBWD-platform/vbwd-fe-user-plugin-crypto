# crypto (fe-user) — non-custodial on-chain pay panel

fe-user plugin for S137. After checkout selects the backend payment method
`code = "crypto"` ("Crypto (on-chain)"), core's agnostic dispatcher follows the
`redirectPath` registered here and hops to `/pay/crypto?invoice=<id>`.

The pay panel (`CryptoPayView.vue`):

1. **Coin selector** — the enabled coins come from `config.json` (`enabledCoins`)
   or an injected `coins` prop; no coin list is hardcoded in logic.
2. **Create charge** — on confirm, `POST /plugins/crypto/create-charge`
   `{ invoice_id, coin }` and renders the returned address (copyable), the exact
   `crypto_amount` + coin, and a **client-side QR** (`CryptoQrCode.vue`) built
   from the returned BIP21/EIP-681 `uri` as inline SVG — no remote image, no
   network at render (CSP/offline safe).
3. **Countdown** — ticks down to `expires_at` (the rate-lock window); on expiry
   the panel shows an expired state and offers "get a new quote" (re-quote).
4. **Live status** — polls `GET /plugins/crypto/charges/<invoice_id>/status?coin=`
   on an interval and reflects `awaiting → detected (confirmations/…required) →
   settled`. On `settled`/`overpaid` it routes to `checkout-confirmation`;
   `underpaid` shows a top-up hint; `expired` flips to the expired state.

## Extension seam used

`registerCheckoutPaymentMethod('crypto', { redirectPath })` from
`@/registries/checkoutPaymentMethods`. Core checkout never names the method.
No core / fe-core edits.

## Dependency

`qrcode-generator` — pure-JS QR encoder used to build the inline SVG matrix in
the browser. It performs no network access at render.

## Test

```
npx vitest run plugins/crypto/
```
