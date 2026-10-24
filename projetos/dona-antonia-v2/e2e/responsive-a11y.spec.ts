import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'small mobile', width: 320, height: 740 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

for (const route of [
  { name: 'storefront', path: '/' },
  { name: 'admin', path: '/admin/' },
]) {
  for (const viewport of viewports) {
    test(`${route.name} has no document overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(route.path);

      const dimensions = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      expect(dimensions.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(
        dimensions.width + 2,
      );
    });
  }
}

for (const route of [
  { name: 'storefront', path: '/' },
  { name: 'admin', path: '/admin/' },
]) {
  test(`${route.name} meets automated WCAG 2.1 AA checks`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route.path);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      results.violations.map(({ id, impact, description, nodes }) => ({
        id,
        impact,
        description,
        elements: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });
}
