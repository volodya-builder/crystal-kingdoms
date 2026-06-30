/* Генерация 3D-моделей через Meshy (text-to-3D: превью-геометрия -> текстуры -> .glb).
   Запуск: node gen-3d.js "промт" --name hq [--style realistic] [--image path.png]
   Ключ: meshy-key.txt или $MESHY_API_KEY.  Модели -> assets/generated/3d/<name>.glb
   ============================================================ */
"use strict";
const fs=require("fs"),path=require("path");
const BASE="https://api.meshy.ai/openapi";
function readKey(){try{const k=fs.readFileSync(path.join(__dirname,"meshy-key.txt"),"utf8").trim();if(k&&!/ВСТАВЬ/.test(k))return k;}catch(_){}return process.env.MESHY_API_KEY||null;}
const KEY=readKey();
const argv=process.argv.slice(2);
const val=(f,d)=>{const i=argv.indexOf(f);return i>=0&&argv[i+1]?argv[i+1]:d;};
const PROMPT=argv[0]&&!argv[0].startsWith("--")?argv[0]:null;
const NAME=val("--name","model");
const STYLE=val("--style","realistic");
const IMAGE=val("--image",null);
const OUT=path.join(__dirname,"assets","generated","3d");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function log(m){console.log(`[${new Date().toISOString()}] ${m}`);}
const H={Authorization:"Bearer "+KEY,"Content-Type":"application/json"};

async function post(url,body){const r=await fetch(url,{method:"POST",headers:H,body:JSON.stringify(body)});const t=await r.text();if(!r.ok)throw new Error(`POST ${url} -> ${r.status} ${t.slice(0,200)}`);try{return JSON.parse(t);}catch(_){return t;}}
async function poll(url,label){let last=-1;for(let i=0;i<160;i++){
  try{const r=await fetch(url,{headers:H});const j=await r.json();
    if(j.status!==undefined&&(j.progress!==last)){log(`  ${label}: ${j.status} ${j.progress||0}%`);last=j.progress;}
    if(j.status==="SUCCEEDED")return j;
    if(j.status==="FAILED"||j.status==="CANCELED")throw new Error(`__FATAL__ ${label} ${j.status}: ${JSON.stringify(j.task_error||{}).slice(0,200)}`);
  }catch(e){if(/__FATAL__/.test(e.message))throw e; log(`  (сеть, ретрай: ${(e.message||e).slice(0,50)})`);}
  await sleep(5000);}
  throw new Error(`${label}: таймаут`);}
async function dl(url){for(let i=0;i<6;i++){try{const r=await fetch(url);if(!r.ok)throw new Error("HTTP "+r.status);return Buffer.from(await r.arrayBuffer());}catch(e){log(`  (скачивание ретрай: ${(e.message||e).slice(0,40)})`);await sleep(4000);}}throw new Error("не скачалось");}

(async()=>{
  if(!KEY){console.error("❌ нет ключа Meshy (meshy-key.txt)");process.exit(1);}
  fs.mkdirSync(OUT,{recursive:true});
  let glbUrl;
  if(IMAGE){ // image-to-3D
    const b64="data:image/png;base64,"+fs.readFileSync(path.isAbsolute(IMAGE)?IMAGE:path.join(__dirname,IMAGE)).toString("base64");
    log(`image-to-3D из ${IMAGE} …`);
    const c=await post(`${BASE}/v1/image-to-3d`,{image_url:b64,enable_pbr:true,should_remesh:true});
    const id=c.result; log(`task ${id}`);
    const done=await poll(`${BASE}/v1/image-to-3d/${id}`,"image-to-3d");
    glbUrl=done.model_urls&&done.model_urls.glb;
  }else{ // text-to-3D: preview -> refine
    if(!PROMPT){console.error("❌ нужен промт или --image");process.exit(1);}
    log(`text-to-3D preview: "${PROMPT.slice(0,60)}…" (style=${STYLE})`);
    const c1=await post(`${BASE}/v2/text-to-3d`,{mode:"preview",prompt:PROMPT,art_style:STYLE,should_remesh:true});
    const pid=c1.result; log(`preview task ${pid}`);
    await poll(`${BASE}/v2/text-to-3d/${pid}`,"preview");
    log(`refine (текстуры)…`);
    const c2=await post(`${BASE}/v2/text-to-3d`,{mode:"refine",preview_task_id:pid,enable_pbr:true});
    const rid=c2.result; log(`refine task ${rid}`);
    const done=await poll(`${BASE}/v2/text-to-3d/${rid}`,"refine");
    glbUrl=done.model_urls&&done.model_urls.glb;
  }
  if(!glbUrl)throw new Error("нет glb в ответе");
  log(`скачиваю glb…`);
  const buf=Buffer.from(await (await fetch(glbUrl)).arrayBuffer());
  const outp=path.join(OUT,NAME+".glb");
  fs.writeFileSync(outp,buf);
  log(`✓ ${path.relative(__dirname,outp)} (${buf.length/1024|0} KB)`);
})().catch(e=>{log("ОШИБКА: "+(e.message||e));process.exit(1);});
