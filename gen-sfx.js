/* Генерация звуков игры через ElevenLabs Sound Effects API (text -> SFX).
   Запуск: node gen-sfx.js [--only click,hit,...] [--force] [--concurrency 3]
   Ключ: elevenlabs-key.txt или $ELEVENLABS_API_KEY. (При блокировке региона — системный VPN.)
   Файлы -> assets/sfx/<name>.mp3
   ============================================================ */
"use strict";
const fs=require("fs"),path=require("path");
const API="https://api.elevenlabs.io/v1/sound-generation";
function readKey(){for(const p of[path.join(__dirname,"elevenlabs-key.txt"),path.join(__dirname,"eleven-key.txt")]){try{if(fs.existsSync(p)){const k=fs.readFileSync(p,"utf8").trim();if(k&&!/ВСТАВЬ/.test(k))return k;}}catch(_){}}return null;}
const KEY=process.env.ELEVENLABS_API_KEY||readKey();
const argv=process.argv.slice(2);
const val=(f,d)=>{const i=argv.indexOf(f);return i>=0&&argv[i+1]?argv[i+1]:d;};
const has=f=>argv.includes(f);
const ONLY=(val("--only","")||"").split(",").map(s=>s.trim()).filter(Boolean);
const FORCE=has("--force");
const CONC=parseInt(val("--concurrency","3"),10);
const OUT=path.join(__dirname,"assets","sfx");

// событие -> {prompt, dur (сек), influence}
const SFX={
  click:    {prompt:"short clean UI button click, soft and crisp, mobile game menu tap", dur:0.5, inf:0.4},
  panel:    {prompt:"soft UI panel slide open whoosh, light and quick", dur:0.6, inf:0.4},
  error:    {prompt:"short negative error blip, soft denied buzzer, not harsh", dur:0.6, inf:0.4},
  place:    {prompt:"placing a building down, satisfying wood and stone thud with a small clink, cartoon strategy game", dur:0.7, inf:0.45},
  upgrade:  {prompt:"upgrade complete, bright magical sparkle chime, positive reward", dur:1.2, inf:0.4},
  coin:     {prompt:"collecting coins, light bright metallic coin pickup jingle", dur:0.7, inf:0.45},
  deploy:   {prompt:"deploying a soldier unit, quick armor clank with a short whoosh, cartoon", dur:0.7, inf:0.45},
  hit:      {prompt:"sword hitting armor and shield, sharp metallic clash, short and punchy", dur:0.5, inf:0.5},
  shoot:    {prompt:"firing an arrow or light projectile, quick whoosh with a snap, cartoon game", dur:0.5, inf:0.45},
  boom:     {prompt:"cannon fire, punchy deep boom with a short tail, cartoon artillery", dur:0.9, inf:0.5},
  explosion:{prompt:"building explosion, debris and dust, medium cartoon boom", dur:1.2, inf:0.5},
  wallbreak:{prompt:"stone wall smashing apart, heavy rubble crash, cartoon", dur:0.9, inf:0.5},
  raid:     {prompt:"battle starts, short war horn blast with a drum hit, epic fantasy", dur:1.8, inf:0.5},
  win:      {prompt:"victory fanfare, triumphant bright brass and bells jingle, fantasy game win", dur:2.2, inf:0.45},
  lose:     {prompt:"defeat sound, sad descending tones, short gentle game over sting", dur:1.8, inf:0.45}
};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function log(m){console.log(`[${new Date().toISOString()}] ${m}`);}

async function gen(name){
  const c=SFX[name];
  const body={text:c.prompt, duration_seconds:Math.max(0.5,c.dur), prompt_influence:c.inf};
  let delay=4000;
  for(let a=1;a<=4;a++){
    try{
      const res=await fetch(API,{method:"POST",headers:{"xi-api-key":KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!res.ok)throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0,200)}`);
      const buf=Buffer.from(await res.arrayBuffer());
      // sanity: mp3 (ID3 или 0xFF 0xFB) и непустой
      const ok=buf.length>800 && (buf[0]===0x49&&buf[1]===0x44&&buf[2]===0x33 || buf[0]===0xFF);
      if(!ok)throw new Error(`подозрительный файл (${buf.length}B)`);
      fs.writeFileSync(path.join(OUT,name+".mp3"),buf);
      log(`✓ ${name}.mp3 (${buf.length/1024|0} KB)`);
      return true;
    }catch(e){log(`⚠ ${name} попытка ${a}/4: ${(e.message||e).slice(0,180)}`);if(a===4)throw e;await sleep(delay);delay=Math.min(delay*2,40000);}
  }
}
(async()=>{
  if(!KEY){console.error("❌ Нет ключа ElevenLabs (elevenlabs-key.txt или $ELEVENLABS_API_KEY).");process.exit(1);}
  fs.mkdirSync(OUT,{recursive:true});
  let names=Object.keys(SFX); if(ONLY.length)names=names.filter(n=>ONLY.includes(n));
  if(!FORCE)names=names.filter(n=>!fs.existsSync(path.join(OUT,n+".mp3")));
  log(`Генерирую ${names.length} звуков (concurrency=${CONC}) -> assets/sfx/ : ${names.join(", ")||"(все уже есть)"}`);
  let i=0,okc=0;
  async function worker(){while(i<names.length){const n=names[i++];try{await gen(n);okc++;}catch(e){log(`✗ ${n}: ${(e.message||e).slice(0,120)}`);}}}
  await Promise.all(Array.from({length:Math.max(1,CONC)},worker));
  log(`Готово: ${okc}/${names.length}.`);
})().catch(e=>{log("ОШИБКА: "+(e.message||e));process.exit(1);});
