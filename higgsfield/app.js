/* 루크 스튜디오 (lukemodel.com/higgsfield/) — independent vanilla-JS implementation.
   UX modeled after openhiggsfield.ai (one composer, per-model settings, masonry gallery,
   viewer, selection + bulk download, undo). No code copied from that project.
   Generation: visitor's own Higgsfield key → platform.higgsfield.ai (CORS-enabled for this origin).
   Public gallery: pluggable Supabase backend (/shared-config.js); falls back to local IndexedDB. */
'use strict';
(function(){
const H=window.LukeHF; /* 공용 모듈 /hf-core.js (얼굴 상세 페이지와 공유) */
const LS_STATE='lukehf.state', LS_TERMS='lukehf.terms';
const HISTORY_CAP=60, POLL_MS=H.POLL_MS, DEADLINE_MS=H.DEADLINE_MS;
const $=id=>document.getElementById(id);
const el=(tag,props,...kids)=>{const n=document.createElement(tag); if(props) for(const k in props){ const v=props[k]; if(v==null||v===false) continue; if(k==='class') n.className=v; else if(k==='text') n.textContent=v; else if(k.startsWith('on')) n.addEventListener(k.slice(2),v); else if(k==='style') n.style.cssText=v; else n.setAttribute(k,v===true?'':v); } kids.flat().forEach(c=>{ if(c==null||c===false) return; n.appendChild(typeof c==='string'?document.createTextNode(c):c); }); return n; };
const uid=H.uid;
let toastT; function toast(msg,kind){ const t=$('toast'); t.textContent=msg; t.className='toast on '+(kind||''); clearTimeout(toastT); toastT=setTimeout(()=>t.className='toast',kind==='err'?6000:3200); }

/* 모델 카탈로그·요청 생성은 공용 모듈에 있음 */
const {MODELS,modelById,defaultsFor,REF_MODELS,buildRequest}=H;

/* ───────── State ───────── */
const saved=(()=>{ try{return JSON.parse(localStorage.getItem(LS_STATE)||'{}');}catch(e){return {};} })();
const state={scope:saved.scope||'video',surface:saved.surface||'video',model:{image:saved.mImage||'soul-2',video:saved.mVideo||'seedance-2.5'},settings:saved.settings||{},media:{start:null,end:null,ref:[]},runs:[],selected:new Set(),selecting:false,lastSel:null,undo:null,pub:{items:[],offset:0,done:false,loading:false,err:null}};
function persist(){ try{ localStorage.setItem(LS_STATE,JSON.stringify({scope:state.scope,surface:state.surface,mImage:state.model.image,mVideo:state.model.video,settings:state.settings})); }catch(e){} }
const curModel=()=>modelById(state.model[state.surface]);
function curSettings(){ const m=curModel(); return H.fixSettings(m,state.settings[m.id]); }
const getKey=H.getKey;

/* ───────── IndexedDB ───────── */
let dbp=null;
function db(){ if(dbp) return dbp; dbp=new Promise((res,rej)=>{ const r=indexedDB.open('lukehf',1); r.onupgradeneeded=()=>{ const d=r.result; d.createObjectStore('runs',{keyPath:'id'}); d.createObjectStore('localpub',{keyPath:'id'}); }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); return dbp; }
async function idb(store,mode,fn){ const d=await db(); return new Promise((res,rej)=>{ const tx=d.transaction(store,mode); const st=tx.objectStore(store); const out=fn(st); tx.oncomplete=()=>res(out&&out.result!==undefined?out.result:out); tx.onerror=()=>rej(tx.error); }); }
const idbAll=store=>idb(store,'readonly',st=>st.getAll());
const idbPut=(store,v)=>idb(store,'readwrite',st=>st.put(v));
const idbDel=(store,k)=>idb(store,'readwrite',st=>st.delete(k));
async function saveRun(r){ try{ await idbPut('runs',r); }catch(e){} }
async function enforceCap(){ const done=state.runs.filter(r=>!r.fav).sort((a,b)=>b.createdAt-a.createdAt); for(const r of done.slice(HISTORY_CAP)){ state.runs=state.runs.filter(x=>x.id!==r.id); try{await idbDel('runs',r.id);}catch(e){} } }

/* ───────── Higgsfield API (공용 모듈) ─────────*/
const {hfSubmit,hfStatus}=H;

/* ───────── Generate ───────── */
let inflight=0;
function setLamp(){ const l=$('lamp'), k=!!getKey(); l.className='lamp'+(inflight?' busy':k?' on':''); l.title=inflight?('생성 중 '+inflight+'건'):k?'키 저장됨':'키 없음'; $('keyBtn').textContent=k?'키 변경':'키 추가'; }
async function generate(){
  const prompt=$('prompt').value.trim(); const m=curModel(); const s=curSettings();
  if(!getKey()){ openKeyModal(()=>generate()); return; }
  if(!prompt&&!state.media.start){ toast('프롬프트를 입력하세요','err'); $('prompt').focus(); return; }
  let req; try{ req=buildRequest(m,prompt,state.media,s); }catch(e){ toast(e.message,'err'); return; }
  const n=m.s.batchNative?1:Math.max(1,Math.min(4,+s.batch||1));
  const media=JSON.parse(JSON.stringify(state.media));
  if(state.scope!==m.kind&&(state.scope==='image'||state.scope==='video'||state.scope==='public')) setScope(m.kind);
  for(let i=0;i<n;i++){
    const r={id:uid(),createdAt:Date.now(),kind:m.kind,model:m.id,modelLabel:m.label,prompt,settings:s,media,endpoint:req.path,status:'pending',fav:false};
    state.runs.unshift(r); renderGrid(); submitRun(r,req.body);
  }
}
async function submitRun(r,body){
  inflight++; setLamp();
  try{ const q=await hfSubmit(r.endpoint,body); r.requestId=q.request_id; r.submittedAt=Date.now(); await saveRun(r); await pollRun(r); }
  catch(e){ failRun(r,e.message); }
  finally{ inflight--; setLamp(); }
}
async function pollRun(r){
  const start=r.submittedAt||r.createdAt;
  while(Date.now()-start<DEADLINE_MS){
    await new Promise(z=>setTimeout(z,POLL_MS));
    if(!state.runs.includes(r)) return;
    let j; try{ j=await hfStatus(r.requestId); }catch(e){ if(e.status===401||e.status===404){ failRun(r,e.message); return; } continue; }
    const st=String(j.status||'').toLowerCase();
    if(st==='completed'){ const urls=[]; (j.images||[]).forEach(x=>x&&x.url&&urls.push(x.url)); if(j.video&&j.video.url) urls.push(j.video.url);
      if(!urls.length){ failRun(r,'결과 URL이 없습니다'); return; }
      r.status='done'; r.url=urls[0]; r.kind=j.video&&j.video.url?'video':'image'; r.share=shared?'pending':null; await saveRun(r);
      const extra=urls.slice(1).map(u=>{ const c=Object.assign({},r,{id:uid(),url:u,createdAt:r.createdAt-1}); state.runs.splice(state.runs.indexOf(r)+1,0,c); return c; });
      for(const c of extra) await saveRun(c);
      await enforceCap(); renderAll();
      for(const x of [r,...extra]) await autoShare(x);
      return; }
    if(st==='failed'||st==='nsfw'||st==='canceled'||st==='cancelled'){ failRun(r,st==='nsfw'?'안전 필터(NSFW)로 거부됨 — 크레딧 환불':st==='failed'?'생성 실패 — 크레딧 환불':'취소됨'); return; }
    r.phase=st; updateTile(r);
  }
  failRun(r,'10분 시간 초과 (나중에 다시 확인하세요)');
}
async function failRun(r,msg){ r.status='failed'; r.error=msg; await saveRun(r); renderAll(); }

/* ───────── Public gallery (Supabase or local fallback) ───────── */
const {CFG,shared,SB,MAX_IMG,MAX_VID,OK_MIME,sbHeaders,pubUrl,validateUpload}=H;
async function publish(file,title,source){
  if(!shared){ const v=await validateUpload(file); const clean=H.makeTitle(title); const it={id:uid(),created_at:new Date().toISOString(),kind:v.kind,mime:v.mime,size:file.size,title:clean,source:source||'upload',blob:file}; await idbPut('localpub',it); return it; }
  return H.publish(file,title,source);
}
/* 완성된 생성 결과를 자동으로 공개 갤러리(= 메인 화면 첫 섹션)에 등록. 결과 파일 자체를 복사(Higgsfield 결과는 ~7일 후 삭제). */
const shareQueue=[]; let sharing=false;
function autoShare(r){ if(!shared||r.status!=='done'||r.share==='done'||r.share==='external') return Promise.resolve(); return new Promise(res=>{ shareQueue.push([r,res]); pumpShare(); }); }
async function pumpShare(){ if(sharing) return; sharing=true;
  while(shareQueue.length){ const [r,res]=shareQueue.shift(); try{ await shareOne(r); }catch(e){} res(); }
  sharing=false; }
async function shareOne(r){
  const title='['+(r.modelLabel||'AI')+'] '+(r.prompt||'');
  r.share='pending'; await saveRun(r);
  try{ const res=await H.shareResult({url:r.url,kind:r.kind,title});
    if(res.share==='done'){ r.share='done'; r.shared=res.path; await saveRun(r); toast('공개 갤러리·메인 화면에 자동 등록했습니다','ok'); }
    else { r.share='external'; await saveRun(r); toast('파일 복사 실패('+res.why+') — 원본 링크로 공개 갤러리에 등록했습니다(약 7일 후 만료)','err'); }
    if(state.scope==='public') loadPublic(true); }
  catch(e){ r.share='failed'; r.shareErr=e.why||e.message; await saveRun(r); toast('자동 공개 등록 실패: '+(e.why||e.message)+' — 뷰어의 「공개 갤러리에 공유」로 다시 시도하세요','err'); }
  renderGrid();
}
async function loadPublic(reset){
  const P=state.pub; if(P.loading) return; if(reset){ P.items=[]; P.offset=0; P.done=false; P.err=null; }
  if(P.done) return; P.loading=true;
  try{
    if(!shared){ const all=(await idbAll('localpub')).sort((a,b)=>b.created_at<a.created_at?-1:1); P.items=all.map(x=>Object.assign({},x,{url:URL.createObjectURL(x.blob),local:true})); P.done=true; }
    else{ const r=await fetch(SB+'/rest/v1/'+CFG.table+'?select=*&hidden=eq.false&or='+encodeURIComponent('(title.is.null,title.not.like.*[각도·*)')+'&order=created_at.desc&limit=40&offset='+P.offset,{headers:sbHeaders()});
      if(!r.ok) throw new Error('목록 불러오기 실패 ('+r.status+')'); const rows=await r.json();
      rows.forEach(x=>{ x.url=x.path?pubUrl(x.path):x.external_url; if(x.url) P.items.push(x); }); P.offset+=rows.length; if(rows.length<40) P.done=true; }
  }catch(e){ P.err=e.message; }
  P.loading=false; if(state.scope==='public') renderGrid();
}
async function reportItem(it){
  const reason=prompt('신고 사유를 적어주세요 (불법·성적·저작권 침해·개인정보 등)'); if(reason==null) return;
  if(!shared){ toast('로컬 모드에서는 신고 대신 삭제할 수 있습니다'); return; }
  try{ const r=await fetch(SB+'/rest/v1/'+(CFG.reportsTable||'media_reports'),{method:'POST',headers:sbHeaders({'Content-Type':'application/json',Prefer:'return=minimal'}),body:JSON.stringify({media_id:it.id,reason:String(reason).slice(0,300)})});
    if(!r.ok) throw new Error(r.status); toast('신고가 접수되었습니다. 누적 신고 시 자동으로 숨겨집니다','ok'); }catch(e){ toast('신고 실패: '+e.message,'err'); }
}

/* 소유자 삭제 (공개 갤러리 항목: 목록 행 + 저장소 파일) */
async function deletePublic(it){
  if(!confirm('이 항목을 삭제할까요?\n목록과 저장된 파일이 완전히 지워지며 되돌릴 수 없습니다.')) return;
  try{ const r=await H.deleteItem(it); state.pub.items=state.pub.items.filter(x=>x.id!==it.id); closeModal(); renderGrid();
    toast(r.fileOk?'삭제했습니다':'목록에서 삭제했습니다 (파일 정리는 운영자가 합니다)',r.fileOk?'ok':'err'); }
  catch(e){ toast(e.message,'err'); }
}
/* 「참고로 사용」: 이미지 → 참고 이미지 / 시작 프레임, 영상 → 장면 추출(마지막 = 이어서, 첫 장면 = 참고) */
function useAsRef(url){ state.surface='image'; if(!modelById(state.model.image).roles.ref) state.model.image='soul-2'; const m=modelById(state.model.image);
  if(!state.media.ref.some(x=>x.url===url)){ if(state.media.ref.length>=m.roles.ref) state.media.ref.splice(0,1); state.media.ref.push({url}); }
  if(state.scope==='video') state.scope='image'; persist(); closeModal(); renderAll(); $('prompt').focus(); toast(m.label+' 참고 이미지로 추가했습니다','ok'); }
function useAsStartFrame(url){ state.surface='video'; if(!modelById(state.model.video).roles.start) state.model.video='seedance-2.5'; state.media={start:{url},end:null,ref:[]};
  persist(); closeModal(); if(state.scope==='image') state.scope='video'; renderAll(); $('prompt').focus(); toast('시작 프레임으로 넣었습니다 — 영상 프롬프트를 쓰고 생성을 누르세요','ok'); }
async function useVideoFrame(url,which,as){ closeModal(); toast('영상 장면 추출·업로드 중…');
  try{ const u=await H.frameUrl(url,which); if(as==='ref') useAsRef(u); else useAsStartFrame(u); }catch(e){ toast('장면 추출 실패: '+e.message,'err'); } }
function useButtons(url,kind){ return kind==='video'
  ? [el('button',{class:'btn use-last',text:'마지막 장면에서 이어서 영상 만들기',onclick:()=>useVideoFrame(url,'last','start')}),el('button',{class:'btn ghost use-first',text:'첫 장면을 참고 이미지로',onclick:()=>useVideoFrame(url,'first','ref')})]
  : [el('button',{class:'btn use-ref',text:'참고 이미지로 (이미지 생성)',onclick:()=>useAsRef(url)}),el('button',{class:'btn ghost use-start',text:'시작 프레임으로 (영상 생성)',onclick:()=>useAsStartFrame(url)})]; }
function openUseChooser(url,kind){
  const media=kind==='video'?el('video',{src:url+'#t=0.1',muted:true,playsinline:true,preload:'metadata',style:'width:100%;max-height:260px;border-radius:10px;background:#000;margin-bottom:10px'}):el('img',{src:url,alt:'',referrerpolicy:'no-referrer',style:'width:100%;max-height:260px;object-fit:contain;border-radius:10px;background:#000;margin-bottom:10px'});
  openModal(el('div',{class:'box use-chooser'},el('h3',{text:'참고로 사용'}),el('p',{text:kind==='video'?'이 영상의 한 장면을 이미지로 뽑아 입력으로 씁니다. 마지막 장면을 시작 프레임으로 넣으면 같은 인물·장면이 자연스럽게 이어집니다.':'다른 사람의 결과를 참고 이미지(같은 인물·스타일 유지)나 영상의 시작 프레임으로 써서 처음부터 다시 만드는 토큰을 아낄 수 있습니다.'}),media,
    el('div',{class:'acts2',style:'justify-content:flex-start'},...useButtons(url,kind),el('button',{class:'btn ghost',text:'취소',onclick:closeModal}))));
}
/* 이 브라우저 전용(로컬 모드 시절) 갤러리 항목 → 공개 갤러리 */
async function shareLocalPub(btn){
  const list=state.localPub||[]; if(!list.length) return;
  if(!confirm('이 브라우저에만 저장된 공개 갤러리 항목 '+list.length+'개를 모든 방문자에게 공개할까요?')) return;
  let ok=0; const errs=[];
  for(let i=0;i<list.length;i++){ const it=list[i]; if(btn) btn.textContent='공유 중 '+(i+1)+'/'+list.length+'…';
    try{ await H.publish(it.blob,it.title||'',it.source||'upload'); await idbDel('localpub',it.id); ok++; }catch(e){ errs.push(e.message); } }
  try{ state.localPub=await idbAll('localpub'); }catch(e){ state.localPub=[]; }
  toast(ok+'개 공유했습니다'+(errs.length?' · 실패 '+errs.length+'개 — '+errs[0]:''),errs.length?'err':'ok'); loadPublic(true); renderNotice();
}

/* ───────── Download ───────── */
const download=(it,i)=>H.download(it,i);

/* ───────── Rendering ───────── */
const SCOPES=[['image','이미지'],['video','영상'],['assets','에셋'],['fav','즐겨찾기'],['public','공개 갤러리']];
function scopeItems(sc){ const R=state.runs;
  if(sc==='image') return R.filter(r=>r.kind==='image'); if(sc==='video') return R.filter(r=>r.kind==='video');
  if(sc==='assets') return R.filter(r=>r.status==='done'); if(sc==='fav') return R.filter(r=>r.fav&&r.status==='done'); return state.pub.items; }
function renderTabs(){ const t=$('tabs'); t.textContent='';
  SCOPES.forEach(([k,l],idx)=>{ const cnt=k==='public'?(state.pub.items.length||''):scopeItems(k).length||''; const b=el('button',{role:'tab','aria-selected':String(state.scope===k),tabindex:state.scope===k?'0':'-1',onclick:()=>setScope(k)},l,cnt!==''?el('span',{class:'cnt',text:String(cnt)}):null);
    b.addEventListener('keydown',e=>{ if(e.key==='ArrowRight'||e.key==='ArrowLeft'){ const n=(idx+(e.key==='ArrowRight'?1:SCOPES.length-1))%SCOPES.length; setScope(SCOPES[n][0]); t.children[n].focus(); } }); t.appendChild(b); }); }
function setScope(k){ state.scope=k; if(k==='image'||k==='video'){ state.surface=k; } exitSelect(); persist(); if(k==='public') loadPublic(true); renderAll(); }
function renderNotice(){ const n=$('notice'); n.textContent='';
  if(state.scope==='public'){
    n.appendChild(el('div',{class:'notice'+(shared?'':' warn')},
      el('b',{text:shared?'공개 갤러리 — 누구나 업로드·다운로드':'공개 갤러리 (현재 이 브라우저 전용 모드)'}),' ',
      shared?'이미지·영상을 올리면 lukemodel.com 방문자 모두가 보고 내려받을 수 있습니다. 이미지 ≤'+Math.round(MAX_IMG/1048576)+'MB, 영상 ≤'+Math.round(MAX_VID/1048576)+'MB, JPG·PNG·WEBP·GIF·MP4·WEBM·MOV만. 불법·성인·타인 초상/저작권 침해 게시물은 금지되며 신고 누적 시 자동 숨김됩니다.'
            :'공유 저장소가 아직 연결되지 않아, 올린 파일은 이 기기 브라우저에만 저장됩니다(다른 방문자에게는 보이지 않음). 운영자가 무료 저장소를 연결하면 자동으로 전체 공개 갤러리로 전환됩니다.'));
    if(shared&&state.localPub&&state.localPub.length){ const b=el('button',{class:'btn sm',text:'이 브라우저 전용 항목 '+state.localPub.length+'개 공유하기',onclick:()=>shareLocalPub(b)});
      n.appendChild(el('div',{class:'notice'},el('b',{text:'이 브라우저에만 있던 항목: '}),'예전에 로컬 모드로 올린 파일이 있습니다. ',b)); }
    return; }
  if(shared) n.appendChild(el('div',{class:'notice',style:'border-color:#4a5a14'},el('b',{text:'자동 공개: '}),'이 스튜디오에서 완성된 이미지·영상은 자동으로 공개 갤러리와 lukemodel.com 메인 화면 첫 줄에 등록되어 누구나 보고 내려받을 수 있습니다. 공개되면 안 되는 내용(개인정보·타인 얼굴 등)은 생성하지 마세요.'));
  if(!getKey()) n.appendChild(el('div',{class:'notice'},el('b',{text:'내 Higgsfield 키로 생성합니다.'}),' 오른쪽 위 「키 추가」에 ',el('b',{text:'key-id:key-secret'}),' 형식 키를 넣으세요(',el('a',{href:'https://cloud.higgsfield.ai/',target:'_blank',rel:'noopener',text:'Higgsfield Cloud에서 발급'}),'). 키는 이 브라우저에만 저장되고 platform.higgsfield.ai로만 전송됩니다. 생성 비용은 키 소유자 계정에서 차감됩니다.'));
}
const STARTERS={image:['창가 햇살 아래 앉아 있는 20대 한국인 모델, 필름 카메라 질감의 에디토리얼 인물 사진','비 오는 서울 골목의 네온사인, 젖은 아스팔트 반사, 시네마틱 와이드 샷','흰 배경 위 미니멀 향수병 제품 사진, 부드러운 그림자, 스튜디오 조명'],
  video:['새벽 안개 낀 한라산 능선을 천천히 넘어가는 드론 샷, 볼류메트릭 라이트','물속에 번지는 먹물 매크로, 역광, 초슬로모션, 검은 배경','비 내리는 야시장을 따라가는 핸드헬드 트래킹 샷, 렌즈에 맺힌 빗방울, 얕은 심도']};
function renderEmpty(items){ const e=$('empty'); e.textContent=''; e.hidden=items.length>0; if(items.length) return;
  if(state.scope==='public'){ e.append(el('h2',{text:state.pub.loading?'불러오는 중…':state.pub.err?'불러오기 실패':'아직 올라온 파일이 없습니다'}),el('p',{text:state.pub.err||'첫 번째 이미지·영상을 올려보세요.'}),el('div',{style:'margin-top:16px'},el('button',{class:'btn',onclick:()=>openUploadModal(),text:'+ 업로드'}))); return; }
  const k=state.scope==='image'?'image':'video';
  const title={image:'이미지 결과가 여기에 쌓입니다',video:'영상 결과가 여기에 쌓입니다',assets:'완성된 결과가 아직 없습니다',fav:'즐겨찾기한 결과가 없습니다'}[state.scope];
  e.append(el('h2',{text:title}),el('p',{text:'아래에 장면을 설명하고 모델을 고른 뒤 생성을 누르세요. 모든 결과는 이 브라우저에 보관됩니다.'}));
  const st=el('div',{class:'starters'}); STARTERS[k].forEach(p=>st.appendChild(el('button',{text:p,onclick:()=>{ if(state.surface!==k){ state.surface=k; renderComposer(); } $('prompt').value=p; autosize(); $('prompt').focus(); }}))); e.appendChild(st); }
function arVar(r){ const a=(r.settings&&r.settings.ar)||'1:1'; const [w,h]=a.split(':').map(Number); return w&&h?(w/h).toFixed(4):'1'; }
function tileFor(it,idx,items){
  const isRun=!!it.model&&!it.path&&!it.local, t=el('div',{class:'tile'+(state.selected.has(it.id)?' sel':''),tabindex:'0','data-id':it.id,style:'--ar:'+(isRun?arVar(it):'1')});
  if(isRun&&it.status==='pending'){ t.appendChild(el('div',{class:'ph'},el('div',{},el('b',{text:it.modelLabel}),el('br'),it.phase==='in_progress'?'생성 중…':'대기열…'))); t.style.cursor='default'; return t; }
  if(isRun&&it.status==='failed'){ t.appendChild(el('div',{class:'fail'},el('b',{text:'실패 · '+it.modelLabel}),el('span',{text:it.error||''}),el('span',{style:'color:#aab;font-size:11.5px',text:it.prompt.slice(0,120)}),
    el('div',{style:'display:flex;gap:6px'},el('button',{class:'btn sm',text:'다시 시도',onclick:e=>{e.stopPropagation(); reuse(it); removeRuns([it.id],true);}}),el('button',{class:'btn ghost sm',text:'삭제',onclick:e=>{e.stopPropagation(); removeRuns([it.id]);}})))); t.style.cursor='default'; return t; }
  const media=it.kind==='video'?el('video',{src:it.url,muted:true,loop:true,playsinline:true,preload:'metadata'}):el('img',{src:it.url,alt:it.prompt||H.displayTitle(it.title)||'',loading:'lazy',decoding:'async',referrerpolicy:'no-referrer'});
  if(it.kind==='video'){ media.muted=true; t.addEventListener('mouseenter',()=>media.play().catch(()=>{})); t.addEventListener('mouseleave',()=>media.pause()); }
  media.addEventListener('error',()=>{ media.replaceWith(el('div',{class:'fail',style:'color:var(--dim)'},el('span',{text:'미디어를 불러올 수 없습니다 (결과 URL 만료 가능 — 생성 결과는 최소 7일 보관)'}))); });
  t.appendChild(media);
  t.appendChild(el('span',{class:'chk',text:state.selected.has(it.id)?'✓':'',onclick:e=>{ e.stopPropagation(); toggleSel(it,idx,items,e.shiftKey); }}));
  if(it.kind==='video') t.appendChild(el('span',{class:'badge',text:'VIDEO'}));
  const acts=el('div',{class:'acts'});
  if(isRun){ acts.append(el('button',{class:'ic'+(it.fav?' on':''),title:'즐겨찾기','aria-label':'즐겨찾기',text:it.fav?'★':'☆',onclick:e=>{e.stopPropagation(); toggleFav(it);}}),
    el('button',{class:'ic',title:'재사용','aria-label':'재사용',text:'↺',onclick:e=>{e.stopPropagation(); reuse(it);}})); }
  acts.append(el('button',{class:'ic',title:'다운로드','aria-label':'다운로드',text:'⤓',onclick:e=>{e.stopPropagation(); download(it);}}));
  if(isRun) acts.append(el('button',{class:'ic',title:'삭제','aria-label':'삭제',text:'🗑',onclick:e=>{e.stopPropagation(); removeRuns([it.id]);}}));
  else if(!it.local){ if(H.canDelete(it)) acts.append(el('button',{class:'ic del',title:'내 작품 삭제','aria-label':'삭제',text:'🗑',onclick:e=>{e.stopPropagation(); deletePublic(it);}}));
    acts.append(el('button',{class:'ic',title:'신고','aria-label':'신고',text:'⚑',onclick:e=>{e.stopPropagation(); reportItem(it);}})); }
  else acts.append(el('button',{class:'ic',title:'삭제','aria-label':'삭제',text:'🗑',onclick:async e=>{e.stopPropagation(); await idbDel('localpub',it.id); loadPublic(true);}}));
  t.appendChild(acts);
  t.appendChild(el('div',{class:'cap'},el('span',{text:it.prompt||H.displayTitle(it.title)||(it.source==='studio'?'스튜디오 결과':'업로드')}),el('span',{text:it.modelLabel||(it.size?(it.size/1048576).toFixed(1)+'MB':'')})));
  t.addEventListener('click',e=>{ if(state.selecting){ toggleSel(it,idx,items,e.shiftKey); return; } openViewer(it); });
  t.addEventListener('keydown',e=>{ if(e.key==='Enter') openViewer(it); });
  return t;
}
function renderGrid(){ const items=scopeItems(state.scope); const g=$('grid'); g.textContent=''; g.classList.toggle('selecting',state.selecting);
  items.forEach((it,i)=>g.appendChild(tileFor(it,i,items))); renderEmpty(items); renderTabs();
  $('more').hidden=!(state.scope==='public'&&shared&&!state.pub.done&&items.length); }
function updateTile(r){ const t=document.querySelector('.tile[data-id="'+r.id+'"] .ph div'); if(t) t.lastChild.textContent=r.phase==='in_progress'?'생성 중…':'대기열…'; }
function renderAll(){ renderTabs(); renderNotice(); renderGrid(); renderComposer(); renderSelbar(); setLamp(); }

/* composer */
function autosize(){ const p=$('prompt'); p.style.height='auto'; p.style.height=Math.min(180,p.scrollHeight)+'px'; }
function sel(label,values,cur,fmt,on){ const s=el('select',{'aria-label':label}); values.forEach(v=>{ const o=el('option',{value:String(v),text:fmt?fmt(v):String(v)}); if(String(v)===String(cur)) o.selected=true; s.appendChild(o); }); s.onchange=()=>on(s.value); return el('label',{class:'chip',title:label},s); }
function setSetting(k,v){ const m=curModel(); state.settings[m.id]=Object.assign({},curSettings(),{[k]:v}); persist(); renderComposer(); }
function renderComposer(){
  const m=curModel(), s=curSettings(), c=$('ctl'); c.textContent='';
  c.appendChild(el('div',{class:'chip',style:'padding:3px',role:'group','aria-label':'이미지/영상'},
    ...[['image','이미지'],['video','영상']].map(([k,l])=>el('button',{class:'btn sm'+(state.surface===k?'':' ghost'),style:state.surface===k?'':'border:0;background:transparent',text:l,onclick:()=>{ state.surface=k; if(state.scope==='image'||state.scope==='video') state.scope=k; persist(); renderAll(); }}))));
  c.appendChild(el('button',{class:'chip model',onclick:openModelPicker,title:'모델 선택'},el('span',{class:'dot'}),m.label,' ▾'));
  if(m.s.ar&&!(m.kind==='video'&&state.media.start&&m.id!=='dop')) c.appendChild(sel('화면비',m.s.ar,s.ar,null,v=>setSetting('ar',v)));
  if(m.s.dur) c.appendChild(sel('길이',m.s.dur,s.dur,v=>v+'s',v=>setSetting('dur',v)));
  if(m.s.res) c.appendChild(sel('해상도',m.s.res,s.res,null,v=>setSetting('res',v)));
  if(m.kind==='image'){ const cap=m.roles.ref||0, n=state.media.ref.length;
    const tip=cap?('참고 이미지 '+Math.min(n,cap)+'/'+cap+(n>cap?' (초과분은 무시됨)':'')+' — 파일 끌어놓기·붙여넣기(Ctrl+V)·클릭, 내 결과, 공개 갤러리에서 추가'):('이 모델은 참고 이미지를 지원하지 않습니다. 지원 모델: '+REF_MODELS());
    const b=el('button',{class:'chip ref-btn'+(n?' on':''),title:tip,'aria-label':tip,'aria-disabled':cap?null:'true',onclick:()=>{ if(!cap){ toast(tip,'err'); return; } if(n>=cap){ toast('이 모델은 참고 이미지를 최대 '+cap+'장까지 씁니다','err'); return; } openAssetPicker('ref','참고 이미지'); }},'🖼 참고 이미지',cap?el('span',{class:'cnt',text:' '+Math.min(n,cap)+'/'+cap+(n>cap?' (+'+(n-cap)+' 미사용)':'')}):el('span',{class:'cnt',text:n?' 미지원 · '+n+'장 무시됨':' 미지원'}));
    c.appendChild(b);
    if(m.s.weight&&n) c.appendChild(sel('참고 강도',m.s.weight,s.weight,v=>'강도 '+v,v=>setSetting('weight',v))); }
  if(m.s.audio){ const cb=el('input',{type:'checkbox'}); cb.checked=!!s.audio; cb.onchange=()=>setSetting('audio',cb.checked); c.appendChild(el('label',{class:'chip',title:'오디오 생성'},cb,'오디오')); }
  c.appendChild(sel('개수',m.s.batchNative?[1,4]:[1,2,3,4],s.batch,v=>v+'개',v=>setSetting('batch',+v)));
  c.appendChild(el('span',{class:'spacer'}));
  c.appendChild(el('button',{class:'btn gen',onclick:generate},'생성',el('span',{class:'kbd',text:'Ctrl ↵'})));
  renderTray();
  $('prompt').placeholder=m.kind==='video'?'찍고 싶은 샷을 설명하세요 (카메라 움직임, 조명, 분위기)…':'만들고 싶은 이미지를 설명하세요…';
}
function renderTray(){ const m=curModel(), t=$('tray'); t.textContent='';
  const roles=[['start','시작 프레임'],['end','끝 프레임'],['ref','참고 이미지']].filter(([k])=>m.roles[k]||(k==='ref'&&m.kind==='image'&&state.media.ref.length));
  if(m.roles.end&&!state.media.start) roles.splice(roles.findIndex(r=>r[0]==='end'),1);
  roles.forEach(([k,l])=>{ const list=k==='ref'?state.media.ref:(state.media[k]?[state.media[k]]:[]); const cap=m.roles[k]||0;
    list.forEach((x,i)=>{ const unused=k==='ref'&&i>=cap; t.appendChild(el('div',{class:'slot filled'+(unused?' unused':''),title:unused?(cap?'이 모델은 참고 이미지를 '+cap+'장까지만 사용 — 이 이미지는 무시됨':'현재 모델은 참고 이미지를 쓰지 않습니다 — 생성 시 무시됨'):(x.url||'')},
      el('span',{class:'th',style:x.preview||x.url?'background-image:url("'+encodeURI(x.preview||x.url)+'")':''},x.uploading?'…':''),x.uploading?l+' 업로드 중…':(l+(k==='ref'&&list.length>1?' '+(i+1):'')+(unused?' (미사용)':'')),
      el('button',{class:'x','aria-label':'제거',text:'✕',onclick:()=>{ if(k==='ref') state.media.ref.splice(i,1); else { state.media[k]=null; if(k==='start') state.media.end=null; } renderComposer(); }}))); });
    if(k!=='ref'&&list.length<cap) t.appendChild(el('button',{class:'slot',onclick:()=>openAssetPicker(k,l)},el('span',{class:'th',text:'+'}),l+(m.needStart&&k==='start'?' (필수)':''))); });
}
/* 로컬 파일 → 공개 URL: Supabase public-media(갤러리 행 없이 파일만) 우선, 미설정 시 Higgsfield 업로드 URL */
const uploadInput=H.uploadInput;
/* role: 'ref' | 'start' | 'end'. 업로드 동안 미리보기 슬롯 표시 */
async function addLocalFiles(role,files){
  const m=curModel(); const cap=role==='ref'?(m.roles.ref||0):1; let room=role==='ref'?cap-state.media.ref.length:1;
  const imgs=[...files].filter(f=>/^image\//.test(f.type)); if(!imgs.length){ toast('이미지 파일이 아닙니다','err'); return; }
  if(room<=0){ toast(cap?'이 모델은 참고 이미지를 최대 '+cap+'장까지 씁니다':'이 모델은 참고 이미지를 지원하지 않습니다','err'); return; }
  const jobs=imgs.slice(0,room).map(f=>{ const item={url:'',preview:URL.createObjectURL(f),uploading:true}; if(role==='ref') state.media.ref.push(item); else { state.media[role]=item; } return [f,item]; });
  if(imgs.length>room) toast('최대 '+cap+'장까지 — '+(imgs.length-room)+'장은 제외했습니다','err');
  renderComposer();
  await Promise.all(jobs.map(async([f,item])=>{ try{ item.url=await uploadInput(f); item.uploading=false; }
    catch(e){ toast('업로드 실패: '+e.message,'err'); if(role==='ref'){ const i=state.media.ref.indexOf(item); if(i>=0) state.media.ref.splice(i,1); } else if(state.media[role]===item) state.media[role]=null; }
    finally{ URL.revokeObjectURL(item.preview); delete item.preview; } }));
  renderComposer();
}
function dropRole(){ const m=curModel(); if(m.kind==='image') return m.roles.ref?'ref':null; if(m.roles.start&&!state.media.start) return 'start'; if(m.roles.end&&state.media.start&&!state.media.end) return 'end'; return null; }

/* selection */
function toggleSel(it,idx,items,shift){ state.selecting=true;
  if(shift&&state.lastSel!=null){ const [a,b]=[Math.min(state.lastSel,idx),Math.max(state.lastSel,idx)]; for(let i=a;i<=b;i++) if(items[i]) state.selected.add(items[i].id); }
  else { state.selected.has(it.id)?state.selected.delete(it.id):state.selected.add(it.id); }
  state.lastSel=idx; if(!state.selected.size) state.selecting=false; renderGrid(); renderSelbar(); }
function exitSelect(){ state.selecting=false; state.selected.clear(); state.lastSel=null; renderSelbar(); }
function renderSelbar(){ const b=$('selbar'); b.textContent=''; const on=state.selecting&&state.selected.size>0; b.classList.toggle('on',on); $('composer').style.display=on?'none':''; if(!on) return;
  const items=scopeItems(state.scope).filter(x=>state.selected.has(x.id)&&(x.status==='done'||!x.model||x.path||x.local));
  b.append(el('b',{text:state.selected.size+'개 선택'}),
    el('button',{class:'btn sm',text:'다운로드',onclick:async()=>{ let ok=0,fail=0; for(let i=0;i<items.length;i++){ toast('다운로드 '+(i+1)+'/'+items.length); (await download(items[i],i))?ok++:fail++; await new Promise(z=>setTimeout(z,400)); } toast('완료 '+ok+'개'+(fail?' · 새 탭으로 연 파일 '+fail+'개 (CDN이 직접 저장을 거부)':''),fail?'err':'ok'); }}));
  if(state.scope!=='public'){ b.append(el('button',{class:'btn ghost sm',text:'즐겨찾기',onclick:()=>{ const all=items.every(x=>x.fav); items.forEach(x=>{ x.fav=!all; saveRun(x); }); renderGrid(); }}),
    el('button',{class:'btn danger sm',text:'삭제',onclick:()=>removeRuns([...state.selected])})); }
  b.append(el('button',{class:'btn ghost sm',text:'취소 (Esc)',onclick:()=>{ exitSelect(); renderGrid(); }})); }

/* run ops */
function toggleFav(r){ r.fav=!r.fav; saveRun(r); renderGrid(); }
function reuse(r){ const m=modelById(r.model); state.surface=m.kind; state.model[m.kind]=m.id; state.settings[m.id]=Object.assign({},r.settings); state.media=JSON.parse(JSON.stringify(r.media||{start:null,end:null,ref:[]})); if(!state.media.ref) state.media.ref=[];
  $('prompt').value=r.prompt||''; autosize(); persist(); closeModal(); renderComposer(); $('prompt').focus(); toast('모델·설정·프롬프트를 불러왔습니다'); }
function removeRuns(ids,silent){ const removed=state.runs.filter(r=>ids.includes(r.id)); state.runs=state.runs.filter(r=>!ids.includes(r.id)); exitSelect(); renderAll();
  if(silent){ removed.forEach(r=>idbDel('runs',r.id)); return; }
  if(state.undo) clearTimeout(state.undo.timer);
  const strip=$('strip'); strip.textContent='';
  const finish=()=>{ removed.forEach(r=>idbDel('runs',r.id)); strip.textContent=''; state.undo=null; };
  const timer=setTimeout(finish,6000); state.undo={timer};
  strip.append(el('span',{text:removed.length+'개 삭제됨'}),el('span',{class:'bar'},el('i')),el('button',{class:'btn ghost sm',text:'실행 취소',onclick:()=>{ clearTimeout(timer); state.runs.push(...removed); state.runs.sort((a,b)=>b.createdAt-a.createdAt); strip.textContent=''; state.undo=null; renderAll(); }})); }

/* ───────── Modals ───────── */
function closeModal(){ $('modal').textContent=''; document.removeEventListener('keydown',modalEsc); }
function modalEsc(e){ if(e.key==='Escape') closeModal(); }
function openModal(box){ closeModal(); const ov=el('div',{class:'ov',onclick:e=>{ if(e.target===ov) closeModal(); }},box); $('modal').appendChild(ov); document.addEventListener('keydown',modalEsc); const f=box.querySelector('input,textarea,button'); if(f) setTimeout(()=>f.focus(),0); }
function openKeyModal(after){
  const inp=el('input',{class:'inp',type:'password',placeholder:'key-id:key-secret',autocomplete:'off',spellcheck:'false'}); inp.value=getKey();
  const save=()=>{ const v=inp.value.trim(); if(v&&!H.validKey(v)){ toast('형식: key-id:key-secret','err'); return; } H.setKey(v); closeModal(); renderAll(); toast(v?'키를 저장했습니다 (이 브라우저에만)':'키를 삭제했습니다','ok'); if(v&&after) after(); };
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') save(); });
  openModal(el('div',{class:'box'},el('h3',{text:'Higgsfield API 키'}),
    el('p',{},'Higgsfield Cloud에서 발급한 키를 ',el('b',{text:'key-id:key-secret'}),' 형식으로 붙여넣으세요. 키는 이 브라우저 localStorage에만 저장되고 platform.higgsfield.ai 외에는 어디로도 전송되지 않습니다. lukemodel.com 서버는 키를 보지 못합니다. 공용 PC에서는 사용 후 삭제하세요.'),
    inp, el('p',{style:'font-size:12px;color:var(--dim)'},el('a',{href:'https://cloud.higgsfield.ai/',target:'_blank',rel:'noopener',text:'키 발급 (Higgsfield Cloud)'}),' · ',el('a',{href:'https://docs.higgsfield.ai/docs/authentication',target:'_blank',rel:'noopener',text:'인증 문서'})),
    el('div',{class:'acts2'},getKey()?el('button',{class:'btn danger',text:'키 삭제',onclick:()=>{ inp.value=''; save(); }}):null,el('button',{class:'btn ghost',text:'닫기',onclick:closeModal}),el('button',{class:'btn',text:'저장',onclick:save}))));
}
function openModelPicker(){
  const q=el('input',{class:'inp',placeholder:'모델 검색…',type:'search'}); const list=el('div',{class:'mlist'});
  const draw=()=>{ list.textContent=''; const s=q.value.trim().toLowerCase();
    [['image','이미지'],['video','영상']].forEach(([k,l])=>{ const ms=MODELS.filter(m=>m.kind===k&&(!s||m.label.toLowerCase().includes(s)||m.id.includes(s))); if(!ms.length) return; list.appendChild(el('div',{class:'mhead',text:l+' · '+ms.length}));
      ms.forEach(m=>list.appendChild(el('button',{class:state.model[m.kind]===m.id&&state.surface===m.kind?'on':'',onclick:()=>{ state.surface=m.kind; state.model[m.kind]=m.id; if(state.scope==='image'||state.scope==='video') state.scope=m.kind; persist(); closeModal(); renderAll(); }},
        el('span',{text:m.label}),el('small',{text:[m.roles.ref?'참고 이미지 '+m.roles.ref+'장':'',m.roles.start?'이미지→':'' ,m.s.dur?m.s.dur[0]+'–'+m.s.dur[m.s.dur.length-1]+'s':'',m.s.audio?'오디오':''].filter(Boolean).join(' · ')})))); }); };
  q.oninput=draw; draw();
  openModal(el('div',{class:'box'},el('h3',{text:'모델 선택 · '+MODELS.length+'개'}),q,list));
}
function openViewer(it){
  const isRun=!!it.model&&!it.path&&!it.local;
  const media=it.kind==='video'?el('video',{src:it.url,controls:true,autoplay:true,loop:true,playsinline:true}):el('img',{src:it.url,alt:it.prompt||H.displayTitle(it.title)||'',referrerpolicy:'no-referrer'});
  const side=el('div',{class:'vside'});
  if(isRun){ side.append(el('h3',{text:it.modelLabel}),el('div',{class:'ptxt',text:it.prompt||'(프롬프트 없음)'}),
    el('button',{class:'btn ghost sm',text:'프롬프트 복사',onclick:()=>navigator.clipboard.writeText(it.prompt||'').then(()=>toast('복사했습니다','ok'))}));
    const s=it.settings||{}; [['화면비',s.ar],['해상도',s.res],['길이',s.dur?s.dur+'s':null],['오디오',s.audio!=null&&modelById(it.model).s.audio?(s.audio?'켜짐':'꺼짐'):null],['생성 시각',new Date(it.createdAt).toLocaleString('ko-KR')]].forEach(([k,v])=>{ if(v) side.appendChild(el('div',{class:'kv'},el('span',{class:'k',text:k}),el('span',{text:String(v)}))); }); }
  else { side.append(el('h3',{text:H.displayTitle(it.title)||'공개 갤러리'}),el('div',{class:'kv'},el('span',{class:'k',text:'종류'}),el('span',{text:it.kind==='video'?'영상':'이미지'})),
    el('div',{class:'kv'},el('span',{class:'k',text:'크기'}),el('span',{text:it.size?(it.size/1048576).toFixed(2)+'MB':'-'})),
    el('div',{class:'kv'},el('span',{class:'k',text:'올린 시각'}),el('span',{text:new Date(it.created_at).toLocaleString('ko-KR')}))); }
  const acts=el('div',{style:'display:flex;flex-direction:column;gap:8px;margin-top:auto'});
  acts.appendChild(el('button',{class:'btn',text:'다운로드',onclick:()=>download(it)}));
  if(!isRun&&!it.local&&/^[0-9a-f-]{36}$/i.test(String(it.id||''))) acts.appendChild(el('a',{class:'btn ghost v-page',href:'/?m='+it.id,text:'작품 페이지 · 이어서 만들기 ›',title:'이 이미지/영상을 원본으로 이어서 만들고, 이어진 작품을 모아 보는 페이지'}));
  if(isRun){ acts.append(el('button',{class:'btn ghost',text:it.fav?'★ 즐겨찾기 해제':'☆ 즐겨찾기',onclick:()=>{ toggleFav(it); openViewer(it); }}),
    el('button',{class:'btn ghost',text:'다시 만들기 (설정 재사용)',onclick:()=>reuse(it)}),
    it.kind==='image'?el('button',{class:'btn ghost',text:'참고 이미지로 사용',onclick:()=>{ state.surface='image'; if(!modelById(state.model.image).roles.ref) state.model.image='soul-2'; const m=modelById(state.model.image); const u=it.shared&&shared?pubUrl(it.shared):it.url; if(!state.media.ref.some(x=>x.url===u)){ if(state.media.ref.length>=m.roles.ref) state.media.ref.splice(0,1); state.media.ref.push({url:u}); } if(state.scope==='video') state.scope='image'; persist(); closeModal(); renderAll(); $('prompt').focus(); toast(m.label+' 참고 이미지로 추가했습니다','ok'); }}):null,
    it.kind==='image'?el('button',{class:'btn ghost',text:'이 이미지로 영상 만들기',onclick:()=>{ state.surface='video'; if(!modelById(state.model.video).roles.start) state.model.video='seedance-2.5'; state.media={start:{url:it.url},end:null,ref:[]}; persist(); closeModal(); if(state.scope==='image') state.scope='video'; renderAll(); $('prompt').focus(); }}):null,
    (it.share==='done'||it.share==='external')?el('div',{class:'kv'},el('span',{class:'k',text:'공개 갤러리'}),el('span',{text:it.share==='done'?'자동 등록됨 ✓':'링크로 등록됨'})):el('button',{class:'btn ghost',text:it.share==='pending'?'공개 갤러리 등록 중…':'공개 갤러리에 공유',onclick:()=>shareRun(it)})); }
  else if(!it.local){ acts.append(...useButtons(it.url,it.kind));
    if(H.canDelete(it)) acts.appendChild(el('button',{class:'btn danger',text:'🗑 내 작품 삭제',onclick:()=>deletePublic(it)}));
    acts.appendChild(el('button',{class:'btn ghost',text:'⚑ 신고',onclick:()=>reportItem(it)})); }
  acts.appendChild(el('button',{class:'btn ghost',text:'닫기 (Esc)',onclick:closeModal}));
  side.appendChild(acts);
  openModal(el('div',{class:'box wide'},el('div',{class:'vmedia'},media),side));
}
async function shareRun(r){
  if(shared){ toast('공개 갤러리에 올리는 중…'); r.share=null; await autoShare(r); if(state.scope==='public') loadPublic(true); return; }
  if(!termsOk()){ openUploadModal(null,r); return; }
  toast('공개 갤러리에 올리는 중…');
  try{ const resp=await fetch(r.url,{mode:'cors'}); if(!resp.ok) throw new Error(resp.status); const b=await resp.blob(); await publish(new File([b],'x',{type:b.type}),r.prompt.slice(0,80),'studio'); toast('공개 갤러리에 올렸습니다'+(shared?'':' (로컬 모드)'),'ok'); if(state.scope==='public') loadPublic(true); }
  catch(e){ toast('자동 공유 실패: '+e.message+' — 다운로드 후 「+ 업로드」로 올려주세요','err'); }
}
const termsOk=()=>{ try{return localStorage.getItem(LS_TERMS)==='1';}catch(e){return false;} };
function openUploadModal(files,pendingRun){
  const chosen=[]; const list=el('div',{style:'font-size:12.5px;color:var(--dim);margin:8px 0'});
  const title=el('input',{class:'inp',placeholder:'제목 (선택, 80자)',maxlength:'80'});
  const fin=el('input',{type:'file',accept:'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime',multiple:true,hidden:true});
  const drop=el('div',{class:'drop',tabindex:'0',role:'button',onclick:()=>fin.click()},'클릭하거나 파일을 끌어다 놓으세요',el('br'),el('small',{text:'이미지 ≤'+Math.round(MAX_IMG/1048576)+'MB · 영상 ≤'+Math.round(MAX_VID/1048576)+'MB · 최대 10개'}));
  const add=fs=>{ [...fs].slice(0,10-chosen.length).forEach(f=>chosen.push(f)); list.textContent=chosen.map(f=>f.name+' ('+(f.size/1048576).toFixed(1)+'MB)').join(' · '); };
  fin.onchange=()=>add(fin.files);
  drop.addEventListener('dragover',e=>{ e.preventDefault(); drop.classList.add('hot'); }); drop.addEventListener('dragleave',()=>drop.classList.remove('hot'));
  drop.addEventListener('drop',e=>{ e.preventDefault(); drop.classList.remove('hot'); add(e.dataTransfer.files); });
  const agree=el('input',{type:'checkbox'}); agree.checked=termsOk();
  const go=el('button',{class:'btn',text:pendingRun?'동의하고 공유':'업로드'});
  go.onclick=async()=>{ if(!agree.checked){ toast('게시 규칙에 동의해야 합니다','err'); return; } try{ localStorage.setItem(LS_TERMS,'1'); }catch(e){}
    if(pendingRun){ closeModal(); shareRun(pendingRun); return; }
    if(!chosen.length){ toast('파일을 선택하세요','err'); return; }
    go.disabled=true; let ok=0; const errs=[];
    for(let i=0;i<chosen.length;i++){ go.textContent='업로드 '+(i+1)+'/'+chosen.length+'…'; try{ await publish(chosen[i],title.value,'upload'); ok++; }catch(e){ errs.push(chosen[i].name+': '+e.message); } }
    closeModal(); toast(ok+'개 업로드 완료'+(errs.length?' · 실패 '+errs.length+'개 — '+errs[0]:''),errs.length?'err':'ok'); setScope('public'); };
  if(files) add(files);
  openModal(el('div',{class:'box'},el('h3',{text:pendingRun?'공개 갤러리에 공유':'공개 갤러리에 업로드'}),
    el('p',{text:shared?(H.schemaV2()?'올린 파일은 lukemodel.com의 모든 방문자가 보고 다운로드할 수 있습니다. 내가 올린 파일은 언제든 직접 삭제할 수 있습니다(이 브라우저, 또는 「내 계정」에서 연결한 계정으로).':'올린 파일은 lukemodel.com의 모든 방문자가 보고 다운로드할 수 있습니다. 올린 뒤에는 직접 삭제할 수 없습니다(신고/운영자 삭제만 가능).'):'현재 공유 저장소 미연결 — 이 브라우저에만 저장됩니다.'}),
    pendingRun?null:drop, fin, pendingRun?null:list, pendingRun?null:title,
    el('label',{style:'display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:#c3c8d4;line-height:1.6'},agree,el('span',{},'내가 권리를 가진 콘텐츠만 올리며, 불법·성적·폭력적 콘텐츠, 타인의 얼굴·개인정보를 동의 없이 올리지 않습니다. 위반 시 삭제될 수 있습니다. (',el('a',{href:'/terms.html',target:'_blank',text:'이용약관'}),')')),
    el('div',{class:'acts2'},el('button',{class:'btn ghost',text:'취소',onclick:closeModal}),go)));
}
function openAssetPicker(role,label){
  let tab='file'; const body=el('div'); const tabs=el('div',{class:'ptabs'});
  const room=()=>role==='ref'?(curModel().roles.ref||0)-state.media.ref.length:1;
  const pick=url=>{ if(role==='ref'){ if(state.media.ref.some(x=>x.url===url)){ toast('이미 추가된 이미지입니다'); return; } state.media.ref.push({url}); } else state.media[role]={url}; renderComposer(); if(room()<=0) closeModal(); else { toast('추가했습니다 ('+state.media.ref.length+'/'+curModel().roles.ref+')','ok'); draw(); } };
  const draw=()=>{ tabs.textContent=''; body.textContent='';
    [['file','내 파일'],['runs','내 결과·에셋'],['public','공개 갤러리'],['url','URL']].forEach(([k,l])=>tabs.appendChild(el('button',{class:tab===k?'on':'',text:l,onclick:()=>{ tab=k; if(k==='public'&&!state.pub.items.length) loadPublic(true).then(draw); draw(); }})));
    if(tab==='file'){ const fin=el('input',{type:'file',accept:'image/jpeg,image/png,image/webp,image/gif',multiple:role==='ref',hidden:true});
      const st=el('p',{text:shared?'선택한 이미지는 lukemodel 공개 저장소에 파일로만 올라가(갤러리·메인 화면에는 표시되지 않음) 모델 입력 URL로 사용됩니다. 최대 '+Math.round(MAX_IMG/1048576)+'MB.':'이미지를 Higgsfield 임시 저장소에 올려 입력으로 사용합니다(내 키 필요).'});
      fin.onchange=()=>{ if(fin.files.length){ closeModal(); addLocalFiles(role,fin.files); } };
      const drop=el('div',{class:'drop',role:'button',tabindex:'0',onclick:()=>fin.click(),onkeydown:e=>{ if(e.key==='Enter'||e.key===' ') fin.click(); }},'클릭하거나 이미지를 끌어다 놓으세요',el('br'),el('small',{text:'JPG·PNG·WEBP·GIF'+(role==='ref'?' · 남은 칸 '+room()+'장':'')+' · 프롬프트 창에 Ctrl+V로 붙여넣기도 됩니다'}));
      drop.addEventListener('dragover',e=>{ e.preventDefault(); drop.classList.add('hot'); }); drop.addEventListener('dragleave',()=>drop.classList.remove('hot'));
      drop.addEventListener('drop',e=>{ e.preventDefault(); e.stopPropagation(); drop.classList.remove('hot'); if(e.dataTransfer.files.length){ closeModal(); addLocalFiles(role,e.dataTransfer.files); } });
      body.append(st,fin,drop); }
    if(tab==='url'){ const u=el('input',{class:'inp',placeholder:'https://… 공개 이미지 URL'}); body.append(u,el('div',{class:'acts2'},el('button',{class:'btn',text:'사용',onclick:()=>{ const v=u.value.trim(); if(!/^https:\/\/\S+$/.test(v)){ toast('https URL을 입력하세요','err'); return; } pick(v); }}))); }
    if(tab==='runs'||tab==='public'){ const src=tab==='runs'?state.runs.filter(r=>r.status==='done'&&r.kind==='image').map(r=>({url:r.shared&&shared?pubUrl(r.shared):r.url,title:r.prompt})):state.pub.items.filter(x=>x.kind==='image'&&!x.local);
      if(!src.length) body.appendChild(el('p',{text:tab==='runs'?'완성된 이미지 결과가 없습니다.':(shared?'공개 갤러리에 이미지가 없습니다.':'공유 저장소 미연결 — 로컬 파일은 외부 URL이 없어 입력으로 쓸 수 없습니다.')}));
      const g=el('div',{class:'pgrid'}); src.forEach(x=>{ const on=role==='ref'&&state.media.ref.some(y=>y.url===x.url); g.appendChild(el('button',{style:'background-image:url("'+encodeURI(x.url)+'")'+(on?';outline:2px solid var(--acc)':''),title:x.title||x.prompt||'',onclick:()=>pick(x.url)})); }); body.appendChild(g);
      if(tab==='public'&&shared&&!state.pub.done) body.appendChild(el('div',{class:'acts2'},el('button',{class:'btn ghost sm',text:'더 불러오기',onclick:()=>loadPublic(false).then(draw)}))); } };
  draw(); openModal(el('div',{class:'box'},el('h3',{text:label+' 추가'}),tabs,body));
}

/* ───────── Boot ───────── */
async function boot(){
  try{ state.runs=(await idbAll('runs')).sort((a,b)=>b.createdAt-a.createdAt); }catch(e){ state.runs=[]; }
  const p=$('prompt'); p.addEventListener('input',autosize);
  p.addEventListener('keydown',e=>{ if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){ e.preventDefault(); generate(); } });
  p.addEventListener('paste',e=>{ const fs=[...(e.clipboardData&&e.clipboardData.files||[])].filter(f=>/^image\//.test(f.type)); if(!fs.length) return; const r=dropRole(); if(!r){ toast(curModel().kind==='image'?'이 모델은 참고 이미지를 지원하지 않습니다. 지원: '+REF_MODELS():'이 모델은 이미지 입력을 받지 않습니다','err'); return; } e.preventDefault(); addLocalFiles(r,fs); });
  const comp=$('composer');
  comp.addEventListener('dragover',e=>{ if([...e.dataTransfer.types].includes('Files')){ e.preventDefault(); comp.classList.add('hot'); } });
  comp.addEventListener('dragleave',e=>{ if(!comp.contains(e.relatedTarget)) comp.classList.remove('hot'); });
  comp.addEventListener('drop',e=>{ comp.classList.remove('hot'); if(!e.dataTransfer.files.length) return; e.preventDefault(); const r=dropRole(); if(!r){ toast('현재 모델은 이미지 입력을 받지 않습니다. 참고 이미지 지원: '+REF_MODELS(),'err'); return; } addLocalFiles(r,e.dataTransfer.files); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&state.selecting&&!$('modal').firstChild){ exitSelect(); renderGrid(); } });
  $('keyBtn').onclick=()=>openKeyModal(); $('upBtn').onclick=()=>openUploadModal(); $('moreBtn').onclick=()=>loadPublic(false);
  const q=new URLSearchParams(location.search); if(q.get('tab')&&SCOPES.some(s=>s[0]===q.get('tab'))) state.scope=q.get('tab');
  { const right=document.querySelector('.top .right'); if(right&&window.LukeAuth&&LukeAuth.chip) right.insertBefore(LukeAuth.chip(),right.firstChild); }
  if(window.LukeAuth&&LukeAuth.onChange) LukeAuth.onChange(()=>{ if(state.scope==='public') renderGrid(); const n=LukeAuth.takeNotice&&LukeAuth.takeNotice(); if(n) toast(n.text,n.kind==='err'?'err':'ok'); });
  window.addEventListener('lukemedia:deleted',e=>{ const id=e.detail&&e.detail.id; if(state.pub.items.some(x=>x.id===id)){ state.pub.items=state.pub.items.filter(x=>x.id!==id); renderGrid(); } });
  if(shared) idbAll('localpub').then(a=>{ state.localPub=a||[]; if(state.localPub.length) renderNotice(); }).catch(()=>{});
  loadPublic(true);
  renderAll();
  /* 홈·상세의 「참고로 사용」 → /higgsfield/?use=<파일 URL>&kind=image|video */
  { const use=q.get('use'), kind=q.get('kind')==='video'?'video':'image';
    if(use){ try{ const u=new URL(location.href); u.searchParams.delete('use'); u.searchParams.delete('kind'); history.replaceState(null,'',u.pathname+(u.search||'')); }catch(e){}
      if(H.okMediaUrl(use)) openUseChooser(use,kind); else toast('참고로 쓸 수 없는 주소입니다','err'); } }
  state.runs.filter(r=>r.status==='done'&&r.share==='pending').forEach(r=>autoShare(r));
  state.runs.filter(r=>r.status==='pending').forEach(r=>{ if(r.requestId&&getKey()&&Date.now()-(r.submittedAt||r.createdAt)<DEADLINE_MS){ inflight++; setLamp(); pollRun(r).finally(()=>{ inflight--; setLamp(); }); } else failRun(r,'페이지를 떠나 확인이 중단됨'); });
}
boot();
})();
