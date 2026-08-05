import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const baseUrl=process.env.E2E_BASE_URL||'https://pedidos-pro-ai.botreservasmultilocal.workers.dev/';
const email=process.env.E2E_EMAIL||'';
const password=process.env.E2E_PASSWORD||'';
const profiles=[
  {name:'Chromium desktop',engine:chromium,context:{viewport:{width:1440,height:900}}},
  {name:'WebKit iPhone',engine:webkit,context:{viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'}},
  {name:'WebKit iPad',engine:webkit,context:{viewport:{width:1180,height:820},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'}}
];

async function firstVisible(locator){
  const count=await locator.count();
  for(let index=0;index<count;index++)if(await locator.nth(index).isVisible())return locator.nth(index);
  return null;
}

for(const profile of profiles){
  const browser=await profile.engine.launch({headless:true});
  const context=await browser.newContext(profile.context);
  const page=await context.newPage();
  const fatal=[];
  page.on('pageerror',error=>fatal.push(String(error?.message||error)));

  const response=await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:60000});
  assert.ok(response?.ok(),`${profile.name}: shell HTTP ${response?.status()}`);
  assert.equal(await page.title(),'Nuvasto',`${profile.name}: title`);
  await page.locator('link[rel="manifest"]').waitFor({state:'attached',timeout:10000});

  await page.waitForFunction(()=>{
    const auth=document.querySelector('#authScreen');
    const app=document.querySelector('#appShell');
    return Boolean((auth&&!auth.classList.contains('hidden'))||(app&&!app.classList.contains('hidden')));
  },null,{timeout:20000});

  let appVisible=await page.locator('#appShell:not(.hidden)').count()>0;
  const authVisible=await page.locator('#authScreen:not(.hidden)').count()>0;
  if(authVisible&&email&&password){
    await page.fill('#loginEmail',email);
    await page.fill('#loginPassword',password);
    const [loginResponse]=await Promise.all([
      page.waitForResponse(item=>item.url().includes('/api/auth/login')&&item.request().method()==='POST',{timeout:30000}),
      page.click('#loginForm button[type="submit"]')
    ]);
    assert.ok(loginResponse.ok(),`${profile.name}: login HTTP ${loginResponse.status()}`);
    await page.locator('#appShell:not(.hidden)').waitFor({timeout:30000});
    appVisible=true;
  }

  if(appVisible){
    await page.locator('#mainContent').waitFor({state:'visible',timeout:20000});
    const dashboardButton=await firstVisible(page.locator('[data-view="dashboard"]'));
    if(dashboardButton)await dashboardButton.click();
    await page.locator('.dashboard-v14,#mainContent').first().waitFor({state:'visible',timeout:30000});

    const invoiceButton=await firstVisible(page.locator('[data-action="analyze-invoice"]'));
    assert.ok(invoiceButton,`${profile.name}: invoice action is available`);
    await invoiceButton.click();
    await page.locator('#modal[open]').waitFor({state:'visible',timeout:20000});
    await page.locator('#modalTitle').filter({hasText:/Analizar documento|Adjuntar documento/}).waitFor({state:'visible',timeout:10000});
    await page.locator('#modalClose').click();
    await page.locator('#modal:not([open])').waitFor({state:'attached',timeout:10000});

    const ordersButton=await firstVisible(page.locator('[data-view="orders"]'));
    assert.ok(ordersButton,`${profile.name}: orders navigation is available`);
    await ordersButton.click();
    await page.locator('#mainContent').waitFor({state:'visible',timeout:15000});
  }else{
    assert.equal(await page.locator('#loginForm').count(),1,`${profile.name}: login form exists`);
    assert.equal(await page.locator('#loginForm button[type="submit"]').count(),1,`${profile.name}: login submit exists`);
  }

  assert.deepEqual(fatal,[],`${profile.name}: uncaught page errors: ${fatal.join(' | ')}`);
  await browser.close();
  console.log(`${profile.name}: OK${appVisible?' authenticated shell':' public shell'}`);
}
