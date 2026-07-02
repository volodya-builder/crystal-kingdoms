/* Армия v2 — стилистика «кинематик CoC» (глянцевый 3D-рендер) по референсу игрока.
   Позы риг-френдли: ноги врозь, оружие вниз-в сторону, зазоры между руками и корпусом.
   Запуск: node gen-units2.js. Ключ: solana-key.txt. Нужен VPN. */
"use strict";
const fs=require("fs"),path=require("path");
const KEY=process.env.OPENAI_API_KEY||fs.readFileSync(path.join(__dirname,"solana-key.txt"),"utf8").trim();
const OUT=path.join(__dirname,"assets","generated");fs.mkdirSync(OUT,{recursive:true});

const STYLE=`Premium mobile strategy game splash-art style exactly like modern Clash of Clans cinematic renders: stylized 3D-rendered character with glossy, almost toy-like PBR shading, vibrant saturated colors, soft warm studio key light plus cool blue sky rim light, Pixar-like expressive face with big glossy eyes and a confident smile, rich material detail (polished metal with ornate gold filigree trim, stitched cloth, leather straps), small blue star-cut crystal gems embedded in the gear. POSE FOR ANIMATION RIG: standing upright in a relaxed neutral stance, both legs straight and clearly APART with a visible gap between them, feet flat; the weapon arm relaxed DOWN and slightly OUT to the side so the weapon does NOT cross the torso; clear space between arms and torso so limbs read as separate shapes. Seen from a 3/4 top-down game camera, body facing to the RIGHT. FULL BODY fully visible from head to feet, centered, generous empty margin all around. Isolated on a fully TRANSPARENT background, no ground, no shadow, no scenery, single character only.`;

const UNITS={
  knight2:`A heroic young knight with short dark navy-blue hair (no helmet), wearing polished silver plate armor with ornate gold filigree trim and a royal blue cape. On his left arm a large heater shield: blue field with a gold rim and a glowing blue star-cut crystal in the center. In his right hand a big ornate longsword with a gold crossguard and a small blue gem in the pommel, held relaxed DOWN at his side, blade pointing down-outward. ${STYLE}`,
  mage2:`A cheerful young sorceress with a bright PINK ponytail, wearing an elegant purple-and-violet battle dress with gold trim, a wide leather belt and small pauldrons. In one hand an ornate dark-wood staff crowned with a big glowing magenta/pink crystal, held planted at her side; her other palm open with tiny pink sparkles. ${STYLE}`,
  archer2:`A focused young archer girl with a brown ponytail, wearing a forest-green hood and cape over light leather armor with gold buckles, a quiver of red-fletched arrows on her back. She holds an elegant golden recurve bow in her left hand relaxed at her side (bow vertical, not drawn). ${STYLE}`,
  maceman2:`A stocky cheerful dwarf warrior with a magnificent braided BLONDE beard and bushy eyebrows, wearing a sleeveless navy-blue tunic with a broad leather belt with a gold buckle, leather bracers and boots. In his right hand a heavy SPIKED MACE (thick round steel head with blunt spikes, short sturdy handle) held relaxed DOWN at his side. ${STYLE}`,
  balloon2:`A military hot-air balloon war machine: a big round patched balloon envelope in royal navy blue with gold stripes and rope netting, hanging wooden basket with steel corner fittings; a small cheeky green goblin pilot with aviator goggles peeks over the edge; a round black bomb with a lit fuse hangs under the basket on a rope. Slight drifting tilt. ${STYLE}`
};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);
async function gen(name,prompt){
  for(let att=1;att<=3;att++){
    try{
      log(`${name}: попытка ${att}…`);
      const r=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",
        headers:{"Authorization":"Bearer "+KEY,"Content-Type":"application/json"},
        body:JSON.stringify({model:"gpt-image-1.5",prompt,size:"1024x1536",quality:"high",background:"transparent",n:1})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error&&j.error.message||("HTTP "+r.status));
      fs.writeFileSync(path.join(OUT,name+".png"),Buffer.from(j.data[0].b64_json,"base64"));
      log(`${name}: ✓`); return true;
    }catch(e){log(`${name}: ${(e.message||e).slice(0,110)}`);await sleep(5000);}
  }
  return false;
}
(async()=>{
  const res=await Promise.all(Object.entries(UNITS).map(([n,p])=>gen(n,p)));
  log("итого "+res.filter(Boolean).length+"/5");
  process.exit(res.every(Boolean)?0:1);
})();
