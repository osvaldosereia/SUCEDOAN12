import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const url=process.env.STOREFRONT_URL||'https://donaantonia.com.br/';
const browser=await chromium.launch({headless:true});
const results=[];
try{
  for(const viewport of [{width:390,height:844},{width:320,height:740}]){
    const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
    const page=await context.newPage(),jsErrors=[],homeStatuses=[];
    page.on('pageerror',e=>jsErrors.push(String(e.stack||e.message).slice(0,450)));
    page.on('response',response=>{
      if(response.url().includes('/functions/v1/storefront-v2?action=home'))homeStatuses.push({action:new URL(response.url()).searchParams.get('action'),status:response.status()});
    });
    // Reproduce a modest mobile connection, not the full variability of physical 4G.
    const devtools=await context.newCDPSession(page);
    await devtools.send('Network.enable');
    await devtools.send('Network.emulateNetworkConditions',{
      offline:false,latency:120,downloadThroughput:1600000/8,uploadThroughput:750000/8
    });
    await devtools.send('Emulation.setCPUThrottlingRate',{rate:3});
    const started=Date.now();
    let failure=null;
    try{
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      assert.equal(response?.status(),200,'homepage must serve HTTP 200');
      await page.locator('#basketSections .basket-card').first().waitFor({state:'visible',timeout:35000});
      await page.waitForTimeout(1100);
      const data=await page.evaluate(()=>{
        const c=window.DAStorefrontPerf?.snapshot?.()||{};
        const nav=performance.getEntriesByType('navigation')[0];
        return {
          cardCount:document.querySelectorAll('#basketSections .basket-card').length,
          fcpMs:c.fcpMs??null,lcpMs:c.lcpMs??null,
          firstCestasMs:c.firstCestasMs??null,
          cachedCestasMs:c.cachedCestasMs??null,
          fullCatalogMs:c.fullCatalogMs??null,
          domContentLoadedMs:Math.round(nav?.domContentLoadedEventEnd??0),
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
          firstCardImageLoaded:Boolean(document.querySelector('#basketSections .basket-card-photo img')?.naturalWidth),
          mobileViewport:innerWidth
        };
      });
      assert.ok(data.cardCount>0,'customer must see at least one basket');
      assert.equal(data.horizontalOverflow,false,'layout must not have horizontal page overflow');
      assert.equal(jsErrors.length,0,'no JavaScript runtime exceptions on first mobile view');
      results.push({viewport,elapsedMs:Date.now()-started,homeStatuses,...data,jsErrors});
    }catch(e){
      failure=String(e?.stack||e).slice(0,750);
      results.push({viewport,elapsedMs:Date.now()-started,homeStatuses,jsErrors,error:failure});
    }finally{
      await context.close();
    }
    if(failure)throw new Error('Mobile production smoke failure: '+failure);
  }
  console.log('Storefront live mobile Chromium/4G-like smoke:',JSON.stringify(results));
}finally{
  await browser.close();
}
