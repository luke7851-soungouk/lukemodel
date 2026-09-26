/* 캐릭터 시트 나누기 (무료 · 브라우저 canvas) — window.LukeSplit
   한 장짜리 캐릭터 시트(윗줄 전신 정면/측면/뒷모습 + 아랫줄 얼굴 클로즈업 왼쪽/정면/오른쪽/뒷모습)를
   흰 배경 여백(가로·세로 투영)으로 칸을 찾아 한 장씩 자르고, 작은 글씨(라벨) 줄은 버림.
   · 작품 페이지(?m=)에서 시트 아래 타일 + 한 장씩 다운로드
   · 시트 주인(로그인·내 작품)의 브라우저에서만 정면·왼쪽·오른쪽·뒷모습 4장을 원본의 [각도·…] 참고 이미지로 한 번 저장(이미 있으면 건너뜀)
   · 못 찾으면 아무것도 표시하지 않음(오류 없음) */
(function(){
'use strict';
const H=window.LukeHF;
const isSheet=x=>/캐릭터 시트/.test(String((typeof x==='string'?x:x&&x.title)||''));
const lsGet=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
const lsSet=(k,v)=>{ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,String(v)); }catch(e){} };

/* ── 칸 찾기: ImageData(작게 줄인 것) → {rows:[{y0,y1,panels:[{x0,x1,y0,y1}]}]} | null ── */
function bgColor(d,w,h){   /* 네 모서리 5×5 평균 → 배경색 (흰색이 아니면 실패로 봄) */
  let r=0,g=0,b=0,n=0; for(const [cx,cy] of [[0,0],[w-5,0],[0,h-5],[w-5,h-5]]) for(let y=cy;y<cy+5;y++) for(let x=cx;x<cx+5;x++){ const i=(y*w+x)*4; r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
  return [r/n,g/n,b/n]; }
function inkMask(img){
  const {data:d,width:w,height:h}=img, bg=bgColor(d,w,h);
  if(Math.min(...bg)<200) return null;                       /* 밝은 단색 배경 시트만 */
  const m=new Uint8Array(w*h);
  for(let p=0,i=0;p<w*h;p++,i+=4){ const dr=d[i]-bg[0],dg=d[i+1]-bg[1],db=d[i+2]-bg[2]; if(dr*dr+dg*dg+db*db>28*28) m[p]=1; }
  return {m,w,h}; }
function runs(arr,minVal,minGap,minLen){   /* 값이 minVal 초과인 구간들, minGap 보다 좁은 빈틈은 이어 붙임 */
  const out=[]; let s=-1,lastOn=-1e9;
  for(let i=0;i<arr.length;i++){ if(arr[i]>minVal){ if(s<0||i-lastOn>minGap){ if(s>=0) out.push([s,lastOn+1]); s=i; } lastOn=i; } }
  if(s>=0) out.push([s,lastOn+1]); return out.filter(r=>r[1]-r[0]>=minLen); }
function detect(img){
  const k=inkMask(img); if(!k) return null; const {m,w,h}=k;
  const rowInk=new Float32Array(h); for(let y=0;y<h;y++){ let c=0; for(let x=0;x<w;x++) c+=m[y*w+x]; rowInk[y]=c; }
  const bands=runs(rowInk,Math.max(1,w*0.002),Math.max(2,h*0.006),2);
  const rows=[];
  for(const [y0,y1] of bands){
    const bh=y1-y0; if(bh<h*0.09) continue;                  /* 낮은 줄 = 글씨(라벨·제목) → 버림 */
    const colInk=new Float32Array(w); for(let x=0;x<w;x++){ let c=0; for(let y=y0;y<y1;y++) c+=m[y*w+x]; colInk[x]=c; }
    let segs=runs(colInk,Math.max(1,bh*0.01),Math.max(3,w*0.012),Math.max(4,w*0.03));
    const panels=[];
    for(const [x0,x1] of segs){
      /* 칸 안에서 위아래 다시 좁히고, 칸 안 윗부분의 작은 글씨 줄은 떼어냄 */
      const ri=new Float32Array(bh); for(let y=y0;y<y1;y++){ let c=0; for(let x=x0;x<x1;x++) c+=m[y*w+x]; ri[y-y0]=c; }
      const sub=runs(ri,Math.max(1,(x1-x0)*0.01),1,2).filter(r=>r[1]-r[0]>=bh*0.25);   /* 빈 줄 하나라도 있으면 끊음 → 칸 위 라벨이 떨어져 나감 */
      if(!sub.length) continue; const sy0=y0+sub[0][0], sy1=y0+sub[sub.length-1][1];
      panels.push(frameTrim(m,w,{x0,x1,y0:sy0,y1:sy1})); }
    if(panels.length) rows.push({y0,y1,panels}); }
  const n=rows.reduce((a,r)=>a+r.panels.length,0);
  if(n<2||n>12||rows.some(r=>r.panels.length>6)) return null;
  rows.forEach(r=>{ r.panels=r.panels.map(q=>q.framed?q:growClean(m,w,q)); });
  return {w,h,rows}; }
/* 테두리(가는 선 상자)가 있으면 안쪽만: 가장자리 ±4px 안에서 거의 꽉 찬 가로/세로 선을 찾아 그 안쪽으로 */
function frameTrim(m,w,p){
  const H=m.length/w, rowFull=(y,a,b)=>{ if(y<0||y>=H) return 0; let c=0; for(let t=a;t<b;t++) c+=m[y*w+t]; return c/Math.max(1,b-a); };
  const colFull=(x,a,b)=>{ if(x<0||x>=w) return 0; let c=0; for(let t=a;t<b;t++) c+=m[t*w+x]; return c/Math.max(1,b-a); };
  let {x0,x1,y0,y1}=p; const e={};
  for(let t=-4;t<=4;t++){
    if(e.top==null&&rowFull(y0+t,x0,x1)>0.55) e.top=y0+t; if(e.bot==null&&rowFull(y1-1-t,x0,x1)>0.55) e.bot=y1-1-t;
    if(e.lft==null&&colFull(x0+t,y0,y1)>0.55) e.lft=x0+t; if(e.rgt==null&&colFull(x1-1-t,y0,y1)>0.55) e.rgt=x1-1-t; }
  const framed=Object.keys(e).length>=2;
  if(framed){ const g=Math.max(3,Math.round(Math.min(x1-x0,y1-y0)*0.012));
    if(e.top!=null) y0=e.top+g; if(e.bot!=null) y1=e.bot-g+1; if(e.lft!=null) x0=e.lft+g; if(e.rgt!=null) x1=e.rgt-g+1; }
  return {x0,x1,y0,y1,framed}; }
/* 틀 없는 칸: 이웃 글씨·그림에 닿지 않는 만큼만 흰 여백을 붙임 (최대 칸 크기의 5%) */
function growClean(m,w,p){
  const H=m.length/w, pad=Math.round(Math.max(p.x1-p.x0,p.y1-p.y0)*0.05);
  const rowClean=(y,a,b)=>{ if(y<0||y>=H) return false; let c=0; for(let t=Math.max(0,a);t<Math.min(w,b);t++) c+=m[y*w+t]; return c<=Math.max(1,(b-a)*0.01); };   /* 1% 이하 잡티는 무시 */
  const colClean=(x,a,b)=>{ if(x<0||x>=w) return false; let c=0; for(let t=Math.max(0,a);t<Math.min(H,b);t++) c+=m[t*w+x]; return c<=Math.max(1,(b-a)*0.01); };
  let {x0,x1,y0,y1}=p;
  for(let i=0;i<pad&&rowClean(y0-1,x0,x1);i++) y0--; for(let i=0;i<pad&&rowClean(y1,x0,x1);i++) y1++;
  for(let i=0;i<pad&&colClean(x0-1,y0,y1);i++) x0--; for(let i=0;i<pad&&colClean(x1,y0,y1);i++) x1++;
  return Object.assign({},p,{x0,x1,y0,y1}); }
/* 줄·칸 수 → 이름 (lukemodel 시트 프롬프트: 윗줄 FRONT/SIDE/BACK, 아랫줄 LEFT/FRONT/RIGHT/BACK) */
const NAMES={4:[['left','왼쪽'],['front','정면'],['right','오른쪽'],['back','뒷모습']],3:[['front','정면'],['side','측면'],['back','뒷모습']],2:[['front','정면'],['back','뒷모습']],1:[['front','정면']]};
function label(res){
  const out=[]; const multi=res.rows.length>1;
  res.rows.forEach((r,ri)=>{ const names=NAMES[r.panels.length]||r.panels.map((_,i)=>['p'+(i+1),String(i+1)]);
    const aspect=r.panels.map(p=>(p.y1-p.y0)/Math.max(1,p.x1-p.x0)); const tall=aspect.reduce((a,b)=>a+b,0)/aspect.length>1.6;   /* 세로로 긴 칸 = 전신 */
    const group=multi?(tall?'전신':'얼굴'):'';
    r.panels.forEach((p,i)=>out.push(Object.assign({angle:names[i][0],ko:names[i][1],group,row:ri},p))); });
  return out; }

/* ── 이미지 → 조각 Blob ── */
async function loadBitmap(url){
  const r=await fetch(url,{mode:'cors'}); if(!r.ok) throw new Error('이미지 받기 실패 ('+r.status+')');
  const b=await r.blob(); return await createImageBitmap(b); }
async function split(url,opt){
  opt=opt||{}; const bmp=await loadBitmap(url); const W=bmp.width, Hh=bmp.height;
  const s=Math.min(1,1000/Math.max(W,Hh)); const w=Math.max(1,Math.round(W*s)), h=Math.max(1,Math.round(Hh*s));
  const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(bmp,0,0,w,h);
  const res=detect(x.getImageData(0,0,w,h)); if(!res) return null;
  const parts=label(res);
  for(const p of parts){
    const sx=Math.max(0,Math.floor(p.x0/s)), sy=Math.max(0,Math.floor(p.y0/s)), ex=Math.min(W,Math.ceil(p.x1/s)), ey=Math.min(Hh,Math.ceil(p.y1/s));
    const cc=document.createElement('canvas'); cc.width=ex-sx; cc.height=ey-sy; const cx=cc.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,cc.width,cc.height); cx.drawImage(bmp,sx,sy,cc.width,cc.height,0,0,cc.width,cc.height);
    if(p.framed){ const g=Math.max(2,Math.round(3/Math.max(s,0.25))); cx.fillStyle='#fff'; cx.fillRect(0,0,cc.width,g); cx.fillRect(0,cc.height-g,cc.width,g); cx.fillRect(0,0,g,cc.height); cx.fillRect(cc.width-g,0,g,cc.height); }   /* 틀 선 흔적 지우기 */
    p.box=[sx,sy,ex,ey]; p.width=cc.width; p.height=cc.height;
    p.blob=await new Promise(z=>cc.toBlob(z,opt.type||'image/png',0.92)); p.url=URL.createObjectURL(p.blob); }
  try{ bmp.close(); }catch(e){}
  return {width:W,height:Hh,parts}; }

