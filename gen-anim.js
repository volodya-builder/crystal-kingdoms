/* Пайплайн настоящей анимации юнита: спрайт → Meshy image-to-3D → авто-риг (скелет+анимации) → скачивание .glb.
   Запуск: node gen-anim.js assets/generated/archer2.png --name archer
   Результат: assets/generated/3d/<name>_rigged.glb (+ анимационные glb, если Meshy их отдаёт отдельно)
   Ключ: meshy-key.txt. Нужен VPN. */
"use strict";
const fs=require("fs"),path=require("path");
const BASE="https://api.meshy.ai/openapi";
const KEY=(process.env.MESHY_API_KEY||fs.readFileSync(path.join(__dirname,"meshy-key.txt"),"utf8")).trim();
const argv=process.argv.slice(2);
const IMAGE=argv[0];
const val=(f,d)=>{const i=argv.indexOf(f);return i>=0&&argv[i+1]?argv[i+1]:d;};
const NAME=val("--name","unit");
const OUT=path.join(__dirname,"assets","generated","3d");
fs.mkdirSync(OUT,{recursive:true});
const H={Authorization:"Bearer "+KEY,"Content-Type":"application/json"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);
async function post(url,body){const r=await fetch(url,{method:"POST",headers:H,body:JSON.stringify(body)});const t=await r.text();
  if(!r.ok)throw new Error(`POST ${url} -> ${r.status} ${t.slice(0,300)}`);try{return JSON.parse(t);}catch(_){return t;}}
async function poll(url,label){let last=-1;
  for(let i=0;i<200;i++){
    try{const r=await fetch(url,{headers:H});const j=await r.json();
      if(j.progress!==last){log(`  ${label}: ${j.status} ${j.progress||0}%`);last=j.progress;}
      if(j.status==="SUCCEEDED")return j;
      if(j.status==="FAILED"||j.status==="CANCELED")throw new Error(`__FATAL__ ${label}: ${JSON.stringify(j.task_error||j).slice(0,300)}`);
    }catch(e){if(/__FATAL__/.test(e.message))throw e;log(`  (ретрай: ${(e.message||e).slice(0,60)})`);}
    await sleep(5000);}
  throw new Error(label+": таймаут");}
async function dl(url,file){for(let i=0;i<6;i++){try{const r=await fetch(url);if(!r.ok)throw new Error("HTTP "+r.status);
  fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));log(`  ⬇ ${path.basename(file)} (${(fs.statSync(file).size/1e6).toFixed(1)}МБ)`);return;}catch(e){log("  (ретрай скачивания)");await sleep(4000);}}
  throw new Error("не скачалось: "+url);}
(async()=>{
  // 1) image-to-3D
  const b64="data:image/png;base64,"+fs.readFileSync(IMAGE).toString("base64");
  log(`image-to-3D: ${IMAGE}`);
  const c=await post(`${BASE}/v1/image-to-3d`,{image_url:b64,enable_pbr:true,should_remesh:true,topology:"quad"});
  const tid=c.result; log(`  task ${tid}`);
  const m3=await poll(`${BASE}/v1/image-to-3d/${tid}`,"image-to-3d");
  if(m3.model_urls&&m3.model_urls.glb)await dl(m3.model_urls.glb,path.join(OUT,NAME+"_static.glb"));
  // 2) авто-риг + анимации
  log("rigging…");
  const rq=await post(`${BASE}/v1/rigging`,{input_task_id:tid});
  const rid=rq.result; log(`  task ${rid}`);
  const rg=await poll(`${BASE}/v1/rigging/${rid}`,"rigging");
  log("ОТВЕТ РИГГИНГА (ключи): "+JSON.stringify(Object.keys(rg)));
  log(JSON.stringify(rg).slice(0,1500));
  // скачиваем всё, что похоже на glb
  const urls={};
  (function walk(o,p){for(const k in o){const v=o[k];if(typeof v==="string"&&/^https?:.*\.glb/.test(v.split("?")[0]))urls[p+k]=v;else if(v&&typeof v==="object")walk(v,p+k+".");}})(rg,"");
  for(const [k,u] of Object.entries(urls)){
    const fname=NAME+"_"+k.replace(/[^a-z0-9]+/gi,"_").toLowerCase()+".glb";
    await dl(u,path.join(OUT,fname));
  }
  log("ГОТОВО");
})().catch(e=>{console.error("ОШИБКА:",e.message||e);process.exit(1);});
