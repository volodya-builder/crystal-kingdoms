/* Базы пушки без башни (inpaint) + изолированные башни для 3D.
   node gen-base-edits.js bases   → assets/cannon_base_lv1..10.png
   node gen-base-edits.js turrets → scratchpad turret_only_lv2.png, turret_only_lv5.png
   Ключ: solana-key.txt / $OPENAI_API_KEY. */
"use strict";
const fs=require("fs"),path=require("path");
const API="https://api.openai.com/v1/images/edits";
function readKeyFile(){for(const p of [path.join(__dirname,"solana-key.txt"),path.join(__dirname,"solana","solana-key.txt")]){try{if(fs.existsSync(p)){const k=fs.readFileSync(p,"utf8").trim();if(k)return k;}}catch(_){}}return null;}
const KEY=process.env.OPENAI_API_KEY||readKeyFile();
const SP="C:/Users/HYPERPC/AppData/Local/Temp/claude/c--Users-HYPERPC-Desktop-crystal-kyngdom/a2fd6511-963f-43a3-8cc0-faf1bfbcfee5/scratchpad/";
const MODE=process.argv[2]||"bases";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);

const P_BASE=`Keep the EXACT same isometric game asset: same camera angle, same colors, same materials, same size, fully isolated on a TRANSPARENT background. REMOVE the rotating cannon turret completely: the dome-shaped gun housing, the barrel and the round rotating platform it sits on must be gone. Show instead the EMPTY base platform: the same stone-and-panel ring wall and the flat deck floor in the middle (continue the deck material naturally where the turret used to stand). Do NOT add any new objects, no turret, no cannon, nothing on the deck.`;
const P_TURRET=`Keep the EXACT same isometric game asset style: same camera angle, same colors, same materials, fully isolated on a TRANSPARENT background. KEEP ONLY the rotating cannon turret: the gun housing with its barrel AND the round rotating platform directly under it. REMOVE the entire base: the stone ring wall, panels, corner stones and the ground deck must be gone completely. The turret with its round platform should float alone on transparency, fully visible.`;

async function edit(srcPath,prompt,outPath){
  const buf=fs.readFileSync(srcPath);
  let delay=5000;
  for(let attempt=1;attempt<=5;attempt++){
    try{
      const fd=new FormData();
      fd.append("model","gpt-image-1");
      fd.append("prompt",prompt);
      fd.append("size","1024x1024");
      fd.append("quality","medium");
      fd.append("background","transparent");
      fd.append("input_fidelity","high");
      fd.append("image",new Blob([buf],{type:"image/png"}),"src.png");
      const res=await fetch(API,{method:"POST",headers:{Authorization:"Bearer "+KEY},body:fd});
      if(!res.ok)throw new Error("HTTP "+res.status+" "+(await res.text()).slice(0,160));
      const j=await res.json();
      fs.writeFileSync(outPath,Buffer.from(j.data[0].b64_json,"base64"));
      log("  ✓ "+path.basename(outPath));
      return;
    }catch(e){log("  ⚠ попытка "+attempt+"/5: "+String(e.message||e).slice(0,140));if(attempt===5)throw e;await sleep(delay);delay=Math.min(delay*2,60000);}
  }
}
(async()=>{
  if(!KEY){console.error("нет ключа");process.exit(1);}
  if(MODE==="bases"){
    for(let lv=1;lv<=10;lv++){
      log("база lv"+lv+"…");
      await edit(path.join(__dirname,"assets","cannon_lv"+lv+".png"),P_BASE,path.join(__dirname,"assets","cannon_base_lv"+lv+".png"));
      await sleep(800);
    }
  }else{
    for(const lv of [2,5]){
      log("башня lv"+lv+"…");
      await edit(path.join(__dirname,"assets","cannon_lv"+lv+".png"),P_TURRET,SP+"turret_only_lv"+lv+".png");
      await sleep(800);
    }
  }
  log("ГОТОВО ("+MODE+")");
})().catch(e=>{console.error("ОШИБКА:",e.message);process.exit(1);});
