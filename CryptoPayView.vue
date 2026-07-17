<template>
  <div class="crypto-pay vbwd-card">
    <h1 class="vbwd-heading">
      {{ $t('crypto.pay.title') }}
    </h1>

    <p
      v-if="!invoiceId"
      class="crypto-pay__error"
    >
      {{ $t('crypto.pay.noInvoice') }}
    </p>

    <!-- Phase 1: pick a coin, then request the on-chain charge. -->
    <div
      v-else-if="!charge && !expired"
      class="crypto-pay__select"
    >
      <label
        class="vbwd-subheading"
        for="crypto-coin"
      >{{ $t('crypto.pay.chooseCoin') }}</label>
      <select
        id="crypto-coin"
        v-model="selectedCoin"
        class="vbwd-select"
      >
        <option
          v-for="coin in coins"
          :key="coin.code"
          data-test="coin-option"
          :value="coin.code"
        >
          {{ coin.label }} ({{ coin.code }})
        </option>
      </select>
      <p
        v-if="error"
        class="crypto-pay__error"
      >
        {{ error }}
      </p>
      <button
        class="vbwd-btn vbwd-btn--primary"
        data-test="confirm-coin"
        :disabled="loading || !selectedCoin"
        @click="requestCharge"
      >
        {{ loading ? $t('crypto.pay.creating') : $t('crypto.pay.confirm') }}
      </button>
    </div>

    <!-- Phase 3: the rate-lock window elapsed (locally or per the backend). -->
    <div
      v-else-if="expired"
      class="crypto-pay__expired"
      data-test="expired"
    >
      <p>{{ $t('crypto.pay.expired') }}</p>
      <button
        class="vbwd-btn vbwd-btn--primary"
        data-test="requote"
        :disabled="loading"
        @click="requestCharge"
      >
        {{ $t('crypto.pay.requote') }}
      </button>
    </div>

    <!-- Phase 2: render the live charge. `expired` is handled above, so this
         branch is only reached with a non-null charge — v-else-if narrows the
         ref for the template type-checker. -->
    <div
      v-else-if="charge"
      class="crypto-pay__charge"
    >
      <CryptoQrCode :value="charge.uri" />

      <div class="crypto-pay__amount">
        <span class="vbwd-subheading">{{ $t('crypto.pay.sendExactly') }}</span>
        <strong>{{ charge.crypto_amount }} {{ charge.coin }}</strong>
      </div>

      <div class="crypto-pay__address">
        <code>{{ charge.address }}</code>
        <button
          class="vbwd-btn vbwd-btn--ghost vbwd-btn--sm"
          data-test="copy-address"
          @click="copyAddress"
        >
          {{ copied ? $t('crypto.pay.copied') : $t('crypto.pay.copy') }}
        </button>
      </div>

      <p
        class="crypto-pay__countdown"
        data-test="countdown"
      >
        {{ $t('crypto.pay.expiresIn') }}: {{ formattedCountdown }}
      </p>

      <p
        v-if="statusCode === 'awaiting'"
        class="crypto-pay__status"
      >
        {{ $t('crypto.pay.status.awaiting') }} · awaiting
      </p>
      <p
        v-else-if="statusCode === 'detected'"
        class="crypto-pay__status"
        data-test="detected"
      >
        {{ $t('crypto.pay.status.detected') }}:
        {{ status?.confirmations }} / {{ status?.confirmations_required }}
      </p>
      <p
        v-else-if="statusCode === 'underpaid'"
        class="crypto-pay__status crypto-pay__status--warn"
        data-test="underpaid"
      >
        {{ $t('crypto.pay.status.underpaid') }}
      </p>
    </div>
  </div>
</template>

<script lang="ts">
import config from './config.json';

export interface Coin {
  code: string;
  label: string;
}

// Module-scope so the `withDefaults` factory below may reference them (Vue
// forbids defineProps defaults from touching `<script setup>` locals). The
// enabled coins and poll cadence are config-driven — never hardcoded here.
const configuredCoins = config.enabledCoins as Coin[];
const defaultPollIntervalMs = config.pollIntervalMs as number;
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CryptoQrCode from './CryptoQrCode.vue';
import {
  createCharge as createChargeRequest,
  getChargeStatus,
  type CryptoCharge,
  type CryptoChargeStatus,
  type CryptoChargeStatusCode,
} from './cryptoApi';

