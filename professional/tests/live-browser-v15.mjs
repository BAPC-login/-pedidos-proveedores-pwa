import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';

const baseUrl=process.env.E2E_BASE_URL||'https://pedidos-pro-ai.botreservasmultilocal.workers.dev/';
const email=process.env.E2E_EMAIL||'';
const password=process.env.E2E_PASSWORD||'';
const profiles=[
  {name:'Chromium desktop',engine:chromium,context:{viewport:{width:1440,height:900}}},
  {name:'WebKit iPhone',engine:webkit,context:{...devices['iPhone 15 Pro']}},
  {name:'WebKit iPad',engine:webkit,context:{...devices['iPad Pro 11 landscape']}}
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
  const hasLogin=await page.locator('#loginForm').count();
  assert.equal(hasLogin,1,`${profile.name}: login form exists`);
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
