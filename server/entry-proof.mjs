import {trustPublicOrigin} from "./public-origin.mjs";
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
// 仅部署配置启用时要求网关证明；原直连模式保持，任何转发头均不能自行取得可信IP。
export async function verifyEntry(req,{key=process.env.WEB_ENTRY_KEY,limit=1048576,response}={}){
 if(!key)return req.socket.remoteAddress;
 if(typeof key!=='string'||key.length<32)throw Error('入口验签密钥配置无效');
 const ip=req.headers['x-entry-client-ip'],at=req.headers['x-entry-time'],signature=req.headers['x-entry-signature'],digest=req.headers['x-entry-body-sha256'];
 if(typeof ip!=='string'||!isIP(ip)||typeof at!=='string'||!/^\d{10}$/.test(at)||Math.abs(Date.now()/1000-Number(at))>30||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))throw Error('入口来源证明缺失或已过期');
 const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>limit)throw Error('入口请求正文超限');chunks.push(chunk)}const raw=Buffer.concat(chunks);
 const hash=createHash('sha256').update(raw).digest('hex');if(hash!==digest)throw Error('入口请求正文摘要不匹配');
 const parts=['web-entry-v1',req.method,req.url,req.headers.host,ip,at,hash];if(parts.some(x=>typeof x!=='string'||/[\r\n]/.test(x)))throw Error('入口证明字段无效');
 const expected=createHmac('sha256',key).update(parts.join('\n')).digest();if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw Error('入口来源证明验签失败');
 // 校验后恢复原字节供既有JSON/签名逻辑读取，不重新编码正文，也不修改底层连接地址。
 req[Symbol.asyncIterator]=async function*(){if(raw.length)yield raw};Object.defineProperty(req,'entryClientIP',{value:ip});trustPublicOrigin(req,response);return ip;
}
