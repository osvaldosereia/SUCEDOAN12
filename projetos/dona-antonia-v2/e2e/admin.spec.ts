import { expect, test } from '@playwright/test';

test('admin: extras e produtos são editáveis somente no modo demonstrativo', async ({page})=>{
  await page.setViewportSize({width:1280,height:800});
  const errors: string[]=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/admin/');
  await expect(page.getByRole('heading',{name:'Tipos de produto'})).toBeVisible();
  await page.getByRole('button',{name:'Produtos extras'}).click();
  await expect(page.getByRole('heading',{name:'Grupos exibidos na etapa de extras'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Produtos permitidos — Biscoitos'})).toBeVisible();
  await page.getByRole('button',{name:'Desativar Biscoitos'}).click();
  await expect(page.getByRole('button',{name:'Ativar Biscoitos'})).toBeVisible();
  await page.getByRole('button',{name:'Ativar Biscoitos'}).click();

  // Novo tipo extra, depois vinculação de produto existente.
  await page.getByRole('textbox',{name:'Nome do tipo extra'}).fill('Enlatados');
  await page.getByRole('button',{name:'Criar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Produtos permitidos — Enlatados'})).toBeVisible();
  const row=page.getByRole('group',{name:'Produtos do tipo extra'}).locator('label.check-row').filter({hasText:'Óleo de Soja Concord 900 ml'});
  await row.locator('input[type="checkbox"]').check();
  await expect(row.locator('input[type="checkbox"]')).toBeChecked();

  await page.getByRole('button',{name:'Composição das cestas'}).click();
  await expect(page.getByRole('heading',{name:'Cestas básicas'})).toBeVisible();
  await expect(page.getByRole('heading',{name:/Composição: Mini/})).toBeVisible();
  await page.screenshot({path:'test-results/admin-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('admin mobile: abas navegáveis sem estouro horizontal',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/admin/');
  await page.getByRole('button',{name:'Produtos extras'}).click();
  await expect(page.getByRole('heading',{name:'Grupos exibidos na etapa de extras'})).toBeVisible();
  // Apenas overflow local de tabelas, sem quebrar a largura do documento.
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBeTruthy();
  await page.screenshot({path:'test-results/admin-mobile.png',fullPage:true});
});
