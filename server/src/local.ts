import express,{Request,Response,NextFunction} from 'express';
import {readFileSync,mkdirSync,writeFileSync,renameSync} from 'fs';
import {resolve,join} from 'path';
import {randomBytes,createHash,timingSafeEqual} from 'crypto';
import {execFile} from 'child_process';
import {runAgent,codex,modelEnv} from './localAgent';
const base='/pdf-translator/app';
const stateDir=resolve(process.env.PDF_STATE_DIR||'state/local');mkdirSync(stateDir,{recursive:true,mode:0o700});
const secretFile=process.env.PDF_PROXY_SECRET_FILE;if(!secretFile)throw Error('PDF_PROXY_SECRET_FILE required');
const secret=readFileSync(secretFile,'utf8').trim();if(secret.length<40)throw Error('Invalid proxy secret');
const app=express();app.disable('x-powered-by');
app.use((req,res,next)=>{const token=req.get('X-PDF-Proxy')||'';const a=Buffer.from(secret),b=Buffer.from(token);if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(403).json({error:'Použij soukromý vstup přes Velín.'});res.set('Cache-Control','no-store');next();});
app.use(express.json({limit:'128kb'}));
type Session={expires:number,cache:Map<string,string>};const sessions=new Map<string,Session>();let busy=false;
const metricsFile=join(stateDir,'usage.json');let usage:{day:string,attempts:number,completed:number,failed:number,cacheHits:number}={day:'',attempts:0,completed:0,failed:0,cacheHits:0};try{usage=JSON.parse(readFileSync(metricsFile,'utf8'));}catch{}
function persist(){writeFileSync(metricsFile+'.tmp',JSON.stringify(usage),{mode:0o600});renameSync(metricsFile+'.tmp',metricsFile);}
function resetDay(){const day=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'});if(usage.day!==day){usage={day,attempts:0,completed:0,failed:0,cacheHits:0};persist();}}
function session(req:Request){const token=(req.get('X-PDF-Session')||'');const s=sessions.get(token);if(s&&s.expires>Date.now())return s;sessions.delete(token);return null;}
function auth(req:Request,res:Response,next:NextFunction){if(!session(req))return res.status(401).json({error:'Připojení vypršelo. Otevři Translator znovu.'});next();}
app.post(base+'/api/auth/login',(req,res)=>{for(const [k,s]of sessions)if(s.expires<Date.now())sessions.delete(k);if(sessions.size>=30)return res.status(429).json({error:'Příliš mnoho aktivních relací.'});const token=randomBytes(32).toString('hex');sessions.set(token,{expires:Date.now()+8*3600000,cache:new Map()});res.json({token,username:'Vlastník soukromého Velínu'});});
app.get(base+'/api/auth/me',auth,(req,res)=>res.json({username:'Vlastník soukromého Velínu'}));
app.post(base+'/api/auth/logout',auth,(req,res)=>{sessions.delete((req.get('X-PDF-Session')||''));res.json({ok:true});});
app.get(base+'/api/health',(req,res)=>res.json({ok:true,provider:'codex',mode:'private-owner'}));
app.get(base+'/api/model-status',(req,res)=>{execFile(codex,['login','status'],{timeout:5000,env:modelEnv()},(error,stdout,stderr)=>res.json({connected:!error&&/chatgpt/i.test(stdout+stderr),provider:'Codex · osobní účet',apiFallback:false}));});
app.get(base+'/api/usage',auth,(req,res)=>{resetDay();res.json({...usage,dailyLimit:60,busy,apiSpend:0,billing:'Využití limitu osobního Codex účtu; nikoli měření ceny předplatného.'});});
app.get(base+'/api/cache-status',auth,(req,res)=>res.json({cacheSize:session(req)!.cache.size,timestamp:new Date().toISOString()}));
app.post(base+'/api/cache/clear',auth,(req,res)=>{session(req)!.cache.clear();res.json({ok:true});});
const langs=new Set(['czech','english','german','french','spanish','italian','slovak','polish','japanese','portuguese','russian','ukrainian']);
for(const action of ['translate','summarize'])app.post(base+`/api/${action}-stream`,auth,async(req,res)=>{
 const text=action==='translate'?req.body.pageText:req.body.text;const language=action==='translate'?req.body.targetLanguage:req.body.outputLanguage;
 if(typeof text!=='string'||!text.trim()||text.length>24000||typeof language!=='string'||!langs.has(language))return res.status(400).json({error:'Vyber jazyk a text o délce nejvýše 24 000 znaků. Delší úsek rozděl.'});
 const data={action,text,language,task:req.body.task==='notes'?'notes':'final',instructions:typeof req.body.userInstructions==='string'?req.body.userInstructions.slice(0,1200):''};
 const current=session(req)!;const key=createHash('sha256').update(JSON.stringify(data)).digest('hex');resetDay();
 if(!req.body.force&&current.cache.has(key)){usage.cacheHits++;persist();res.type('text/event-stream').end('data: '+JSON.stringify({content:current.cache.get(key),isDone:true})+'\n\n');return;}
 if(busy)return res.status(429).json({error:'Agent právě zpracovává jinou stránku. Počkej na dokončení.'});
 if(usage.attempts>=60)return res.status(429).json({error:'Dnešní limit 60 modelových požadavků je vyčerpaný.'});
 busy=true;usage.attempts++;persist();const controller=new AbortController();res.on('close',()=>controller.abort());
 res.status(200).type('text/event-stream');res.flushHeaders();const pulse=setInterval(()=>res.write(': processing\n\n'),10000);
 try{const content=await runAgent(data,controller.signal);if(current.cache.size>=40)current.cache.delete(current.cache.keys().next().value!);current.cache.set(key,content);usage.completed++;if(!res.destroyed)res.write('data: '+JSON.stringify({content,isDone:true})+'\n\n');}
 catch(e){usage.failed++;if(!res.destroyed)res.write('data: '+JSON.stringify({error:e instanceof Error?e.message:'Zpracování selhalo.',isDone:true})+'\n\n');}
 finally{clearInterval(pulse);busy=false;persist();res.end();}
});
app.use(base,express.static(resolve(__dirname,'../../client/dist')));
app.use((req,res)=>res.status(404).json({error:'Nenalezeno.'}));
app.use((err:unknown,req:Request,res:Response,next:NextFunction)=>res.status(400).json({error:'Neplatný nebo příliš velký požadavek.'}));
app.listen(Number(process.env.PDF_PORT||4190),'127.0.0.1',()=>console.log('PDF Translator private backend ready'));
