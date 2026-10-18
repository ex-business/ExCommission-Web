import test from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {createHash,createHmac} from 'node:crypto';import {verifyEntry} from '../server/entry-proof.mjs';import {publicOrigin} from '../server/public-origin.mjs';
test('固定HTTPS来源须有有效证明并为会话添加Secure，转发头不能启用来源',async()=>{
 const before=process.env.WEB_PUBLIC_ORIGINS;process.env.WEB_PUBLIC_ORIGINS='["https://ops.localhost:24443"]';
 try{const key='k'.repeat(64),at=String(Math.floor(Date.now()/1000)),hash=createHash('sha256').update('').digest('hex');
 function request(){const r=Readable.from([]);r.method='GET';r.url='/api/me';r.socket={remoteAddress:'127.0.0.1'};r.headers={host:'ops.localhost:24443','x-forwarded-proto':'https','x-entry-client-ip':'192.0.2.1','x-entry-time':at,'x-entry-body-sha256':hash,'x-entry-signature':createHmac('sha256',key).update(['web-entry-v1','GET',r.url,'ops.localhost:24443','192.0.2.1',at,hash].join('\n')).digest('hex')};return r}
 const r=request(),headers={};const res={setHeader(name,value){headers[name.toLowerCase()]=value}};await verifyEntry(r,{key,response:res});assert.equal(publicOrigin(r,'http://127.0.0.1:19586'),'https://ops.localhost:24443');res.setHeader('Set-Cookie',['session=opaque; HttpOnly; SameSite=Strict','other=value; Secure']);assert.match(headers['set-cookie'][0],/; Secure$/);assert.equal(headers['set-cookie'][1],'other=value; Secure');
 const direct=request();await verifyEntry(direct,{key:''});assert.equal(publicOrigin(direct,'http://127.0.0.1:19586'),'http://127.0.0.1:19586');
 }finally{if(before===undefined)delete process.env.WEB_PUBLIC_ORIGINS;else process.env.WEB_PUBLIC_ORIGINS=before}
});
