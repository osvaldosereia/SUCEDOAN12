import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryDates, isNationalHoliday } from '../src/checkout.js';

function key(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('não oferece feriado nacional como data de entrega', () => {
  const holiday = new Date(2026, 8, 7, 8);
  assert.equal(isNationalHoliday(holiday), true);
  const dates = deliveryDates(holiday).map(key);
  assert.equal(dates.includes('2026-09-07'), false);
  assert.equal(dates[0], '2026-09-08');
});

test('após as 10h não oferece entrega no mesmo dia', () => {
  const dates = deliveryDates(new Date(2026, 6, 24, 11)).map(key);
  assert.equal(dates.includes('2026-07-24'), false);
});
