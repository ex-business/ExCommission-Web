import {readFileSync,statSync} from 'node:fs';
import {routedFetch} from '@ex-business/service-router-sdk';
let cachedPath,cached;
function configuration(){
 const path=process.env.EX_SERVICE_GATEWAY_CONFIG_FILE;
 if(!path)return null;
 if(cachedPath===path)return cached;
 const info=statSync(path);if(!info.isFile()||(info.mode&0o077)||info.size>131072)throw Error('网关接入配置必须为0600私有文件');
 const c=JSON.parse(readFileSync(path,'utf8'));
 if(!Array.isArray(c.nodes)||c.nodes.length<1||c.nodes.length>16||!Array.isArray(c.bindings)||!c.bindings.length||c.bindings.length>128)throw Error('网关接入配置无效');
 for(const address of c.nodes){const u=new URL(address);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||(u.protocol!=='https:'&&!(u.protocol==='http:'&&u.hostname==='127.0.0.1')))throw Error('网关地址必须是固定HTTPS或本机HTTP')}
 for(const b of c.bindings){const u=new URL(b.origin);if(u.origin!==b.origin||u.username||u.password||!/^\/(?:[a-zA-Z0-9_.-]+\/?)+$/.test(b.upstream_prefix)||!/^\/(?:[a-zA-Z0-9_.-]+\/?)+$/.test(b.gateway_prefix)||b.upstream_prefix.endsWith('/')||b.gateway_prefix.endsWith('/')||b.upstream_prefix.split('/').some(x=>x==='.'||x==='..')||b.gateway_prefix.split('/').some(x=>x==='.'||x==='..'))throw Error('网关路径绑定无效')}
 cachedPath=path;cached=c;return c;
}
// 未启用时兼容原内部发现；启用后任何网关故障均不绕过网关，不自动重发写请求。
export async function externalFetch(input,options={}){
 const c=configuration();if(!c)return routedFetch(input,options);
 const original=new URL(input),binding=c.bindings.filter(b=>b.origin===original.origin&&(original.pathname===b.upstream_prefix||original.pathname.startsWith(b.upstream_prefix+'/'))).sort((a,b)=>b.upstream_prefix.length-a.upstream_prefix.length)[0];
 if(!binding||original.username||original.password||original.hash)throw Error('接口未配置网关路径，禁止直接访问业务服务');
 // 健康探测只选择入口；实际业务请求发送一次，未知结果交业务按原单号查询。
 let selected;for(const node of c.nodes){try{const r=await fetch(node+'/readyz',{redirect:'error',signal:AbortSignal.timeout(800)});await r.body?.cancel();if(r.ok){selected=node;break}}catch{}}
 if(!selected)throw Error('网关暂不可用，禁止绕过入口');
 const target=new URL(selected);target.pathname=binding.gateway_prefix+original.pathname.slice(binding.upstream_prefix.length);target.search=original.search;
 return fetch(target,{...options,redirect:'error'});
}