/* ── 원본의 [각도·…] 참고 이미지로 저장 (주인 브라우저 · 한 번) ──
   정면=전신 정면(없으면 얼굴 정면), 왼쪽/오른쪽=얼굴 클로즈업(얼굴이 잘 보임), 뒷모습=전신 뒷모습(없으면 얼굴) */
function pickForAngles(parts){
  const by=(a,g)=>parts.find(p=>p.angle===a&&(!g||p.group===g));
  return {front:by('front','전신')||by('front'),left:by('left','얼굴')||by('left'),right:by('right','얼굴')||by('right'),back:by('back','전신')||by('back')}; }
const LS_DONE='lukesplit.saved.';
async function saveAngles(item,res){
  const A=window.LukeAngles; if(!A||!H||!H.shared||!H.canDelete||!H.canDelete(item)) return {skipped:'not-owner'};
  if(lsGet(LS_DONE+item.id)) return {skipped:'done'};
  const root=await A.rootOf(item); if(!root||!A.publicRoot||!A.publicRoot(root.key)) return {skipped:'no-root'};
  const lock='lukesplit.lock.'+item.id, t=+(lsGet(lock)||0); if(t&&Date.now()-t<5*60000) return {skipped:'locked'}; lsSet(lock,Date.now());
  const saved=[];
  try{
    const pick=pickForAngles(res.parts);
    for(const a of A.ANGLES){ const p=pick[a.id]; if(!p) continue;
      const found=await A.findAngles(root.key); if(found[a.id]) continue;          /* 이미 있으면(자동 생성·다른 시트) 건너뜀 */
      const jpg=await toJpeg(p.blob);
      await H.publish(new File([jpg],'angle-'+a.id+'.jpg',{type:'image/jpeg'}),A.MARK(a)+' 캐릭터 시트에서'+(p.group?' ('+p.group+')':''),'studio',root.key);
      saved.push(a.id); }
    lsSet(LS_DONE+item.id,Date.now());
    if(saved.length&&A.refresh) A.refresh(root.key).catch(()=>{});
  }finally{ lsSet(lock,null); }
  return {saved,root:root.key}; }
