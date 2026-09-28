/* 모델 캐스팅 (window.LukeCasting) — 사이트에 이미 있는 얼굴(faces/*.jpg)과 공개 갤러리의 인물(각도 참고 세트가 있는 작품)을
   세로 카드로 모아 보고, 카드를 누르면 큰 사진 + 저장된 각도(정면·왼쪽·오른쪽·뒷모습) + 「이 모델로 이미지/영상 만들기」.
   읽기 전용: Supabase 는 GET 만, 생성·업로드 없음. 만들기 버튼은 기존 힉스필드 스튜디오 /higgsfield/?m=<id> 로 넘김
   (이미지 = 참고 이미지로, 영상 = &as=video 시작 프레임으로). index.html 의 전역(DB, GENDERS, AGES, go, openMedia, toast …)을 호출 시점에 사용. */
(function(){
'use strict';
const ANG=[['front','정면'],['left','왼쪽'],['right','오른쪽'],['back','뒷모습']];
const AGE_RE=/(\d0대\+?|시니어)/, GEN_RE=/(여성|남성|중성)/;
const CF={g:'',a:'',ang:false,q:''};
const S={loaded:false,loading:null,err:null,repo:new Map(),angles:new Map(),gallery:[]};   /* repo: r-키 → 행, angles: 뿌리 키 → {front:row,…} */
const cfg=()=>(typeof sharedCfg==='function'?sharedCfg():null);
function mk(tag,cls,text){ const n=document.createElement(tag); if(cls) n.className=cls; if(text!=null) n.textContent=text; return n; }
function rowUrl(c,x){ return typeof sharedItemUrl==='function'?sharedItemUrl(c,x):(window.LukeHF?LukeHF.itemUrl(x):null); }

/* ── 데이터 (Supabase 읽기 3번, 실패해도 사이트 얼굴 카드는 그대로) ── */
async function get(c,q){ const r=await fetch(c.url+'/rest/v1/'+(c.table||'shared_media')+'?'+q,{headers:hsHeaders(c)}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
function load(){
  if(S.loaded) return Promise.resolve(); if(S.loading) return S.loading;
  const c=cfg(); if(!c){ S.loaded=true; return Promise.resolve(); }
  const cols='select=id,title,face_id,path,external_url,kind,mime,created_at,source';
  S.loading=Promise.all([
    get(c,cols+'&hidden=eq.false&source=eq.repo&face_id=like.r-*&limit=200'),
    get(c,cols+'&hidden=eq.false&kind=eq.image&title=like.'+encodeURIComponent('*[각도·*')+'&order=created_at.desc&limit=500')
  ]).then(async([repo,angs])=>{
    repo.forEach(x=>{ x.url=rowUrl(c,x); if(x.url&&!S.repo.has(x.face_id)) S.repo.set(x.face_id,x); });
    angs.forEach(x=>{ const m=String(x.title||'').match(/\[각도·(정면|왼쪽|오른쪽|뒷모습)\]/); const k=x.face_id||(window.LukeHF?LukeHF.faceOf(x.title):null); if(!m||!k) return;
      const id=ANG.find(a=>a[1]===m[1])[0]; x.url=rowUrl(c,x); if(!x.url) return; const set=S.angles.get(k)||{}; if(!set[id]) set[id]=x; S.angles.set(k,set); });
    const mids=[...S.angles.keys()].filter(k=>/^m-[0-9a-f-]{36}$/i.test(k)).map(k=>k.slice(2));
    if(mids.length){ const rows=await get(c,cols+'&hidden=eq.false&kind=eq.image&id=in.('+mids.join(',')+')');
      S.gallery=rows.map(x=>{ x.url=rowUrl(c,x); return x; }).filter(x=>x.url&&!/\[각도·/.test(x.title||'')&&!(window.LukeSplit&&LukeSplit.isSheet&&LukeSplit.isSheet(x)))
        .sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))); }
  }).catch(e=>{ S.err=e.message; console.warn('casting: 공개 갤러리 읽기 실패',e); }).finally(()=>{ S.loaded=true; S.loading=null; });
  return S.loading;
}

/* ── 카드 목록 ── */
function shortName(name,photoKey){
  let s=String(name||'').replace(/^\[[^\]]*\]\s*/,'').split(' · ')[0];
  s=s.replace(new RegExp(AGE_RE.source,'g'),' ').replace(new RegExp(GEN_RE.source,'g'),' ').replace(/(^|\s)(실사|얼굴)(?=\s|$)/g,' ').replace(/\s*캐스팅\s*$/,'').replace(/\s+/g,' ').trim();
  if(!/\d/.test(s)&&photoKey){ const n=String(photoKey).match(/^photo-(\d+)$/); if(n) s=(s?s+' ':'')+n[1];
    else { const v=['vface-f20','vface-m30','vface-f40'].indexOf(photoKey); if(v>=0) s=(s||'시드')+' '+(v+1); } }
  return s||'모델';
}
function vibeOf(txt){ const m=String(txt||'').match(/커리어|캐주얼|프로필|중후한|자연스러운/); return m?m[0]:''; }
function build(){
  const out=[], seen=new Set();
  (typeof DB!=='undefined'&&DB.models||[]).slice().sort((a,b)=>(b.photoKey?1:0)-(a.photoKey?1:0)).forEach(m=>{
    const ph=(m.photos&&m.photos[0])||''; const pm=String(ph).match(/^faces\/([a-z0-9-]+)\.(jpe?g|png|webp)$/i); if(!pm) return;
    const key='r-'+pm[1].toLowerCase(); if(seen.has(key)) return; seen.add(key);
    out.push({key,type:'face',model:m,name:shortName(m.name,m.photoKey||pm[1]),full:m.name,gender:m.gender||'',age:m.age||'',
      info:[GENDERS[m.gender],AGES[m.age],vibeOf(m.name)||STYLES[m.style]].filter(Boolean).join(' · '),
      photo:'/'+ph, file:pm[1]+'.'+pm[2], tags:(m.tags||[]).join(' ')});
  });
  let gi=0;
  S.gallery.forEach(x=>{ const key='m-'+x.id; if(seen.has(key)) return; seen.add(key); gi++;
    const t=(window.LukeHF?LukeHF.displayTitle(x.title):String(x.title||'')).replace(/^\[[^\]]*\]\s*/,'');
    const g=(t.match(GEN_RE)||[])[1]||'', a=(t.match(AGE_RE)||[])[1]||'';
    let nm=shortName(t); if(!nm||nm==='모델'||/(좌|우|뒷|앞|정면|측면|모습|시트|각도)/.test(nm)) nm='갤러리 모델 '+gi;
    const gk=Object.keys(GENDERS).find(k=>GENDERS[k]===g)||'', ak=a?(Object.keys(AGES).find(k=>AGES[k]===a)||(a==='시니어'?'senior':'')):'';
    out.push({key,type:'gallery',row:x,name:nm,full:t,gender:gk,age:ak,info:[g,a,'공개 갤러리'].filter(Boolean).join(' · '),photo:x.url,tags:t});
  });
  out.forEach(c=>{ const set=S.angles.get(c.key)||{}; c.angles=set; c.angN=ANG.filter(a=>set[a[0]]).length; });
  const ord=k=>/^m-/.test(k)?0:/^r-real/.test(k)?1:/^r-photo/.test(k)?2:3;
  return out.sort((a,b)=>(b.angN>0)-(a.angN>0)||ord(a.key)-ord(b.key)||a.key.localeCompare(b.key));
}
function passes(c){
  if(CF.g&&c.gender!==CF.g) return false; if(CF.a&&c.age!==CF.a) return false; if(CF.ang&&!c.angN) return false;
  const q=CF.q.trim().toLowerCase(); if(q&&!(c.name+' '+c.full+' '+c.info+' '+c.tags).toLowerCase().includes(q)) return false; return true;
}

