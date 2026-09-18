import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigator } from '../../src/app/navigation.ts';

test('navigator starts at home and accepts only known app routes', () => {
  const nav = createNavigator();
  assert.equal(nav.current(), 'home');

  nav.navigate('catalog');
  assert.equal(nav.current(), 'catalog');

  assert.throws(() => nav.navigate('unknown' as never), /Unknown app route/);
  assert.equal(nav.current(), 'catalog');
});

test('navigator notifies subscribers only when route actually changes', () => {
  const nav = createNavigator();
  const visited: string[] = [];
  const unsubscribe = nav.subscribe((route) => visited.push(route));

  nav.navigate('catalog');
  nav.navigate('catalog');
  nav.navigate('cart');
  unsubscribe();
  nav.navigate('home');

  assert.deepEqual(visited, ['catalog', 'cart']);
});
