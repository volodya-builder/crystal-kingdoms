"use strict";
/* Автопримерка рига: меряем спрайт по альфе (bbox, просвет между ног, таз),
   рендерим цикл шага той же математикой, что drawUnitRig в игре.
   node rig-fit.js <имя-файла.png> [--waist 0.70] ... — параметры можно переопределить. */
const {createCanvas,loadImage}=require("@napi-rs/canvas");
const fs=require("fs");
const FILE=process.argv[2];
const val=(f,d)=>{const i=process.argv.indexOf(f);return i>0&&process.argv[i+1]?parseFloat(process.argv[i+1]):d;};
(async()=>{
  const im=await loadImage(FILE);
  const iw=im.width,ih=im.height;
  const c=createCanvas(iw,ih),x=c.getContext("2d");x.drawImage(im,0,0);
  const d=x.getImageData(0,0,iw,ih).data;
  const A=(px,py)=>d[(py*iw+px)*4+3];
  // bbox
  let mnx=iw,mny=ih,mxx=0,mxy=0;
  for(let py=0;py<ih;py++)for(let px=0;px<iw;px++)if(A(px,py)>12){if(px<mnx)mnx=px;if(px>mxx)mxx=px;if(py<mny)mny=py;if(py>mxy)mxy=py;}
  const bw=mxx-mnx,bh=mxy-mny;
  const fx=v=>(v-mnx)/bw, fy=v=>(v-mny)/bh;
  // ищем промежность: сканируем снизу вверх, ищем строки где 2 блоба; вершина зоны = crotch
  function blobs(py){const arr=[];let run=null;
    for(let px=mnx;px<=mxx;px++){const a=A(px,py)>12;
      if(a&&!run)run={s:px};else if(!a&&run){run.e=px;if(run.e-run.s>bw*0.06)arr.push(run);run=null;}}
    if(run){run.e=mxx;if(run.e-run.s>bw*0.06)arr.push(run);}
    return arr;}
  let crotchY=null,legRows=[];
  for(let py=mxy-Math.round(bh*0.02);py>mny+bh*0.4;py--){
    const b=blobs(py);
    if(b.length>=2){legRows.push({py,b});}
    else if(legRows.length>bh*0.06){crotchY=py+1;break;}
    else legRows=[];
  }
  let split=0.5,hipLX=0.42,hipRX=0.58,legTop=0.64,hipY=0.665;
  if(crotchY){
    // средняя точка просвета по ножным строкам
    let gaps=[],l=[],r=[];
    for(const row of legRows.slice(0,Math.round(legRows.length*0.7))){
      const b=row.b; if(b.length<2)continue;
      const L=b[0],R=b[b.length-1];
      gaps.push((L.e+R.s)/2); l.push((L.s+L.e)/2); r.push((R.s+R.e)/2);
    }
    const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
    split=fx(avg(gaps)); hipLX=fx(avg(l)); hipRX=fx(avg(r));
    legTop=Math.max(0,fy(crotchY)-0.045); hipY=fy(crotchY)+0.005;
  }
  const cfg={x0:0,x1:1,y0:0,y1:1,waist:val("--waist",Math.max(0.5,legTop-0.06)),
    legTop:val("--legTop",legTop),split:val("--split",split),
    hipY:val("--hipY",hipY),hipLX:val("--hipLX",hipLX),hipRX:val("--hipRX",hipRX),spd:9};
  console.log("cfg:",JSON.stringify(cfg));
  // рендер цикла: 6 фаз шага + покой + удар (та же математика, что drawUnitRig)
  const cell=300,H=260,W=H*( (bw/bh) );
  const cv=createCanvas(cell*8,cell),ctx=cv.getContext("2d");
  ctx.fillStyle="#6f8f4f";ctx.fillRect(0,0,cv.width,cv.height);
  // вырезанный bbox-спрайт
  const spr=createCanvas(bw,bh);spr.getContext("2d").drawImage(c,mnx,mny,bw,bh,0,0,bw,bh);
  function draw(i,phase,label,idle,atkQ){
    const cx=i*cell+cell/2, baseY=cell*0.9;
    const lx=f=>-W/2+f*W, ly=f=>-H+f*H;
    const part=(ax,ay,bx,by)=>ctx.drawImage(spr,ax*bw,ay*bh,(bx-ax)*bw,(by-ay)*bh,lx(ax),ly(ay),(bx-ax)*W,(by-ay)*H);
    let bob=0,twist=0,rotL=0,rotR=0,liftL=0,liftR=0,sxU=1,syU=1;
    if(idle){const br=Math.sin(phase);bob=Math.max(0,br)*0.01;syU=1+0.03*br;sxU=1-0.02*br;twist=Math.sin(phase*0.6)*0.025;}
    else{const s=Math.sin(phase);liftL=Math.max(0,s);rotL=liftL*0.10;liftR=Math.max(0,-s);rotR=-liftR*0.10;bob=Math.abs(s)*0.05;twist=s*0.06;}
    let swing=0,lunge=0;
    if(atkQ!=null){const q=atkQ;swing=q<0.22?(q/0.22)*(-0.6):q<0.5?-0.6+((q-0.22)/0.28)*1.05:0.45*(1-(q-0.5)/0.5);lunge=Math.sin(Math.min(1,q/0.6)*Math.PI)*0.09;}
    ctx.save();ctx.translate(cx,baseY);
    const hy=ly(cfg.hipY);
    const leg=(ax,bx,hx,rot,lift)=>{ctx.save();const px=lx(hx);
      ctx.translate(px,hy);ctx.rotate(rot);ctx.translate(0,-lift*0.13*H);ctx.translate(-px,-hy);
      part(ax,cfg.legTop,bx,1);ctx.restore();};
    leg(0,cfg.split,cfg.hipLX,rotL,liftL);
    leg(cfg.split,1,cfg.hipRX,rotR,liftR);
    ctx.save();ctx.translate(0,-bob*H);
    if(atkQ!=null){const pvx=lx(0.46),pvy=ly(0.46);ctx.translate(lunge*W,0);ctx.translate(pvx,pvy);ctx.rotate(swing);ctx.translate(-pvx,-pvy);}
    const wx=lx(0.49),wy=ly(cfg.waist);
    ctx.translate(wx,wy);ctx.rotate(twist);ctx.scale(sxU,syU);ctx.translate(-wx,-wy);
    part(0,0,1,cfg.waist);
    ctx.restore();ctx.restore();
    ctx.fillStyle="#fff";ctx.font="13px sans-serif";ctx.fillText(label,i*cell+8,18);
  }
  for(let i=0;i<5;i++)draw(i,i/5*Math.PI*2,"шаг "+i,false,null);
  draw(5,1.1,"покой",true,null);
  draw(6,0,"удар q=0.15",false,0.15);
  draw(7,0,"удар q=0.4",false,0.4);
  const out=FILE.replace(/\.png$/,"_rig.png");
  fs.writeFileSync(out,cv.toBuffer("image/png"));
  console.log("wrote",out);
})().catch(e=>{console.error(e);process.exit(1);});