/* ── 화면 ── */
function render(app){
  try{ document.title='모델 캐스팅 · 페이스루크'; }catch(e){}
  const page=mk('section','cast-page'); page.setAttribute('aria-label','모델 캐스팅'); app.appendChild(page);
  const head=mk('div','cast-head');
  const ht=mk('div','cast-ht'); ht.appendChild(mk('span','cast-kick','CASTING'));
  const h1=mk('h1','cast-h1','모델 캐스팅'); ht.appendChild(h1);
  ht.appendChild(mk('p','cast-sub','영상·이미지 주인공으로 쓸 가상 인물을 고르세요. 카드를 누르면 각도 참고 사진과 함께 힉스필드 스튜디오로 바로 넘어갑니다.'));
  head.appendChild(ht);
  page.appendChild(head);

  const bar=mk('div','cast-bar'); page.appendChild(bar);
  const chips=mk('div','cast-chips'); bar.appendChild(chips);
  const ages=mk('div','cast-chips cast-ages'); bar.appendChild(ages);
  const sw=mk('div','cast-search'); const si=mk('input'); si.type='search'; si.placeholder='이름·태그 검색 (예: 30대, 커리어)'; si.value=CF.q; si.setAttribute('aria-label','모델 검색'); sw.appendChild(si); bar.appendChild(sw);
  const grid=mk('div','cast-grid'); grid.setAttribute('role','list'); page.appendChild(grid);
  const note=mk('p','cast-note'); page.appendChild(note);

  function chip(box,label,on,fn){ const b=mk('button','cast-chip'+(on?' on':''),label); b.type='button'; b.setAttribute('aria-pressed',String(!!on)); b.onclick=fn; box.appendChild(b); }
  function draw(){
    const all=build(), list=all.filter(passes);
    chips.textContent=''; ages.textContent='';
    const n=k=>all.filter(c=>c.gender===k).length;
    chip(chips,'전체 '+all.length,!CF.g,()=>{CF.g='';draw();});
    [['female','여성'],['male','남성'],['neutral','중성']].forEach(([k,l])=>{ if(n(k)) chip(chips,l+' '+n(k),CF.g===k,()=>{CF.g=CF.g===k?'':k;draw();}); });
    const withAng=all.filter(c=>c.angN).length;
    if(withAng) chip(chips,'각도 사진 있음 '+withAng,CF.ang,()=>{CF.ang=!CF.ang;draw();});
    Object.keys(AGES).forEach(k=>{ if(all.some(c=>c.age===k)) chip(ages,AGES[k],CF.a===k,()=>{CF.a=CF.a===k?'':k;draw();}); });
    grid.setAttribute('aria-label','모델 '+list.length+'명');
    grid.textContent='';
    if(!list.length){ const e=mk('div','cast-empty','조건에 맞는 모델이 없습니다.'); const r=mk('button','btn ghost sm','필터 지우기'); r.type='button'; r.onclick=()=>{CF.g='';CF.a='';CF.ang=false;CF.q='';si.value='';draw();}; e.appendChild(r); grid.appendChild(e); }
    list.forEach((c,i)=>grid.appendChild(card(c,i)));
    note.textContent=S.loaded?(S.err?'공개 갤러리 인물을 불러오지 못해 사이트 얼굴만 보여 줍니다.':'사이트 얼굴 '+all.filter(c=>c.type==='face').length+'명 · 공개 갤러리 인물 '+all.filter(c=>c.type==='gallery').length+'명 · 이름과 정보는 사이트에 저장된 값에서 가져왔습니다.'):'공개 갤러리 인물·각도 사진 확인 중…';
  }
  si.addEventListener('input',()=>{ CF.q=si.value; draw(); });
  draw();
  if(!S.loaded) load().then(()=>{ if(page.isConnected) draw(); });
}
function card(c,i){
  const b=mk('button','cast-card'); b.type='button'; b.setAttribute('role','listitem'); b.dataset.key=c.key; b.setAttribute('aria-label',c.name+' — '+c.info+' 캐스팅 정보 열기');
  const fig=mk('div','cast-ph'); const im=mk('img'); im.src=c.photo; im.alt=c.name; im.decoding='async'; if(i>7) im.loading='lazy'; im.referrerPolicy='no-referrer';
  im.addEventListener('error',()=>{ b.classList.add('broken'); });
  fig.appendChild(im); b.appendChild(fig);
  if(c.angN) b.appendChild(mk('span','cast-badge','각도 '+c.angN+'장'));
  if(c.type==='gallery') b.appendChild(mk('span','cast-badge cast-badge-r','갤러리'));
  const cap=mk('div','cast-cap'); cap.appendChild(mk('b','cast-name',c.name)); cap.appendChild(mk('span','cast-info',c.info)); b.appendChild(cap);
  b.onclick=()=>openPanel(c);
  return b;
}

