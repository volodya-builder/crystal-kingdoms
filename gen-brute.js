/* Генерация кандидатов нового брута в позе, удобной для рига (рука с мечом сбоку, не поперёк тела),
   с более ЛЁГКОЙ бронёй. Несколько вариантов параллельно — потом выберем лучший.
   Запуск: node gen-brute.js [N] [--model gpt-image-1.5] [--quality medium]
   Ключ: solana-key.txt или $OPENAI_API_KEY. Нужен системный VPN (US/DE). */
"use strict";
const fs=require("fs"),path=require("path");
const API="https://api.openai.com/v1/images/generations";
function readKey(){for(const p of[path.join(__dirname,"solana-key.txt"),path.join(__dirname,"solana","solana-key.txt")]){try{if(fs.existsSync(p)){const k=fs.readFileSync(p,"utf8").trim();if(k)return k;}}catch(_){}}return null;}
const KEY=process.env.OPENAI_API_KEY||readKey();
const argv=process.argv.slice(2);
const val=(f,d)=>{const i=argv.indexOf(f);return i>=0&&argv[i+1]?argv[i+1]:d;};
const N=parseInt(argv.find(a=>/^\d+$/.test(a))||"4",10);
const MODEL=val("--model","gpt-image-1.5");
const QUALITY=val("--quality","medium");
const OUT=path.join(__dirname,"assets","generated");

const PROMPT=`A cute stylized cartoon knight, Clash Royale / Clash of Clans mobile game art style, chibi proportions (slightly big head, short sturdy body). Colors: navy blue cloth, gold/yellow trim, light polished steel accents. LIGHT, SIMPLE armor — a blue tunic with a leather belt, a light steel chestplate, small shoulder pads and a simple open helmet showing his face; NOT heavy full plate, keep it light and clean. He holds a straight steel sword in his right hand with the arm relaxed DOWN and slightly OUT to his side, the blade pointing down and NOT crossing his torso. On his left arm a simple round shield (wood with a gold rim) held out a little to the side. Standing upright in a neutral relaxed A-pose, both legs straight and clearly apart with a visible gap between them, feet flat on the ground. Clear space between his arms and his torso so the limbs read as separate. Seen from a 3/4 top-down game camera, body facing to the RIGHT. FULL BODY fully visible from helmet to boots, centered, with empty margin all around. Clean vector-like cel shading, soft top-down lighting, crisp edges. Isolated on a fully TRANSPARENT background, no ground, no shadow, no scenery.`;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function log(m){console.log(`[${new Date().toISOString()}] ${m}`);}

async function gen(idx){
  const body={model:MODEL,prompt:PROMPT,size:"1024x1024",quality:QUALITY,background:"transparent",n:1};
  let delay=4000;
  for(let a=1;a<=4;a++){
    try{
      const res=await fetch(API,{method:"POST",headers:{Authorization:`Bearer ${KEY}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!res.ok)throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0,200)}`);
      const j=await res.json();
      const buf=Buffer.from(j.data[0].b64_json,"base64");
      const out=path.join(OUT,`brute_v${idx}.png`);
      fs.writeFileSync(out,buf);
      log(`✓ brute_v${idx}.png (${buf.length/1024|0} KB)`);
      return out;
    }catch(e){log(`⚠ v${idx} попытка ${a}/4: ${(e.message||e).slice(0,180)}`);if(a===4)throw e;await sleep(delay);delay=Math.min(delay*2,40000);}
  }
}
(async()=>{
  if(!KEY){console.error("❌ нет ключа");process.exit(1);}
  fs.mkdirSync(OUT,{recursive:true});
  log(`Генерирую ${N} кандидатов | модель=${MODEL} качество=${QUALITY} → assets/generated/brute_vN.png`);
  const tasks=[];for(let i=1;i<=N;i++)tasks.push(gen(i));
  const res=await Promise.allSettled(tasks);
  const ok=res.filter(r=>r.status==="fulfilled").length;
  log(`Готово: ${ok}/${N} успешно.`);
})().catch(e=>{log("ОШИБКА: "+(e.message||e));process.exit(1);});