async function toJpeg(blob){ const b=await createImageBitmap(blob); const c=document.createElement('canvas'); c.width=b.width; c.height=b.height; const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(b,0,0); return await new Promise(z=>c.toBlob(z,'image/jpeg',0.92)); }

/* ── 작품 페이지 타일 ── */
const safeName=s=>String(s||'캐릭터 시트').replace(/[\\/:*?"<>|#]+/g,' ').replace(/\s+/g,' ').trim().slice(0,60)||'캐릭터 시트';
function saveBlob(b,name){ const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),4000); }
function el(tag,attrs,...kids){ const e=document.createElement(tag); for(const [k,v] of Object.entries(attrs||{})){ if(v==null) continue; if(k==='class') e.className=v; else if(k==='text') e.textContent=v; else if(k.startsWith('on')) e.addEventListener(k.slice(2),v); else e.setAttribute(k,v); } kids.flat().forEach(c=>c!=null&&e.appendChild(typeof c==='string'?document.createTextNode(c):c)); return e; }
let cssDone=false;
function css(){ if(cssDone) return; cssDone=true; const s=document.createElement('style'); s.textContent=
  '.lsplit{margin:12px 0 4px;padding:12px;border:1px solid var(--line,#2a2f3a);border-radius:14px;background:var(--card,#141821)}'
 +'.lsplit h3{margin:0 0 4px;font-size:15px}.lsplit .sub{margin:0 0 10px;color:#8b93a7;font-size:12.5px;line-height:1.45}'
 +'.lsplit .grp{margin:10px 0 4px;font-size:12.5px;color:#aeb6c8;font-weight:700}'
 +'.lsplit .row{display:grid;grid-template-columns:repeat(var(--n,3),minmax(0,1fr));gap:8px}.lsplit .row[data-n="4"]{--n:2}@media(min-width:700px){.lsplit .row[data-n="4"]{--n:4}}.lsplit .row[data-n="1"]{--n:2}'
 +'.lsplit .t{border:1px solid var(--line,#2a2f3a);border-radius:10px;overflow:hidden;background:#fff;display:flex;flex-direction:column}'
 +'.lsplit .t .im{position:relative;background:#fff;aspect-ratio:3/4}'
 +'.lsplit .t img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;cursor:zoom-in}'
 +'.lsplit .t .ft{background:var(--card,#141821);padding:6px;display:flex;flex-direction:column;gap:5px}'
 +'.lsplit .t b{font-size:12.5px;color:var(--fg,#e8ebf2)}.lsplit .t .dl{font-size:12px;padding:6px 4px;border-radius:8px;border:0;background:var(--acc,#5b8cff);color:#fff;font-weight:700;cursor:pointer}'
 +'.lsplit .all{margin-top:10px;font-size:12.5px}.lsplit .note{margin-top:8px;font-size:12px;color:#8b93a7}';
  document.head.appendChild(s); }
