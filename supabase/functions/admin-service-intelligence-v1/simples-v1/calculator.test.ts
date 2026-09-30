import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRbt12, calculateEffectiveRate } from './calculator.ts';

const brackets = [
  { min: 0, max: 180000, nominalRate: 0.04, deduction: 0, shares: { irpj:0.055, csll:0.035, cofins:0.1274, pis:0.0276, cpp:0.415, icms:0.34 } },
  { min: 180000.01, max: 360000, nominalRate: 0.073, deduction: 5940, shares: { irpj:0.055, csll:0.035, cofins:0.1274, pis:0.0276, cpp:0.415, icms:0.34 } },
  { min: 360000.01, max: 720000, nominalRate: 0.095, deduction: 13860, shares: { irpj:0.055, csll:0.035, cofins:0.1274, pis:0.0276, cpp:0.42, icms:0.335 } },
];

test('calculateRbt12 sums exactly 12 contiguous prior months', () => {
  const months = Array.from({length:12}, (_,i) => ({ month: `2025-${String(i+1).padStart(2,'0')}`, amount: 10000 }));
  const r = calculateRbt12(months);
  assert.equal(r.complete, true);
  assert.equal(r.rbt12, 120000);
  assert.deepEqual(r.missingMonths, []);
});

test('calculateRbt12 blocks incomplete history', () => {
  const months = Array.from({length:11}, (_,i) => ({ month: `2025-${String(i+1).padStart(2,'0')}`, amount: 10000 }));
  const r = calculateRbt12(months);
  assert.equal(r.complete, false);
  assert.equal(r.rbt12, null);
  assert.ok(r.missingMonths.length >= 1);
});

test('calculateEffectiveRate selects the correct bracket boundary', () => {
  const atBoundary = calculateEffectiveRate({ rbt12:180000, brackets, bases:[{name:'normal',amount:10000,reliefComponents:[]}] });
  assert.equal(atBoundary.bracket.nominalRate, 0.04);
  const above = calculateEffectiveRate({ rbt12:180000.01, brackets, bases:[{name:'normal',amount:10000,reliefComponents:[]}] });
  assert.equal(above.bracket.nominalRate, 0.073);
});

test('calculateEffectiveRate applies Annex I formula and component reliefs', () => {
  const normal = calculateEffectiveRate({ rbt12:300000, brackets, bases:[{name:'normal',amount:10000,reliefComponents:[]}] });
  assert.equal(normal.effectiveRate, 0.0532);
  assert.equal(normal.estimatedDas, 532);
  const st = calculateEffectiveRate({ rbt12:300000, brackets, bases:[{name:'st',amount:10000,reliefComponents:['icms']}] });
  assert.equal(st.estimatedDas, 351.12);
  const mono = calculateEffectiveRate({ rbt12:300000, brackets, bases:[{name:'mono',amount:10000,reliefComponents:['pis','cofins']}] });
  assert.equal(mono.estimatedDas, 449.54);
  const both = calculateEffectiveRate({ rbt12:300000, brackets, bases:[{name:'both',amount:10000,reliefComponents:['icms','pis','cofins']}] });
  assert.equal(both.estimatedDas, 268.66);
});

test('calculateEffectiveRate clamps negative recognized base and rounds cents deterministically', () => {
  const r = calculateEffectiveRate({ rbt12:300000, brackets, bases:[
    {name:'negative',amount:-100,reliefComponents:[]},
    {name:'fractional',amount:333.33,reliefComponents:[]}
  ]});
  assert.equal(r.bases[0].taxableAmount, 0);
  assert.equal(r.bases[1].taxAmount, 17.73);
  assert.equal(r.estimatedDas, 17.73);
});
