import { expect, test } from '@playwright/test';

const sizes = [
  {name: 'mobile', width: 390, height: 844},
  {name: 'desktop', width: 1280, height: 800}
];

for (const viewport of sizes) {
  test('site - fluxo cesta, extras e checkout em ' + viewport.name, async ({page}) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', {name:'Monte sua cesta'})).toBeVisible();
    await expect(page.getByText('PROTÓTIPO', {exact:false})).toBeVisible();
    await expect(page.getByRole('button', {name:/Próximo/})).toBeEnabled();
    await expect(page.getByText('Entrega em Cuiabá e Várzea Grande')).toBeVisible();
    await expect(page.locator('.size-card')).toHaveCount(5);
    await expect(page.getByRole('navigation',{name:'Progresso do pedido'})).toBeVisible();
    await expect(page.locator('.sticky-summary')).toBeVisible();
    await page.screenshot({path:'test-results/vitrine-inicial-'+viewport.name+'.png',fullPage:true});


    // Tamanho, troca de marca e seletor abaixo dos cards
    await page.getByRole('button', {name:/Econômica/}).click();
    const arroz = page.getByRole('region', {name:'Escolher Arroz'});
    await expect(arroz.getByRole('heading',{name:'Arroz'})).toBeVisible();
    const imageBounds=await arroz.locator('.catalog-square-image').first().boundingBox();
    expect(imageBounds).not.toBeNull();
    expect(Math.abs((imageBounds?.width??0)-(imageBounds?.height??0))).toBeLessThanOrEqual(1);
    const basketImage=page.locator('.size-card .catalog-square-image').first();
    const basketBounds=await basketImage.boundingBox();
    expect(Math.abs((basketBounds?.width??0)-(basketBounds?.height??0))).toBeLessThanOrEqual(1);
    await expect(page.locator('.size-card.selected')).toHaveCount(1);
    const imageWidth=await page.locator('.size-card.selected .catalog-square-image').first().boundingBox();
    expect(Math.abs((imageWidth?.width??0)-(imageWidth?.height??0))).toBeLessThanOrEqual(1);
    const currentQty = await arroz.locator('output').innerText();
    const before = await page.locator('.sticky-summary strong').innerText();
    await arroz.getByRole('button',{name:/Arroz Caibi/}).click();
    await expect(arroz.locator('output')).toHaveText(currentQty);
    const afterChange = await page.locator('.sticky-summary strong').innerText();
    expect(afterChange).not.toBe(before);
    await arroz.getByRole('button',{name:'Aumentar Arroz'}).click();
    await expect(arroz.locator('output')).toHaveText(String(Number(currentQty)+1));
    await arroz.getByRole('button',{name:'Diminuir Arroz'}).click();
    await expect(arroz.locator('output')).toHaveText(currentQty);
    if(viewport.name==='mobile'){
      const carousel=arroz.locator('.compact-carousel');
      expect(await carousel.evaluate(element => element.scrollWidth > element.clientWidth)).toBeTruthy();
      await arroz.getByRole('button',{name:'Ver próximos produtos de Arroz'}).click();
      await expect.poll(async()=>carousel.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
    }

    // Extras são opcionais, mas tocar um produto adiciona 1, com valor total acumulado.
    await page.getByRole('button',{name:/Próximo/}).click();
    await expect(page.getByRole('heading',{name:'Escolha produtos extras'})).toBeVisible();
    const extra=page.getByRole('region',{name:'Escolher Biscoitos'});
    await expect(extra.locator('output')).toHaveText('0');
    const totalWithoutExtra=await page.locator('.sticky-summary strong').innerText();
    await extra.getByRole('button',{name:/Biscoito Rosquinha de Chocolate/}).click();
    await expect(extra.locator('output')).toHaveText('1');
    await extra.getByRole('button',{name:/Biscoito Rosquinha de Coco/}).click();
    await expect(extra.locator('output')).toHaveText('1');
    await extra.getByRole('button',{name:'Aumentar Biscoitos'}).click();
    await expect(extra.locator('output')).toHaveText('2');
    expect(await page.locator('.sticky-summary strong').innerText()).not.toBe(totalWithoutExtra);
    await page.screenshot({path:'test-results/extras-'+viewport.name+'.png',fullPage:true});

    // Finalizar abre checkout local não operacional.
    await page.getByRole('button',{name:/Finalizar pedido/}).click();
    await expect(page.getByRole('heading',{name:'Finalize seu pedido'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Seus produtos'})).toBeVisible();
    await expect(page.getByRole('button',{name:/Confirmação indisponível/})).toBeDisabled();
    await page.screenshot({path:'test-results/checkout-'+viewport.name+'.png',fullPage:true});
    await page.getByRole('button',{name:'Editar extras'}).click();
    await expect(page.getByRole('heading',{name:'Escolha produtos extras'})).toBeVisible();
    await expect(page.getByRole('region',{name:'Escolher Biscoitos'}).locator('output')).toHaveText('2');
    await page.getByRole('button',{name:'← Voltar'}).click();
    await expect(page.getByRole('region',{name:'Escolher Arroz'}).locator('output')).toHaveText(currentQty);
    expect(errors).toEqual([]);
    if(viewport.name==='mobile'){
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBeTruthy();
    }
    await page.screenshot({path:'test-results/cesta-'+viewport.name+'.png',fullPage:true});
  });
}


test('checkout: itens da cesta sem preço individual e quantidades editáveis',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:/Próximo/}).click();
  await page.getByRole('region',{name:'Escolher Biscoitos'}).getByRole('button',{name:/Biscoito Rosquinha de Chocolate/}).click();
  await page.getByRole('button',{name:/Finalizar pedido/}).click();
  await expect(page.getByRole('heading',{name:'Seus produtos'})).toBeVisible();
  const basketRows=page.locator('.checkout-basket-line');
  await expect(basketRows.first()).toBeVisible();
  await expect(basketRows.first().locator('small')).toHaveText('Produto da cesta');
  await expect(basketRows.first()).not.toContainText('por unidade');
  const extraRow=page.locator('.checkout-extra-line').first();
  await expect(extraRow).toContainText('por unidade');
  await extraRow.getByRole('button',{name:/Diminuir .* no checkout/}).click();
  await expect(page.locator('.checkout-extra-line')).toHaveCount(0);
  const count=await basketRows.count();
  const firstName=await basketRows.first().locator('b').innerText();
  await basketRows.first().getByRole('button',{name:'Diminuir '+firstName+' no checkout'}).click();
  await expect(page.locator('.checkout-basket-line')).toHaveCount(count-1);
  await page.screenshot({path:'test-results/checkout-editavel-mobile.png',fullPage:true});
});
