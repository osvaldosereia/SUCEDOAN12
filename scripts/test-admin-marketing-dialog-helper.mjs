import assert from 'node:assert/strict';
import { closeMarketingDialog } from '../vitrine/admin/marketing/dialog.js';

const calls = [];
const dialog = {
  close() { calls.push('close'); },
  remove() { calls.push('remove'); }
};
closeMarketingDialog(dialog);
assert.deepEqual(calls, ['close', 'remove']);

const failingDialog = {
  close() { calls.push('close-failed'); throw new Error('already closed'); },
  remove() { calls.push('remove-after-close-failed'); }
};
assert.doesNotThrow(() => closeMarketingDialog(failingDialog));
assert.deepEqual(calls.slice(-2), ['close-failed', 'remove-after-close-failed']);
console.log('Admin marketing dialog helper: PASS');
