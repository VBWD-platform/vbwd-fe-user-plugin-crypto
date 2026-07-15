<template>
  <svg
    class="crypto-qr"
    :viewBox="`0 0 ${dimension} ${dimension}`"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Payment QR code"
  >
    <rect
      :width="dimension"
      :height="dimension"
      fill="#ffffff"
    />
    <rect
      v-for="cell in darkCells"
      :key="cell.key"
      :x="cell.x"
      :y="cell.y"
      width="1"
      height="1"
      fill="#000000"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import qrcode from 'qrcode-generator';

/**
 * Inline-SVG QR code generated entirely in the browser from a payment `uri`
 * (BIP21 / EIP-681). The dark modules are rendered as Vue-controlled <rect>s,
 * so nothing is fetched over the network and there is no v-html/XSS surface —
 * safe under a strict CSP and offline. `qrcode-generator` picks the smallest
 * type number automatically (error-correction level M).
 */
const props = withDefaults(
  defineProps<{ value: string; margin?: number }>(),
  { margin: 2 },
);

const AUTOMATIC_TYPE_NUMBER = 0;
const ERROR_CORRECTION_LEVEL = 'M';

interface QrCell {
  key: string;
  x: number;
  y: number;
}

const matrix = computed(() => {
  const generator = qrcode(AUTOMATIC_TYPE_NUMBER, ERROR_CORRECTION_LEVEL);
  generator.addData(props.value);
  generator.make();
  return generator;
});

const dimension = computed(() => matrix.value.getModuleCount() + props.margin * 2);

const darkCells = computed<QrCell[]>(() => {
  const cells: QrCell[] = [];
  const count = matrix.value.getModuleCount();
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (matrix.value.isDark(row, column)) {
        cells.push({
          key: `${row}-${column}`,
          x: column + props.margin,
          y: row + props.margin,
        });
      }
    }
  }
  return cells;
});
</script>

<style scoped>
.crypto-qr {
  display: block;
  width: 100%;
  max-width: 240px;
  height: auto;
  margin: 0 auto;
}
</style>