/* ── 캐스팅 패널 ── */
function studioHref(sel,video){
  if(sel.row&&sel.row.id) return '/higgsfield/?m='+encodeURIComponent(sel.row.id)+(video?'&as=video':'');
  const abs=new URL(sel.url,location.href).href; return '/higgsfield/?use='+encodeURIComponent(abs)+'&kind=image';
}
function openPanel(c){
  const root=document.getElementById('modal'); if(!root) return; root.textContent='';
  const prevFocus=document.activeElement; S.cur=c;
  try{ document.dispatchEvent(new CustomEvent('lukecasting:open',{detail:{key:c.key}})); }catch(e){}
  const ov=mk('div','modal cast-ov'); const box=mk('div','cast-panel'); box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true'); box.setAttribute('aria-label',c.name+' 캐스팅');
  const close=()=>{ S.cur=null; root.textContent=''; document.removeEventListener('keydown',onKey); try{ prevFocus&&prevFocus.focus&&prevFocus.focus(); }catch(e){} };
  const onKey=e=>{ if(!box.isConnected){ document.removeEventListener('keydown',onKey); return; } if(e.key==='Escape') close(); };
  document.addEventListener('keydown',onKey); ov.onclick=e=>{ if(e.target===ov) close(); };
  const x=mk('button','cast-x','\u00d7'); x.type='button'; x.setAttribute('aria-label','닫기'); x.onclick=close; box.appendChild(x);

  const base={label:c.type==='face'?'원본':'원본',url:c.photo,row:c.type==='face'?(S.repo.get(c.key)||null):c.row,file:c.file};
  const opts=[base].concat(ANG.filter(a=>c.angles[a[0]]).map(a=>({label:a[1],url:c.angles[a[0]].url,row:c.angles[a[0]]})));
  let sel=base;

  const left=mk('div','cast-pl'); const big=mk('div','cast-big'); const bim=mk('img'); bim.alt=c.name; bim.src=base.url; bim.referrerPolicy='no-referrer'; big.appendChild(bim); left.appendChild(big);
  const thumbs=mk('div','cast-thumbs'); left.appendChild(thumbs);
  const right=mk('div','cast-pr');
  right.appendChild(mk('span','cast-kick','CASTING'));
  right.appendChild(mk('h2','cast-pname',c.name));
  right.appendChild(mk('div','cast-pinfo',c.info));
  if(c.full&&c.full!==c.name) right.appendChild(mk('div','cast-pfull',c.full));
  const angT=mk('div','cast-sec'); angT.appendChild(mk('b',null,'각도 참고 사진'));
  angT.appendChild(mk('span',null,c.angN?(c.angN+'/4장 저장됨 · 눌러서 크게 보고, 그 사진으로 만들 수 있어요'):'아직 저장된 각도 사진이 없어요 · 상세 보기에서 만들 수 있어요'));
  right.appendChild(angT);
  const acts=mk('div','cast-acts');
  const aImg=mk('a','btn cast-go'); aImg.textContent='이 모델로 이미지 만들기';
  const aVid=mk('a','btn ghost cast-vid'); aVid.textContent='이 모델로 영상 만들기';
  const row2=mk('div','cast-row2');
  const det=mk('button','btn ghost sm','상세 보기'); det.type='button';
  det.onclick=()=>{ close(); window._lmFromCasting=true; if(c.type==='face') go('detail',c.model.id); else if(typeof openMedia==='function') openMedia(c.row); };
  const dl=mk('button','btn ghost sm cast-dl','\u2913 다운로드'); dl.type='button';
  dl.onclick=async()=>{ const r=sel.row; const it=r&&r.path?Object.assign({},r):{url:sel.url,kind:'image'};
    const ext=(String(sel.url).match(/\.(png|jpe?g|webp)(\?|$)/i)||[,r&&r.mime==='image/jpeg'?'jpg':'png'])[1];
    it.fileName='lukemodel-casting-'+c.key.replace(/^m-/,'g-').slice(0,20)+(sel===base?'':'-'+(ANG.find(a=>a[1]===sel.label)||['x'])[0])+'.'+ext;
    try{ if(window.LukeHF&&LukeHF.download) await LukeHF.download(it); else window.open(sel.url,'_blank','noopener'); }catch(e){ if(typeof toast==='function') toast('다운로드 실패: '+e.message,'err'); } };
  row2.appendChild(det); row2.appendChild(dl);
  acts.appendChild(aImg); acts.appendChild(aVid); acts.appendChild(row2); right.appendChild(acts);
  right.appendChild(mk('p','cast-hint','힉스필드 스튜디오에서 이 사진이 참고 이미지(영상은 시작 프레임)로 들어가고, 얼굴 유지 모델(Qwen Image 3 edit)이 기본으로 선택됩니다. 생성은 스튜디오에서 직접 누를 때만 진행돼요.'));

  function pick(o){ sel=o; bim.src=o.url; bim.alt=c.name+' · '+o.label;
    [...thumbs.children].forEach(t=>t.classList.toggle('on',t._o===o));
    aImg.href=studioHref(o,false); aVid.href=studioHref(o,true);
    aImg.title='「'+o.label+'」 사진을 참고 이미지로 스튜디오 열기'; aVid.title='「'+o.label+'」 사진을 시작 프레임으로 스튜디오 열기'; }
  opts.forEach(o=>{ const t=mk('button','cast-th'); t.type='button'; t._o=o; t.setAttribute('aria-label',o.label+' 사진 보기');
    const ti=mk('img'); ti.src=o.url; ti.alt=''; ti.loading='lazy'; ti.referrerPolicy='no-referrer'; t.appendChild(ti); t.appendChild(mk('span',null,o.label)); t.onclick=()=>pick(o); thumbs.appendChild(t); });
  ANG.filter(a=>!c.angles[a[0]]).forEach(a=>{ const t=mk('div','cast-th cast-th-empty'); t.appendChild(mk('i',null,'—')); t.appendChild(mk('span',null,a[1])); t.title='저장된 '+a[1]+' 사진 없음'; thumbs.appendChild(t); });
  pick(base);
  box.appendChild(left); box.appendChild(right); ov.appendChild(box); root.appendChild(ov);
  setTimeout(()=>{ try{ aImg.focus({preventScroll:true}); }catch(e){} },0);
  /* 사이트 얼굴 행 id 를 아직 못 받았으면 받은 뒤 링크 갱신 (첫 방문 직후 바로 누른 경우) */
  if(c.type==='face'&&!base.row&&!S.loaded) load().then(()=>{ base.row=S.repo.get(c.key)||null; if(sel===base&&aImg.isConnected) pick(base); });
}

