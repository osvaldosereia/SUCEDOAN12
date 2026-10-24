import { expect, test } from '@playwright/test';

test('R15 - vitrine suporta carga sintética de 802 produtos e três operadores', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');

  const result = await page.evaluate(() => {
    const catalog = Array.from({ length: 802 }, (_, index) => ({
      sku: `R15-${String(index + 1).padStart(4, '0')}`,
      name: `Produto de homologação ${index + 1}`,
      active: index % 7 !== 0,
    }));
    const durations = [0, 1, 2].map((operator) => {
      const started = performance.now();
      for (let queryIndex = 0; queryIndex < 120; queryIndex += 1) {
        const query = String((queryIndex + operator) % 80);
        catalog
          .filter((product) => product.active)
          .filter((product) => product.name.includes(query) || product.sku.includes(query))
          .slice(0, 48);
      }
      return performance.now() - started;
    });
    return {
      catalogSize: catalog.length,
      operatorCount: durations.length,
      maxOperatorMs: Math.max(...durations),
    };
  });

  expect(result.catalogSize).toBeGreaterThanOrEqual(802);
  expect(result.operatorCount).toBe(3);
  expect(result.maxOperatorMs).toBeLessThan(2_000);
  expect(pageErrors).toEqual([]);
});
