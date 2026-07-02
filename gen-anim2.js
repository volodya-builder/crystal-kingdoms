/* Конвейер v2: МУЛЬТИ-ВЬЮ (фронт+профиль+спина) → Meshy 3D → авто-риг → полный набор анимаций.
   node gen-anim2.js <name> <viewsPrefix> <actionSpec...>
   Пример: node gen-anim2.js knight3 assets/generated/views/knight3 219:attack 89:idle 8:death
   Скачивает: assets/generated/3d/<name>_rigged.glb, _walking.glb, _anim_<label>.glb */
"use strict";
const fs=require("fs"),path=require("path");
const BASE="https://api.meshy.ai/openapi/v1";
const KEY=(process.env.MESHY_API_KEY||fs.readFileSync(path.join(__dirname,"meshy-key.txt"),"utf8")).trim();
const [NAME,PREFIX,...ACTIONS]=process.argv.slice(2);
const OUT=path.join(__dirname,"assets","generated","3d");fs.mkdirSync(OUT,{recursive:true});
const H={Authorization:"Bearer "+KEY,"Content-Type":"application/json"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);
async function post(url,body){const r=await fetch(url,{method:"POST",headers:H,body:JSON.stringify(body)});const t=await r.text();
  if(!r.ok)throw new Error(`POST ${url} -> ${r.status} ${t.slice(0,250)}`);return JSON.parse(t);}
async function poll(url,label){let last=-1;
  for(let i=0;i<240;i++){
    try{const r=await fetch(url,{headers:H});const j=await r.json();
      if(j.progress!==last){log(`  ${label}: ${j.status} ${j.progress||0}%`);last=j.progress;}
      if(j.status==="SUCCEEDED")return j;
      if(j.status==="FAILED"||j.status==="CANCELED")throw new Error(`__FATAL__ ${label}: ${JSON.stringify(j.task_error||j).slice(0,250)}`);
    }catch(e){if(/__FATAL__/.test(e.message))throw e;log("  (ретрай)");}
    await sleep(5000);}
  throw new Error(label+": таймаут");}
async function dl(url,file){for(let i=0;i<6;i++){try{const r=await fetch(url);if(!r.ok)throw new Error("HTTP "+r.status);
  fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));log(`  ⬇ ${path.basename(file)} (${(fs.statSync(file).size/1e6).toFixed(1)}МБ)`);return;}catch(e){await sleep(4000);}}
  throw new Error("не скачалось");}
const b64=f=>"data:image/png;base64,"+fs.readFileSync(f).toString("base64");
(async()=>{
  // 1) мульти-вью 3D
  const views=["front","side","back"].map(v=>b64(path.join(__dirname,PREFIX+"_"+v+".png")));
  log(`${NAME}: multi-image-to-3D (3 ракурса)…`);
  const c=await post(`${BASE}/multi-image-to-3d`,{image_urls:views,enable_pbr:true,should_remesh:true,topology:"quad"});
  const tid=c.result;log(`  task ${tid}`);
  const m3=await poll(`${BASE}/multi-image-to-3d/${tid}`,"multi-3d");
  const glbUrl=m3.model_urls&&m3.model_urls.glb;
  if(glbUrl)await dl(glbUrl,path.join(OUT,NAME+"_static.glb"));
  // 2) риг (по task id; если не примет — по model_url)
  log("rigging…");
  let rq;
  try{rq=await post(`${BASE}/rigging`,{input_task_id:tid});}
  catch(e){log("  input_task_id не принят ("+e.message.slice(0,80)+"), пробую model_url");
    rq=await post(`${BASE}/rigging`,{model_url:glbUrl});}
  const rid=rq.result;log(`  rig task ${rid}`);
  const rg=await poll(`${BASE}/rigging/${rid}`,"rigging");
  const res=rg.result||{};
  if(res.rigged_character_glb_url)await dl(res.rigged_character_glb_url,path.join(OUT,NAME+"_rigged.glb"));
  const ba=res.basic_animations||{};
  if(ba.walking_glb_url)await dl(ba.walking_glb_url,path.join(OUT,NAME+"_walking.glb"));
  // 3) анимации по списку
  for(const spec of ACTIONS){
    const [id,label]=spec.split(":");
    log(`анимация ${label} (${id})…`);
    const a=await post(`${BASE}/animations`,{rig_task_id:rid,action_id:parseInt(id,10)});
    const t=await poll(`${BASE}/animations/${a.result}`,label);
    const u=(t.result||{}).animation_glb_url;
    if(u)await dl(u,path.join(OUT,NAME+"_anim_"+label+".glb"));
    else log("  нет glb: "+JSON.stringify(t.result||{}).slice(0,200));
  }
  log(NAME+": ГОТОВО");
})().catch(e=>{console.error("ОШИБКА:",e.message);process.exit(1);});
