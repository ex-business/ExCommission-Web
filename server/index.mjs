import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {randomBytes,timingSafeEqual,createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
try{for(const line of (await readFile(resolve(root,'.env'),'utf8')).split('\n')){const i=line.indexOf('=');if(i>0&&!process.env[line.slice(0,i)])process.env[line.slice(0,i)]=line.slice(i+1).trim();}}catch{}
const spec=JSON.parse(await readFile(resolve(root,'contracts/openapi.json'),'utf8'));
const routes=Object.entries(spec.paths).flatMap(([path,ops])=>Object.keys(ops).map(method=>({method:method.toUpperCase(),re:new RegExp('^'+path.replace(/\{[^}]+\}/g,'[^/]+')+'$')})));
const sessions=new Map(),attempts=new Map();
const secretEquals=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
async function body(req){let s='';for await(const c of req){s+=c;if(Buffer.byteLength(s)>1048576)throw new Error('BODY_TOO_LARGE');}return s;}
function session(req){const id=/(?:^|;\s*)ec_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];const s=sessions.get(id);if(s&&s.expires>Date.now())return {...s,id};if(id)sessions.delete(id);return null;}
export function createServer(){return http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 try{
 const url=new URL(req.url,'http://localhost');const s=session(req);
 if(!['GET','HEAD'].includes(req.method)){
 const origin=req.headers.origin; if(!origin||new URL(origin).host!==req.headers.host)return json(res,403,{error:{code:'ORIGIN_REJECTED',message:'请求来源不匹配'}});
 }
 if(url.pathname==='/auth/login'&&req.method==='POST'){
 const ip=req.socket.remoteAddress;let attempt=attempts.get(ip);if(!attempt||attempt.until<Date.now())attempt={count:0,until:Date.now()+60000};if(attempt.count>=10)return json(res,429,{error:{code:'LOGIN_RATE_LIMIT',message:'尝试过于频繁，请稍后重试'}});
 const input=JSON.parse(await body(req));const role=['operator','approver'].includes(input.role)?input.role:'';const password=process.env['WEB_'+role.toUpperCase()+'_PASSWORD'];
 if(!role||!secretEquals(input.password,password)){attempt.count++;attempts.set(ip,attempt);return json(res,401,{error:{code:'LOGIN_FAILED',message:'身份或本地登录口令错误'}});}
 if(s)sessions.delete(s.id);const id=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(id,{role,csrf,expires:Date.now()+3600000});attempts.delete(ip);
 res.setHeader('Set-Cookie',`ec_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);return json(res,200,{role,csrf,subject:'local-'+role});
 }
 if(url.pathname==='/auth/session'){if(!s)return json(res,401,{error:{code:'LOGIN_REQUIRED',message:'请先登录'}});return json(res,200,{role:s.role,csrf:s.csrf,subject:'local-'+s.role});}
 if(url.pathname==='/auth/logout'&&req.method==='POST'){if(!s||!secretEquals(req.headers['x-csrf-token'],s.csrf))return json(res,403,{error:{code:'CSRF_REJECTED'}});sessions.delete(s.id);res.setHeader('Set-Cookie','ec_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
 if(url.pathname.startsWith('/api/')){
 if(!s)return json(res,401,{error:{code:'LOGIN_REQUIRED',message:'登录已过期，请重新登录'}});
 if(!['GET','HEAD'].includes(req.method)&&!secretEquals(req.headers['x-csrf-token'],s.csrf))return json(res,403,{error:{code:'CSRF_REJECTED',message:'会话校验失败'}});
 const path=url.pathname.slice(4);if(!routes.some(x=>x.method===req.method&&x.re.test(path)))return json(res,404,{error:{code:'UNKNOWN_OPERATION',message:'接口不在 V1 契约中'}});
 // 回调只接受渠道系统发起，不开放浏览器签名代理。
 if(path.startsWith('/v1/payment-callbacks/'))return json(res,403,{error:{code:'CHANNEL_ONLY',message:'付款回调仅由受信渠道提交；管理端可核验原付款'}});
 const headers={'Authorization':'Bearer '+process.env['LOCAL_'+s.role.toUpperCase()+'_TOKEN'],'X-Request-ID':randomBytes(16).toString('hex')};
 let raw;if(req.method!=='GET'){raw=await body(req);headers['Content-Type']='application/json';const key=req.headers['idempotency-key'];if(!key||! /^[\x20-\x7E]{1,128}$/.test(key))return json(res,400,{error:{code:'IDEMPOTENCY_REQUIRED',message:'缺少有效的幂等键'}});headers['Idempotency-Key']=key;
 if(path==='/v1/events'||path==='/v1/refunds'){if(s.role!=='operator')return json(res,403,{error:{code:'PERMISSION_DENIED',message:'仅申请身份可提交本地来源事实'}});const data=JSON.parse(raw);if(data.source_id!=='sandbox')return json(res,400,{error:{code:'SANDBOX_ONLY',message:'当前只允许 sandbox 来源'}});headers['X-Source-Signature']=createHmac('sha256',process.env.LOCAL_SOURCE_KEY).update(raw).digest('hex');}}
 const upstream=await fetch(new URL(path+url.search,process.env.BACKEND_URL||'http://127.0.0.1:18080'),{method:req.method,headers,body:raw,signal:AbortSignal.timeout(30000),redirect:'error'});
 res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json',...(upstream.headers.get('content-disposition')?{'Content-Disposition':upstream.headers.get('content-disposition')}:{}),'X-Request-ID':upstream.headers.get('x-request-id')||headers['X-Request-ID']});return res.end(Buffer.from(await upstream.arrayBuffer()));
 }
 if(url.pathname==='/healthz')return json(res,200,{status:'ok',mode:'local-sandbox'});
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED'}});
 const requested=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,'');const file=resolve(root,'dist',requested);if(!file.startsWith(resolve(root,'dist')+'/'))return json(res,404,{});
 try{const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);}catch{return json(res,404,{error:{code:'NOT_FOUND'}});}
 }catch(err){return json(res,err.message==='BODY_TOO_LARGE'?413:err instanceof SyntaxError?400:502,{error:{code:err instanceof SyntaxError?'INVALID_JSON':'GATEWAY_UNAVAILABLE',message:'请求未完成，请核对输入或服务状态；写入请求请保留原幂等键核验'}});}
 });}
if(process.argv[1]===fileURLToPath(import.meta.url)){for(const key of ['WEB_OPERATOR_PASSWORD','WEB_APPROVER_PASSWORD','LOCAL_OPERATOR_TOKEN','LOCAL_APPROVER_TOKEN','LOCAL_SOURCE_KEY'])if(!process.env[key])throw new Error('Missing '+key);createServer().listen(Number(process.env.PORT||18180),process.env.BIND_HOST||'127.0.0.1',()=>console.log('ExCommission-Web http://127.0.0.1:'+(process.env.PORT||18180)));}
