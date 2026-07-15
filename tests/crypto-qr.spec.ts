/**
 * S137 fe-user crypto pay-panel — client-side QR rendering.
 *
 * The QR is generated in the browser from the returned BIP21/EIP-681 `uri`.
 * It MUST render as inline SVG (CSP/offline safe) — never a remote <img src>.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CryptoQrCode from '../CryptoQrCode.vue';

const BITCOIN_URI = 'bitcoin:bc1qexampleaddress?amount=0.00100000';

describe('CryptoQrCode', () => {
  it('renders an inline SVG generated from the uri (no remote image)', () => {
    const wrapper = mount(CryptoQrCode, { props: { value: BITCOIN_URI } });
    const html = wrapper.html();
    expect(wrapper.find('svg').exists()).toBe(true);
    // No remote image — no <img>, and nothing fetches an external resource
    // (the only URL is the SVG XML namespace, which is not a network request).
    expect(wrapper.find('img').exists()).toBe(false);
    expect(html).not.toContain('src=');
    expect(html).not.toContain('href="http');
    expect(html).not.toContain('url(http');
  });

  it('regenerates when the uri prop changes', async () => {
    const wrapper = mount(CryptoQrCode, { props: { value: BITCOIN_URI } });
    const first = wrapper.find('svg').html();

    await wrapper.setProps({
      value: 'ethereum:0xabc0000000000000000000000000000000000001?value=1',
    });
    const second = wrapper.find('svg').html();

    expect(second).not.toBe(first);
  });
});