/* ── 홈 첫 화면의 짧은 입구 ── */
function homeEntry(app){
  const faces=build(); if(!faces.length) return;
  const a=mk('button','cast-entry'); a.type='button'; a.setAttribute('aria-label','모델 캐스팅 열기');
  const av=mk('span','cast-entry-av'); faces.slice(0,4).forEach(c=>{ const i=mk('img'); i.src=c.photo; i.alt=''; i.decoding='async'; av.appendChild(i); }); a.appendChild(av);
  const t=mk('span','cast-entry-t'); t.appendChild(mk('b',null,'모델 캐스팅')); const sub=mk('span',null,faces.length+'명 중에서 영상·이미지 주인공 고르기'); t.appendChild(sub); a.appendChild(t);
  if(!S.loaded) load().then(()=>{ if(sub.isConnected) sub.textContent=build().length+'명 중에서 영상·이미지 주인공 고르기'; });
  a.appendChild(mk('span','cast-entry-go','캐스팅 \u2192'));
  a.onclick=()=>go('casting'); app.appendChild(a);
}

const CSS=`
.cast-page{padding:18px 0 40px}
.cast-head{display:flex;align-items:flex-end;gap:14px;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px}
.cast-ht{flex:1;min-width:0}
.cast-kick{display:inline-block;font-size:10.5px;font-weight:900;letter-spacing:2.4px;color:#d1fe17}
.cast-h1{font-size:26px;font-weight:900;margin:4px 0 6px;color:#fff;letter-spacing:-.3px}
.cast-sub{font-size:13px;color:var(--dim);line-height:1.6;max-width:640px;margin:0}
.cast-bar{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:0 0 14px}
.cast-chips{display:flex;flex-wrap:wrap;gap:6px}
.cast-chip{font-size:12.5px;font-weight:700;color:#cdd2df;background:#151822;border:1px solid var(--line);border-radius:20px;padding:6px 12px;cursor:pointer;white-space:nowrap}
.cast-chip:hover{border-color:#4a5166;color:#fff}
.cast-chip.on{background:#d1fe17;border-color:#d1fe17;color:#111}
.cast-ages .cast-chip{padding:5px 10px;font-size:12px}
.cast-search{flex:1;min-width:180px;max-width:320px;margin-left:auto}
.cast-search input{width:100%;box-sizing:border-box;background:#151822;border:1px solid var(--line);border-radius:10px;color:var(--tx);font-size:14px;padding:8px 12px}
.cast-search input:focus{outline:none;border-color:#d1fe17}
.cast-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
@media (min-width:1100px){.cast-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
.cast-card{position:relative;display:block;width:100%;min-width:0;padding:0;text-align:left;border-radius:14px;overflow:hidden;background:#12141b;border:1px solid #232835;cursor:pointer;transition:transform .15s,border-color .15s,box-shadow .15s}
.cast-card:hover,.cast-card:focus-visible{transform:translateY(-2px);border-color:#d1fe17;box-shadow:0 10px 26px rgba(0,0,0,.45);outline:none}
.cast-ph{aspect-ratio:3/4;background:#0c0d12;overflow:hidden}
.cast-ph img{width:100%;height:100%;object-fit:cover;object-position:50% 22%;display:block}
.cast-card.broken .cast-ph img{visibility:hidden}
.cast-cap{position:absolute;left:0;right:0;bottom:0;padding:34px 12px 11px;background:linear-gradient(180deg,rgba(8,9,13,0) 0%,rgba(8,9,13,.78) 48%,rgba(8,9,13,.94) 100%);display:flex;flex-direction:column;gap:2px}
.cast-name{font-size:15px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cast-info{font-size:11.8px;color:#b9bfcf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cast-badge{position:absolute;top:9px;left:9px;font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:20px;background:rgba(209,254,23,.92);color:#111}
.cast-badge-r{left:auto;right:9px;background:rgba(15,17,23,.78);color:#e6e8ef;border:1px solid rgba(255,255,255,.18)}
.cast-empty{grid-column:1/-1;text-align:center;color:var(--dim);font-size:13px;padding:40px 10px;border:1px dashed var(--line);border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:12px}
.cast-note{font-size:11.5px;color:#6f7689;margin:16px 0 0}
@media (max-width:640px){
 .cast-page{padding-top:14px}.cast-h1{font-size:22px}.cast-sub{font-size:12.5px}
 .cast-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 .cast-search{max-width:none;margin-left:0;flex-basis:100%}
 .cast-cap{padding:28px 9px 9px}.cast-name{font-size:13.5px}.cast-info{font-size:11px}
 .cast-badge{top:7px;left:7px;font-size:10px;padding:2px 7px}.cast-badge-r{left:auto;right:7px}
}
.cast-ov{align-items:center}
.cast-panel{position:relative;background:#12141b;border:1px solid #2a2f3d;border-radius:18px;width:min(920px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:22px;padding:22px;box-sizing:border-box;color:var(--tx)}
.cast-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;background:rgba(15,17,23,.85);border:1px solid #3a4052;color:#fff;font-size:22px;line-height:1;cursor:pointer;z-index:2}
.cast-big{aspect-ratio:3/4;background:#0a0b10;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.cast-big img{width:100%;height:100%;object-fit:contain;display:block}
.cast-thumbs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:9px}
.cast-th{position:relative;padding:0;border-radius:9px;overflow:hidden;background:#0c0d12;border:2px solid transparent;cursor:pointer;aspect-ratio:3/4;min-width:0}
.cast-th img{width:100%;height:100%;object-fit:cover;object-position:50% 20%;display:block}
.cast-th span{position:absolute;left:0;right:0;bottom:0;font-size:10px;font-weight:800;color:#fff;background:rgba(0,0,0,.62);text-align:center;padding:2px 0}
.cast-th.on{border-color:#d1fe17}
.cast-th-empty{cursor:default;border:1px dashed #333a4b;display:flex;align-items:center;justify-content:center;color:#4b5264}
.cast-th-empty i{font-style:normal;font-size:14px;margin-bottom:12px}
.cast-th-empty span{background:transparent;color:#667}
.cast-pr{display:flex;flex-direction:column;gap:8px;min-width:0;padding-top:6px}
.cast-pname{font-size:24px;font-weight:900;color:#fff;margin:0;padding-right:36px;word-break:keep-all}
.cast-pinfo{font-size:13.5px;color:#cfd4e2;font-weight:700}
.cast-pfull{font-size:12px;color:var(--dim)}
.cast-sec{display:flex;flex-direction:column;gap:3px;background:#171a24;border:1px solid #262b39;border-radius:11px;padding:10px 12px;margin-top:6px;font-size:12px;color:var(--dim)}
.cast-sec b{color:#e6e8ef;font-size:12.5px}
.cast-acts{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.cast-acts a.btn{display:flex;justify-content:center;text-decoration:none;padding:12px 14px;font-size:14.5px}
.cast-go{background:#d1fe17!important;color:#111!important;font-weight:900!important}
.cast-row2{display:flex;gap:8px}.cast-row2 .btn{flex:1}
.cast-hint{font-size:11.5px;color:#737a8d;line-height:1.6;margin:4px 0 0}
@media (max-width:720px){
 .cast-ov{align-items:flex-end;padding:0}
 .cast-panel{grid-template-columns:1fr;width:100vw;max-height:94vh;border-radius:18px 18px 0 0;padding:14px 14px 22px;gap:12px}
 .cast-big{aspect-ratio:auto;height:min(46vh,420px)}
 .cast-acts{position:sticky;bottom:-22px;margin:4px -14px -22px;padding:12px 14px 16px;background:linear-gradient(180deg,rgba(18,20,27,.86),#12141b 30%);z-index:1}
 .cast-acts a.btn{padding:11px 14px}
 .cast-pname{font-size:21px}
}
.cast-entry{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;margin:16px 0 2px;padding:10px 14px;border-radius:14px;background:linear-gradient(100deg,#171b0c,#15171f 55%);border:1px solid #3d4a12;color:var(--tx);cursor:pointer;text-align:left}
.cast-entry:hover{border-color:#d1fe17}
.cast-entry-av{display:flex;flex-shrink:0}
.cast-entry-av img{width:34px;height:34px;border-radius:50%;object-fit:cover;object-position:50% 25%;border:2px solid #15171f;margin-left:-9px;background:#0c0d12}
.cast-entry-av img:first-child{margin-left:0}
.cast-entry-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.cast-entry-t b{font-size:14.5px;font-weight:900;color:#fff}
.cast-entry-t span{font-size:12px;color:#b8bfa6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cast-entry-go{flex-shrink:0;background:#d1fe17;color:#111;font-weight:900;font-size:12.5px;border-radius:9px;padding:7px 11px;white-space:nowrap}
@media (max-width:400px){.cast-entry{gap:9px;padding:9px 10px}.cast-entry-av img{width:28px;height:28px;margin-left:-8px}.cast-entry-av img:nth-child(4){display:none}.cast-entry-go{padding:6px 9px;font-size:12px}}
`;
function css(){ if(document.getElementById('castCss')) return; const s=document.createElement('style'); s.id='castCss'; s.textContent=CSS; (document.head||document.documentElement).appendChild(s); }
css();
/* 도우미(assistant.js)용: 지금 열린 카드 · 필터 지정 · 패널 닫기 */
function current(){ return S.cur&&document.querySelector('.cast-panel')?S.cur:null; }
function setFilter(f){ f=f||{}; CF.g=f.g||''; CF.a=f.a||''; CF.q=f.q||''; CF.ang=!!f.ang; }
function closePanel(){ const x=document.querySelector('.cast-panel .cast-x'); if(x) x.click(); S.cur=null; }
window.LukeCasting={render,openPanel,homeEntry,load,build,current,setFilter,close:closePanel,_state:S};
})();
