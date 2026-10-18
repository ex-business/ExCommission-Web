import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {externalFetch} from '../server/external-gateway.mjs';
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
test('外部接口固定网关、保留签名正文、故障不绕过且写请求只发一次',async t=>{
 let writes=0,direct=0,ready=true;
 const upstream=http.createServer((q,s)=>{direct++;s.end('{}')});const original=await listen(upstream);
 const gateway=http.createServer(async(q,s)=>{if(q.url==='/readyz'){s.writeHead(ready?200:503);return s.end('{}')}writes++;assert.equal(q.url,'/commission/me/affiliate/claims?x=1');assert.equal(q.headers['idempotency-key'],'original');assert.equal(q.headers['x-affiliate-client-signature'],'signed');assert.equal(q.headers['x-affiliate-client-ip'],'192.0.2.1');let raw='';for await(const chunk of q)raw+=chunk;assert.equal(raw,'{ "amount":"10.00" }');s.writeHead(504);s.end('{}')});const endpoint=await listen(gateway);
 const directory=await mkdtemp(join(tmpdir(),'gateway-client-'));const path=join(directory,'config.json');await writeFile(path,JSON.stringify({nodes:[endpoint],bindings:[{origin:original,upstream_prefix:'/v1',gateway_prefix:'/commission'}]}),{mode:0o600});process.env.EX_SERVICE_GATEWAY_CONFIG_FILE=path;
 t.after(async()=>{delete process.env.EX_SERVICE_GATEWAY_CONFIG_FILE;upstream.closeAllConnections();upstream.close();gateway.closeAllConnections();gateway.close();await rm(directory,{recursive:true,force:true})});
 const response=await externalFetch(original+'/v1/me/affiliate/claims?x=1',{method:'POST',headers:{'Idempotency-Key':'original','X-Affiliate-Client-Signature':'signed','X-Affiliate-Client-IP':'192.0.2.1'},body:'{ "amount":"10.00" }'});assert.equal(response.status,504);await response.body.cancel();assert.equal(writes,1);assert.equal(direct,0);
 ready=false;await assert.rejects(()=>externalFetch(original+'/v1/me',{method:'GET'}),/网关暂不可用/);assert.equal(direct,0);assert.equal(writes,1);
 await assert.rejects(()=>externalFetch(original+'/internal/introspect'),/未配置/);assert.equal(direct,0);
});
