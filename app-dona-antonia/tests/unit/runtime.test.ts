import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRuntime } from '../../src/platform/runtime.ts';

test('detectRuntime returns web when no native or standalone signals exist', () => {
  assert.equal(detectRuntime({}), 'web');
});

test('detectRuntime returns pwa for standalone display mode', () => {
  assert.equal(detectRuntime({ standalone: true }), 'pwa');
});

test('detectRuntime prefers native platform over pwa', () => {
  assert.equal(detectRuntime({ nativePlatform: 'android', standalone: true }), 'android');
  assert.equal(detectRuntime({ nativePlatform: 'ios', standalone: true }), 'ios');
});
