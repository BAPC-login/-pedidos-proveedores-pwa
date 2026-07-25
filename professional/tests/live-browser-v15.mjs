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

for(const profile of profiles){
  const browser=await profile.engine.launch({headless:true});
  const context=await browser.newContext(profile.context);
  const page=await context.newPage();
  const fatal=[];
  page.on('pageerror',error=>fatal.push(String(error?.message||error)));
  const response=await page.goto(baseUrl,{waitUntil:'networkidle',timeout:60000});
  assert.ok(response?.ok(),`${profile.name}: shell HTTP ${response?.status()}`);
  assert.equal(await page.title(),'Pedidos Pro',`${profile.name}: title`);
  await page.locator('#startupScreen,#authScreen,#appShell').first().waitFor({state:'attached',timeout:20000});
  assert.equal(await page.locator('#loginForm').count(),1,`${profile.name}: login form exists`);
  if(email&&password){
    await page.fill('#loginEmail',email);
    await page.fill('#loginPassword',password);
    await Promise.all([page.waitForResponse(r=>r.url().includes('/api/auth/login')&&r.request().method()==='POST'),page.click('#loginForm button[type=submit]')]);
    await page.locator('#appShell:not(.hidden)').waitFor({timeout:30000});
    await page.locator('[data-view="dashboard"]').first().click();
    await page.locator('.dashboard-v14').waitFor({timeout:30000});
    await page.locator('[data-experience-view="operations"]').first().click();
    await page.locator('#operationsAdminV14').waitFor({timeout:30000});
  }
  assert.deepEqual(fatal,[],`${profile.name}: uncaught page errors: ${fatal.join(' | ')}`);
  await browser.close();
  console.log(`${profile.name}: OK${email&&password?' authenticated':' public shell'}`);
}