const props = withDefaults(
  defineProps<{ coins?: Coin[]; pollIntervalMs?: number }>(),
  {
    coins: () => configuredCoins,
    pollIntervalMs: defaultPollIntervalMs,
  },
);

const route = useRoute();
const router = useRouter();

const invoiceId = computed(() => (route.query.invoice as string) || '');

const selectedCoin = ref<string>(props.coins[0]?.code ?? '');
const charge = ref<CryptoCharge | null>(null);
const status = ref<CryptoChargeStatus | null>(null);
const statusCode = computed<CryptoChargeStatusCode | null>(
  () => status.value?.status ?? charge.value?.status ?? null,
);

const loading = ref(false);
const error = ref<string | null>(null);
const expired = ref(false);
const copied = ref(false);
const remainingSeconds = ref(0);

let countdownTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const SETTLED_STATUSES: CryptoChargeStatusCode[] = ['settled', 'overpaid'];

const formattedCountdown = computed(() => {
  const total = remainingSeconds.value;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
});

async function requestCharge(): Promise<void> {
  if (!invoiceId.value || !selectedCoin.value) {
    error.value = 'No invoice or coin selected';
    return;
  }
  loading.value = true;
  error.value = null;
  expired.value = false;
  status.value = null;
  try {
    charge.value = await createChargeRequest(invoiceId.value, selectedCoin.value);
    startCountdown();
    startPolling();
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Failed to create charge';
  } finally {
    loading.value = false;
  }
}

function startCountdown(): void {
  stopCountdown();
  updateRemaining();
  countdownTimer = setInterval(updateRemaining, 1000);
}

function updateRemaining(): void {
  if (!charge.value) return;
  const millisecondsLeft = new Date(charge.value.expires_at).getTime() - Date.now();
  remainingSeconds.value = Math.max(0, Math.ceil(millisecondsLeft / 1000));
  if (millisecondsLeft <= 0) handleExpiry();
}

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(pollOnce, props.pollIntervalMs);
}

async function pollOnce(): Promise<void> {
  if (!charge.value) return;
  let latest: CryptoChargeStatus;
  try {
    latest = await getChargeStatus(invoiceId.value, selectedCoin.value);
  } catch {
    // Transient poll failure — keep the interval alive and retry next tick.
    return;
  }
  status.value = latest;
  if (SETTLED_STATUSES.includes(latest.status)) {
    finishPaid();
  } else if (latest.status === 'expired') {
    handleExpiry();
  }
}

function finishPaid(): void {
  stopPolling();
  stopCountdown();
  router.push({ name: 'checkout-confirmation', query: { invoice_id: invoiceId.value } });
}

function handleExpiry(): void {
  expired.value = true;
  charge.value = null;
  stopCountdown();
  stopPolling();
}

async function copyAddress(): Promise<void> {
  if (!charge.value || typeof navigator === 'undefined' || !navigator.clipboard) return;
  await navigator.clipboard.writeText(charge.value.address);
  copied.value = true;
}

function stopCountdown(): void {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onBeforeUnmount(() => {
  stopCountdown();
  stopPolling();
});
</script>

<style scoped>
.crypto-pay {
  max-width: 480px;
  margin: 3rem auto;
  padding: 1.5rem;
  text-align: center;
}
.crypto-pay__select,
.crypto-pay__charge,
.crypto-pay__expired {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}
.crypto-pay__amount strong {
  font-size: 1.25rem;
}
.crypto-pay__address {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}
.crypto-pay__address code {
  word-break: break-all;
  font-family: monospace;
}
.crypto-pay__countdown {
  color: var(--vbwd-muted, #6b7280);
}
.crypto-pay__status--warn {
  color: var(--vbwd-warning, #b45309);
}
.crypto-pay__error {
  color: var(--vbwd-danger, #b91c1c);
}
</style>
