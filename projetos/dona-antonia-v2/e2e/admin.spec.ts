import { expect, test } from '@playwright/test';

test('admin: extras e produtos são editáveis somente no modo demonstrativo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await page.getByRole('button', { name: 'Tipos de produto' }).click();
  await expect(page.getByRole('heading', { name: 'Tipos de produto' })).toBeVisible();
  await page.getByRole('button', { name: 'Produtos extras' }).click();
  await expect(
    page.getByRole('heading', { name: 'Grupos exibidos na etapa de extras' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Produtos permitidos — Biscoitos' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Desativar Biscoitos' }).click();
  await expect(page.getByRole('button', { name: 'Ativar Biscoitos' })).toBeVisible();
  await page.getByRole('button', { name: 'Ativar Biscoitos' }).click();

  // Novo tipo extra, depois vinculação de produto existente.
  await page.getByRole('textbox', { name: 'Nome do tipo extra' }).fill('Enlatados');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Produtos permitidos — Enlatados' }),
  ).toBeVisible();
  const row = page
    .getByRole('group', { name: 'Produtos do tipo extra' })
    .locator('label.check-row')
    .filter({ hasText: 'Óleo de Soja Concord 900 ml' });
  await row.locator('input[type="checkbox"]').check();
  await expect(row.locator('input[type="checkbox"]')).toBeChecked();

  await page.getByRole('button', { name: 'Cestas básicas' }).click();
  await expect(page.getByRole('heading', { name: 'Cestas básicas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Composição: Mini/ })).toBeVisible();
  // Valor por cesta permanece privado no admin, separado dos preços da vitrine.
  const fee = page.getByLabel('Valor interno da cesta (R$)');
  await fee.fill('7.5');
  await expect(fee).toHaveValue('7.5');
  await page
    .locator('.type-list')
    .getByRole('button', { name: /^Econômica/ })
    .click();
  await expect(fee).toHaveValue('0');
  await page.locator('.type-list').getByRole('button', { name: /^Mini/ }).click();
  await expect(fee).toHaveValue('7.5');
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('admin mobile: abas navegáveis sem estouro horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('button', { name: 'Produtos extras' })).toBeVisible();
  await page.getByRole('button', { name: 'Produtos extras' }).click();
  await expect(
    page.getByRole('heading', { name: 'Grupos exibidos na etapa de extras' }),
  ).toBeVisible();
  const firstGroup = page.locator('.extra-admin-group').first();
  await expect(firstGroup).toBeVisible();
  const groupButton = await firstGroup.locator('.extra-group-name').boundingBox();
  expect(groupButton?.width ?? 0).toBeGreaterThan(200);
  // Apenas overflow local de tabelas, sem quebrar a largura do documento.
  const info = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('*')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > window.innerWidth + 2 || rect.left < -2;
      })
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        scrollWidth: element.scrollWidth,
      })),
  }));
  expect(
    info.scrollWidth,
    'Overflow suspects: ' + JSON.stringify(info.offenders),
  ).toBeLessThanOrEqual(info.innerWidth + 2);
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
});

test('navegação agrupada, atalhos e histórico preservam a seção', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Seções do administrador' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pedidos' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Clientes' })).toBeEnabled();
  await page.getByRole('button', { name: /Configurar cestas/ }).click();
  await expect(page.getByRole('heading', { name: 'Cestas básicas' })).toBeVisible();
  await expect(page).toHaveURL(/secao=cestas/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Expandir menu' }).click();
  await expect(page.getByRole('button', { name: 'Recolher menu' })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-inicio-desktop.png', fullPage: true });
});

test('busca global de seções e de produtos', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/admin/');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Buscar no administrador' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Buscar no administrador' }).fill('cestas');
  await dialog.getByRole('button', { name: 'Cestas básicas' }).click();
  await expect(page.getByRole('heading', { name: 'Cestas básicas' })).toBeVisible();
  await page.getByRole('button', { name: 'Buscar no administrador' }).click();
  await dialog.getByRole('textbox', { name: 'Buscar no administrador' }).fill('Arroz Caibi');
  await dialog.getByRole('button', { name: /Arroz Caibi/ }).click();
  await expect(page.getByRole('heading', { name: 'Produtos', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Buscar produtos' })).toHaveValue(/Arroz Caibi/);
  await expect(page.getByText('1 produto(s) encontrado(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Sem estoque' }).click();
  await expect(page.getByText('Nenhum produto encontrado.')).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('menu mobile abre como gaveta e preserva o espaço de trabalho', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/');
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('button', { name: 'Cestas básicas' })).toBeVisible();
  await page.getByRole('button', { name: 'Cestas básicas' }).click();
  await expect(page.getByRole('heading', { name: 'Cestas básicas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('.da-side')).toHaveCSS('visibility', 'hidden');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/admin-cestas-mobile.png', fullPage: true });
});

test('gestão de pedidos: quatro estados, conferência e nota independente', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/admin/?secao=pedidos');
  await expect(page.getByRole('heading', { name: 'Pedidos', exact: true })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Etapas dos pedidos' });
  await expect(tabs.getByRole('tab')).toHaveCount(4);
  await tabs.getByRole('tab', { name: /^Novo / }).click();
  await page.getByRole('button', { name: /DEMO-2026-001/ }).click();
  await expect(page.getByRole('article', { name: /Detalhes do pedido/ })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar separação' }).click();
  await expect(page.getByRole('tab', { name: /Em separação/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Concluir separação' })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir separação' }).click();
  await expect(page.getByRole('alert')).toContainText('Marque cada item');
  const group = page.getByRole('article', { name: /Detalhes do pedido/ });
  for (const row of await group.locator('.da-order-item').all()) {
    await row.getByRole('button', { name: 'Separado' }).click();
  }
  await page.getByRole('button', { name: 'Concluir separação' }).click();
  await expect(tabs.getByRole('tab', { name: /Pronto/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Marcar entregue' }).click();
  await expect(tabs.getByRole('tab', { name: /Entregue/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.screenshot({ path: 'test-results/admin-pedidos-desktop.png', fullPage: true });
});
