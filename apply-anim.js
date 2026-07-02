/* Применение анимаций из библиотеки Meshy к риг-задаче.
   node apply-anim.js <rig_task_id> <name> <action_id:метка> [<action_id:метка> ...]
   Пример: node apply-anim.js 019f21af... knight 219:attack 89:idle 8:death
   Результат: assets/generated/3d/<name>_anim_<метка>.glb */
"use strict";
const fs=require("fs"),path=require("path");
const BASE="https://api.meshy.ai/openapi/v1";
const KEY=(process.env.MESHY_API_KEY||fs.readFileSync(path.join(__dirname,"meshy-key.txt"),"utf8")).trim();
const [RIG,NAME,...ACTIONS]=process.argv.slice(2);
const OUT=path.join(__dirname,"assets","generated","3d");
const H={Authorization:"Bearer "+KEY,"Content-Type":"application/json"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);
async function post(url,body){const r=await fetch(url,{method:"POST",headers:H,body:JSON.stringify(body)});const t=await r.text();
  if(!r.ok)throw new Error(`POST ${r.status} ${t.slice(0,300)}`);return JSON.parse(t);}
async function poll(url,label){let last=-1;
  for(let i=0;i<200;i++){
    try{const r=await fetch(url,{headers:H});const j=await r.json();
      if(j.progress!==last){log(`  ${label}: ${j.status} ${j.progress||0}%`);last=j.progress;}
      if(j.status==="SUCCEEDED")return j;
      if(j.status==="FAILED"||j.status==="CANCELED")throw new Error(`__FATAL__ ${label}: ${JSON.stringify(j.task_error||j).slice(0,300)}`);
    }catch(e){if(/__FATAL__/.test(e.message))throw e;log(`  (ретрай)`);}
    await sleep(4000);}
  throw new Error(label+": таймаут");}
async function dl(url,file){for(let i=0;i<6;i++){try{const r=await fetch(url);if(!r.ok)throw new Error("HTTP "+r.status);
  fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));log(`  ⬇ ${path.basename(file)} (${(fs.statSync(file).size/1e6).toFixed(1)}МБ)`);return;}catch(e){await sleep(4000);}}
  throw new Error("не скачалось");}
(async()=>{
  for(const spec of ACTIONS){
    const [id,label]=spec.split(":");
    log(`анимация ${label} (action ${id})…`);
    const c=await post(`${BASE}/animations`,{rig_task_id:RIG,action_id:parseInt(id,10)});
    const t=await poll(`${BASE}/animations/${c.result}`,label);
    const res=t.result||{};
    const url=res.animation_glb_url||res.glb_url||(res.model_urls&&res.model_urls.glb);
    if(!url){log("  нет glb в ответе: "+JSON.stringify(res).slice(0,300));continue;}
    await dl(url,path.join(OUT,`${NAME}_anim_${label}.glb`));
  }
  log("ГОТОВО");
})().catch(e=>{console.error("ОШИБКА:",e.message);process.exit(1);});
