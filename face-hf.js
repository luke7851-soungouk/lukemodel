/* 얼굴 상세 페이지 「이 얼굴로 힉스필드 제작」 패널 (window.LukeFaceHF)
   - 이 얼굴 사진을 매번 자동으로 참고 이미지(이미지 모델) / 시작 프레임(영상 모델)으로 보내 같은 사람을 유지.
   - 방문자 본인 Higgsfield 키 사용(스튜디오와 같은 localStorage 키).
   - 완성 결과는 공용 모듈(LukeHF.shareResult)로 Supabase에 파일 복사 + shared_media 행(제목 끝 #face:<키>) →
     홈 공개 갤러리와 이 페이지 「이 얼굴로 만든 작품」에 표시.
   의존: /shared-config.js, /hf-core.js */
'use strict';
(function(){
const H=window.LukeHF; if(!H) return;
const LS_PREFS='lukeface.prefs', LS_RUNS='lukeface.runs', RUNS_CAP=40, PAGE=24, REFRESH_MS=45000;
const IMG_MODELS=H.MODELS.filter(m=>m.kind==='image'&&m.roles.ref);           /* Soul 2 · Soul Cinema · Ideogram 4.0 (참고 1장) · Qwen Image 3 · Grok Imagine 2.0 (참고 최대 3장) */
const VID_MODELS=H.MODELS.filter(m=>m.kind==='video'&&m.i&&m.roles.start);      /* 이미지→영상 가능한 모델 */
const el=(tag,props,...kids)=>{const n=document.createElement(tag); if(props) for(const k in props){ const v=props[k]; if(v==null||v===false) continue; if(k==='class') n.className=v; else if(k==='text') n.textContent=v; else if(k.startsWith('on')) n.addEventListener(k.slice(2),v); else if(k==='style') n.style.cssText=v; else n.setAttribute(k,v===true?'':v); } kids.flat().forEach(c=>{ if(c==null||c===false) return; n.appendChild(typeof c==='string'?document.createTextNode(c):c); }); return n; };
const toast=(m,k)=>{ try{ (window.toast||function(){})(m,k); }catch(e){} };

/* ── 저장된 선택값 ── */
function loadJSON(k,d){ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
function saveJSON(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
/* 기본 이미지 모델 = 얼굴 유지가 되는 편집 모델(Qwen Image 3 edit, 참고 최대 3장). Soul 은 참고 이미지가 1장뿐이고 얼굴 유지가 약해
   직접 고른 경우(imgPicked)에만 유지 — 예전 기본값(soul-2)이 저장된 브라우저도 Qwen Image 3 으로 바뀜 */
const DEF_IMG='qwen-image-3';
const prefs=Object.assign({img:DEF_IMG,vid:'seedance-2.5',settings:{}},loadJSON(LS_PREFS,{}));
if(!prefs.imgPicked||!IMG_MODELS.some(m=>m.id===prefs.img)) prefs.img=IMG_MODELS.some(m=>m.id===DEF_IMG)?DEF_IMG:'soul-2';
if(!VID_MODELS.some(m=>m.id===prefs.vid)) prefs.vid='seedance-2.5';
const savePrefs=()=>saveJSON(LS_PREFS,prefs);
const settingsFor=m=>H.fixSettings(m,prefs.settings[m.id]);
function setSetting(m,k,v){ prefs.settings[m.id]=Object.assign({},settingsFor(m),{[k]:v}); savePrefs(); }

/* ── 생성 기록(이 기기): 새로고침해도 진행 중 작업을 이어서 확인 ── */
let allRuns=loadJSON(LS_RUNS,[]); if(!Array.isArray(allRuns)) allRuns=[];
function persistRuns(){ allRuns=allRuns.filter(r=>r.status!=='gone').slice(0,RUNS_CAP); saveJSON(LS_RUNS,allRuns.map(r=>{ const c=Object.assign({},r); delete c._el; delete c.blob; delete c._live; if(c.url&&/^blob:/.test(c.url)) delete c.url; return c; })); }
const polling=new Set();

/* ── 얼굴별 상태 ── */
const states=new Map();
function stateFor(face,opts){
  opts=opts||{}; let st=states.get(face.key);
  if(!st){ st={key:face.key,tab:'image',prompt:{image:'',video:''},start:null,items:[],ids:new Set(),loading:false,done:false,err:null,loadedAt:0,
    faceUrl:face.publicUrl||null,faceState:face.publicUrl?'ready':'idle',faceErr:null}; states.set(face.key,st); }
  st.face=face; st.mode=opts.mode||'face'; st.item=opts.item||null;
  if(!st._tabSet&&st.mode==='media'&&st.item&&st.item.kind==='video'){ st.tab='video'; } st._tabSet=true;
  if(face.publicUrl&&st.faceUrl!==face.publicUrl){ st.faceUrl=face.publicUrl; st.faceState='ready'; }
  return st;
}
const runsOf=st=>allRuns.filter(r=>r.faceKey===st.key&&r.status!=='gone');
/* 상세 화면은 DOM을 다 만든 뒤 문서에 붙이므로, 마운트 직후(같은 틱)에는 아직 연결 전이어도 그린다 */
const alive=st=>!!(st.root&&(st.root.isConnected||st.root._fresh));

/* ── 얼굴 사진 → Higgsfield가 받을 수 있는 공개 URL ── */
async function ensureFaceUrl(st){
  if(st.faceState==='ready'&&st.faceUrl) return st.faceUrl;
  if(st.facePromise) return st.facePromise;
  if(!st.face.resolve){ st.faceState='error'; st.faceErr='얼굴 이미지 주소를 찾을 수 없습니다'; drawStatus(st); throw new Error(st.faceErr); }
  st.faceState='uploading'; st.faceErr=null; drawStatus(st); drawForm(st);
  st.facePromise=(async()=>{ try{ const u=await st.face.resolve(); st.faceUrl=u; st.faceState='ready'; return u; }
    catch(e){ st.faceState='error'; st.faceErr=e.message||String(e); throw e; }
    finally{ st.facePromise=null; drawStatus(st); drawForm(st); } })();
  return st.facePromise;
}

/* ── Supabase에서 이 얼굴 작품 목록 ── */
async function loadTree(st,quiet){
  if(st.loading) return; st.loading=true; st.err=null; if(!quiet) drawGallery(st);
  try{ const rows=await H.listTree(st.item.id); st.items=rows; st.ids=new Set(rows.map(x=>x.id)); st.done=true; st.loadedAt=Date.now(); }
  catch(e){ st.err=e.message; }
  st.loading=false; drawGallery(st);
}
async function loadFirst(st){
  if(st.mode==='media') return loadTree(st);
  if(st.loading) return; st.loading=true; st.err=null; drawGallery(st);
  try{ const rows=await H.listByFace(st.key,{limit:PAGE}); st.items=rows; st.ids=new Set(rows.map(x=>x.id)); st.done=rows.length<PAGE; st.loadedAt=Date.now(); }
  catch(e){ st.err=e.message; }
  st.loading=false; drawGallery(st);
}
async function loadMore(st){
  if(st.loading||st.done) return; const last=st.items[st.items.length-1]; if(!last) return loadFirst(st);
  st.loading=true; drawGallery(st);
  try{ const rows=await H.listByFace(st.key,{limit:PAGE,before:last.created_at}); const add=rows.filter(x=>!st.ids.has(x.id)); add.forEach(x=>st.ids.add(x.id)); st.items.push(...add); if(rows.length<PAGE) st.done=true; }
  catch(e){ st.err=e.message; }
  st.loading=false; drawGallery(st);
}
async function loadNew(st){
  if(st.mode==='media') return loadTree(st,true);
  const first=st.items[0]; if(!first){ st.loading=false; return loadFirst(st); }
  try{ const rows=await H.listByFace(st.key,{limit:50,after:first.created_at}); const add=rows.filter(x=>!st.ids.has(x.id)); if(add.length){ add.forEach(x=>st.ids.add(x.id)); st.items.unshift(...add); } st.loadedAt=Date.now(); drawGallery(st); }
  catch(e){}
}

/* ── 생성 ── */
function generate(st,kind){
  if(!H.getKey()){ toast('먼저 내 Higgsfield 키를 저장하세요','err'); const i=st.root&&st.root.querySelector('.fhf-key input'); if(i) i.focus(); return; }
  const prompt=(st.prompt[kind]||'').trim();
  if(!prompt){ toast('프롬프트를 입력하세요','err'); const t=st.root&&st.root.querySelector('.fhf-form textarea'); if(t) t.focus(); return; }
  const m=H.modelById(kind==='image'?prefs.img:prefs.vid), s=settingsFor(m);
  let plan=refPlan(st,m);
  const needFace=kind==='image'?plan.list.some(x=>x.id==='orig'):(!plan.custom&&plan.start.id==='orig');
  if(needFace&&st.faceState!=='ready'){
    if(st.faceState==='uploading'){ toast('얼굴 사진을 올리는 중입니다. 잠시 후 다시 누르세요','err'); return; }
    ensureFaceUrl(st).then(()=>generate(st,kind)).catch(e=>toast('얼굴 사진 준비 실패: '+e.message,'err')); return;
  }
  plan=refPlan(st,m);
  const media=kind==='image'?{ref:plan.list.map(x=>({url:x.url}))}:{start:{url:plan.start.url}};
  let req; try{ req=H.buildRequest(m,prompt,media,s); }catch(e){ toast(e.message,'err'); return; }
  const n=kind==='image'&&!m.s.batchNative?Math.max(1,Math.min(4,+s.batch||1)):1;
  const refNote=kind==='image'?plan.list.map(x=>x.label).join('+'):'시작: '+plan.start.label;
  for(let i=0;i<n;i++){
    const r={id:H.uid(),faceKey:st.key,createdAt:Date.now(),kind:m.kind,model:m.id,modelLabel:m.label,prompt,endpoint:req.path,input:kind==='image'?plan.list[0].url:media.start.url,refNote,status:'pending',ar:s.ar};
    allRuns.unshift(r); persistRuns(); submit(st,r,req.body);
  }
  drawGallery(st);
  const g=st.root&&st.root.querySelector('.fhf-gal'); if(g&&g.scrollIntoView) try{ g.scrollIntoView({behavior:'smooth',block:'nearest'}); }catch(e){}
}
/* ── 일관성 참고 이미지 (정면·왼쪽·오른쪽·뒷모습) ──────────────────────────────────────
   자동(무료) 생성·저장은 /angle-auto.js (window.LukeAngles). 여기선 ① 4칸 상태 ② 유료 힉스필드 수동 옵션(확인 창)
   ③ 이미지·영상 만들 때 참고 이미지/시작 프레임으로 자동 첨부 (파생 작품은 뿌리=원본 인물의 세트를 물려받음) */
const A=window.LukeAngles||null, ANG=A?A.ANGLES:[];
const ANGLE_KO=Object.fromEntries(ANG.map(a=>[a.id,a.ko]));
async function ensureRoot(st){
  if(st.rootInfo) return st.rootInfo;
  if(st.mode==='media'&&st.item&&A){ try{ st.rootInfo=await A.rootOf(st.item); }catch(e){ st.rootInfo={key:st.key,item:st.item,face:false}; } }
  else st.rootInfo={key:st.key,item:null,face:true,self:true};
  return st.rootInfo;
}
const rootKey=st=>st.rootInfo?st.rootInfo.key:st.key;
const angleFound=st=>(A&&(A.stateOf(rootKey(st))||{}).found)||{};
/* 자동 대상: 뿌리가 공개(작품 m- 또는 저장소 얼굴 r-)이고, 뿌리가 각도·시트 이미지가 아님. 얼굴 뿌리는 그 얼굴 페이지에서만 */
function angleAuto(st){ if(!A||!H.shared) return false; const r=st.rootInfo; if(!r||!A.publicRoot(r.key)) return false;
  if(r.item) return !A.isAngle(r.item)&&!A.isSheet(r.item);
  return !!r.self&&/^r-/.test(st.key); }
function angleSrc(st){ const r=st.rootInfo;
  if(r&&r.item) return A.srcOf(r.item.url||H.itemUrl(r.item),r.item.kind);
  return async()=>{ const u=st.faceUrl||st.face.publicUrl||st.face.preview; if(u) return A.blobFromUrl(u); throw new Error('얼굴 이미지 없음'); }; }
function anglesManual(st,engine){
  if(engine==='higgsfield') return makeAnglesHiggsfield(st);
  if(!A) return;
  ensureRoot(st).then(r=>{
    if(r.face&&!r.self){ toast('원본 얼굴 페이지에서 만들 수 있어요','err'); return; }
    if(r.item&&(A.isAngle(r.item)||A.isSheet(r.item))){ toast('이 이미지에는 만들지 않아요','err'); return; }
    const f=angleFound(st), full=ANG.every(a=>f[a.id]);
    A.run({key:r.key,getSrc:angleSrc(st),manual:true,force:full,from:'view'}).then(x=>{ if(x&&x.state==='failed') toast(x.text||x.quiet,'err'); else if(x&&x.justDone) toast('일관성 참고 이미지를 만들었습니다 — 누구나 무료로 내려받을 수 있습니다','ok'); });
  });
}
/* 유료(힉스필드 Qwen Image 3 편집 · 1K · 3:4): 빠진 각도(없으면 4장 전부)를 각각 1번씩 요청. 확인 창 필수 */
async function makeAnglesHiggsfield(st){
  if(!A) return;
  if(!H.getKey()){ toast('먼저 내 Higgsfield 키를 저장하세요 (유료)','err'); const i=st.root&&st.root.querySelector('.fhf-key input'); if(i) i.focus(); return; }
  const r=await ensureRoot(st);
  if(r.face&&!r.self){ toast('원본 얼굴 페이지에서 만들 수 있어요','err'); return; }
  const f=angleFound(st), missing=ANG.filter(a=>!f[a.id]), list=missing.length?missing:ANG;
  const m=H.modelById('qwen-image-3');
  if(!confirm('일관성 참고 이미지 '+list.length+'장('+list.map(a=>a.ko).join('·')+')을 힉스필드 '+m.label+' 편집(1K · 3:4)으로 만듭니다.\n요청 '+list.length+'번 — 내 Higgsfield 키의 크레딧이 사용됩니다. 계속할까요?')) return;
  let src;
  try{ if(!r.item||(st.item&&r.item.id===st.item.id)) src=await ensureFaceUrl(st);
       else src=r.item.kind==='video'?await H.frameUrl(r.item.url,'first'):r.item.url; }
  catch(e){ toast('원본 준비 실패: '+e.message,'err'); return; }
  list.forEach(a=>{ let req; try{ req=H.buildRequest(m,A.promptFor(a.id),{ref:[{url:src}]},H.fixSettings(m,{ar:'3:4',res:'1k'})); }catch(e){ toast(e.message,'err'); return; }
    const run={id:H.uid(),faceKey:st.key,attachKey:r.key,angle:a.id,createdAt:Date.now(),kind:'image',model:m.id,modelLabel:m.label,prompt:A.TITLE(a),endpoint:req.path,input:src,status:'pending',ar:'3:4'};
    allRuns.unshift(run); persistRuns(); submit(st,run,req.body); });
  drawGallery(st); scrollGal(st);
}
function scrollGal(st){ const g=st.root&&st.root.querySelector('.fhf-gal'); if(g&&g.scrollIntoView) try{ g.scrollIntoView({behavior:'smooth',block:'nearest'}); }catch(e){} }
/* 이번 생성에 넣을 참고: 다중 참고 모델 → 원본 + 켜진 각도(모델 최대까지, 원본→정면→왼쪽→오른쪽→뒷모습), 1장 모델 → 고른 1장(기본 원본), 영상 → 시작 프레임 1장 */
function refPlan(st,m){
  const f=angleFound(st), avail=ANG.filter(a=>f[a.id]);
  const orig={id:'orig',url:st.faceUrl,label:'원본'+(st.mode==='media'?(st.item&&st.item.kind==='video'?'(첫 장면)':''):'(얼굴 사진)')};
  const pickOf=k=>{ const id=(st.angPick||{})[k]; return id&&id!=='orig'&&f[id]?{id,url:f[id].url,label:ANGLE_KO[id]}:orig; };
  if(m.kind==='image'){
    const cap=m.roles.ref||0; const off=st.angOff||{};
    if(cap>1){ const all=[orig].concat(avail.filter(a=>!off[a.id]).map(a=>({id:a.id,url:f[a.id].url,label:a.ko}))); return {multi:true,cap,list:all.slice(0,cap),all,avail}; }
    return {multi:false,cap,list:[pickOf('image')],avail};
  }
  if(st.start) return {video:true,custom:true,start:{id:'custom',url:st.start.url,label:st.start.label||'선택한 이미지'},avail};
  return {video:true,start:pickOf('video'),avail};
}
async function submit(st,r,body){
  try{ const q=await H.hfSubmit(r.endpoint,body); r.requestId=q.request_id; r.submittedAt=Date.now(); persistRuns(); await follow(st,r); }
  catch(e){ fail(st,r,e.message); }
}
async function follow(st,r){
  if(polling.has(r.id)) return; polling.add(r.id);
  try{
    const res=await H.waitForResult(r.requestId,r.submittedAt||r.createdAt,{onPhase:ph=>{ r.phase=ph; updatePhase(st,r); }});
    const title='['+r.modelLabel+'] '+r.prompt;
    const outs=res.urls.map((u,i)=>{ if(i===0){ Object.assign(r,{status:'done',url:u,kind:res.kind,share:'pending'}); return r; }
      const c=Object.assign({},r,{id:H.uid(),url:u,kind:res.kind,status:'done',share:'pending',createdAt:r.createdAt-i}); allRuns.splice(allRuns.indexOf(r)+i,0,c); return c; });
    persistRuns(); redraw(st);
    for(const o of outs) await share(st,o,title);
  }catch(e){ fail(st,r,e.message); }
  finally{ polling.delete(r.id); }
}
async function share(st,r,title){
  if(!H.shared){ r.share='off'; persistRuns(); redraw(st); return; }
  try{ const res=await H.shareResult({url:r.url,kind:r.kind,title,faceKey:r.attachKey||st.key}); if(r.angle&&A) A.refresh(r.attachKey);
    r.share=res.share; await loadNew(st); r.status='gone'; persistRuns();
    toast(res.share==='done'?(st.mode==='media'?'완성! 원본 아래 「이 작품에서 이어진 작품」과 홈 공개 갤러리에 저장했습니다':'완성! 「이 얼굴로 만든 작품」과 홈 공개 갤러리에 저장했습니다'):'파일 복사 실패('+res.why+') — 원본 링크로 저장했습니다(약 7일 후 만료)',res.share==='done'?'ok':'err'); }
  catch(e){ r.share='failed'; r.shareErr=e.why||e.message; persistRuns(); toast('갤러리 저장 실패: '+r.shareErr+' — 아래 결과에서 바로 내려받으세요','err'); }
  redraw(st);
}
function fail(st,r,msg){ r.status='failed'; r.error=msg; persistRuns(); redraw(st); }
function resume(st){
  runsOf(st).forEach(r=>{
    if(r.engine&&r.engine!=='higgsfield'){ r.status='gone'; persistRuns(); }   /* 예전 버튼식 무료 시트 기록 → 이제 상태 영역이 담당 */
    else if(r.status==='pending'&&!polling.has(r.id)){
      if(r.requestId&&H.getKey()&&Date.now()-(r.submittedAt||r.createdAt)<H.DEADLINE_MS) follow(st,r);
      else fail(st,r,'페이지를 떠나 확인이 중단됨 (Higgsfield 기록에서 확인하세요)');
    } else if(r.status==='done'&&r.share==='pending'&&!polling.has(r.id)){ polling.add(r.id); share(st,r,'['+r.modelLabel+'] '+r.prompt).finally(()=>polling.delete(r.id)); }
  });
}
function useAsStart(st,url,label){ st.start={url,label:label||null}; st.tab='video'; drawForm(st); const f=st.root&&st.root.querySelector('.fhf-form'); if(f){ try{ f.scrollIntoView({behavior:'smooth',block:'center'}); }catch(e){} const t=f.querySelector('textarea'); if(t) setTimeout(()=>t.focus(),250); } toast('시작 프레임으로 넣었습니다. 영상 프롬프트를 쓰고 「영상 만들기」를 누르세요','ok'); }
/* 「참고로 사용」: 이미지 → 영상 시작 프레임, 영상 → 마지막 장면을 추출해 시작 프레임(이어서 만들기) */
async function useItem(st,x,btn){
  if(x.kind!=='video'){ useAsStart(st,x.url,'선택한 작품 이미지'); return; }
  if(btn){ btn.disabled=true; btn.textContent='장면 추출 중…'; }
  try{ const u=await H.frameUrl(x.url,'last'); useAsStart(st,u,'선택한 영상의 마지막 장면'); }
  catch(e){ toast('장면 추출 실패: '+e.message,'err'); }
  finally{ if(btn&&btn.isConnected){ btn.disabled=false; btn.textContent='참고로 사용'; } }
}
/* 소유자 삭제 (행 + 파일) */
async function removeItem(st,x,btn){
  if(!confirm('이 작품을 삭제할까요?\n목록과 저장된 파일이 완전히 지워지며 되돌릴 수 없습니다.')) return;
  if(btn) btn.disabled=true;
  try{ const r=await H.deleteItem(x); st.items=st.items.filter(y=>y.id!==x.id); st.ids.delete(x.id); redraw(st);
    toast(r.fileOk?'삭제했습니다':'목록에서 삭제했습니다 (파일 정리는 운영자가 합니다)',r.fileOk?'ok':'err'); }
  catch(e){ if(btn) btn.disabled=false; toast(e.message,'err'); }
}
/* 이 얼굴에 이미지·영상 올리기 (face 태그) */
const LS_TERMS='lukehf.terms';
async function uploadFiles(st,files){
  const list=[...(files||[])].slice(0,10); if(!list.length) return;
  if(!H.shared){ toast('공유 저장소가 설정되지 않았습니다','err'); return; }
  let agreed=false; try{ agreed=localStorage.getItem(LS_TERMS)==='1'; }catch(e){}
  if(!agreed){ if(!confirm('올린 파일은 lukemodel.com 방문자 모두가 보고 내려받을 수 있습니다.\n내가 권리를 가진 콘텐츠만 올리며, 불법·성적 콘텐츠나 타인의 얼굴·개인정보를 동의 없이 올리지 않는 데 동의합니까?')) return; try{ localStorage.setItem(LS_TERMS,'1'); }catch(e){} }
  st.uploading={i:0,n:list.length}; redraw(st);
  let ok=0; const errs=[];
  for(const f of list){ st.uploading.i++; redraw(st);
    try{ await H.publish(f,(st.face.name||'얼굴')+' · 업로드','upload',st.key); ok++; }catch(e){ errs.push((f.name||'파일')+': '+e.message); } }
  st.uploading=null; await loadNew(st); redraw(st);
  toast(ok+'개 올렸습니다'+(errs.length?' · 실패 '+errs.length+'개 — '+errs[0]:''),errs.length?'err':'ok');
}

/* ── 그리기 ── */
function redraw(st){ if(!alive(st)) return; drawGallery(st); }
function drawKey(st){
  const box=st.root.querySelector('.fhf-key'); box.textContent='';
  if(H.getKey()&&!st.editKey){ box.append(el('span',{class:'ok',text:'✓ 내 Higgsfield 키 사용 중 (유료 이미지·영상 만들기용 · 이 브라우저에 저장됨)'}),el('button',{class:'lnk',type:'button',text:'키 변경',onclick:()=>{ st.editKey=true; drawKey(st); }})); return; }
  const inp=el('input',{class:'inp',type:'password',placeholder:'key-id:key-secret',autocomplete:'off',spellcheck:'false','aria-label':'Higgsfield API 키'}); inp.value=H.getKey();
  const save=()=>{ const v=inp.value.trim(); if(v&&!H.validKey(v)){ toast('형식: key-id:key-secret','err'); return; } H.setKey(v); st.editKey=false; drawKey(st); resume(st); toast(v?'키를 저장했습니다 (이 브라우저에만)':'키를 지웠습니다','ok'); };
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') save(); });
  box.append(el('div',{class:'t'},el('b',{text:'Higgsfield 키 (선택) — '}),'아래 「이미지·영상 만들기」(유료)에만 필요합니다. 정면·왼쪽·오른쪽·뒷모습 일관성 참고 이미지는 키 없이 자동으로 무료 생성됩니다. 키는 이 브라우저에만 저장되고 platform.higgsfield.ai로만 전송되며, 비용은 키 주인 계정에서 차감됩니다.'),
    el('div',{class:'row'},inp,el('button',{class:'btn sm',type:'button',text:'저장',onclick:save}),H.getKey()?el('button',{class:'btn ghost sm',type:'button',text:'취소',onclick:()=>{ st.editKey=false; drawKey(st); }}):null),
    el('a',{href:'https://cloud.higgsfield.ai/',target:'_blank',rel:'noopener',class:'lnk',text:'키 발급 (Higgsfield Cloud) ↗'}));
}
function drawStatus(st){
  if(!alive(st)) return; const box=st.root.querySelector('.fhf-face'); box.textContent='';
  const vid=st.mode==='media'&&st.item&&st.item.kind==='video';
  const txt=st.mode==='media'
    ?(st.faceState==='ready'?(vid?'영상의 첫 장면 준비됨 — 생성할 때 자동으로 함께 보냅니다':'원본 이미지 준비됨 — 모든 생성에 자동으로 함께 보냅니다 (같은 인물·스타일 유지)'):st.faceState==='uploading'?'영상의 첫 장면을 뽑아 올리는 중… (한 번만)':st.faceState==='error'?'원본 준비 실패: '+(st.faceErr||''):'영상의 첫 장면을 생성할 때 한 번 뽑아 시작 프레임·참고 이미지로 씁니다')
    :(st.faceState==='ready'?'얼굴 사진 준비됨 — 모든 생성에 자동으로 함께 보냅니다':st.faceState==='uploading'?'얼굴 사진을 공개 저장소에 올리는 중… (한 번만)':st.faceState==='error'?'얼굴 사진 준비 실패: '+(st.faceErr||''):'얼굴 사진 준비 전');
  box.append(thumbEl(st.face.preview,st.face.previewKind),el('span',{class:'t '+(st.faceState==='error'?'bad':st.faceState==='ready'?'good':'')},txt));
  if(st.faceState==='error') box.append(el('button',{class:'btn ghost sm',type:'button',text:'다시 시도',onclick:()=>ensureFaceUrl(st).catch(()=>{})}));
  drawAngles(st);
}
function drawAngles(st){
  if(!alive(st)) return; const box=st.root.querySelector('.fhf-angles'); if(!box) return; box.textContent='';
  if(!A){ box.hidden=true; return; } box.hidden=false;
  const r=st.rootInfo, key=rootKey(st), s0=(r&&A.stateOf(key))||{state:'loading',angles:{}};
  const auto=r?angleAuto(st):true, faceRoot=!!(r&&r.face&&!r.self), inh=!!(r&&st.mode==='media'&&r.key!==st.key);
  box.append(el('div',{class:'hd'},el('span',{class:'ic',text:'🧍'}),el('b',{text:'일관성 참고 이미지'}),el('span',{class:'tag',text:auto?'자동 · 무료':'무료'}),
    inh?el('small',{class:'inh',text:faceRoot?'원본 얼굴 기준':'원본 작품 기준'}):null));
  const open=window.LukeOpenMedia;
  const grid=el('div',{class:'fhf-ang'});
  ANG.forEach(a=>{ const v=(s0.angles||{})[a.id]||{state:s0.state==='loading'||s0.state==='checking'||s0.state==='queued'?'loading':'wait'};
    const t=el('div',{class:'fhf-ang-t st-'+v.state,'data-angle':a.id});
    const src=v.item?v.item.url:v.state==='local'?v.url:null;
    if(src){ const im=el('img',{src,alt:a.ko+' 참고 이미지',loading:'lazy',decoding:'async',referrerpolicy:'no-referrer'}); if(v.item&&open){ im.style.cursor='zoom-in'; im.addEventListener('click',()=>open(v.item)); } t.appendChild(im); }
    else t.appendChild(el('div',{class:'ph2'},el('span',{text:v.state==='running'?(v.phase||'생성 중…'):v.state==='loading'?'확인 중…':v.state==='elsewhere'?'다른 탭에서 생성 중':'대기'})));
    const stTxt=src?(v.state==='local'?'저장 실패':'완료'):v.state==='running'?'생성 중':v.state==='loading'?'':'대기';
    t.appendChild(el('div',{class:'lb'},el('b',{text:a.ko}),stTxt?el('span',{class:'s',text:stTxt}):null));
    if(src) t.appendChild(el('div',{class:'ab'},
      el('button',{class:'fhf-ang-dl',type:'button',title:'다운로드','aria-label':a.ko+' 다운로드',text:'⤓',onclick:()=>H.download(v.item?Object.assign({},v.item,{model:'angle-'+a.id}):{blob:v.blob,kind:'image',model:'angle-'+a.id})}),
      v.item&&open?el('button',{class:'fhf-ang-open',type:'button',title:'크게 보기','aria-label':a.ko+' 크게 보기',text:'⤢',onclick:()=>open(v.item)}):null));
    grid.appendChild(t); });
  box.appendChild(grid);
  const found=s0.found||{}, nDone=ANG.filter(a=>found[a.id]).length, busy=s0.state==='running'||s0.state==='checking';
  const note=s0.state==='running'?'자동 생성 중… 무료 GPU로 한 장씩 차례로 만들어요 (다른 작업을 계속해도 됩니다)'
    :(s0.state==='failed'||s0.state==='cooldown')?(s0.manual?(s0.text||s0.quiet):(s0.quiet||A.QUIET.error))
    :s0.state==='manual'||(r&&!auto&&!faceRoot&&nDone<4&&!A.publicRoot(key))?'내 기기에만 있는 얼굴일 수 있어 자동으로 만들지 않아요. 원하면 「무료로 만들기」를 누르세요 (결과는 공개 갤러리에 올라갑니다).'
    :faceRoot&&nDone<4?'원본 얼굴 페이지를 열면 자동으로 만들어져요.'
    :nDone?'이미지·영상을 만들 때 자동으로 참고 이미지로 들어가요 · 누구나 무료로 내려받을 수 있어요':'';
  if(note) box.appendChild(el('small',{class:'fhf-ang-note',text:note}));
  const tok=A.hfToken();
  box.appendChild(el('div',{class:'more'},
    faceRoot?null:el('button',{class:'lnk fhf-ang-again',type:'button',disabled:busy?true:null,text:nDone===4?'다시 만들기 (무료)':'무료로 만들기',onclick:()=>anglesManual(st,'hf')}),
    faceRoot?null:el('button',{class:'lnk fhf-ang-paid',type:'button',disabled:busy?true:null,text:'힉스필드(유료)로 만들기',onclick:()=>anglesManual(st,'higgsfield')}),
    el('button',{class:'lnk fhf-hftok-open',type:'button',text:tok?'✓ 내 허깅페이스 토큰 사용 중':'+ 허깅페이스 토큰 (선택 · 하루 5분)',onclick:()=>{ st.hfTok=!st.hfTok; drawAngles(st); }})));
  if(st.hfTok){ const inp=el('input',{class:'inp',type:'password',placeholder:'hf_… (읽기/Inference 전용 토큰)',autocomplete:'off',spellcheck:'false','aria-label':'허깅페이스 토큰'}); inp.value=tok;
    const save=()=>{ const v=inp.value.trim(); if(v&&!/^hf_[A-Za-z0-9]{20,}$/.test(v)){ toast('hf_ 로 시작하는 토큰을 넣으세요','err'); return; } A.setHfToken(v); st.hfTok=false; drawAngles(st); toast(v?'허깅페이스 토큰을 저장했습니다 (이 브라우저에만, 허깅페이스로만 전송)':'토큰을 지웠습니다','ok'); };
    box.appendChild(el('div',{class:'fhf-hftok'},inp,el('button',{class:'btn sm',type:'button',text:'저장',onclick:save}),el('a',{class:'lnk',href:'https://huggingface.co/settings/tokens',target:'_blank',rel:'noopener',text:'토큰 만들기 ↗'}))); }
}
/* 이미지·영상 폼의 「일관성 참고」 줄 (자동 첨부 내용 + 켜고 끄기 / 1장 모델·영상은 고르기) */
function drawCons(st){
  if(!alive(st)) return; const box=st.root.querySelector('.fhf-cons'); if(!box) return; box.textContent='';
  if(!A){ box.hidden=true; return; }
  const kind=st.tab, m=H.modelById(kind==='image'?prefs.img:prefs.vid), plan=refPlan(st,m);
  const chip=(id,label,on,cls,click,dis)=>el('button',{type:'button',class:'fhf-cons-chip'+(on?' on':'')+(cls?' '+cls:''),'data-angle':id,'aria-pressed':String(!!on),disabled:dis?true:null,text:label,onclick:click});
  if(kind==='image'&&plan.multi){
    const used=plan.list.map(x=>x.label);
    box.append(el('div',{class:'ln'},el('b',{text:'일관성 참고: '}),used.length>1?used[0]+' + '+used.slice(1).join('·')+' ('+used.length+'장) 자동 첨부':'원본 1장 자동 첨부',el('small',{text:' · 이 모델 최대 '+plan.cap+'장'})));
    if(plan.avail.length) box.append(el('div',{class:'chips'},chip('orig','원본',true,'fixed',null,true),...plan.avail.map(a=>{ const on=!(st.angOff||{})[a.id], over=on&&!plan.list.some(x=>x.id===a.id);
      return chip(a.id,a.ko+(over?' (초과)':''),on&&!over,over?'over':'',()=>{ st.angOff=Object.assign({},st.angOff,{[a.id]:on}); drawCons(st); }); })));
    else box.append(el('small',{text:'정면·왼쪽·오른쪽·뒷모습 참고 이미지가 준비되면 자동으로 함께 들어가요.'}));
    return; }
  const k=kind==='image'?'image':'video', cur=kind==='image'?plan.list[0]:plan.start;
  if(kind==='video'&&plan.custom){ box.append(el('div',{class:'ln'},el('b',{text:'일관성 참고: '}),'시작 프레임 = '+cur.label,el('small',{text:' · 영상 모델은 참고 이미지를 추가로 받지 않아요'}))); return; }
  box.append(el('div',{class:'ln'},el('b',{text:kind==='image'?'일관성 참고: ':'시작 프레임: '}),cur.label+(kind==='image'?' 1장 자동 첨부':''),
    el('small',{text:kind==='image'?' · 이 모델('+m.label+')은 참고 이미지 1장만 받아요 — 여러 장은 Qwen Image 3 / Grok Imagine 2.0':' · 영상 모델은 시작 프레임 1장만 받아요'})));
  if(kind==='image'&&/^soul/.test(m.id)) box.append(el('div',{class:'fhf-soul-warn',role:'note'},'⚠ Soul은 얼굴 유지가 약해요 — 같은 사람이 필요하면 ',
    el('button',{type:'button',class:'lnk fhf-soul-switch',text:'Qwen Image 3로 바꾸기',onclick:()=>{ prefs.img='qwen-image-3'; prefs.imgPicked=true; savePrefs(); drawForm(st); }})));
  if(plan.avail.length) box.append(el('div',{class:'chips',role:'radiogroup'},chip('orig','원본',cur.id==='orig','',()=>{ st.angPick=Object.assign({},st.angPick,{[k]:'orig'}); drawCons(st); }),
    ...plan.avail.map(a=>chip(a.id,a.ko,cur.id===a.id,'',()=>{ st.angPick=Object.assign({},st.angPick,{[k]:a.id}); drawCons(st); }))));
}
/* 작은 미리보기: 이미지는 배경, 영상은 첫 장면 */
function thumbEl(url,kind){ if(kind==='video'){ const v=el('video',{class:'th',src:String(url||'')+'#t=0.1',muted:true,playsinline:true,preload:'metadata'}); v.muted=true; return v; }
  return el('span',{class:'th',style:'background-image:url("'+String(url||'').replace(/"/g,'%22')+'")'}); }
function selChip(label,values,cur,fmt,on){ const s=el('select',{'aria-label':label}); values.forEach(v=>{ const o=el('option',{value:String(v),text:fmt?fmt(v):String(v)}); if(String(v)===String(cur)) o.selected=true; s.appendChild(o); }); s.onchange=()=>on(s.value); return el('label',{class:'fhf-chip'},el('span',{text:label}),s); }
function drawForm(st){
  if(!alive(st)) return; const box=st.root.querySelector('.fhf-form'); box.textContent='';
  const kind=st.tab, busy=st.faceState==='uploading';
  box.appendChild(el('div',{class:'fhf-tabs',role:'tablist'},...[['image','이미지 만들기'],['video','영상 만들기']].map(([k,l])=>el('button',{type:'button',role:'tab','aria-selected':String(kind===k),class:kind===k?'on':'',text:l,onclick:()=>{ st.tab=k; drawForm(st); }}))));
  const m=H.modelById(kind==='image'?prefs.img:prefs.vid), s=settingsFor(m);
  if(kind==='video'){
    const med=st.mode==='media', vsrc=med&&st.item&&st.item.kind==='video';
    const baseLabel=med?(vsrc?'이 영상의 첫 장면':'이 이미지'):'이 얼굴 사진';
    box.appendChild(el('div',{class:'fhf-start'},st.start?thumbEl(st.start.url,'image'):thumbEl(st.face.preview,st.face.previewKind),
      el('span',{class:'t'},el('b',{text:'시작 프레임: '}),st.start?(st.start.label||'이 페이지에서 만든 이미지'):baseLabel,el('br'),el('small',{text:med?'첫 장면을 이 이미지로 고정해 같은 인물·장면이 이어서 움직이게 합니다.':'첫 장면을 이 이미지로 고정해 같은 사람이 움직이게 합니다.'})),
      vsrc&&!st.start?el('button',{class:'btn ghost sm fhf-last',type:'button',text:'마지막 장면에서 이어서',onclick:e=>useItem(st,st.item,e.currentTarget)}):null,
      st.start?el('button',{class:'btn ghost sm',type:'button',text:baseLabel+'(으)로 되돌리기',onclick:()=>{ st.start=null; drawForm(st); }}):null));
  } else {
    box.appendChild(el('div',{class:'fhf-hint',text:(st.mode==='media'?(st.item&&st.item.kind==='video'?'이 영상의 첫 장면을':'이 이미지를'):'이 얼굴 사진을')+' 참고 이미지로 자동 첨부합니다 ('+(m.id.startsWith('soul')?'Soul Reference: image_reference_url':m.id==='ideogram-4'?'Ideogram: image_url + 참고 강도':'Qwen 편집: image_urls')+').'}));
  }
  box.appendChild(el('div',{class:'fhf-cons'})); setTimeout(()=>drawCons(st),0);
  const ta=el('textarea',{class:'inp',rows:'3',placeholder:kind==='image'?'예) 한강 공원 벤치에 앉아 웃고 있는 모습, 오후 햇살, 필름 사진 느낌':'예) 카메라를 보며 천천히 미소 짓고 고개를 살짝 돌린다, 부드러운 바람, 시네마틱','aria-label':kind==='image'?'이미지 프롬프트':'영상 프롬프트'});
  ta.value=st.prompt[kind]||''; ta.addEventListener('input',()=>{ st.prompt[kind]=ta.value; });
  ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); generate(st,kind); } });
  box.appendChild(ta);
  const row=el('div',{class:'fhf-row'});
  const list=kind==='image'?IMG_MODELS:VID_MODELS;
  row.appendChild(selChip('모델',list.map(x=>x.id),m.id,id=>H.modelById(id).label,v=>{ if(kind==='image'){ prefs.img=v; prefs.imgPicked=true; } else prefs.vid=v; savePrefs(); drawForm(st); }));
  if(kind==='image'&&m.s.ar) row.appendChild(selChip('화면비',m.s.ar,s.ar,null,v=>setSetting(m,'ar',v)));
  if(kind==='video'&&m.s.dur) row.appendChild(selChip('길이',m.s.dur,s.dur,v=>v+'초',v=>setSetting(m,'dur',v)));
  if(m.s.res) row.appendChild(selChip('해상도',m.s.res,s.res,null,v=>setSetting(m,'res',v)));
  if(m.s.weight) row.appendChild(selChip('참고 강도',m.s.weight,s.weight,null,v=>setSetting(m,'weight',v)));
  if(kind==='image') row.appendChild(selChip('개수',m.s.batchNative?[1,4]:[1,2,3,4],s.batch,v=>v+'장',v=>setSetting(m,'batch',+v)));
  if(m.s.audio){ const cb=el('input',{type:'checkbox'}); cb.checked=!!s.audio; cb.onchange=()=>setSetting(m,'audio',cb.checked); row.appendChild(el('label',{class:'fhf-chip'},cb,el('span',{text:'소리'}))); }
  row.appendChild(el('span',{class:'sp'}));
  row.appendChild(el('button',{class:'btn fhf-go',type:'button',disabled:busy&&(kind==='image'||!st.start)?true:null,text:busy&&(kind==='image'||!st.start)?(st.mode==='media'?'원본 준비 중…':'얼굴 사진 올리는 중…'):(kind==='image'?'이미지 만들기':'영상 만들기'),onclick:()=>generate(st,kind)}));
  box.appendChild(row);
}
function mediaEl(url,kind,alt){
  if(kind==='video'){ const v=el('video',{src:url+'#t=0.1',muted:true,loop:true,playsinline:true,preload:'metadata',controls:true}); v.muted=true; return v; }
  return el('img',{src:url,alt:alt||'',loading:'lazy',decoding:'async',referrerpolicy:'no-referrer'});
}
function tileRun(st,r){
  const t=el('div',{class:'fhf-tile'+(r.sheet?' wide':''),'data-run':r.id});
  if(r.status==='pending'){ t.append(el('div',{class:'ph',style:r.sheet?'aspect-ratio:16/9':null},el('b',{text:r.modelLabel}),el('span',{class:'phase',text:phaseText(r)}),el('small',{text:r.prompt.slice(0,80)}))); return t; }
  if(r.status==='failed'){ const gone=()=>{ r.status='gone'; persistRuns(); redraw(st); };
    t.append(el('div',{class:'fl'},el('b',{text:'실패 · '+r.modelLabel}),el('span',{text:r.error||''}),el('small',{text:r.prompt.slice(0,100)}),
    el('div',{class:'acts'},
      el('button',{class:'btn ghost sm',type:'button',text:'지우기',onclick:gone})))); return t; }
  /* 완성됐지만 아직 갤러리 저장 전/실패 */
  t.appendChild(mediaEl(r.url,r.kind,r.prompt));
  t.appendChild(el('span',{class:'bd',text:r.kind==='video'?'VIDEO':r.sheet?'캐릭터 시트':'IMAGE'}));
  const note=r.share==='pending'?'갤러리에 저장하는 중…':r.share==='failed'?'갤러리 저장 실패 — 지금 내려받으세요 (원본은 약 7일 보관)':'이 기기에서만 보임';
  t.appendChild(el('div',{class:'cap'},el('span',{class:'t',text:note}),el('div',{class:'acts'},
    el('button',{class:'btn sm',type:'button',text:'⤓ 다운로드',onclick:()=>H.download({url:r.url,kind:r.kind,model:r.model,createdAt:r.createdAt})}),
    r.kind==='image'?el('button',{class:'btn ghost sm',type:'button',text:'이 결과로 영상 만들기',onclick:()=>useAsStart(st,r.url)}):null,
    r.share==='failed'?el('button',{class:'btn ghost sm',type:'button',text:'다시 저장',onclick:()=>share(st,r,'['+r.modelLabel+'] '+r.prompt)}):null)));
  return t;
}
function tileItem(st,x){
  const t=el('div',{class:'fhf-tile'+(/캐릭터 시트/.test(x.title||'')?' wide':''),'data-id':x.id});
  const open=window.LukeOpenMedia;
  const m=mediaEl(x.url,x.kind,H.displayTitle(x.title)); if(x.kind!=='video'){ m.style.cursor='zoom-in'; m.addEventListener('click',()=>open?open(x):window.open(x.url,'_blank','noopener')); }
  t.appendChild(m);
  t.appendChild(el('span',{class:'bd',text:x.kind==='video'?'VIDEO':/캐릭터 시트/.test(x.title||'')?'캐릭터 시트':'IMAGE'}));
  const depth=st.mode==='media'&&x._depth?el('small',{class:'dep',text:x._depth===1?'↳ 이 작품에서 바로':'↳ 파생의 파생 · '+x._depth+'단계'}):null;
  t.appendChild(el('div',{class:'cap'},el('span',{class:'t',text:H.displayTitle(x.title)||'힉스필드 결과'}),depth,el('small',{text:new Date(x.created_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}),
    el('div',{class:'acts'},el('button',{class:'btn sm fhf-dl',type:'button',text:'⤓ 다운로드',onclick:()=>H.download(Object.assign({},x,{model:'face-'+st.key}))}),
      el('button',{class:'btn ghost sm fhf-use',type:'button',text:'참고로 사용',title:x.kind==='video'?'이 영상의 마지막 장면을 시작 프레임으로 넣어 이어서 영상 만들기':'이 이미지를 시작 프레임으로 넣어 영상 만들기',onclick:e=>useItem(st,x,e.currentTarget)}),
      open?el('button',{class:'btn ghost sm fhf-open',type:'button',text:'이어서 만들기 ›',title:'이 작품 페이지에서 이 작품을 원본으로 이미지·영상 만들기',onclick:()=>open(x)}):null,
      H.canDelete&&H.canDelete(x)?el('button',{class:'btn ghost sm fhf-del',type:'button',text:'삭제',title:'내가 올리거나 만든 작품 삭제',onclick:e=>removeItem(st,x,e.currentTarget)}):null)));
  return t;
}
function drawGallery(st){
  if(!alive(st)) return; const box=st.root.querySelector('.fhf-gal'); box.textContent='';
  const runs=runsOf(st);
  const fin=el('input',{type:'file',accept:'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime',multiple:true,hidden:true,class:'fhf-file','aria-label':'이 얼굴에 올릴 파일'});
  fin.addEventListener('change',()=>{ const fs=[...fin.files]; fin.value=''; uploadFiles(st,fs); });
  const chip=window.LukeAuth&&window.LukeAuth.chip?window.LukeAuth.chip():null;
  const med=st.mode==='media';
  box.appendChild(el('div',{class:'fhf-ghead'},el('h3',{text:med?'이 작품에서 이어진 작품 · 최신순':'이 얼굴의 작품 · 최신순'}),el('span',{class:'cnt',text:(()=>{ const n=st.items.filter(x=>!(A&&A.isAngle(x))).length; return n?(n+(st.done?'개':'개+')):''; })()}),el('span',{class:'sp'}),chip,
    H.shared?el('button',{class:'btn sm fhf-up',type:'button',disabled:st.uploading?true:null,text:st.uploading?('올리는 중 '+st.uploading.i+'/'+st.uploading.n+'…'):(med?'+ 여기에 이어 올리기':'+ 이 얼굴에 올리기'),title:'이미지(≤'+Math.round(H.MAX_IMG/1048576)+'MB)·영상(≤'+Math.round(H.MAX_VID/1048576)+'MB)을 '+(med?'이 작품에서 이어진 작품':'이 얼굴 작품')+'으로 공개 등록',onclick:()=>fin.click()}):null,fin,
    el('button',{class:'btn ghost sm',type:'button',text:st.loading?'불러오는 중…':'새로고침',disabled:st.loading?true:null,onclick:()=>loadFirst(st)})));
  const grid=el('div',{class:'fhf-grid'});
  runs.forEach(r=>grid.appendChild(tileRun(st,r)));
  const shown=st.items.filter(x=>!(A&&A.isAngle(x)));
  shown.forEach(x=>grid.appendChild(tileItem(st,x)));
  box.appendChild(grid);
  if(!runs.length&&!shown.length) box.appendChild(el('div',{class:'fhf-empty',text:st.loading?'불러오는 중…':st.err?('불러오지 못했습니다: '+st.err):(med?'아직 이 작품에서 이어 만든 작품이 없습니다. 위에서 첫 이미지나 영상을 만들어 보세요 — 결과가 여기 최신순으로 붙습니다.':'아직 이 얼굴로 만든 작품이 없습니다. 위에서 첫 이미지나 영상을 만들어 보세요.')}));
  else if(st.err) box.appendChild(el('div',{class:'fhf-empty',text:'불러오지 못했습니다: '+st.err}));
  if(st.items.length&&!st.done){ const mb=el('div',{class:'fhf-more',style:'text-align:center;margin-top:10px'},el('button',{class:'btn ghost sm',type:'button',text:st.loading?'불러오는 중…':'더 보기',disabled:st.loading?true:null,onclick:()=>loadMore(st)})); box.appendChild(mb);
    /* 끝까지 스크롤하면 자동으로 다음 페이지 (버튼은 백업) */
    if('IntersectionObserver' in window&&!st.err){ if(st.moreIO) st.moreIO.disconnect(); st.moreIO=new IntersectionObserver(es=>{ if(es.some(e=>e.isIntersecting)&&!st.loading&&!st.done) loadMore(st); },{rootMargin:'400px 0px'}); st.moreIO.observe(mb); } }
}
function phaseText(r){ if(r.engine&&r.engine!=='higgsfield') return r.phase||'준비 중…'; return r.phase==='in_progress'?'생성 중…':r.requestId?'대기열…':'요청 보내는 중…'; }
function updatePhase(st,r){ if(!alive(st)) return; const p=st.root.querySelector('.fhf-tile[data-run="'+r.id+'"] .phase'); if(p) p.textContent=phaseText(r); }

const CSS=`.fhf{border:1px solid var(--acc);border-radius:14px;background:rgba(79,124,255,.06);padding:16px;margin:4px 0 26px}
.fhf h2{font-size:16px;font-weight:800;color:var(--tx);margin:0 0 4px;letter-spacing:0}
.fhf .sub{font-size:12.8px;color:var(--dim);line-height:1.6;margin-bottom:12px}
.fhf .lnk{background:none;border:0;color:var(--acc);font-size:12.5px;cursor:pointer;text-decoration:underline;padding:0}
.fhf-key{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:12.8px;color:var(--dim);line-height:1.6;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.fhf-key .ok{color:var(--ok)}.fhf-key .t{flex-basis:100%}.fhf-key .row{display:flex;gap:6px;flex:1;min-width:240px}.fhf-key .inp{margin:0;flex:1}
.fhf-face,.fhf-start{display:flex;align-items:center;gap:10px;font-size:12.8px;color:var(--dim);margin-bottom:10px;flex-wrap:wrap}
.fhf-face .th,.fhf-start .th{width:44px;height:44px;border-radius:9px;background:#14171f center/contain no-repeat;flex:none;border:1px solid var(--line);object-fit:contain}
.fhf-tile .dep{color:#9fb4ff}
.fhf-tile.wide{grid-column:1/-1}.fhf-tile.wide img{aspect-ratio:auto 16/9}.fhf-tile.wide .ph,.fhf-tile.wide .fl{aspect-ratio:auto;min-height:190px}
.fhf-angles{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:9px 11px;margin-bottom:12px;font-size:12.5px;color:var(--dim);display:flex;flex-direction:column;gap:7px}
.fhf-angles[hidden]{display:none}.fhf-angles .hd{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.fhf-angles .ic{font-size:16px}.fhf-angles b{color:var(--tx)}.fhf-angles .inh{font-size:11px;color:#9fb4ff}
.fhf-angles .tag{font-size:10.5px;font-weight:800;color:#7de2a8;border:1px solid rgba(125,226,168,.4);border-radius:5px;padding:0 5px}
.fhf-ang{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;max-width:440px}
.fhf-ang-t{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
.fhf-ang-t img,.fhf-ang-t .ph2{display:block;width:100%;height:auto;aspect-ratio:3/4;object-fit:contain;background:#e9eaee}
.fhf-ang-t .ph2{display:flex;align-items:center;justify-content:center;text-align:center;padding:4px;font-size:10.5px;line-height:1.35;color:#8b93a7;background:#171a21}
.fhf-ang-t.st-running .ph2{color:#7de2a8;background:linear-gradient(110deg,#171a21 30%,#232733 50%,#171a21 70%);background-size:200% 100%;animation:fhfsh 1.4s linear infinite}
.fhf-ang-t .lb{display:flex;align-items:baseline;justify-content:space-between;gap:3px;padding:3px 5px 0;font-size:11px}.fhf-ang-t .lb .s{font-size:9.5px;color:#8b93a7}.fhf-ang-t.st-done .lb .s{color:var(--ok)}
.fhf-ang-t .ab{display:flex;gap:3px;padding:3px 4px 4px}.fhf-ang-t .ab button{flex:1;min-width:0;padding:3px 0;border-radius:6px;border:1px solid var(--line);background:var(--panel2);color:var(--tx);font-size:12px;cursor:pointer}
.fhf-angles small{font-size:11.5px;line-height:1.5}
.fhf-angles .more{display:flex;flex-wrap:wrap;gap:4px 14px}.fhf-angles .more .lnk{font-size:11.5px;color:#8b93a7}.fhf-angles .more .lnk:disabled{opacity:.45;cursor:default}
.fhf-soul-warn{margin:6px 0 2px;padding:6px 9px;border-radius:8px;background:rgba(255,176,32,.12);border:1px solid rgba(255,176,32,.35);color:#ffcf7a;font-size:12.5px;line-height:1.45}.fhf-soul-warn .lnk{color:#ffe2a8;font-size:12.5px}
.fhf-cons{margin:-2px 0 8px;font-size:12px;color:var(--dim);display:flex;flex-direction:column;gap:5px}.fhf-cons[hidden]{display:none}.fhf-cons b{color:var(--tx)}.fhf-cons small{color:#8b93a7}
.fhf-cons .chips{display:flex;flex-wrap:wrap;gap:5px}.fhf-cons-chip{padding:4px 9px;border-radius:8px;font-size:11.5px;font-weight:700;color:var(--dim);background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.fhf-cons-chip.on{border-color:#7de2a8;color:#fff;background:rgba(125,226,168,.14)}.fhf-cons-chip.over{opacity:.55}.fhf-cons-chip:disabled{cursor:default}
.fhf-hftok{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.fhf-hftok .inp{flex:1;min-width:180px;margin:0}
.fhf-face .t,.fhf-start .t{flex:1;min-width:160px;line-height:1.5}.fhf-face .good{color:var(--ok)}.fhf-face .bad{color:var(--bad)}
.fhf-start{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:8px 10px}.fhf-start b{color:var(--tx)}
.fhf-tabs{display:flex;gap:6px;margin-bottom:10px}
.fhf-tabs button{padding:8px 14px;border-radius:9px;font-weight:700;font-size:13px;color:var(--dim);background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.fhf-tabs button.on{background:var(--acc);border-color:var(--acc);color:#fff}
.fhf-hint{font-size:12px;color:var(--dim);margin-bottom:8px}
.fhf-form textarea{width:100%;min-height:74px;resize:vertical;margin:0 0 8px;font-size:14px;line-height:1.55}
.fhf-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.fhf-row .sp,.fhf-ghead .sp{flex:1}
.fhf-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:9px;background:var(--panel2);border:1px solid var(--line);font-size:12.5px;color:var(--dim)}
.fhf-chip select{background:transparent;border:0;outline:none;color:var(--tx);font-weight:700;font-size:12.5px;max-width:190px}
.fhf-chip select option{background:#1a1d27}.fhf-chip input{accent-color:var(--acc)}
.fhf-go{padding:9px 18px}
.fhf-gal{margin-top:18px}
.fhf-ghead{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}.fhf-ghead h3{font-size:14px;font-weight:800;margin:0}.fhf-ghead .cnt{font-size:12px;color:var(--dim)}
.fhf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;align-items:start}
.fhf-tile{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:11px;overflow:hidden;display:flex;flex-direction:column}
.fhf-tile img,.fhf-tile video{display:block;width:100%;height:auto;aspect-ratio:auto 3/4;object-fit:contain;background:#14171f}
.fhf-tile .bd{position:absolute;top:7px;left:7px;font-size:10px;font-weight:800;background:rgba(0,0,0,.7);color:#fff;padding:2px 7px;border-radius:5px}
.fhf-tile .cap{padding:8px 9px;display:flex;flex-direction:column;gap:5px;font-size:11.5px;color:var(--dim)}
.fhf-tile .cap .t{color:#cdd2df;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.45}
.fhf-tile .acts{display:flex;flex-wrap:wrap;gap:5px}
.fhf-tile .ph,.fhf-tile .fl{aspect-ratio:3/4;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;padding:14px;text-align:center;font-size:12.5px;color:var(--dim)}
.fhf-tile .ph{background:linear-gradient(110deg,#171a21 30%,#232733 50%,#171a21 70%);background-size:200% 100%;animation:fhfsh 1.4s linear infinite}
.fhf-tile .ph b{color:var(--tx)}.fhf-tile .fl{background:#1a1214;color:#ffb3b3}.fhf-tile small{font-size:11px;color:#8b93a7;word-break:break-word}
@keyframes fhfsh{to{background-position:-200% 0}}
.fhf-empty{font-size:13px;color:var(--dim);padding:14px 2px}
@media(max-width:640px){.fhf{padding:12px}.fhf-grid{grid-template-columns:repeat(2,1fr);gap:8px}.fhf-row .sp{display:none}.fhf-go{width:100%}.fhf-chip select{max-width:150px}}
@media(prefers-reduced-motion:reduce){.fhf-tile .ph,.fhf-ang-t .ph2{animation:none!important}}`;
function ensureCss(){ if(document.getElementById('fhf-css')) return; const s=document.createElement('style'); s.id='fhf-css'; s.textContent=CSS; document.head.appendChild(s); }

/* face: {key, name, preview, publicUrl?, resolve?:async()=>url} */
/* opts: {mode:'media', item:<shared_media 행>} → 작품 페이지 모드 (그 이미지/영상을 원본으로, 결과는 face_id='m-<id>' 로 그 아래에) */
function mount(container,face,opts){
  ensureCss(); opts=opts||{};
  face=Object.assign({},face,{key:H.cleanKey(face.key)});
  const st=stateFor(face,opts), med=st.mode==='media';
  const root=el('section',{class:'fhf',id:med?'mediaHf':'faceHf','aria-label':med?'이 작품으로 이어서 만들기':'이 얼굴로 힉스필드 제작','data-face':st.key},
    el('h2',{text:med?'이 작품으로 이어서 만들기':'이 얼굴로 힉스필드 제작'}),
    el('div',{class:'sub',text:med?(st.item&&st.item.kind==='video'?'이 영상의 첫 장면(또는 마지막 장면)을 시작 프레임으로 넣어 이어지는 영상을 만들거나, 참고 이미지로 넣어 같은 인물의 다른 장면·포즈 이미지를 만듭니다.':'이 이미지를 매번 참고 이미지로 함께 보내 같은 인물의 다른 포즈·장면 이미지를 만들거나, 시작 프레임으로 넣어 영상을 만듭니다.')+' 이미지·영상 만들기는 내 Higgsfield 키(유료)를 쓰며, 완성된 결과는 아래 「이 작품에서 이어진 작품」(최신순)과 홈 공개 갤러리에 저장되어 누구나 보고 내려받을 수 있습니다. 결과에서 또 만든 작품도 여기에 함께 붙습니다.':'이 얼굴 사진을 매번 자동으로 함께 보내 같은 사람으로 이미지와 영상을 만듭니다(내 Higgsfield 키 · 유료). 완성된 결과와 직접 올린 파일은 아래 「이 얼굴의 작품」과 홈 공개 갤러리에 저장되어 누구나 보고 내려받을 수 있습니다. 다른 사람 작품도 「참고로 사용」으로 시작 프레임에 넣어 토큰을 아낄 수 있습니다. 공개되면 안 되는 내용은 만들지 마세요.'}),
    el('div',{class:'fhf-key'}),el('div',{class:'fhf-face'}),el('div',{class:'fhf-angles'}),el('div',{class:'fhf-form'}),el('div',{class:'fhf-gal'}));
  container.appendChild(root); st.root=root; root._fresh=true; setTimeout(()=>{ root._fresh=false; },0);
  drawKey(st); drawStatus(st); drawForm(st); drawGallery(st);
  if(st.faceState==='idle'&&!face.lazy) ensureFaceUrl(st).catch(()=>{});   /* 작품(영상) 모드: 장면 추출·업로드는 생성할 때만 */
  if(!st.loadedAt||Date.now()-st.loadedAt>15000){ if(st.items.length) loadNew(st); else loadFirst(st); }
  resume(st);
  if(A) ensureRoot(st).then(r=>{ if(!alive(st)) return; drawAngles(st);
    A.refresh(r.key).then(()=>{ if(alive(st)){ drawAngles(st); drawCons(st); } });   /* 지금 있는 세트만 읽기 */
    if(angleAuto(st)) A.autoView(r.key,angleSrc(st)); });   /* 한가해진 뒤: 빠진 각도만 차례로 */
  if(!st.timer) st.timer=setInterval(()=>{ if(!alive(st)){ clearInterval(st.timer); st.timer=null; return; } if(!document.hidden) loadNew(st); },REFRESH_MS);
  return st;
}
/* 로그인 상태가 바뀌면 삭제 버튼 표시를 다시 계산 · 다른 곳에서 삭제된 항목은 목록에서 제거 */
if(window.LukeAuth&&window.LukeAuth.onChange) window.LukeAuth.onChange(()=>states.forEach(st=>redraw(st)));
window.addEventListener('lukemedia:deleted',e=>{ const id=e.detail&&e.detail.id; states.forEach(st=>{ if(st.ids.has(id)){ st.items=st.items.filter(y=>y.id!==id); st.ids.delete(id); redraw(st); } }); });
window.LukeFaceHF={mount,IMG_MODELS,VID_MODELS,_states:states};
window.addEventListener('lukeangle:state',e=>{ const d=e.detail||{}; states.forEach(st=>{ if(!alive(st)||rootKey(st)!==d.key) return; drawAngles(st); drawCons(st); }); });
})();
