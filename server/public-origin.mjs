// HTTPS来源仅由服务端部署白名单提供，必须先通过入口证明，不能根据转发头反射来源。
export function trustPublicOrigin(req,res){
 const raw=process.env.WEB_PUBLIC_ORIGINS;if(!raw)return;
 if(raw.length>8192)throw Error('公开来源白名单过大');const values=JSON.parse(raw);if(!Array.isArray(values)||values.length>16)throw Error('公开来源白名单无效');
 for(const value of values){const u=new URL(value);if(u.protocol!=='https:'||!u.hostname||u.origin!==value||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('公开来源只允许固定HTTPS源');
  if(u.host!==req.headers.host)continue;Object.defineProperty(req,'entryPublicOrigin',{value:u.origin});
  if(res){const set=res.setHeader.bind(res);res.setHeader=(name,value)=>{if(name.toLowerCase()==='set-cookie'){const protect=x=>/;\s*secure(?:;|$)/i.test(x)?x:x+'; Secure';value=Array.isArray(value)?value.map(protect):protect(String(value))}return set(name,value)}}
  return;
 }
}
export const publicOrigin=(req,fallback)=>req.entryPublicOrigin||fallback;
