/* 방문자용 AI 도우미 (window.LukeAssist) — 홈(모델 탐색·캐스팅·얼굴·작품 페이지)과 힉스필드 스튜디오에서 동작.
   두뇌: 브라우저 안의 한국어 규칙 해석기(무료, 서버·키 없음). 선택: 방문자가 직접 넣은 본인 Gemini 키(이 탭에만)로
   못 알아들은 말만 「사이트 명령」으로 바꿔 다시 규칙 해석기에 넘김 — 사이트 운영자 키는 쓰지 않음.
   돈이 드는 생성(방문자 본인 Higgsfield 키)은 채팅의 「생성하기」를 눌렀을 때만. 스튜디오 채우기는 localStorage 한 번짜리 전달
   (lukeassist.handoff → /higgsfield/?assist=<nonce>, higgsfield/app.js 의 applyAssist). 캐스팅(casting.js)이 없어도 동작. */
(function(){
'use strict';
if(window.LukeAssist) return;
const PAGE=/^\/higgsfield(\/|$)/.test(location.pathname)?'studio':'home';
const LS_HAND='lukeassist.handoff', LS_PEND='lukeassist.pending', SS_CHAT='lukeassist.chat.v1', SS_CTX='lukeassist.ctx.v1', SS_GEM='lukeassist.gemini';
const ANG=[['front','정면'],['left','왼쪽'],['right','오른쪽'],['back','뒷모습']];
const GLAB={female:'여성',male:'남성',neutral:'중성'}, ALAB={twenties:'20대',thirties:'30대',forties:'40대',senior:'50대+'};
const H=()=>window.LukeHF||null;
const ss={ get(k,d){ try{ const v=sessionStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }, set(k,v){ try{ sessionStorage.setItem(k,JSON.stringify(v)); }catch(e){} } };
function mk(tag,cls,text){ const n=document.createElement(tag); if(cls) n.className=cls; if(text!=null) n.textContent=text; return n; }
/* 조사: 받침 따라 을/를·은/는·으로/로 (숫자로 끝나면 한국어 읽기 기준) */
function jo(w,t){ w=String(w||''); const c=w.trim().slice(-1); let b=null, rieul=false;
  if(/[가-힣]/.test(c)){ const k=(c.charCodeAt(0)-0xAC00)%28; b=k>0; rieul=k===8; }
  else if(/\d/.test(c)){ b='013678'.includes(c); rieul='178'.includes(c); }
  else if(/[a-z]/i.test(c)){ b=/[lmnr]/i.test(c); rieul=/[lr]/i.test(c); }
  const P={를:['을','를'],는:['은','는'],로:['으로','로'],가:['이','가'],와:['과','와']}[t]; if(!P) return w+t;
  if(b===null) return w+'('+P[0]+')'+P[1]; if(t==='로') return w+(b&&!rieul?'으로':'로'); return w+(b?P[0]:P[1]); }
const rid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);

/* ───────── 모델 목록 (캐스팅이 있으면 그 목록 그대로, 없으면 공개 갤러리에서 직접 읽기 · 읽기 전용) ───────── */
const D={list:null,loading:null,err:null};
function cfg(){ const c=window.LUKE_SHARED||{}; const url=String(c.url||'').replace(/\/$/,''); return (url&&c.anonKey&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))?{url,key:c.anonKey,table:c.table||'shared_media',bucket:c.bucket||'public-media'}:null; }
function hdr(c){ const h={apikey:c.key}; if(/^eyJ/.test(c.key)) h.Authorization='Bearer '+c.key; return h; }
function rowUrl(c,x){ if(x.path) return c.url+'/storage/v1/object/public/'+encodeURIComponent(c.bucket)+'/'+String(x.path).split('/').map(encodeURIComponent).join('/'); return /^https:\/\//.test(x.external_url||'')?x.external_url:null; }
const localize=u=>String(u||'').replace(/^https:\/\/lukemodel\.com(?=\/faces\/)/,'');
const absUrl=u=>{ try{ const s=String(u||''); if(/^\/?faces\//.test(s)) return 'https://lukemodel.com/'+s.replace(/^\//,''); return new URL(s,location.href).href; }catch(e){ return u; } };
function cleanTitle(t){ const h=H(); return (h&&h.displayTitle?h.displayTitle(t):String(t||'').replace(/\s*#face:[a-z0-9-]+$/,'')).replace(/^\[[^\]]*\]\s*/,'').trim(); }
function shortName(t){ let s=String(t||'').split(' · ')[0]; s=s.replace(/(\d0대\+?|시니어|여성|남성|중성)/g,' ').replace(/(^|\s)(실사|얼굴)(?=\s|$)/g,' ').replace(/\s*캐스팅\s*$/,'').replace(/\s+/g,' ').trim(); return s; }
function genderOf(t){ const m=String(t).match(/여성|남성|중성/); return m?({여성:'female',남성:'male',중성:'neutral'})[m[0]]:''; }
function ageOf(t){ const s=String(t); if(/20대/.test(s)) return 'twenties'; if(/30대/.test(s)) return 'thirties'; if(/40대/.test(s)) return 'forties'; if(/50대|60대|시니어/.test(s)) return 'senior'; return ''; }
function groupAngles(c,rows){ const map=new Map(); rows.forEach(x=>{ const m=String(x.title||'').match(/\[각도·(정면|왼쪽|오른쪽|뒷모습)\]/); const h=H(); const k=x.face_id||(h&&h.faceOf?h.faceOf(x.title):null); if(!m||!k) return;
  const id=ANG.find(a=>a[1]===m[1])[0]; const url=rowUrl(c,x); if(!url) return; const set=map.get(k)||{}; if(!set[id]) set[id]={id:x.id,url}; map.set(k,set); }); return map; }
function rec(o){ o.angles=o.angles||{}; o.angN=ANG.filter(a=>o.angles[a[0]]).length;
  if(!o.info) o.info=[GLAB[o.gender],ALAB[o.age],o.type==='gallery'?'공개 갤러리':'실사'].filter(Boolean).join(' · ');
  o.text=(o.name+' '+(o.full||'')+' '+o.info+' '+(o.tags||'')).toLowerCase(); return o; }
function sortRecs(a){ const ord=k=>/^m-/.test(k)?0:/^r-real/.test(k)?1:/^r-photo/.test(k)?2:3; return a.sort((x,y)=>(y.angN>0)-(x.angN>0)||ord(x.key)-ord(y.key)||x.key.localeCompare(y.key)); }
function dbModelIdFor(key){ try{ if(typeof DB==='undefined'||!DB.models) return null; const f=key.replace(/^r-/,''); const m=DB.models.find(x=>x.photoKey===f&&x.photos&&x.photos[0])||DB.models.find(x=>(x.photos||[])[0]&&String(x.photos[0]).replace(/^faces\/|\.(jpe?g|png|webp)$/gi,'').toLowerCase()===f); return m?m.id:null; }catch(e){ return null; } }
async function loadStandalone(){
  const c=cfg(); if(!c) return [];
  const cols='select=id,title,face_id,path,external_url,kind,mime,created_at,source';
  const get=q=>fetch(c.url+'/rest/v1/'+c.table+'?'+q,{headers:hdr(c)}).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
  const [repo,angs]=await Promise.all([get(cols+'&hidden=eq.false&source=eq.repo&face_id=like.r-*&limit=200'),get(cols+'&hidden=eq.false&kind=eq.image&title=like.'+encodeURIComponent('*[각도·*')+'&order=created_at.desc&limit=500')]);
  const angles=groupAngles(c,angs);
  const mids=[...angles.keys()].filter(k=>/^m-[0-9a-f-]{36}$/i.test(k)).map(k=>k.slice(2));
  const gal=mids.length?await get(cols+'&hidden=eq.false&kind=eq.image&id=in.('+mids.join(',')+')'):[];
  const out=[], seen=new Set();
  repo.forEach(x=>{ const url=rowUrl(c,x); if(!url||seen.has(x.face_id)) return; seen.add(x.face_id); const t=cleanTitle(x.title);
    out.push(rec({key:x.face_id,type:'face',name:shortName(t)||t,full:t,gender:genderOf(t),age:ageOf(t),thumb:localize(url),ref:url,rowId:x.id,angles:angles.get(x.face_id),modelId:dbModelIdFor(x.face_id)})); });
  let gi=0; gal.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).forEach(x=>{ if(/\[각도·|캐릭터 시트/.test(x.title||'')) return; const url=rowUrl(c,x); if(!url) return; gi++;
    const t=cleanTitle(x.title); let nm=shortName(t); if(!nm||/(좌|우|뒷|앞|정면|측면|모습|시트|각도)/.test(nm)) nm='갤러리 모델 '+gi;
    out.push(rec({key:'m-'+x.id,type:'gallery',name:nm,full:t,gender:genderOf(t),age:ageOf(t),thumb:url,ref:url,rowId:x.id,angles:angles.get('m-'+x.id)})); });
  return sortRecs(out);
}
function fromCast(c,S){ const row=c.type==='face'?(S&&S.repo&&S.repo.get(c.key))||null:c.row; const ang={};
  ANG.forEach(([k])=>{ const r=c.angles&&c.angles[k]; if(r&&r.url) ang[k]={id:r.id,url:r.url}; });
  return rec({key:c.key,type:c.type,name:c.name,full:c.full,info:c.info,gender:c.gender,age:c.age,tags:c.tags,thumb:c.photo,ref:row&&row.url?row.url:absUrl(c.photo),rowId:row?row.id:null,angles:ang,modelId:c.model?c.model.id:null,cast:c}); }
function loadModels(){
  if(D.list) return Promise.resolve(D.list); if(D.loading) return D.loading;
  D.loading=(async()=>{ let out=[];
    const C=window.LukeCasting;
    if(C&&C.build&&C.load){ try{ await C.load(); out=C.build().map(c=>fromCast(c,C._state)); }catch(e){ out=[]; } }
    if(!out.length) out=await loadStandalone();
    return out; })()
    .then(l=>{ D.list=l; D.loading=null; D.err=null; return l; },e=>{ D.loading=null; D.err=e.message; return []; });
  return D.loading;
}
const byKey=k=>(D.list||[]).find(m=>m.key===k)||null;

/* ───────── 대화 맥락 ───────── */
const ctx=Object.assign({lastKey:null,lastList:[],pending:null,temp:null},ss.get(SS_CTX,{}));
const saveCtx=()=>ss.set(SS_CTX,ctx);
/* index.html 의 전역(let view·curId·curMediaId·mediaCache·DB·filt) 읽기 — eval 없이 (CSP) */
const GV={view:()=>typeof view!=='undefined'?view:undefined,curId:()=>typeof curId!=='undefined'?curId:undefined,curMediaId:()=>typeof curMediaId!=='undefined'?curMediaId:undefined,
  mediaCache:()=>typeof mediaCache!=='undefined'?mediaCache:undefined,DB:()=>typeof DB!=='undefined'?DB:undefined,filt:()=>typeof filt!=='undefined'?filt:undefined};
function g(name){ try{ return GV[name]?GV[name]():undefined; }catch(e){ return undefined; } }
function mediaRec(x){ return rec({key:'m-'+x.id,type:'media',name:cleanTitle(x.title)||'이 작품',full:cleanTitle(x.title),gender:genderOf(x.title||''),age:ageOf(x.title||''),info:'지금 보고 있는 작품',thumb:x.url,ref:x.url,rowId:x.id,item:x,angles:{}}); }
/* 지금 화면의 모델: 캐스팅 패널 → 얼굴 상세 → 작품 페이지 → 대화에서 마지막으로 고른 모델 */
function contextModel(){
  if(PAGE==='home'){
    const C=window.LukeCasting; const cc=C&&C.current&&C.current(); if(cc&&byKey(cc.key)) return byKey(cc.key);
    const v=g('view');
    if(v==='detail'){ const id=g('curId'), db=g('DB'); const m=db&&db.models&&db.models.find(x=>x.id===id); const ph=m&&(m.photos||[])[0]; const f=ph&&String(ph).match(/^faces\/([a-z0-9-]+)\./i); if(f&&byKey('r-'+f[1].toLowerCase())) return byKey('r-'+f[1].toLowerCase()); }
    if(v==='media'){ const id=g('curMediaId'), cache=g('mediaCache'); const x=cache&&cache.get&&cache.get(id); if(x&&x.url){ const direct=byKey('m-'+x.id)||(D.list||[]).find(m=>m.rowId===x.id); return direct||mediaRec(x); } }
  }
  if(ctx.lastKey&&byKey(ctx.lastKey)) return byKey(ctx.lastKey);
  if(ctx.temp&&ctx.temp.key) return rec(ctx.temp);
  return null;
}
function remember(m){ if(!m) return; ctx.lastKey=byKey(m.key)?m.key:null; ctx.temp=byKey(m.key)?null:{key:m.key,type:m.type,name:m.name,full:m.full,info:m.info,thumb:m.thumb,ref:m.ref,rowId:m.rowId,angles:m.angles,item:m.item?{id:m.item.id,title:m.item.title,url:m.item.url,face_id:m.item.face_id,kind:'image'}:null}; saveCtx(); }

/* ───────── 한국어 규칙 해석기 ───────── */
const R={
  female:/(여성|여자|여배우|여자분|아가씨|언니|누나|할머니|아줌마|woman|female|girl|lady)/i,
  male:/(남성|남자|남배우|남자분|오빠|아저씨|할아버지|청년\s*남|man\b|male|boy|guy)/i,
  neutral:/(중성|젠더리스|유니섹스|androgynous)/i,
  twenties:/(20\s*대|이십\s*대|스무\s*살|20살|대학생|젊은|청춘)/, thirties:/(30\s*대|삼십\s*대|서른)/, forties:/(40\s*대|사십\s*대|마흔|중년)/, senior:/(50\s*대|60\s*대|70\s*대|오십\s*대|육십\s*대|시니어|노년|어르신|할머니|할아버지|중장년|실버)/,
  video:/(영상|동영상|비디오|클립|쇼츠|릴스|움직이|움직임|\d+\s*초)/, image:/(사진|이미지|그림|화보|프로필|컷|포스터|썸네일)/,
  make:/(만들|생성|찍어|찍자|그려|제작|뽑아|해\s*줘|해줘|부탁)/, show:/(보여|찾아|추천|골라|있어|있나|리스트|목록|검색|알려|뭐\s*있)/,
  angle:/(각도|앵글|정면|옆모습|측면|뒷모습|턴어라운드|일관성\s*참고)/, sheet:/(캐릭터\s*시트|시트)/,
  dl:/(다운로드|다운|내려\s*받|저장해|받고\s*싶|파일로)/, mine:/(내\s*작품|내가\s*만든|내\s*결과|내\s*페이지|내\s*이미지|내\s*영상|즐겨찾기|마이\s*페이지|내\s*갤러리|내꺼)/,
  login:/(로그인|로그아웃|회원\s*가입|가입|계정|sign\s*in|login)/i, upload:/(업로드|올리|올려|업로드는|사진\s*등록|파일\s*올)/,
  key:/(키\s*(는|를|설정|추가|넣|등록|어디|없|발급)|api\s*키|higgsfield\s*키|힉스필드\s*키|키가)/i,
  here:/(이\s*모델|이\s*사람|이\s*얼굴|이\s*분|이\s*인물|이\s*친구|얘|지금\s*(모델|사람|이거)|이걸로|이거로|이걸|여기\s*사람|방금|아까)/,
  hello:/^(안녕|하이|hi|hello|헬로|반가)/i, help:/(뭐\s*할\s*수|뭘\s*할\s*수|무엇을\s*할|도움말|사용법|기능|할\s*줄|어떻게\s*써|도와)/,
  casting:/(캐스팅)/, studio:/(스튜디오|힉스필드|higgsfield)/i, home:/(홈|처음\s*화면|메인)/, gallery:/(공개\s*갤러리|갤러리)/, fashion:/(가상\s*피팅|피팅|룩북)/,
  go:/(열어|가줘|가자|이동|가기|띄워|켜줘|보여줘|들어가)/
};
const ORD={'첫':1,'두':2,'세':3,'네':4,'다섯':5,'여섯':6};
const STOP=new Set(['모델','가상','캐스팅','포토','시드','실사','공개','갤러리','얼굴','인상','캐주얼 얼굴']);
function vocab(){ const set=new Set(); (D.list||[]).forEach(m=>String(m.full||m.name).split(/[\s·,()\[\]]+/).forEach(w=>{ w=w.replace(/[^가-힣a-z]/gi,''); if(w.length>=2&&!STOP.has(w)&&!/^(여성|남성|중성|시니어)$/.test(w)&&!/대$/.test(w)) set.add(w); })); return [...set]; }
function descriptors(t){
  const d={gender:'',age:'',words:[],num:null,ord:null};
  if(R.neutral.test(t)) d.gender='neutral'; else if(R.female.test(t)&&!R.male.test(t)) d.gender='female'; else if(R.male.test(t)&&!R.female.test(t)) d.gender='male';
  for(const a of ['senior','forties','thirties','twenties']) if(R[a].test(t)){ d.age=a; break; }
  vocab().forEach(w=>{ if(t.includes(w)) d.words.push(w); });
  if(/금발|블론드|blonde/i.test(t)&&!d.words.includes('금발')) d.words.push('금발');
  const n=t.match(/(?:캐스팅|모델|포토|갤러리\s*모델)\s*(\d{1,2})(?!\s*(초|대|살|장|개))/); if(n) d.num=+n[1];
  const o=t.match(/(\d{1,2})\s*번(?:\s*째)?|(첫|두|세|네|다섯|여섯)\s*번\s*째/); if(o) d.ord=o[1]?+o[1]:ORD[o[2]];
  return d; }
const hasDesc=d=>!!(d.gender||d.age||d.words.length||d.num!=null||d.ord!=null);
function findModels(d){ let L=(D.list||[]).slice();
  if(d.ord!=null&&ctx.lastList&&ctx.lastList[d.ord-1]&&byKey(ctx.lastList[d.ord-1])) return [byKey(ctx.lastList[d.ord-1])];
  if(d.ord!=null&&d.num==null) d=Object.assign({},d,{num:d.ord});
  if(d.num!=null){ const re=new RegExp('(^|\\D)0?'+d.num+'(\\D|$)'); const hit=L.filter(m=>re.test(m.name)); if(hit.length) L=hit; }
  if(d.gender) L=L.filter(m=>m.gender===d.gender); if(d.age) L=L.filter(m=>m.age===d.age);
  if(d.words.length){ const hit=L.filter(m=>d.words.every(w=>m.text.includes(w.toLowerCase()))); L=hit.length?hit:L.filter(m=>d.words.some(w=>m.text.includes(w.toLowerCase()))); }
  return L; }

/* 장면 → 영어 프롬프트 조각 (없는 말은 원문 한국어를 함께 보내 모델이 이해) */
const SCENE=[
 ['place',/(카페|커피숍|커피\s*숍)/,'in a cozy cafe with warm window light'],['place',/(해변|바닷가|바다)/,'on a sunny beach by the sea'],['place',/(사무실|오피스|회사)/,'in a bright modern office'],
 ['place',/(길거리|거리|골목)/,'on a lively city street'],['place',/(도심|도시|서울|강남|명동)/,'in downtown Seoul'],['place',/(공원)/,'in a green park'],['place',/(한옥|궁궐|경복궁)/,'in a traditional Korean hanok courtyard'],
 ['place',/(흰\s*배경|배경\s*없|스튜디오\s*배경|단색\s*배경)/,'in a photo studio with a plain seamless background'],['place',/(거실|집에서|집\s*안)/,'in a cozy living room'],['place',/(부엌|주방)/,'in a modern kitchen'],
 ['place',/(숲)/,'in a quiet forest'],['place',/(산\s|산에|산에서|등산)/,'on a mountain trail'],['place',/(호텔)/,'in an elegant hotel lobby'],['place',/(레스토랑|식당)/,'in a stylish restaurant'],['place',/(지하철)/,'on a subway platform'],
 ['place',/(옥상|루프탑)/,'on a rooftop overlooking the city'],['place',/(헬스장|체육관|짐에서)/,'in a gym'],['place',/(무대|콘서트)/,'on a concert stage'],['place',/(런웨이|패션쇼)/,'on a fashion runway'],['place',/(도서관)/,'in a library'],['place',/(차\s*안|자동차|운전)/,'inside a car'],
 ['time',/(눈\s*오|설경|겨울|눈밭)/,'in a snowy winter scene'],['time',/(벚꽃|봄)/,'under cherry blossoms in spring'],['time',/(비\s*오|빗속|우산)/,'in the rain with an umbrella'],['time',/(야경|밤|네온)/,'at night with city lights'],['time',/(노을|석양|해질|골든\s*아워)/,'at golden hour sunset'],['time',/(아침|햇살)/,'in soft morning sunlight'],
 ['face',/(활짝|크게\s*웃|깔깔)/,'laughing brightly'],['face',/(웃는|웃으며|웃고|미소|웃어|스마일)/,'smiling warmly'],['face',/(진지|시크|무표정|카리스마)/,'with a serious, confident expression'],['face',/(윙크)/,'winking at the camera'],['face',/(놀란|놀라는)/,'looking surprised'],['face',/(슬픈|우울)/,'with a melancholic expression'],
 ['act',/(걷는|걸어|걷고|산책)/,'walking'],['act',/(앉아|앉은|앉아서)/,'sitting'],['act',/(서\s*있|서있)/,'standing'],['act',/(달리|뛰는|뛰어|조깅)/,'running'],['act',/(춤|댄스)/,'dancing'],
 ['act',/(커피\s*(를\s*)?마시|커피\s*들)/,'holding a cup of coffee'],['act',/(책\s*(을\s*)?읽|독서)/,'reading a book'],['act',/(노트북|일하는|업무)/,'working on a laptop'],['act',/(전화|통화)/,'talking on the phone'],['act',/(손\s*(을\s*)?흔들)/,'waving at the camera'],
 ['act',/(돌아보|뒤돌아)/,'turning to look back at the camera'],['act',/(셀카)/,'taking a selfie'],['act',/(요리)/,'cooking'],['act',/(운동)/,'working out'],['act',/(포즈)/,'posing naturally'],
 ['wear',/(정장|수트|슈트)/,'wearing a tailored suit'],['wear',/(한복)/,'wearing a modern hanbok'],['wear',/(드레스)/,'wearing an elegant dress'],['wear',/(캐주얼|청바지|티셔츠)/,'in casual clothes, white T-shirt and jeans'],['wear',/(운동복|트레이닝|스포츠웨어)/,'in sportswear'],
 ['wear',/(코트)/,'wearing a long coat'],['wear',/(가죽\s*재킷|라이더)/,'wearing a leather jacket'],['wear',/(니트|스웨터)/,'wearing a cozy knit sweater'],['wear',/(비즈니스|오피스룩)/,'in business attire'],['wear',/(수영복|비키니)/,'in modest swimwear'],
 ['shot',/(전신)/,'full-body shot'],['shot',/(상반신|반신)/,'upper-body shot'],['shot',/(클로즈업|얼굴\s*위주|근접|얼굴만)/,'close-up portrait'],['shot',/(프로필|증명)/,'clean profile headshot'],
 ['cam',/(다가가|줌\s*인|점점\s*가까)/,'slow dolly-in camera move'],['cam',/(돌면서|회전|360|빙글)/,'camera slowly orbits around the person'],['cam',/(따라가|팔로우|트래킹)/,'tracking shot following the person'],['cam',/(슬로\s*모션|슬로우|느리게)/,'slow motion'],['cam',/(드론|항공)/,'aerial drone shot'],
 ['style',/(필름|빈티지|레트로)/,'film photo look'],['style',/(흑백)/,'black and white'],['style',/(시네마틱|영화\s*같|영화처럼)/,'cinematic'],['style',/(광고|화보|잡지|매거진)/,'high-end fashion editorial'],['style',/(인스타|sns|SNS)/,'social media lifestyle photo']
];
function sceneOf(t){ const s={}; SCENE.forEach(([k,re,en])=>{ if(re.test(t)){ (s[k]=s[k]||[]); if(!s[k].includes(en)) s[k].push(en); } });
  if(s.face&&s.face.includes('laughing brightly')) s.face=s.face.filter(x=>x!=='smiling warmly'); return s; }
const hasScene=s=>Object.keys(s).length>0;
function slotsOf(t){ const video=R.video.test(t)&&!/(사진|이미지)\s*(을|를)?\s*(만들|생성)/.test(t.replace(/영상.*$/,''))||/(\d+)\s*초/.test(t);
  const dm=t.match(/(\d{1,2})\s*초/); const s=sceneOf(t);
  let ar=null; if(/(세로|9\s*:\s*16|쇼츠|릴스|틱톡|스토리)/.test(t)) ar='9:16'; else if(/(가로|16\s*:\s*9|유튜브|와이드)/.test(t)) ar='16:9'; else if(/(정사각|1\s*:\s*1|피드)/.test(t)) ar='1:1';
  let engine=null; if(/(클링|kling)/i.test(t)) engine='kling-3-turbo'; else if(/(시댄스|seedance)/i.test(t)) engine='seedance-2.5'; else if(/(소울|soul)/i.test(t)) engine='soul-2'; else if(/(그록|grok)/i.test(t)) engine='grok-imagine-2'; else if(/(큐웬|qwen)/i.test(t)) engine='qwen-image-3';
  return {video:!!video,dur:dm?+dm[1]:null,scene:s,ar,engine,full:!!(s.shot&&s.shot.includes('full-body shot'))}; }
function buildPrompt(sl,orig,video){ const s=sl.scene, j=a=>(a||[]).join(', ');
  const who=video?'The person in the start frame':'The same person as in the reference images';
  const parts=[], doing=[j(s.face),j(s.act)].filter(Boolean).join(', ');
  if(video){ parts.push(who+(doing?' is '+doing:' moves naturally')+(s.place?' '+j(s.place):'')+(s.time?', '+j(s.time):'')+(s.wear?', '+j(s.wear):'')+'.');
    parts.push((s.cam?j(s.cam)+', ':'')+'natural motion, keep the exact same face, hairstyle and identity throughout, realistic, '+(s.style?j(s.style):'cinematic lighting')+'.'); }
  else { parts.push((s.shot?j(s.shot)+' of ':'Portrait photo of ')+'the same person as in the reference images'+(doing?', '+doing:'')+(s.wear?', '+j(s.wear):'')+(s.place?', '+j(s.place):'')+(s.time?', '+j(s.time):'')+'.');
    parts.push('Keep the exact face, hairstyle, age and identity of reference image 1. '+(s.style?j(s.style)+', ':'')+'natural editorial photo, realistic skin texture, soft natural light, 85mm lens, sharp focus.'); }
  const ko=String(orig||'').replace(/\s+/g,' ').trim().slice(0,300); if(ko) parts.push('Request (Korean): '+ko);
  return parts.join(' '); }
function nearestDur(d){ const ok=[4,5,8,10,12,15]; if(!d) return 5; return ok.reduce((a,b)=>Math.abs(b-d)<Math.abs(a-d)?b:a,5); }

function parse(raw){
  const t=String(raw||'').trim(); if(!t) return null; const low=t.toLowerCase();
  if(R.hello.test(low)&&t.length<12) return {type:'hello'};
  if(R.help.test(t)&&!R.make.test(t.replace(/도와/,''))) return {type:'help'};
  if(R.sheet.test(t)) return {type:'sheet'};
  if(R.upload.test(t)&&!R.video.test(t)) return {type:'upload',how:/(어떻게|방법|어디|뭐)/.test(t)};
  if(R.login.test(t)) return {type:'login',out:/로그아웃/.test(t)};
  if(R.key.test(t)) return {type:'key'};
  if(R.mine.test(t)) return {type:'mine'};
  if(R.dl.test(t)) return {type:'download'};
  if(R.angle.test(t)&&!/(영상|동영상)/.test(t)) return {type:'angles',d:descriptors(t)};
  const faq=faqOf(t); if(faq&&!R.make.test(t)) return {type:'faq',faq};
  const d=descriptors(t), sl=slotsOf(t), wantsMake=R.make.test(t)&&(R.image.test(t)||R.video.test(t)||hasScene(sl.scene)), sceneOnly=hasScene(sl.scene)&&(R.image.test(t)||R.video.test(t));
  if(wantsMake||sceneOnly) return {type:'gen',d,sl,here:R.here.test(t),orig:t};
  if(R.go.test(t)||/^(캐스팅|스튜디오|홈|갤러리)$/.test(t)){
    if(R.casting.test(t)&&!hasDesc(d)) return {type:'nav',to:'casting'};
    if(R.fashion.test(t)) return {type:'nav',to:'fashion'};
    if(R.gallery.test(t)) return {type:'nav',to:'gallery'};
    if(R.studio.test(t)) return {type:'nav',to:'studio'};
    if(R.home.test(t)) return {type:'nav',to:'home'}; }
  if(R.make.test(t)&&(R.image.test(t)||R.video.test(t))) return {type:'gen',d,sl,here:R.here.test(t),orig:t};
  if(d.ord!=null&&!hasScene(sl.scene)) return {type:'pick',d};
  if(hasDesc(d)&&(R.show.test(t)||/(모델|사람|인물|배우|얼굴)/.test(t)||t.length<=14)) return {type:'show',d};
  if(/(모델|사람|인물|배우|얼굴)/.test(t)&&R.show.test(t)) return {type:'show',d};
  if(R.casting.test(t)) return {type:'nav',to:'casting'};
  return faq?{type:'faq',faq}:null;
}
const FAQ=[
 [/(무료|공짜|비용|가격|요금|돈\s*(이|을|드))/,'모델 둘러보기·다운로드·각도 사진·캐릭터 시트 나누기·이 도우미는 모두 무료예요. 힉스필드(Higgsfield)로 새 이미지·영상을 만들 때만 방문자 본인의 Higgsfield 키로 요금이 나가요. 그래서 제가 생성하기 전에는 항상 확인 버튼을 보여 드려요.'],
 [/(힉스필드|higgsfield).*(뭐|무엇|란|이야|인가)|(뭐|무엇).*(힉스필드|higgsfield)/i,'힉스필드는 이미지·영상 생성 AI 서비스예요. 루크 스튜디오(/higgsfield/)에서 본인 키를 넣으면 Qwen Image 3·Soul·Seedance·Kling 같은 모델로 만들 수 있고, 결과는 공개 갤러리에 올라가요.'],
 [/(실존|연예인|유명인|진짜\s*사람|실제\s*인물|딥페이크)/,'이 사이트의 얼굴은 모두 AI로 만든 가상 인물이에요. 동의 없는 실존 인물·연예인 얼굴로 만들기는 금지예요.'],
 [/(삭제|지우|지워)/,'내가 올리거나 만든 작품은 작품 페이지나 공개 갤러리 카드의 「삭제」 버튼으로 지울 수 있어요 (로그인한 같은 계정·브라우저일 때).'],
 [/(상업|저작권|라이선스|써도\s*돼|사용해도)/,'가상 인물 사진은 자유롭게 내려받아 쓸 수 있지만, 생성 AI 서비스 약관과 초상·상표 관련 법은 사용자 책임이에요. 자세한 건 하단의 Terms를 봐 주세요.'],
 [/(개인정보|데이터|저장\s*위치|어디에\s*저장)/,'대화와 설정은 이 브라우저에만 저장돼요. 키는 서버로 보내지 않고 해당 AI 서비스로만 전송돼요.'],
 [/(각도\s*사진|일관성).*(뭐|무엇|란)/,'각도 사진은 같은 인물의 정면·왼쪽·오른쪽·뒷모습 4장이에요. 무료 GPU로 자동으로 만들어지고, 이미지·영상을 만들 때 참고 이미지로 함께 들어가 얼굴이 덜 바뀌어요.'],
 [/(누가|운영|만든\s*사람|연락|문의)/,'페이스루크(lukemodel.com)는 가상 얼굴 모델을 모아 이미지·영상 제작에 쓰도록 만든 사이트예요. 문의는 하단 GitHub 링크를 이용해 주세요.'],
 [/(말하는\s*ai|초이|음성)/,'음성으로 대화하려면 상단의 「🎙 말하는 AI 초이」를 눌러 주세요 (본인 Gemini 키 필요). 저는 사이트 기능을 대신 눌러 드리는 도우미예요.'],
 [/(모델\s*스튜디오)/,'「모델 스튜디오」는 상단 링크로 여는 별도 도구예요. 저는 사이트에 이미 있는 모델로 캐스팅·생성 준비를 도와 드려요.']
];
function faqOf(t){ const f=FAQ.find(([re])=>re.test(t)); return f?f[1]:null; }

/* ───────── 실행 ───────── */
const hasKey=()=>{ const h=H(); try{ return !!(h&&h.getKey&&h.getKey()); }catch(e){ return false; } };
async function exec(it){
  await loadModels();
  switch(it.type){
    case 'hello': case 'help': return say('안녕하세요! 페이스루크 도우미예요. 이렇게 말해 보세요:\n· "30대 여성 모델 보여줘"\n· "이 모델로 카페에서 웃는 사진 만들어줘"\n· "금발 여성으로 5초 영상 만들어줘"\n· "각도 사진 만들어줘" · "다운로드" · "내 작품 보여줘"',{chips:starterChips()});
    case 'faq': return say(it.faq);
    case 'show': return doShow(it.d);
    case 'pick': { const L=findModels(it.d); if(!L.length) return say('그 번호의 모델을 찾지 못했어요. 먼저 "여성 모델 보여줘"처럼 목록을 불러 주세요.'); return doPick(L[0]); }
    case 'gen': return doGen(it);
    case 'angles': return doAngles(it.d);
    case 'sheet': return doSheet();
    case 'download': return doDownload();
    case 'mine': return doMine();
    case 'login': return doLogin(it.out);
    case 'upload': return doUpload(it.how);
    case 'key': return doKeyHelp();
    case 'nav': return doNav(it.to);
  }
}
function starterChips(){ const c=contextModel(); const a=[];
  if(c) a.push('이 모델로 카페에서 웃는 사진 만들어줘','이 모델로 5초 걷는 영상 만들어줘');
  else a.push('30대 여성 모델 보여줘','남성 모델 추천해줘');
  if(!c) a.push('금발 여성으로 5초 영상 만들어줘');
  const v=g('view'), cache=g('mediaCache'), x=v==='media'&&cache&&cache.get&&cache.get(g('curMediaId'));
  if(x&&window.LukeSplit&&LukeSplit.isSheet(x)) a.unshift('캐릭터 시트 나눠줘');
  a.push('각도 사진 만들어줘','내 작품 보여줘','업로드 어떻게 해?','무료야?'); return a.slice(0,7); }
/* 캐스팅 화면(casting.js)이 배포돼 있는지: 없으면 캐스팅 버튼·이동을 숨김 (도우미만 따로 배포 가능) */
const LS_HASC='lukeassist.hasCasting';   /* 홈에서 casting.js 가 있었는지 기억 → 스튜디오에서도 판단 (네트워크 요청 없음) */
async function castingAvail(){ if(PAGE==='home'){ const y=!!window.LukeCasting; try{ localStorage.setItem(LS_HASC,y?'1':'0'); }catch(e){} return y; }
  try{ return localStorage.getItem(LS_HASC)==='1'; }catch(e){ return false; } }
async function doShow(d){ const L=findModels(d);
  const label=[d.age?ALAB[d.age]:'',d.gender?GLAB[d.gender]:'',d.words.join(' ')].filter(Boolean).join(' ')||'전체';
  if(!L.length) return say(label+' 조건에 맞는 모델이 없어요. 조건을 조금 넓혀 볼까요?',{chips:['여성 모델 보여줘','남성 모델 보여줘','전체 모델 보여줘']});
  ctx.lastList=L.slice(0,6).map(m=>m.key); ctx.pending=null; saveCtx();
  const acts=[], hasC=await castingAvail(); if(PAGE==='home'&&window.LukeCasting&&LukeCasting.setFilter) acts.push({label:'캐스팅에서 '+L.length+'명 전부 보기',act:'casting',arg:{g:d.gender,a:d.age,q:d.words[0]||''}});
  else if(hasC) acts.push({label:'모델 캐스팅에서 전부 보기',act:'casting',arg:{g:d.gender,a:d.age,q:d.words[0]||''}});
  return say(label+' 모델 '+L.length+'명을 찾았어요.'+(L.length>6?' 먼저 6명을 보여 드려요.':'')+' 카드를 누르면 크게 볼 수 있어요.',{cards:ctx.lastList,actions:acts,chips:['첫 번째 모델로 카페 사진 만들어줘','두 번째 모델로 5초 영상 만들어줘']}); }
function doPick(m){ remember(m);
  return say(jo(m.name+' ('+m.info+')','를')+' 골랐어요. 무엇을 만들까요?',{cards:[m.key],chips:['카페에서 웃는 사진 만들어줘','해변 전신 사진 만들어줘','사무실 프로필 사진 만들어줘','5초 걷는 영상 만들어줘','각도 사진 만들어줘']}); }
async function doGen(it){
  let m=null, alts=[];
  const here=it.here?contextModel():null;
  if(here) m=here;
  else if(hasDesc(it.d)){ const L=findModels(it.d); if(!L.length) return say('말씀하신 조건의 모델을 찾지 못했어요. "여성 모델 보여줘"로 먼저 골라 보세요.',{chips:['여성 모델 보여줘','남성 모델 보여줘']}); m=L[0]; alts=L.slice(1,4); }
  else m=contextModel();
  if(!m){ const L=(D.list||[]).slice(0,6); ctx.pending={orig:it.orig}; ctx.lastList=L.map(x=>x.key); saveCtx();
    return say('어떤 모델로 만들까요? 아래에서 골라 주세요 (카드를 누르면 바로 준비해요).',{cards:ctx.lastList,pick:true,chips:['30대 여성 모델 보여줘','남성 모델 보여줘']}); }
  if(!hasScene(it.sl.scene)&&!it.sl.dur){ remember(m); ctx.pending=null; saveCtx();
    return say(jo(m.name,'로')+' 어떤 장면을 만들까요?',{cards:[m.key],chips:it.sl.video?['카페에서 커피 마시는 5초 영상','해변을 걷는 5초 영상','돌아보며 웃는 5초 영상']:['카페에서 웃는 사진','해변 전신 사진','사무실 프로필 사진','한복 입은 한옥 사진']}); }
  remember(m); ctx.pending=null; saveCtx();
  const plan=await makePlan(m,it.sl,it.orig);
  const note=alts.length?'조건에 맞는 모델 중 '+jo(m.name,'를')+' 골랐어요. 다른 모델로 바꾸려면 아래 카드를 누르세요.':jo(m.name,'로')+' 준비했어요.';
  return say(note+' 확인하고 「생성하기」를 누르면 만들어요.',{plan,cards:alts.length?alts.map(a=>a.key):null,pick:alts.length?true:false,pickOrig:it.orig});
}
async function makePlan(m,sl,orig){
  let angles=m.angles||{};
  if(!Object.keys(angles).length&&m.item&&window.LukeAngles){ try{ const r=await LukeAngles.rootOf(m.item); const f=await LukeAngles.findAngles(r.key); ANG.forEach(([k])=>{ if(f[k]&&f[k].url) angles[k]={id:f[k].id,url:f[k].url}; }); }catch(e){} }
  const video=sl.video; const engine=sl.engine&&((video&&/seedance|kling/.test(sl.engine))||(!video&&!/seedance|kling/.test(sl.engine)))?sl.engine:(video?'seedance-2.5':'qwen-image-3');
  const maxRef=engine==='soul-2'?1:3;
  const order=sl.full?['front','back','left','right']:['left','right','front','back'];
  const refs=[{url:absUrl(m.ref),label:'원본'}].concat(order.filter(k=>angles[k]).map(k=>({url:angles[k].url,label:ANG.find(a=>a[0]===k)[1]}))).slice(0,maxRef);
  const start=video?(sl.full&&angles.front?{url:angles.front.url,label:'정면(전신)'}:{url:absUrl(m.ref),label:'원본'}):null;
  const ENG={'qwen-image-3':'Qwen Image 3 (얼굴 유지 편집)','soul-2':'Soul 2 (참고 1장 · 얼굴이 바뀔 수 있어요)','grok-imagine-2':'Grok Imagine 2.0','seedance-2.5':'Seedance 2.5','kling-3-turbo':'Kling 3.0 Turbo'};
  return {id:rid(),key:m.key,name:m.name,thumb:m.thumb,surface:video?'video':'image',model:engine,engineLabel:ENG[engine]||engine,refs:video?[]:refs,start,ar:video?null:(sl.ar||(sl.full?'2:3':'3:4')),dur:video?nearestDur(sl.dur):null,prompt:buildPrompt(sl,orig,video),angN:Object.keys(angles).length};
}
function openModel(m,quiet){
  if(PAGE!=='home'){ if(quiet) return; if(m.rowId){ location.href='/?m='+encodeURIComponent(m.rowId); return; }
    localStorage.setItem(LS_PEND,JSON.stringify({act:'open',key:m.key,ts:Date.now()})); location.href='/'; return; }
  const C=window.LukeCasting;
  if(m.cast&&C&&C.openPanel){ C.openPanel(m.cast); return; }   /* 캐스팅 패널(z 100)이 대화창 위에 뜨고, 닫으면 대화로 돌아옴 */
  if(quiet) return;
  if(m.modelId!=null&&typeof go==='function'){ closePanelIfMobile(); go('detail',m.modelId); return; }
  if(m.rowId&&window.LukeOpenMedia){ closePanelIfMobile(); LukeOpenMedia(m.item||m.rowId); }
}
async function doAngles(d){
  let m=hasDesc(d)?findModels(d)[0]:contextModel();
  if(!m) return say('어느 모델의 각도 사진을 만들까요? 먼저 모델을 골라 주세요.',{cards:(D.list||[]).slice(0,6).map(x=>x.key),chips:['여성 모델 보여줘']});
  remember(m);
  if(m.angN>=4) return say(jo(m.name,'는')+' 정면·왼쪽·오른쪽·뒷모습 4장이 이미 있어요. 이미지·영상을 만들 때 자동으로 참고 이미지로 들어가요.',{angles:m.key});
  if(PAGE!=='home'){ localStorage.setItem(LS_PEND,JSON.stringify({act:'angles',key:m.key,ts:Date.now()})); say(m.name+' 페이지로 가서 무료 각도 사진 만들기를 시작할게요.'); location.href='/'; return; }
  return runAngles(m);
}
async function runAngles(m){
  const ok=await gotoFace(m); if(!ok) return say('이 모델의 페이지를 열지 못했어요.');
  const btn=await waitFor('.fhf-angles .fhf-ang-again',6000);
  if(btn&&!btn.disabled){ btn.click(); return say(m.name+'의 각도 사진(정면·왼쪽·오른쪽·뒷모습)을 무료 GPU로 만들기 시작했어요. 한 장씩 차례로 만들어지고 공개 갤러리에 저장돼요. 다른 걸 해도 괜찮아요.',{angles:m.key}); }
  const box=document.querySelector('.fhf-angles'); if(box){ try{ box.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){} }
  return say('각도 사진 칸을 열었어요. 이 페이지에서는 자동으로 만들어지거나 이미 진행 중이에요 — 「일관성 참고 이미지」 칸을 확인해 주세요.');
}
async function gotoFace(m){ if(typeof go!=='function') return false; closePanelIfMobile(); try{ if(window.LukeCasting&&LukeCasting.close) LukeCasting.close(); }catch(e){}
  if(m.modelId!=null){ window._lmFromCasting=false; go('detail',m.modelId); return true; }
  if(m.rowId&&window.LukeOpenMedia){ LukeOpenMedia(m.item||m.rowId); return true; } return false; }
function waitFor(sel,ms){ return new Promise(res=>{ const t0=Date.now(); (function tick(){ const e=document.querySelector(sel); if(e) return res(e); if(Date.now()-t0>ms) return res(null); setTimeout(tick,150); })(); }); }
async function doSheet(){
  const v=g('view'), cache=g('mediaCache'), x=PAGE==='home'&&v==='media'&&cache&&cache.get&&cache.get(g('curMediaId'));
  if(x&&window.LukeSplit&&LukeSplit.isSheet(x)){ const s=await waitFor('.md-split',4000); if(s){ closePanelIfMobile(); try{ s.scrollIntoView({block:'start',behavior:'smooth'}); }catch(e){} return say('이 캐릭터 시트를 칸마다 한 장씩 나눠 두었어요 (무료 · 브라우저에서 자름). 각 칸 아래 버튼으로 따로 내려받거나 각도 사진으로 저장할 수 있어요.'); }
    return say('이 시트에서 칸을 찾지 못했어요. 칸 사이 여백이 분명한 시트만 자동으로 나눌 수 있어요.'); }
  const c=cfg(); let rows=[];
  if(c){ try{ const r=await fetch(c.url+'/rest/v1/'+c.table+'?select=id,title,path,external_url,kind,mime,face_id,created_at&hidden=eq.false&kind=eq.image&title=like.'+encodeURIComponent('*캐릭터 시트*')+'&order=created_at.desc&limit=30',{headers:hdr(c)}); if(r.ok) rows=await r.json(); }catch(e){} }
  rows=rows.filter(x=>!/\[각도·/.test(x.title||'')).map(x=>Object.assign(x,{url:rowUrl(c,x)})).filter(x=>x.url).slice(0,6);
  if(!rows.length) return say('공개 갤러리에 캐릭터 시트가 아직 없어요. 모델 페이지의 힉스필드 패널에서 「캐릭터 시트」를 만들면 여기서 나눌 수 있어요.');
  return say('캐릭터 시트 '+rows.length+'개를 찾았어요. 열면 칸마다 한 장씩 자동으로 나눠 보여 드려요.',{items:rows.map(x=>({id:x.id,title:cleanTitle(x.title)||'캐릭터 시트',url:x.url}))});
}
async function doDownload(){
  if(PAGE==='home'){
    const cast=document.querySelector('.cast-panel .cast-dl'); if(cast){ cast.click(); return say('지금 보고 있는 사진을 내려받았어요.'); }
    const v=g('view');
    if(v==='media'){ const a=document.querySelector('.md-acts .md-dl'); if(a){ a.click(); return say('이 작품을 내려받았어요.'); } }
    const m=contextModel();
    if(m){ const h=H(); const ext=(String(m.ref).match(/\.(png|jpe?g|webp)(\?|$)/i)||[,'png'])[1];
      try{ if(h&&h.download) await h.download({url:localize(m.ref),kind:'image',fileName:'lukemodel-'+m.key.replace(/^m-/,'g-').slice(0,20)+'.'+ext}); return say(m.name+' 사진을 내려받았어요.'); }catch(e){ return say('다운로드에 실패했어요: '+e.message); } }
    return say('어떤 걸 내려받을까요? 모델 카드나 작품을 연 뒤 "다운로드"라고 말해 주세요. 공개 갤러리의 모든 작품은 카드의 ⤓ 다운로드 버튼으로 무료로 받을 수 있어요.');
  }
  return say('스튜디오 결과는 카드를 열어 ⤓ 다운로드를 누르거나, 여러 장을 선택해 한꺼번에 받을 수 있어요. 공개 갤러리 탭의 작품도 모두 무료로 받을 수 있어요.',{actions:[{label:'공개 갤러리 탭 열기',act:'nav',arg:'gallery'}]});
}
function doMine(){ const acts=[{label:'스튜디오 내 결과 (이 브라우저)',act:'nav',arg:'assets'}]; if(PAGE==='home') acts.push({label:'내 페이지 (관심·받은 얼굴)',act:'nav',arg:'mine'});
  return say('내가 만든 이미지·영상은 스튜디오의 「에셋」 탭에 이 브라우저 기준으로 모여 있어요. 관심 얼굴과 받은 얼굴은 「내 페이지」에서 볼 수 있어요.',{actions:acts}); }
function doLogin(out){
  if(PAGE==='home'&&typeof openLogin==='function'){ const db=g('DB');
    if(db&&db.user){ return say(out?'로그아웃할까요?':'이미 '+jo(db.user.nick,'로')+' 로그인되어 있어요.',{actions:out?[{label:'로그아웃',act:'logout'}]:[]}); }
    closePanelIfMobile(true); openLogin(); return say('로그인 창을 열었어요. 구글·카카오·네이버 또는 닉네임으로 시작할 수 있어요.'); }
  if(window.LukeAuth&&LukeAuth.openAccount){ closePanelIfMobile(true); LukeAuth.openAccount(); return say('계정 창을 열었어요. 로그인하면 내가 올린 작품을 지울 수 있어요.'); }
  return say('상단의 「로그인」 버튼을 눌러 주세요.');
}
function doUpload(how){ const txt='업로드는 이렇게 해요:\n1) 상단 「+ 업로드」(스튜디오는 「+ 업로드」)를 누르고\n2) 이미지(10MB 이하)나 영상(50MB 이하)을 고른 뒤\n3) 올리면 공개 갤러리 맨 위에 바로 등록돼요. 누구나 무료로 내려받을 수 있으니 개인정보가 담긴 사진은 올리지 마세요.';
  return say(how?txt:'업로드 창을 열까요?\n'+txt,{actions:[{label:'지금 업로드 창 열기',act:'upload'}]}); }
function doKeyHelp(){ return say('힉스필드로 이미지·영상을 만들려면 본인 Higgsfield 키가 필요해요. 스튜디오 오른쪽 위 「키 추가」에 key-id:key-secret 형식으로 넣으면 이 브라우저에만 저장되고 platform.higgsfield.ai로만 전송돼요. 요금은 키 계정에 청구돼요.'+(hasKey()?'\n(지금 이 브라우저에는 키가 저장되어 있어요.)':''),{actions:[{label:'키 설정 열기',act:'key'}]}); }
async function doNav(to){
  if(to==='casting'){ if(!(await castingAvail())) return say('모델 캐스팅 화면은 아직 없어요. 대신 여기서 모델을 찾아 드릴게요.',{chips:['여성 모델 보여줘','남성 모델 보여줘','30대 여성 모델 보여줘']}); runAct('casting',{}); return say('모델 캐스팅 화면을 열었어요.'); }
  if(to==='studio'){ say('힉스필드 스튜디오를 열게요.'); if(PAGE!=='studio') location.href='/higgsfield/'; return; }
  if(to==='gallery'){ say('공개 갤러리를 열게요.'); runAct('nav','gallery'); return; }
  if(to==='fashion'){ say('가상 피팅 페이지를 열게요.'); location.href='/fashion/'; return; }
  if(to==='home'){ say('홈으로 갈게요.'); if(PAGE==='home'&&typeof go==='function') go('browse'); else location.href='/'; return; }
}

/* 버튼 동작 (대화 기록에 이름으로 저장 → 페이지를 옮겨도 다시 그려짐) */
function runAct(act,arg){
  if(act==='casting'){ const f=arg||{};
    if(PAGE==='home'&&window.LukeCasting&&typeof go==='function'){ if(LukeCasting.setFilter) LukeCasting.setFilter(f); closePanelIfMobile(); go('casting'); return; }
    if(PAGE==='home'&&typeof go==='function'){ const fl=g('filt'); if(fl){ fl.gender=f.g||''; fl.age=f.a||''; } closePanelIfMobile(); go('browse'); return; }
    localStorage.setItem(LS_PEND,JSON.stringify({act:'casting',f,ts:Date.now()})); location.href='/?view=casting'; return; }
  if(act==='nav'){
    if(arg==='assets'||arg==='gallery'){ const tab=arg==='assets'?'assets':'public';
      if(PAGE==='studio'){ const b=[...document.querySelectorAll('#tabs [role=tab]')].find(x=>x.textContent.startsWith(tab==='assets'?'에셋':'공개 갤러리')); if(b){ b.click(); closePanelIfMobile(); return; } }
      location.href='/higgsfield/?tab='+tab; return; }
    if(arg==='mine'){ if(PAGE==='home'&&typeof go==='function'){ closePanelIfMobile(); go('mine'); } else location.href='/'; return; } }
  if(act==='upload'){ if(PAGE==='home'&&typeof openUploadWorksModal==='function'){ closePanelIfMobile(true); openUploadWorksModal(null); return; } const b=document.getElementById('upBtn'); if(b){ closePanelIfMobile(true); b.click(); } return; }
  if(act==='logout'){ if(typeof logout==='function') logout(); return; }
  if(act==='key'){ if(PAGE==='studio'){ const b=document.getElementById('keyBtn'); if(b){ closePanelIfMobile(true); b.click(); } return; } const h={v:1,nonce:'k'+rid(),ts:Date.now(),openKey:true,keyOnly:true}; try{ localStorage.setItem(LS_HAND,JSON.stringify(h)); }catch(e){} location.href='/higgsfield/?assist='+h.nonce; return; }
  if(act==='item'){ if(PAGE==='home'&&window.LukeOpenMedia){ closePanelIfMobile(); LukeOpenMedia(arg); } else location.href='/?m='+encodeURIComponent(arg); return; }
}
/* 생성 준비 → 스튜디오. go=true 는 「생성하기」(방문자 본인 키로 1회 생성)에서만 */
function handoff(plan,goGen){
  const h={v:1,nonce:rid(),ts:Date.now(),surface:plan.surface,model:plan.model,refs:(plan.refs||[]).map(r=>r.url),start:plan.start?plan.start.url:null,prompt:plan.prompt,ar:plan.ar,dur:plan.dur,go:!!goGen,openKey:!!goGen&&!hasKey()};
  if(PAGE==='studio'&&window.LukeStudio&&LukeStudio.applyAssist){ closePanelIfMobile(true); LukeStudio.applyAssist(h); return; }
  try{ localStorage.setItem(LS_HAND,JSON.stringify(h)); }catch(e){ return say('브라우저 저장소를 쓸 수 없어 스튜디오로 넘기지 못했어요.'); }
  location.href='/higgsfield/?assist='+h.nonce;
}

/* ───────── 선택: 본인 Gemini 키로 자유 문장 해석 (기본 꺼짐 · 키는 이 탭 sessionStorage) ───────── */
const gemKey=()=>{ try{ return sessionStorage.getItem(SS_GEM)||''; }catch(e){ return ''; } };
async function askGemini(text){
  const key=gemKey(); if(!key) return null;
  const sys='너는 lukemodel.com(페이스루크) 방문자 도우미의 해석기다. 사이트 기능: 가상 인물 모델 찾기(성별·나이·금발 등), 선택한 모델로 이미지/영상 생성 준비(장면 설명), 각도 사진 만들기, 캐릭터 시트 나누기, 다운로드, 내 작품, 로그인, 업로드, 키 설정. '
   +'사용자 말을 아래 형식의 JSON 하나로만 답한다: {"reply":"짧은 한국어 답(1~2문장)","command":"사이트 명령 한 문장 또는 빈 문자열"}. command 예: "30대 여성 모델 보여줘", "이 모델로 카페에서 웃는 사진 만들어줘", "금발 여성으로 5초 해변 영상 만들어줘", "각도 사진 만들어줘", "다운로드", "내 작품 보여줘", "로그인", "업로드 어떻게 해?". 실존 인물·연예인 요청, 성인물, 미성년자 요청은 command를 비우고 정중히 거절한다. 절대 생성을 실행했다고 말하지 않는다.';
  const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(),20000);
  try{ const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{method:'POST',signal:ctl.signal,credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{role:'user',parts:[{text:String(text).slice(0,800)}]}],generationConfig:{maxOutputTokens:300,responseMimeType:'application/json',temperature:0.2}})});
    if(!r.ok) throw new Error(r.status===429?'Gemini 사용량 한도':r.status===400||r.status===403?'Gemini 키 확인 필요':'Gemini 오류 '+r.status);
    const j=await r.json(); const txt=(j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts||[]).map(p=>p.text||'').join('');
    const o=JSON.parse(txt.replace(/^```json|```$/g,'').trim()); return {reply:String(o.reply||'').slice(0,300),command:String(o.command||'').slice(0,200)};
  }catch(e){ return {error:e.name==='AbortError'?'Gemini 응답 시간 초과':e.message}; } finally{ clearTimeout(tm); }
}

/* ───────── 대화 기록 · 화면 ───────── */
let msgs=ss.get(SS_CHAT,[]); const saveMsgs=()=>{ msgs=msgs.slice(-40); ss.set(SS_CHAT,msgs); };
let UI=null, busy=false;
function say(text,extra){ const m=Object.assign({role:'bot',text,id:rid()},extra||{}); if(m.chips&&!m.chips.length) delete m.chips; msgs.push(m); saveMsgs(); if(UI) drawMsg(m,true); return m; }
function userMsg(text){ const m={role:'user',text,id:rid()}; msgs.push(m); saveMsgs(); if(UI) drawMsg(m,true); }
async function send(text){
  text=String(text||'').trim(); if(!text||busy) return; busy=true; userMsg(text); setTyping(true);
  try{
    await loadModels();
    const it=parse(text);
    if(it){ await exec(it); return; }
    if(gemKey()){ const a=await askGemini(text);
      if(a&&a.error){ say('자유 대화 AI를 쓰지 못했어요 ('+a.error+'). 아래 예시처럼 말해 주세요.',{chips:starterChips()}); return; }
      if(a){ const it2=a.command?parse(a.command):null; if(a.reply) say(a.reply); if(it2){ await exec(Object.assign(it2,it2.type==='gen'?{orig:text+' → '+a.command}:{})); } return; } }
    say('제가 아직 이해하지 못한 말이에요. 이런 식으로 말해 주세요:',{chips:starterChips()});
  }catch(e){ console.warn('assistant',e); say('처리 중 문제가 생겼어요: '+(e.message||e)); }
  finally{ busy=false; setTyping(false); }
}
const ICON='<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 3C6.9 3 3 6.4 3 10.6c0 2.4 1.3 4.5 3.3 5.9L5.6 20l3.9-2.1c.8.2 1.6.3 2.5.3 5.1 0 9-3.4 9-7.6S17.1 3 12 3Zm-3.8 8.9a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm3.8 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm3.8 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z"/></svg>';
function build(){
  if(UI) return UI; css();
  const fab=mk('button','la-fab'); fab.type='button'; fab.id='laFab'; fab.setAttribute('aria-label','AI 도우미 열기'); fab.title='AI 도우미'; fab.innerHTML=ICON+'<span class="la-fab-t">도우미</span>';
  const back=mk('div','la-back'); back.hidden=true;
  const pnl=mk('section','la-panel'); pnl.id='laPanel'; pnl.hidden=true; pnl.setAttribute('role','dialog'); pnl.setAttribute('aria-label','페이스루크 AI 도우미');
  const hd=mk('div','la-hd'); const ht=mk('div','la-ht'); ht.appendChild(mk('b',null,'페이스루크 도우미')); const sub=mk('span','la-sub'); ht.appendChild(sub); hd.appendChild(ht);
  const gear=mk('button','la-ic','⚙'); gear.type='button'; gear.title='설정'; gear.setAttribute('aria-label','도우미 설정');
  const clr=mk('button','la-ic','↺'); clr.type='button'; clr.title='대화 지우기'; clr.setAttribute('aria-label','대화 지우기');
  const x=mk('button','la-ic la-x','×'); x.type='button'; x.setAttribute('aria-label','도우미 닫기');
  hd.appendChild(gear); hd.appendChild(clr); hd.appendChild(x);
  const set=mk('div','la-set'); set.hidden=true;
  const list=mk('div','la-list'); list.setAttribute('role','log'); list.setAttribute('aria-live','polite');
  const typing=mk('div','la-typing','생각 중…'); typing.hidden=true;
  const chips=mk('div','la-chips');
  const form=mk('form','la-form'); const inp=mk('textarea','la-inp'); inp.rows=1; inp.placeholder='메시지를 입력하세요'; inp.setAttribute('aria-label','도우미에게 메시지'); inp.maxLength=500;
  const sb=mk('button','la-send','보내기'); sb.type='submit'; form.appendChild(inp); form.appendChild(sb);
  pnl.appendChild(hd); pnl.appendChild(set); pnl.appendChild(list); pnl.appendChild(typing); pnl.appendChild(chips); pnl.appendChild(form);
  document.body.appendChild(back); document.body.appendChild(pnl); document.body.appendChild(fab);
  UI={fab,back,pnl,list,chips,inp,typing,sub,set};
  const drawSub=()=>{ sub.textContent=gemKey()?'규칙 해석 + 내 Gemini 키(선택) · 생성 전 항상 확인':'무료 · 브라우저 안 규칙 해석 · 생성 전 항상 확인'; };
  drawSub();
  fab.onclick=()=>open(); x.onclick=()=>close(); back.onclick=()=>close();
  clr.onclick=()=>{ msgs=[]; saveMsgs(); ctx.lastKey=null; ctx.lastList=[]; ctx.pending=null; ctx.temp=null; saveCtx(); list.textContent=''; greet(); };
  gear.onclick=()=>{ set.hidden=!set.hidden; if(!set.hidden) drawSet(); };
  function drawSet(){ set.textContent='';
    set.appendChild(mk('p',null,'기본 두뇌는 브라우저 안의 규칙 해석기예요 (무료, 서버·키 없음). 원하면 본인 Gemini API 키를 넣어 이해하지 못한 문장만 AI로 해석할 수 있어요. 키는 이 탭에만 저장되고(탭을 닫으면 사라짐) Google로만 전송되며, 요금은 키 주인 계정에 적용돼요.'));
    const row=mk('div','la-setrow'); const k=mk('input','la-key'); k.type='password'; k.placeholder='AIza… (선택)'; k.autocomplete='off'; k.value=gemKey(); k.setAttribute('aria-label','Gemini API 키 (선택)');
    const sv=mk('button','la-mini','저장'); sv.type='button'; sv.onclick=()=>{ const v=k.value.trim(); try{ if(v) sessionStorage.setItem(SS_GEM,v); else sessionStorage.removeItem(SS_GEM); }catch(e){} drawSub(); set.hidden=true; say(v?'이 탭에서만 내 Gemini 키로 자유 문장을 해석할게요.':'Gemini 키를 지웠어요. 규칙 해석기만 써요.'); };
    const del=mk('button','la-mini','지우기'); del.type='button'; del.onclick=()=>{ k.value=''; sv.onclick(); };
    row.appendChild(k); row.appendChild(sv); row.appendChild(del); set.appendChild(row); }
  form.onsubmit=e=>{ e.preventDefault(); const v=inp.value; inp.value=''; autosize(); send(v); };
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); form.requestSubmit?form.requestSubmit():form.onsubmit(e); } });
  const autosize=()=>{ inp.style.height='auto'; inp.style.height=Math.min(96,inp.scrollHeight)+'px'; }; inp.addEventListener('input',autosize);
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!pnl.hidden&&!document.querySelector('#modal .modal,#modal .ov,.cast-ov')) close(); });
  msgs.forEach(m=>drawMsg(m,false)); if(!msgs.length) greet(); else drawChips(lastChips());
  if(PAGE==='home') document.body.classList.add('la-pad');
  place(); window.addEventListener('resize',place); setInterval(place,1200);
  return UI;
}
function greet(){ say('안녕하세요! 페이스루크 도우미예요. 모델 찾기, 이 모델로 사진·영상 준비, 각도 사진, 다운로드, 로그인·업로드를 대신 해 드려요. 무엇을 할까요?',{chips:starterChips()}); }
function lastChips(){ for(let i=msgs.length-1;i>=0;i--) if(msgs[i].role==='bot') return msgs[i].chips||starterChips(); return starterChips(); }
function setTyping(on){ if(UI){ UI.typing.hidden=!on; if(on) UI.list.scrollTop=UI.list.scrollHeight; } }
function drawChips(a){ const c=UI.chips; c.textContent=''; (a||[]).forEach(t=>{ const b=mk('button','la-chip',t); b.type='button'; b.onclick=()=>send(t); c.appendChild(b); }); }
function drawMsg(m,live){
  const L=UI.list; const row=mk('div','la-msg la-'+m.role); row.dataset.id=m.id;
  const bub=mk('div','la-bub'); String(m.text||'').split('\n').forEach((ln,i)=>{ if(i) bub.appendChild(document.createElement('br')); bub.appendChild(document.createTextNode(ln)); }); row.appendChild(bub);
  if(m.cards&&m.cards.length){ const grid=mk('div','la-cards'); row.appendChild(grid); const fill=()=>{ grid.textContent=''; m.cards.forEach((k,i)=>{ const md=byKey(k)||(ctx.temp&&ctx.temp.key===k?rec(ctx.temp):null); if(!md) return;
      const b=mk('button','la-card'); b.type='button'; b.dataset.key=k; b.setAttribute('aria-label',md.name+' '+md.info+(m.pick?' 이 모델로 준비':' 크게 보기'));
      const im=mk('img'); im.src=md.thumb; im.alt=''; im.loading='lazy'; im.referrerPolicy='no-referrer'; b.appendChild(im);
      if(m.cards.length>1) b.appendChild(mk('span','la-no',String(i+1)));
      const cp=mk('span','la-cap'); cp.appendChild(mk('b',null,md.name)); cp.appendChild(mk('i',null,md.info)); b.appendChild(cp);
      if(m.pick) b.appendChild(mk('span','la-pick','이 모델로'));
      b.onclick=()=>{ if(m.pick){ remember(md); const orig=m.pickOrig||(ctx.pending&&ctx.pending.orig); if(orig){ ctx.pending=null; saveCtx(); const it=parse(orig)||{}; if(it.type==='gen'){ it.d={gender:'',age:'',words:[],num:null,ord:null}; send_internal(md.name+' 선택',()=>doGen(it)); return; } } send_internal(md.name+' 선택',()=>doPick(md)); }
        else { remember(md); openModel(md,false); } };
      grid.appendChild(b); }); };
    if(D.list) fill(); else loadModels().then(fill); }
  if(m.angles){ const md=byKey(m.angles); if(md&&md.angN){ const a=mk('div','la-angs'); ANG.forEach(([k,l])=>{ const v=md.angles[k]; const f=mk('figure'); if(v){ const im=mk('img'); im.src=v.url; im.alt=l; im.loading='lazy'; f.appendChild(im); } else f.appendChild(mk('i',null,'—')); f.appendChild(mk('figcaption',null,l)); a.appendChild(f); }); row.appendChild(a); } }
  if(m.items&&m.items.length){ const a=mk('div','la-items'); m.items.forEach(x=>{ const b=mk('button','la-item'); b.type='button'; const im=mk('img'); im.src=x.url; im.alt=''; im.loading='lazy'; b.appendChild(im); b.appendChild(mk('span',null,x.title)); b.onclick=()=>runAct('item',x.id); a.appendChild(b); }); row.appendChild(a); }
  if(m.plan) row.appendChild(planCard(m));
  if(m.actions&&m.actions.length){ const a=mk('div','la-acts'); m.actions.forEach(o=>{ const b=mk('button','la-act',o.label); b.type='button'; b.onclick=()=>runAct(o.act,o.arg); a.appendChild(b); }); row.appendChild(a); }
  L.appendChild(row);
  if(live){ L.scrollTop=L.scrollHeight; if(m.role==='bot') drawChips(m.chips||(m.plan?[]:starterChips())); if(UI.pnl.hidden&&m.role==='bot') UI.fab.classList.add('la-dot'); }
}
async function send_internal(label,fn){ if(busy) return; busy=true; userMsg(label); setTyping(true); try{ await fn(); }catch(e){ say('처리 중 문제가 생겼어요: '+e.message); } finally{ busy=false; setTyping(false); } }
function planCard(m){ const p=m.plan; const c=mk('div','la-plan');
  const top=mk('div','la-plan-top'); const im=mk('img'); im.src=p.thumb; im.alt=''; im.referrerPolicy='no-referrer'; top.appendChild(im);
  const info=mk('div','la-plan-i'); info.appendChild(mk('b',null,(p.surface==='video'?'🎬 영상 · ':'🖼 이미지 · ')+p.name));
  info.appendChild(mk('span',null,p.engineLabel+(p.surface==='video'?' · '+p.dur+'초 · 시작 프레임: '+p.start.label:' · '+p.ar)));
  info.appendChild(mk('span',null,p.surface==='video'?'얼굴 사진을 첫 장면으로 넣어 같은 인물로 움직여요':'참고 이미지 '+p.refs.length+'장: '+p.refs.map(r=>r.label).join(' + ')));
  top.appendChild(info); c.appendChild(top);
  if(p.surface!=='video'&&p.refs.length>1){ const rr=mk('div','la-refs'); p.refs.forEach(r=>{ const f=mk('figure'); const i=mk('img'); i.src=localize(r.url); i.alt=r.label; i.loading='lazy'; f.appendChild(i); f.appendChild(mk('figcaption',null,r.label)); rr.appendChild(f); }); c.appendChild(rr); }
  const lab=mk('label','la-plab','프롬프트 (고쳐도 돼요)'); const ta=mk('textarea','la-pta'); ta.value=p.prompt; ta.rows=4; ta.maxLength=4000; ta.oninput=()=>{ p.prompt=ta.value; saveMsgs(); }; lab.appendChild(ta); c.appendChild(lab);
  const k=hasKey();
  c.appendChild(mk('p','la-pnote',k?'「생성하기」를 누르면 스튜디오가 열리고 내 Higgsfield 키로 1회 생성해요 (요금은 키 계정에 청구). 먼저 보기만 하려면 「스튜디오에서 열기」.':'이 브라우저에 Higgsfield 키가 없어요. 「스튜디오에서 열기」로 내용을 채워 두고, 「키 넣고 생성하기」를 누르면 키 입력 창이 열려요 (생성은 키를 넣은 뒤 스튜디오의 「생성」을 직접 눌러야 해요).'));
  const row=mk('div','la-pacts');
  const go1=mk('button','la-go',k?'생성하기':'키 넣고 생성하기'); go1.type='button'; go1.dataset.plan=p.id; go1.onclick=()=>{ say(k?'스튜디오에서 생성할게요…':'스튜디오를 열고 키 입력 창을 띄울게요.'); handoff(p,true); };
  const op=mk('button','la-open','스튜디오에서 열기'); op.type='button'; op.onclick=()=>{ say('스튜디오에 채워 둘게요. 생성은 하지 않아요.'); handoff(p,false); };
  row.appendChild(go1); row.appendChild(op); c.appendChild(row); return c; }