async function mount(host,item){
  if(!host||!item||item.kind!=='image'||!isSheet(item)||!item.url) return null;
  let res=null; try{ res=await split(item.url); }catch(e){ console.warn('[sheet-split]',e); return null; }
  if(!res||!res.parts.length||!host.isConnected) return null;
  css(); const base=safeName(H&&H.displayTitle?H.displayTitle(item.title):item.title);
  const nameOf=p=>base+'-'+(p.group?p.group+'-':'')+p.ko+'.png';
  const box=el('section',{class:'lsplit','aria-label':'캐릭터 시트 한 장씩'},
    el('h3',{text:'한 장씩 보기 · 다운로드'}),
    el('p',{class:'sub',text:'시트를 칸마다 잘랐어요 ('+res.parts.length+'장). 각각 따로 받을 수 있어요.'}));
  const groups=[...new Set(res.parts.map(p=>p.group))];
  for(const g of groups){
    if(g) box.appendChild(el('div',{class:'grp',text:g==='전신'?'전신':'얼굴 클로즈업'}));
    const ps=res.parts.filter(p=>p.group===g), ar=Math.max(...ps.map(p=>p.height/Math.max(1,p.width)));   /* 그룹에서 가장 세로로 긴 칸 비율로 → 잘림 없이 */
    box.appendChild(el('div',{class:'row','data-n':String(ps.length)},ps.map(p=>el('div',{class:'t','data-angle':p.angle,'data-group':p.group||''},
      el('div',{class:'im',style:'aspect-ratio:1 / '+ar.toFixed(3)},el('img',{src:p.url,alt:(p.group?p.group+' ':'')+p.ko,onclick:()=>window.open(p.url,'_blank','noopener')})),
      el('div',{class:'ft'},el('b',{text:p.ko}),el('button',{type:'button',class:'dl','aria-label':(p.group?p.group+' ':'')+p.ko+' 다운로드',text:'⤓ 다운로드',onclick:()=>saveBlob(p.blob,nameOf(p))})))))); }
  box.appendChild(el('button',{type:'button',class:'btn ghost sm all',text:'전체 한번에 받기 ('+res.parts.length+'장)',onclick:async()=>{ for(const p of res.parts){ saveBlob(p.blob,nameOf(p)); await new Promise(z=>setTimeout(z,450)); } }}));
  const note=el('div',{class:'note'}); box.appendChild(note);
  host.appendChild(box);
  saveAngles(item,res).then(r=>{ if(r&&r.saved&&r.saved.length) note.textContent='정면·왼쪽·오른쪽·뒷모습 '+r.saved.length+'장을 원본의 일관성 참고 이미지로 저장했어요 (다음 생성부터 자동 첨부).'; })
    .catch(e=>console.warn('[sheet-split] save',e));
  return {box,res}; }

window.LukeSplit={isSheet,detect,label,split,mount,saveAngles,pickForAngles};
})();
