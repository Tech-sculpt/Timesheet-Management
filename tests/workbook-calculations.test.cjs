const { test } = require('node:test');
const assert = require('node:assert/strict');
const calculations = require('../assets/workbook-calculations.js');

test('working days exclude weekends and public holidays, including leap day', () => {
  assert.equal(calculations.networkDays('2024-02-28', '2024-03-04', ['2024-02-29']), 3);
  assert.equal(calculations.networkDays('2024-03-04', '2024-02-28', []), 0);
});

test('week numbers follow Excel Monday-based calendar weeks at year boundaries', () => {
  assert.equal(calculations.excelWeekNum('2023-01-01'), 1);
  assert.equal(calculations.excelWeekNum('2023-01-02'), 2);
});

test('billing metrics exclude leave and records outside the selected period', () => {
  const entries = [
    { date: '2026-11-02', type: 'Chargeable', hours: 6 },
    { date: '2026-11-02', type: 'Non-Chargeable', hours: 2 },
    { date: '2026-11-03', type: 'Leave', hours: 8 },
    { date: '2026-10-30', type: 'Chargeable', hours: 8 },
  ];
  const result = calculations.metrics(entries, '2026-11-01', '2026-11-30', (row) => row.hours);
  assert.equal(result.total, 8);
  assert.equal(result.billingRate, 0.75);
  assert.equal(result.reconciliation, 0);
});