function isMobile(){ return window.matchMedia('(max-width:720px)').matches; }
function open(){ build(); const over=!!document.querySelector('#modal .cast-panel'); UI.pnl.style.zIndex=over?'110':''; UI.back.style.zIndex=over?'108':''; UI.pnl.hidden=false; UI.back.hidden=!isMobile(); UI.fab.classList.add('la-on'); UI.fab.classList.remove('la-dot'); UI.fab.setAttribute('aria-expanded','true'); drawChips(lastChips()); UI.list.scrollTop=UI.list.scrollHeight; setTimeout(()=>{ try{ UI.inp.focus({preventScroll:true}); }catch(e){} },30); loadModels(); }
function close(){ if(!UI) return; UI.pnl.hidden=true; UI.back.hidden=true; UI.fab.classList.remove('la-on'); UI.fab.setAttribute('aria-expanded','false'); }
/* 캐스팅 패널이 열리면: 그 모델을 '이 모델'로 기억하고, 패널이 대화창 위로 오게 */
document.addEventListener('lukecasting:open',e=>{ const k=e.detail&&e.detail.key; const m=k&&byKey(k); if(m) remember(m); else if(k){ ctx.lastKey=k; ctx.temp=null; saveCtx(); } if(UI){ UI.pnl.style.zIndex=''; UI.back.style.zIndex=''; } });
function closePanelIfMobile(always){ if(always||isMobile()) close(); }
/* 떠 있는 버튼 자리: 다른 버튼(내 AI 모델)·스튜디오 입력창 위로 */
function place(){ if(!UI) return; let b=18;
  const aside=document.getElementById('aiAsideFab'); if(aside&&getComputedStyle(aside).display!=='none'){ const r=aside.getBoundingClientRect(); if(r.height) b=Math.max(b,innerHeight-r.top+10); }
  const comp=document.querySelector('.composer'); if(comp){ const r=comp.getBoundingClientRect(); if(r.height&&r.top<innerHeight) b=Math.max(b,innerHeight-r.top+10); }
  const sel=document.querySelector('.selbar'); if(sel&&getComputedStyle(sel).display!=='none'){ const r=sel.getBoundingClientRect(); if(r.height) b=Math.max(b,innerHeight-r.top+10); }
  b=avoid(b);
  UI.fab.style.bottom=b+'px'; if(!isMobile()) UI.pnl.style.bottom=Math.max(16,b-4)+'px'; else UI.pnl.style.bottom=''; }

