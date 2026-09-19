import assert from 'node:assert/strict';
import {normalizeMetaMetricSnapshot,normalizePinterestMetricSnapshot} from './marketing-channel-metrics-adapters-v1.mjs';

const meta=normalizeMetaMetricSnapshot({channel:'instagram_feed',id:'ig_123',captured_at:'2026-09-19T04:00:00Z',insights:[{name:'reach',value:120},{name:'impressions',value:180},{name:'views',value:90},{name:'engagement',value:14},{name:'saved',value:4},{name:'shares',value:2}]});
assert.equal(meta.provider,'meta');
assert.deepEqual(meta.metrics,{reach:120,impressions:180,views:90,engagement:14,saves:4,shares:2});
assert.equal(meta.evidence.external_side_effect,false);
assert.match(meta.evidence_key,/^meta:instagram_feed:ig_123:/);

const pin=normalizePinterestMetricSnapshot({pin_id:'pin_1',captured_at:'2026-09-19T04:00:00Z',metrics:{impressions:55,video_views:10,engagements:7,saves:3}});
assert.equal(pin.provider,'pinterest');
assert.deepEqual(pin.metrics,{reach:0,impressions:55,views:10,engagement:7,saves:3,shares:0});
assert.equal(pin.evidence.external_side_effect,false);
assert.match(pin.evidence_key,/^pinterest:pinterest:pin_1:/);

assert.throws(()=>normalizeMetaMetricSnapshot({channel:'instagram_feed',captured_at:'2026-09-19T04:00:00Z'}),/identity_required/);
console.log('marketing-channel-metrics-adapters-v1: ok');
