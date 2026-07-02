/* Генерация спрайтов нового состава армии: Footman, Archer, Mage, Balloon.
   Единый стиль с рыцарем (assets/knight.png): Clash-чиби, navy+gold, ракурс 3/4, вправо, прозрачный фон.
   Запуск: node gen-units.js [--quality medium]. Ключ: solana-key.txt / $OPENAI_API_KEY. Нужен VPN. */
"use strict";
const fs=require("fs"),path=require("path");
const API="https://api.openai.com/v1/images/generations";
function readKey(){for(const p of[path.join(__dirname,"solana-key.txt"),path.join(__dirname,"solana","solana-key.txt")]){try{if(fs.existsSync(p)){const k=fs.readFileSync(p,"utf8").trim();if(k)return k;}}catch(_){}}return null;}
const KEY=process.env.OPENAI_API_KEY||readKey();
if(!KEY){console.error("нет ключа");process.exit(1);}
const argv=process.argv.slice(2);
const val=(f,d)=>{const i=argv.indexOf(f);return i>=0&&argv[i+1]?argv[i+1]:d;};
const QUALITY=val("--quality","medium");
const OUT=path.join(__dirname,"assets","generated");
fs.mkdirSync(OUT,{recursive:true});

const STYLE=`Clash Royale / Clash of Clans mobile game art style, cute stylized cartoon, chibi proportions (slightly big head, short sturdy body). Palette: navy blue cloth, gold/yellow trim, light steel accents. Standing in a neutral relaxed pose, legs clearly apart, feet flat. Seen from a 3/4 top-down game camera, body facing to the RIGHT. FULL BODY fully visible, centered, with empty margin all around. Clean vector-like cel shading, soft top-down lighting, crisp edges. Isolated on a fully TRANSPARENT background, no ground, no shadow, no scenery.`;

const UNITS={
  footman:`A light footman soldier. Simple navy-blue gambeson tunic with leather belt and straps, small open iron helmet showing a young determined face, light leather boots. Holds a short one-handed sword in his right hand relaxed DOWN at his side (blade pointing down, not crossing the body), a small round wooden buckler shield on the left arm held slightly out. Slim, lightly-equipped build — clearly LIGHTER and simpler than a knight. ${STYLE}`,
  archer:`An archer. Navy-blue hood and light leather armor with gold trim, fingerless gloves, quiver full of arrows on his back. Holds a wooden recurve bow in the left hand relaxed at his side (bow vertical, not drawn). Sharp confident face visible under the hood. ${STYLE}`,
  mage:`A wizard mage. Flowing navy-blue robe with gold runes and trim, pointed wizard hat, long white beard. Holds a wooden staff topped with a glowing light-blue crystal in his right hand, staff planted vertically at his side; his left palm shows a small magical blue flame. Subtle magical glow around the crystal. ${STYLE}`,
  balloon:`A military hot-air balloon unit. Big round patched balloon envelope in navy blue with gold stripes and stitched seams, ropes down to a small wooden basket; a small round black bomb with a lit fuse hangs under the basket. A tiny cheeky goblin pilot peeks over the basket edge wearing an aviator cap. Slight drift tilt. ${STYLE}`
};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function log(m){console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);}
async function gen(name,prompt){
  for(let att=1;att<=3;att++){
    try{
      log(`${name}: генерирую (попытка ${att})…`);
      const r=await fetch(API,{method:"POST",headers:{"Authorization":"Bearer "+KEY,"Content-Type":"application/json"},
        body:JSON.stringify({model:"gpt-image-1.5",prompt,size:"1024x1024",quality:QUALITY,background:"transparent",n:1})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error&&j.error.message||("HTTP "+r.status));
      const b64=j.data[0].b64_json;
      const f=path.join(OUT,"unit_"+name+".png");
      fs.writeFileSync(f,Buffer.from(b64,"base64"));
      log(`${name}: ✓ ${f}`);
      return true;
    }catch(e){log(`${name}: ошибка — ${(e.message||e).slice(0,120)}`);await sleep(4000);}
  }
  return false;
}
(async()=>{
  const res=await Promise.all(Object.entries(UNITS).map(([n,p])=>gen(n,p)));
  log("итого: "+res.filter(Boolean).length+"/"+res.length);
  process.exit(res.every(Boolean)?0:1);
})();