/* 버튼 밑에 작은 조작 버튼(다운로드·참고로 사용 등)이 깔리면 그 버튼 위로 비켜섬. 큰 카드 전체 버튼은 무시 */
const HIT='a,button,input,select,textarea,label,summary,[role=button],[onclick],video[controls]';
function hitAt(bb){ const w=UI.fab.offsetWidth||58, rt=parseFloat(getComputedStyle(UI.fab).right)||16;
  const L=innerWidth-rt-w, T=innerHeight-bb-w;
  for(const x of [L+3,L+w/2,L+w-3]) for(const y of [T+3,T+w/2,T+w-3]){
    if(y<0) continue;
    for(const e of document.elementsFromPoint(x,y)){ if(UI.fab.contains(e)||UI.pnl.contains(e)||e===UI.back) continue;
      const c=e.closest(HIT); if(c){ const r=c.getBoundingClientRect(); if(r.height<=100&&r.width<=innerWidth*0.6) return r; }
      break; } }
  return null; }
function avoid(base){ let bb=base;
  for(let i=0;i<5;i++){ const r=hitAt(bb); if(!r) return bb; bb=Math.ceil(innerHeight-r.top+8); if(bb>innerHeight*0.6) return base; }
  return hitAt(bb)?base:bb; }
let placeT=null; window.addEventListener('scroll',()=>{ clearTimeout(placeT); placeT=setTimeout(place,110); },{passive:true});

