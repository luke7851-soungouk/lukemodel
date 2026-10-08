'use strict';
(()=>{
const $=id=>document.getElementById(id),auth=window.LukeAuth,endpoint=window.LUKE_SHARED.hairBackendUrl;
let products=[],filter='전체',owner=false;
async function api(action,body){await auth.ensure();if(body&&(!auth.user()||auth.isAnon()))throw new Error('운영자 계정으로 로그인해 주세요.');const r=await fetch(endpoint+'?action='+action,{method:body?'POST':'GET',headers:{...auth.headers(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'요청에 실패했습니다.');return d;}
function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
function btn(text,cls,fn){const b=node('button',text,cls);b.type='button';if(fn)b.onclick=fn;return b;}
const safeName=s=>String(s||'product').replace(/[\\/:*?"<>|]/g,'_');
const currentId=()=>new URLSearchParams(location.search).get('id');

/* ── 저장소 (이 브라우저) ───────────────────────────── */
const db=new Promise((resolve,reject)=>{const r=indexedDB.open('luke-product-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('shots');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.catch(()=>{});
async function loadShots(id){try{const d=await db;return await new Promise((res,rej)=>{const q=d.transaction('shots','readonly').objectStore('shots').get(id);q.onsuccess=()=>res(Array.isArray(q.result)?q.result:[]);q.onerror=()=>rej(q.error);});}catch{return [];}}
async function saveShots(id,list){const d=await db;await new Promise((res,rej)=>{const tx=d.transaction('shots','readwrite');tx.objectStore('shots').put(list,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);});}
const noteKey=id=>'luke.product.note.'+id;
function getNote(id){try{return localStorage.getItem(noteKey(id))||'';}catch{return '';}}
function setNote(id,v){try{localStorage.setItem(noteKey(id),v);}catch{}}

/* ── 목록 ─────────────────────────────────────────── */
const CATEGORIES=['뷰티·스킨케어','헤어·바디','메이크업','향수','패션·의류','가방·잡화','주얼리·액세서리','식품·음료','리빙·인테리어','디지털·가전','기타'];
const ALIAS={'뷰티':'뷰티·스킨케어','스킨케어':'뷰티·스킨케어','화장품':'뷰티·스킨케어','헤어':'헤어·바디','바디':'헤어·바디','헤어/바디':'헤어·바디','패션':'패션·의류','의류':'패션·의류','가방':'가방·잡화','잡화':'가방·잡화','주얼리':'주얼리·액세서리','액세서리':'주얼리·액세서리','식품':'식품·음료','음료':'식품·음료','리빙':'리빙·인테리어','인테리어':'리빙·인테리어','전자':'디지털·가전','가전':'디지털·가전','디지털':'디지털·가전'};
const catOf=p=>{const c=String(p.category||'').trim();return CATEGORIES.includes(c)?c:(ALIAS[c]||c||'기타');};
function renderList(){
  document.body.classList.remove('detail-mode');
  $('list-view').hidden=false;$('detail-view').hidden=true;
  const filters=$('filters'),grid=$('grid');filters.replaceChildren();grid.replaceChildren();
  const counts={};products.forEach(p=>{const c=catOf(p);counts[c]=(counts[c]||0)+1;});
  const cats=['전체',...CATEGORIES,...Object.keys(counts).filter(c=>!CATEGORIES.includes(c))];
  for(const category of cats){const n=category==='전체'?products.length:(counts[category]||0);const b=btn(category,'chip'+(filter===category?' on':''),()=>{filter=category;renderList();});b.append(node('small',String(n)));filters.append(b);}
  const list=products.filter(p=>filter==='전체'||catOf(p)===filter);
  $('message').textContent=filter==='전체'?`${list.length}개 제품 · 최신 등록순`:`${filter} · ${list.length}개 제품`;
  if(!list.length){grid.append(node('p',filter==='전체'?'등록된 제품이 없습니다. 「+ 내 제품 업로드」로 첫 제품을 등록해 보세요.':'이 카테고리에 등록된 제품이 아직 없어요.','empty'));return;}
  for(const p of list){
    const card=node('article',null,'card'),open=node('a',null,'card-open');open.href='?id='+encodeURIComponent(p.id);open.onclick=e=>{e.preventDefault();history.pushState(null,'','?id='+encodeURIComponent(p.id));route();};
    const img=node('img');img.src=p.image_url;img.alt=p.name;img.loading='lazy';img.referrerPolicy='no-referrer';open.append(img);
    const body=node('a',null,'card-body');body.href=open.href;body.onclick=open.onclick;body.style.display='block';
    const top=node('div',null,'card-top');top.append(node('h2',p.name),node('span','상세페이지 · SNS 광고'));
    const desc=node('p',p.description||'제품 사진으로 상세페이지와 광고 컷을 만들어 보세요.');
    const chips=node('div',null,'card-chips');[catOf(p),'제품 스튜디오'].forEach(t=>chips.append(node('span',t)));
    body.append(top,desc,chips);card.append(open,body);grid.append(card);
  }
}
function skeleton(){const grid=$('grid');grid.replaceChildren();for(let i=0;i<8;i++)grid.append(node('div',null,'sk-card'));}

/* ── 생성 확인창 (영상과 같은 확인 단계) ─────────────── */
function confirmGen(rows,count){
  return new Promise(resolve=>{
    const ov=node('div',null,'gen-confirm');ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    const box=node('div',null,'gen-confirm-box');box.append(node('h3','이대로 생성할까요?'));
    const dl=node('dl');rows.forEach(([k,v])=>{dl.append(node('dt',k),node('dd',v));});box.append(dl);
    const row=node('div',null,'row');const done=v=>{ov.remove();resolve(v);};
    const cancel=btn('취소','dark-btn',()=>done(false));const go=btn(`생성 시작 ✦ ${count}장`,'violet-btn',()=>done(true));
    row.append(cancel,go);box.append(row);ov.append(box);ov.onclick=e=>{if(e.target===ov)done(false);};ov.onkeydown=e=>{if(e.key==='Escape')done(false);};
    document.body.append(ov);go.focus();
  });
}
const MODEL_LABEL='Qwen Image 3 Edit (레퍼런스 고정)';

/* ── 콘셉트 제안 ───────────────────────────────────── */
function concepts(p){
  const name=p.name,cat=p.category||'제품';
  return [
    {id:'hero',title:'미니멀 스튜디오 히어로',tag:`"${name}, 그 자체로 충분한 존재감"`,desc:'밝은 무채색 스튜디오에서 제품만 단독으로 세워 형태와 질감을 또렷하게 보여 줍니다.',hint:'구도 · 정면 아이레벨 · 소프트박스 조명 · 여백 넉넉히',ratio:'4:5',prompt:'Minimal premium studio hero shot of the product standing alone on a seamless warm off-white backdrop, soft large softbox key light, gentle shadow, generous negative space, eye-level front view.'},
    {id:'nature',title:'자연에서 온 순간',tag:'"자연에서 온 것, 자연으로 돌아가다"',desc:'이끼와 돌, 나뭇잎 사이에 제품을 두어 원료와 브랜드의 자연스러운 이미지를 전합니다.',hint:'구도 · 낮은 앵글 · 숲속 산란광 · 배경 보케',ratio:'4:5',prompt:'The product placed on a natural stone among moss and fresh green leaves in a sunlit forest, dappled light, shallow depth of field with soft bokeh, low camera angle.'},
    {id:'lifestyle',title:'라이프스타일 일상의 순간',tag:'"매일의 의식, 일상의 선물"',desc:'욕실 선반·화장대처럼 실제로 쓰이는 공간에 놓아 사용 장면을 상상하게 합니다.',hint:'구도 · 45도 · 아침 창가 자연광 · 생활 소품 약간',ratio:'4:5',prompt:`The ${cat} product in a calm, tidy everyday lifestyle setting (bathroom shelf or vanity), soft morning window light, a few tasteful props, realistic and lived-in, 45-degree angle.`},
    {id:'botanical',title:'보태니컬 텍스처 클로즈업',tag:'"손끝에 닿는 결까지 담다"',desc:'제품 표면과 패키지 디테일을 가까이 담아 소재와 마감의 고급스러움을 강조합니다.',hint:'구도 · 매크로 사선 · 측광 · 질감 강조',ratio:'1:1',prompt:'Macro close-up of the product packaging surface and details at a diagonal angle, raking side light revealing material texture and finish, a few botanical elements, crisp focus.'},
    {id:'color',title:'컬러 그라데이션 캐스케이드',tag:'"당신의 선택을 위한 다채로운 결"',desc:'제품 색감과 어울리는 그라데이션 배경으로 SNS 피드에서 눈에 띄는 컷을 만듭니다.',hint:'구도 · 정면 · 컬러 젤 조명 · 그라데이션 배경',ratio:'4:5',prompt:"The product in front of a smooth color-gradient backdrop harmonised with the product's own colors, subtle colored gel rim light, bold and clean social-media advertising look."},
    {id:'hands',title:'핸즈 디테일 컷',tag:'"손에 쥐는 순간 완성되는 경험"',desc:'손이 제품을 들거나 사용하는 장면으로 크기감과 사용감을 자연스럽게 보여 줍니다.',hint:'구도 · 손 클로즈업 · 부드러운 자연광 · 얼굴 없음',ratio:'4:5',prompt:'Close-up of an adult hand naturally holding or using the product, no face visible, soft natural light, clean neutral background, realistic skin texture.'}
  ];
}

/* ── 상세 (제품 스튜디오) ─────────────────────────── */
let detailToken=0;
async function renderDetail(p){
  const token=++detailToken;
  document.body.classList.add('detail-mode');
  $('list-view').hidden=true;const view=$('detail-view');view.hidden=false;view.replaceChildren();
  document.title=p.name+' · 제품 스튜디오 · LUKE MODEL';
  const back=btn('← 상품 목록','back',()=>{history.pushState(null,'','./');route();});view.append(back);

  const intro=node('section',null,'pd-intro');
  const heroWrap=node('button',null,'pd-hero');heroWrap.type='button';heroWrap.setAttribute('aria-label','히어로 컷 크게 보기');const hero=node('img');hero.src=p.image_url;hero.alt=p.name;hero.referrerPolicy='no-referrer';heroWrap.append(hero);
  const info=node('div',null,'pd-info');
  const h1=node('h1',p.name);
  const chips=node('div',null,'pd-chips');[p.category,...String(p.tags||'').split(',')].map(x=>String(x||'').trim()).filter(Boolean).slice(0,7).forEach(t=>chips.append(node('span',t)));
  const desc=node('p',p.description||'제품 사진으로 상세페이지와 광고용 컷을 만들어 보세요.','pd-desc');
  const uses=node('div',null,'pd-uses');uses.append(node('em','추천 활용 채널'));['상세페이지','SNS 광고'].forEach(t=>uses.append(node('span',t)));
  const noteBox=node('label',null,'pd-note');noteBox.append(node('small','브랜드 메모 (선택 · 이 브라우저에 저장)'));const note=node('textarea');note.maxLength=300;note.rows=2;note.placeholder='예: 향기별로 컬러가 다양해짐, 메탈 펌프 보틀';note.value=getNote(p.id);note.oninput=()=>setNote(p.id,note.value);noteBox.append(note);
  const openHero=btn('히어로 컷 원본 열기','dark-btn',()=>showImage({url:p.image_url,label:p.name+' · 히어로 컷',id:'hero'},null));
  heroWrap.onclick=()=>openHero.click();
  info.append(h1,chips,desc,uses,noteBox,openHero);intro.append(heroWrap,info);view.append(intro);

  /* 콘셉트 */
  const list=concepts(p);let picked=new Set([list[0].id,list[1].id]);
  const cSec=node('section',null,'pd-section');const ch=node('div',null,'pd-sec-head');const cht=node('div');cht.append(node('h2','콘셉트 제안 ✦'),node('p','원하는 콘셉트를 골라 실제 이미지로 생성하세요. 고른 콘셉트의 구도·조명 가이드가 프롬프트에 반영됩니다.'));ch.append(cht);cSec.append(ch);
  const cgrid=node('div',null,'pd-concepts');
  const drawConcepts=()=>{cgrid.replaceChildren();list.forEach(c=>{const card=btn('', 'pd-concept'+(picked.has(c.id)?' on':''),()=>{if(picked.has(c.id)){if(picked.size>1)picked.delete(c.id);}else picked.add(c.id);drawConcepts();updateGen();});card.setAttribute('aria-pressed',String(picked.has(c.id)));const top=node('div',null,'pd-concept-top');top.append(node('b',c.title));const meta=node('span',null,'pd-concept-meta');meta.append(node('i',c.ratio),node('i',picked.has(c.id)?'✓':''));top.append(meta);card.append(top,node('strong',c.tag),node('p',c.desc),node('small',c.hint));cgrid.append(card);});};
  drawConcepts();cSec.append(cgrid);view.append(cSec);

  /* 생성 바 */
  const gen=node('section',null,'pd-gen');
  const promptWrap=node('div',null,'pd-prompt');const prompt=node('input');prompt.type='text';prompt.maxLength=300;prompt.placeholder='추가로 원하는 장면을 적어 주세요 (예: 유리 위에 놓인 제품, 따뜻한 조명)';promptWrap.append(prompt,node('small','고른 콘셉트 순서대로 컷을 만들고, 제품 사진을 레퍼런스로 함께 보내 같은 제품이 그대로 나오도록 요청합니다.'));
  const countBox=node('div',null,'pd-count');countBox.append(node('small','컷 수'));let cuts=2;const countRow=node('div');[1,2,3,4].forEach(n=>{const b=btn(String(n),'',()=>{cuts=n;countRow.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.textContent)===cuts)));updateGen();});b.setAttribute('aria-pressed',String(n===cuts));countRow.append(b);});countBox.append(countRow);
  const goBtn=btn('','violet-btn');goBtn.dataset.requiresApproval='';
  const updateGen=()=>{goBtn.textContent=`${cuts}컷 생성 ✦`;};updateGen();
  gen.append(promptWrap,countBox,goBtn);view.append(gen);
  const status=node('p','','pd-status');status.setAttribute('role','status');view.append(status);

  /* 결과 */
  const rSec=node('section',null,'pd-section');const rh=node('div',null,'pd-sec-head');const rht=node('div');rht.append(node('h2','생성한 컷'),node('p','완성된 컷은 lukemodel.com 공개 갤러리에도 자동 등록되고, 이 브라우저에도 보관돼요. 누르면 크게 보고 다운로드할 수 있어요.'));rh.append(rht);rSec.append(rh);
  const rgrid=node('div',null,'pd-results');rSec.append(rgrid);view.append(rSec);
  let shots=await loadShots(p.id);if(token!==detailToken)return;
  let pending=0;
  const drawShots=()=>{rgrid.replaceChildren();for(let i=0;i<pending;i++){const sk=node('div',null,'pd-shot pd-skeleton');sk.append(node('div',null,'pd-sk'),node('span','생성 중…'));rgrid.append(sk);}
    if(!shots.length&&!pending){rgrid.append(node('p','아직 생성한 컷이 없습니다. 콘셉트를 고르고 「컷 생성」을 눌러 보세요.','empty'));return;}
    shots.forEach(s=>{const card=btn('','pd-shot',()=>showImage(s,async()=>{shots=shots.filter(x=>x.id!==s.id);await saveShots(p.id,shots);drawShots();}));const img=node('img');img.src=s.url;img.alt=s.label;img.loading='lazy';card.append(img,node('span',s.label));rgrid.append(card);});};
  drawShots();

  const runCuts=async(seed)=>{
    if(window.LukeAccess&&!await LukeAccess.require())return;
    const chosen=seed?[seed.concept]:list.filter(c=>picked.has(c.id));if(!chosen.length)return;
    const plan=seed?`이 톤으로 시리즈 ${cuts}장`:`${chosen.length}개 콘셉트 · ${cuts}컷`;
    if(!await confirmGen([['생성 모델',MODEL_LABEL],['대상 제품',p.name],['구성',plan],['해상도','1K'],['차감','사장님 Higgsfield 크레딧'],['저장','lukemodel.com 갤러리 자동 등록']],cuts))return;
    goBtn.disabled=true;let done=0,shared=0;pending=cuts;drawShots();
    try{
      await auth.ensure();if(!auth.user()||auth.isAnon()){auth.openAccount?.();throw new Error('로그인한 회원만 제작할 수 있어요.');}
      const r=await fetch(p.image_url);if(!r.ok)throw new Error('제품 사진을 불러오지 못했어요.');const ref=await r.blob();
      const toneRef=seed?await (await fetch(seed.url)).blob():null;
      for(let i=0;i<cuts;i++){
        const c=chosen[i%chosen.length];status.textContent=`${seed?'시리즈 확장 · ':''}${c.title} 생성 중 · ${i+1}/${cuts} · 잠시 기다려 주세요.`;
        const text=['Reference image 1 is the exact PRODUCT. Keep its shape, color, label, typography and packaging identical; do not invent a different product or brand.',c.prompt,prompt.value.trim()?'Extra direction: '+prompt.value.trim():'',note.value.trim()?'Brand note: '+note.value.trim():'',`Product: ${p.name} (${p.category||''}). ${String(p.description||'').slice(0,300)}`,seed?'Reference image 2 is a previous shot of this campaign: match its color grading, lighting mood and styling, but create a new composition.':'',`Aspect ratio ${c.ratio}. Photorealistic commercial product photography, no text overlays, no watermark, one image.`].filter(Boolean).join('\n');
        const url=await generate(text,ref,toneRef);
        const published=await publishShot(p.name+' · '+c.title);if(published)shared++;
        shots.unshift({id:crypto.randomUUID(),url,label:c.title,concept:c.id,createdAt:new Date().toISOString()});done++;pending=cuts-done;
        try{await saveShots(p.id,shots.slice(0,40));}catch{status.textContent='기기 저장 공간이 부족해요. 결과를 다운로드해 주세요.';}
        drawShots();
      }
      status.textContent=`${done}컷을 만들었어요${shared?` · ${shared}컷은 lukemodel.com 갤러리에 자동 등록`:''}. 제품 모양과 라벨이 원본과 같은지 꼭 확인해 주세요.`;
    }catch(e){status.textContent=(e&&e.message||'생성에 실패했어요.')+(done?` 완료된 ${done}컷은 보관돼요.`:'');}
    finally{pending=0;drawShots();goBtn.disabled=false;}
  };
  goBtn.onclick=()=>runCuts(null);
  extendSeries=item=>{const c=list.find(x=>x.id===item.concept)||list[0];runCuts({url:item.url,concept:c});};
}
let extendSeries=null;
let lastRemote='';
async function publishShot(title){if(!lastRemote||!window.LukeHF?.shareResult)return false;try{await LukeHF.shareResult({url:lastRemote,kind:'image',title});return true;}catch(e){console.warn('auto publish failed',e);return false;}}
async function generate(prompt,refBlob,toneBlob){lastRemote='';
  const form=new FormData();form.append('prompt',prompt);form.append('reference',new File([refBlob],'product.png',{type:refBlob.type||'image/png'}));
  if(toneBlob)form.append('reference',new File([toneBlob],'tone.png',{type:toneBlob.type||'image/png'}));
  const sent=await fetch(endpoint+'?action=model',{method:'POST',headers:auth.headers(),body:form});const started=await sent.json().catch(()=>({}));
  if(!sent.ok)throw new Error(started.error||'제작 요청에 실패했어요.');if(!started.jobId)throw new Error('제작 번호를 받지 못했어요.');
  for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,3000));await auth.ensure();const c=await fetch(endpoint+'?action=model-status&job='+encodeURIComponent(started.jobId),{headers:auth.headers()});const cur=await c.json().catch(()=>({}));if(!c.ok)throw new Error(cur.error||'제작 상태를 확인하지 못했어요.');
    if(cur.status==='completed'){lastRemote=cur.resultUrl;const r=await fetch(cur.resultUrl,{credentials:'omit',referrerPolicy:'no-referrer'});const b=await r.blob();if(!/^image\//.test(b.type))throw new Error('결과 이미지를 받지 못했어요.');return await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(b);});}}
  throw new Error('제작이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.');
}
function showImage(item,onDelete){
  const ov=node('div',null,'pd-modal');ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');const box=node('div',null,'pd-modal-box');const img=node('img');img.src=item.url;img.alt=item.label;img.referrerPolicy='no-referrer';
  const actions=node('div',null,'pd-modal-actions');const close=btn('닫기','white-btn',()=>ov.remove());
  if(onDelete)actions.append(btn('삭제','del-btn',async()=>{if(!confirm('이 컷을 삭제할까요?'))return;await onDelete();ov.remove();}));
  const down=btn('다운로드','dark-btn',async()=>{if(window.LukeAccess&&!await LukeAccess.require())return;try{const r=await fetch(item.url);const u=URL.createObjectURL(await r.blob());const a=node('a');a.href=u;a.download=safeName(item.label)+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}catch{window.open(item.url,'_blank','noopener');}});down.dataset.requiresApproval='';
  const tab=btn('원본 새 탭에서 열기','dark-btn',async()=>{try{const r=await fetch(item.url);const u=URL.createObjectURL(await r.blob());window.open(u,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(u),60000);}catch{window.open(item.url,'_blank','noopener');}});
  if(onDelete&&item.concept&&extendSeries){const ext=btn('이 톤으로 시리즈 확장 ✦','violet-btn',()=>{ov.remove();extendSeries(item);});ext.dataset.requiresApproval='';actions.append(down,ext,tab,close);}else actions.append(down,tab,close);box.append(img,actions);ov.append(box);ov.onclick=e=>{if(e.target===ov)ov.remove();};ov.onkeydown=e=>{if(e.key==='Escape')ov.remove();};document.body.append(ov);close.focus();
}

/* ── 라우팅 ───────────────────────────────────────── */
function route(){const id=currentId();if(id){const p=products.find(x=>String(x.id)===id);if(p){renderDetail(p);return;}if(products.length){$('message').textContent='상품을 찾지 못했어요.';}}document.title='Product Studio · LUKE MODEL';renderList();}
async function load(){if(!products.length&&!currentId())skeleton();try{const d=await api('products-list');products=d.products||[];owner=!!d.owner;$('owner-toggle').hidden=!owner;$('hf-studio').hidden=!owner;if(!owner)$('owner-modal').hidden=true;route();}catch(e){$('message').textContent=e.message;$('grid').replaceChildren();}}
window.addEventListener('popstate',route);
$('account').append(auth.chip());CATEGORIES.forEach(c=>$('owner-category').add(new Option(c,c)));$('owner-toggle').onclick=()=>{$('owner-modal').hidden=false;$('owner-form').querySelector('input').focus();};$('owner-cancel').onclick=()=>{$('owner-modal').hidden=true;};$('owner-modal').onclick=e=>{if(e.target===$('owner-modal'))$('owner-modal').hidden=true;};
$('owner-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;try{await api('products-create',Object.fromEntries(new FormData(form)));form.reset();$('owner-modal').hidden=true;await load();$('message').textContent='제품을 등록했습니다.';}catch(error){$('message').textContent=error.message;}finally{button.disabled=false;}};
auth.onChange(load);load();
})();
