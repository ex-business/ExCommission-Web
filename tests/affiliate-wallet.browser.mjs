import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {once} from 'node:events';
import {chromium} from '@playwright/test';
const evidence=process.env.AFFILIATE_UI_EVIDENCE_DIR;
// 使用真实全链路快照模拟异步响应，仅验证浏览器交互，不投递事件或调用资金接口。
test('异步领取显示受理，轮询到钱包确认后才显示已领取',{skip:!evidence},async t=>{
 const overview=JSON.parse(await readFile(join(evidence,'overview.json'),'utf8'));
 const progress=JSON.parse(await readFile(join(evidence,'after-daily-overview.json'),'utf8'));
 const reward=structuredClone(progress.rewards.find(r=>r.kind==='COMMISSION'));reward.status='CLAIMABLE';overview.progress.rewards=[reward];
 let phase='ready',refreshes=0;
 const server=http.createServer(async(req,res)=>{try{const file=req.url==='/'?'index.html':req.url.slice(1);if(file.includes('..'))throw Error();const data=await readFile(new URL('../dist/'+file,import.meta.url));res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'text/html');res.end(data)}catch{res.writeHead(404);res.end()}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage({locale:'zh-CN'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const path=new URL(route.request().url()).pathname;
  const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data})});
  if(path==='/auth/session')return reply({role:'member',subject:reward.user_id,csrf:'test-csrf'});
  if(path==='/api/v1/me/affiliate/overview'){
   const value=structuredClone(overview);
   if(phase!=='ready'){refreshes++;if(refreshes>=2)await new Promise(r=>setTimeout(r,3500));value.progress.rewards[0].status=refreshes<2?'CLAIMING':'CLAIMED';value.progress.rewards[0].wallet_delivery_id='delivery-test';if(refreshes>=2)value.progress.rewards[0].wallet_receipt_ref='receipt-test'}
   return reply(value);
  }
  if(path==='/api/v1/me/affiliate/claims'){phase='pending';return reply({delivery_status:'PENDING',claim_id:'claim-test',rewards:[{...reward,status:'CLAIMING'}]},202)}
  if(path==='/api/v1/me/agent-rules')return reply({rows:[],agent_enabled:true,is_agent:true});
  if(path==='/api/v1/me/affiliate/presentation')return route.fulfill({status:404,contentType:'application/json',body:'{}'});
  if(path.startsWith('/api/'))return reply({rows:[],rewards:[],summary:[],next_after_id:null});
  return route.continue();
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const card=page.locator('.affiliate-cards > section').filter({hasText:'每日佣金'});
 await card.getByRole('button',{name:'领取全部待领'}).click();
 await page.getByRole('status').filter({hasText:'领取已受理，钱包确认后到账'}).waitFor();
 assert.equal(await card.getByRole('button').isDisabled(),true);
 await page.waitForFunction(()=>document.querySelector('body').textContent.includes('独立钱包')||document.querySelector('.affiliate-cards > section')!==null);
 await page.getByRole('region',{name:'原有方案已领取收益'}).getByText(/0\.40/).waitFor({timeout:15000});assert.match(await page.getByRole('region',{name:'原有方案已领取收益'}).textContent(),/0\.40/);assert.ok(refreshes>=2,'必须继续轮询钱包结果');assert.deepEqual(errors,[]);
 await page.screenshot({path:join(evidence,'member-wallet-confirmed.png'),fullPage:true});
});