/* 다른 페이지에서 넘어온 할 일 (각도 만들기·캐스팅 필터) */
async function pending(){
  if(PAGE==='home') castingAvail();
  let p=null; try{ p=JSON.parse(localStorage.getItem(LS_PEND)||'null'); localStorage.removeItem(LS_PEND); }catch(e){}
  if(!p||Date.now()-(p.ts||0)>5*60e3||PAGE!=='home') return;
  await loadModels();
  if(p.act==='casting'&&window.LukeCasting&&typeof go==='function'){ if(LukeCasting.setFilter) LukeCasting.setFilter(p.f||{}); go('casting'); }
  if(p.act==='open'){ const m=byKey(p.key); if(m){ if(m.cast&&window.LukeCasting) openModel(m); else await gotoFace(m); } }
  if(p.act==='angles'){ const m=byKey(p.key); if(m){ build(); open(); await runAngles(m); } }
}

const CSS=`
.la-fab{transition:bottom .18s ease}
@media (max-width:700px){body.la-pad{padding-bottom:84px}}
.la-fab{position:fixed;right:16px;bottom:18px;z-index:45;width:58px;height:58px;border-radius:50%;background:#d1fe17;color:#111;border:0;box-shadow:0 10px 26px rgba(0,0,0,.5),0 0 0 3px rgba(15,17,23,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;cursor:pointer;padding:0;font:800 10px/1 system-ui,sans-serif}
.la-fab:hover{filter:brightness(1.06)}.la-fab:focus-visible{outline:3px solid #fff;outline-offset:3px}
.la-fab svg{width:24px;height:24px}.la-fab-t{font-size:9.5px;margin-top:1px;letter-spacing:-.2px}
.la-fab.la-on{background:#2a2f3d;color:#d1fe17}
.la-fab.la-dot::after{content:'';position:absolute;top:4px;right:4px;width:11px;height:11px;border-radius:50%;background:#ff5a5a;border:2px solid #0f1117}
.la-back{position:fixed;inset:0;z-index:88;background:rgba(0,0,0,.45)}
.la-back[hidden],.la-panel[hidden],.la-set[hidden],.la-typing[hidden]{display:none!important}
.la-panel{position:fixed;right:16px;bottom:16px;z-index:90;width:390px;height:min(640px,calc(100vh - 110px));display:flex;flex-direction:column;background:#12141b;border:1px solid #2c3243;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.6);color:#e6e8ef;font:14px/1.5 system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;overflow:hidden}
.la-hd{display:flex;align-items:center;gap:4px;padding:11px 10px 10px 14px;border-bottom:1px solid #232835;background:#151822}
.la-ht{flex:1;min-width:0;display:flex;flex-direction:column}.la-ht b{font-size:15px;color:#fff}.la-sub{font-size:11px;color:#8b93a7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.la-ic{width:34px;height:34px;border-radius:9px;background:transparent;border:1px solid transparent;color:#aab1c3;font-size:17px;cursor:pointer;flex-shrink:0}.la-ic:hover{background:#1f2330;color:#fff}.la-x{font-size:22px}
.la-set{padding:10px 14px;border-bottom:1px solid #232835;background:#10121a;font-size:12px;color:#9aa1b3}.la-set p{margin:0 0 8px;line-height:1.55}
.la-setrow{display:flex;gap:6px}.la-key{flex:1;min-width:0;background:#171a24;border:1px solid #333a4c;border-radius:8px;color:#fff;padding:7px 9px;font-size:16px}
.la-mini{background:#252b3c;border:1px solid #3a4258;color:#fff;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer}
.la-list{flex:1;overflow-y:auto;padding:12px 12px 6px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.la-msg{display:flex;flex-direction:column;gap:7px;max-width:100%}
.la-bub{padding:9px 12px;border-radius:14px;font-size:13.8px;line-height:1.55;word-break:keep-all;overflow-wrap:anywhere;max-width:88%}
.la-bot .la-bub{background:#1b1f2b;border:1px solid #262c3b;border-top-left-radius:5px;align-self:flex-start}
.la-user .la-bub{background:#d1fe17;color:#111;font-weight:600;border-top-right-radius:5px;align-self:flex-end}
.la-typing{padding:0 16px 6px;font-size:12px;color:#8b93a7}
.la-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
.la-card{position:relative;padding:0;border:1px solid #262c3b;border-radius:11px;overflow:hidden;background:#0c0d12;cursor:pointer;aspect-ratio:3/4;min-width:0;text-align:left}
.la-card:hover,.la-card:focus-visible{border-color:#d1fe17;outline:none}
.la-card img{width:100%;height:100%;object-fit:cover;object-position:50% 22%;display:block}
.la-no{position:absolute;top:5px;left:5px;min-width:18px;height:18px;border-radius:9px;background:rgba(15,17,23,.82);color:#d1fe17;font-size:10.5px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 4px}
.la-cap{position:absolute;left:0;right:0;bottom:0;padding:18px 6px 5px;background:linear-gradient(180deg,rgba(8,9,13,0),rgba(8,9,13,.92) 55%);display:flex;flex-direction:column}
.la-cap b{font-size:11.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.la-cap i{font-style:normal;font-size:9.8px;color:#b9bfcf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.la-pick{position:absolute;top:5px;right:5px;font-size:9.5px;font-weight:900;background:#d1fe17;color:#111;border-radius:6px;padding:2px 5px}
.la-angs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.la-angs figure{margin:0;position:relative;aspect-ratio:3/4;border-radius:8px;overflow:hidden;background:#0c0d12;border:1px solid #262c3b;display:flex;align-items:center;justify-content:center;color:#555}
.la-angs img{width:100%;height:100%;object-fit:cover;object-position:50% 20%}.la-angs figcaption{position:absolute;left:0;right:0;bottom:0;font-size:9.5px;text-align:center;background:rgba(0,0,0,.6);color:#fff}
.la-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.la-item{padding:0;border:1px solid #262c3b;border-radius:9px;overflow:hidden;background:#0c0d12;cursor:pointer;color:#cfd4e2;text-align:left}
.la-item img{width:100%;aspect-ratio:1;object-fit:cover;display:block}.la-item span{display:block;font-size:10px;padding:3px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.la-acts{display:flex;flex-wrap:wrap;gap:6px}
.la-act{background:#1d2230;border:1px solid #3a4258;color:#fff;border-radius:9px;padding:7px 11px;font-size:12.5px;font-weight:700;cursor:pointer}.la-act:hover{border-color:#d1fe17}
.la-plan{background:#171b26;border:1px solid #39431c;border-radius:13px;padding:10px;display:flex;flex-direction:column;gap:8px}
.la-plan-top{display:flex;gap:10px;align-items:flex-start}.la-plan-top img{width:54px;height:72px;border-radius:8px;object-fit:cover;object-position:50% 22%;flex-shrink:0;background:#0c0d12}
.la-plan-i{display:flex;flex-direction:column;gap:2px;min-width:0}.la-plan-i b{font-size:13.5px;color:#fff}.la-plan-i span{font-size:11.5px;color:#aab1c3}
.la-refs{display:flex;gap:5px}.la-refs figure{margin:0;position:relative;width:46px;height:60px;border-radius:7px;overflow:hidden;background:#0c0d12;border:1px solid #2c3243}.la-refs img{width:100%;height:100%;object-fit:cover;object-position:50% 20%}.la-refs figcaption{position:absolute;left:0;right:0;bottom:0;font-size:9px;text-align:center;background:rgba(0,0,0,.62);color:#fff}
.la-plab{display:flex;flex-direction:column;gap:4px;font-size:11px;color:#8b93a7}.la-pta{background:#10121a;border:1px solid #2f3547;border-radius:9px;color:#dfe3ee;font:12.5px/1.5 system-ui,sans-serif;padding:8px;resize:vertical;min-height:70px}
.la-pnote{margin:0;font-size:11px;color:#9aa1b3;line-height:1.5}
.la-pacts{display:flex;gap:7px}.la-go{flex:1.2;background:#d1fe17;color:#111;border:0;border-radius:10px;padding:10px 8px;font-weight:900;font-size:13.5px;cursor:pointer}.la-open{flex:1;background:#232838;color:#fff;border:1px solid #3a4258;border-radius:10px;padding:10px 8px;font-weight:700;font-size:13px;cursor:pointer}
.la-chips{display:flex;gap:6px;overflow-x:auto;padding:6px 12px 4px;scrollbar-width:none;flex-shrink:0}.la-chips::-webkit-scrollbar{display:none}
.la-chip{flex:0 0 auto;background:#171a24;border:1px solid #333a4c;color:#dfe3ee;border-radius:16px;padding:6px 11px;font-size:12.5px;cursor:pointer;white-space:nowrap}.la-chip:hover{border-color:#d1fe17;color:#fff}
.la-form{display:flex;gap:7px;padding:8px 10px 10px;border-top:1px solid #232835;background:#12141b;align-items:flex-end}
.la-inp{flex:1;min-width:0;resize:none;background:#171a24;border:1px solid #333a4c;border-radius:12px;color:#fff;font:16px/1.4 system-ui,sans-serif;padding:9px 11px;max-height:96px}
.la-inp:focus{outline:none;border-color:#d1fe17}
.la-send{background:#d1fe17;color:#111;border:0;border-radius:11px;padding:10px 13px;font-weight:900;font-size:13.5px;cursor:pointer;white-space:nowrap}
@media (max-width:720px){
 .la-panel{left:0;right:0;bottom:0;width:auto;height:min(82vh,680px);border-radius:18px 18px 0 0;border-bottom:0}
 .la-fab{right:14px;width:54px;height:54px}
 .la-hd{padding-top:12px}
}
@media (max-width:370px){.la-cards{gap:5px}.la-cap b{font-size:10.5px}}
`;
function css(){ if(document.getElementById('laCss')) return; const s=document.createElement('style'); s.id='laCss'; s.textContent=CSS; (document.head||document.documentElement).appendChild(s); }

function boot(){ build(); pending().catch(()=>{}); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else setTimeout(boot,0);
window.LukeAssist={open,close,send,parse,exec,loadModels,contextModel,_ctx:ctx,_msgs:()=>msgs,buildPrompt,slotsOf,descriptors};
})();
