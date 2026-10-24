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
