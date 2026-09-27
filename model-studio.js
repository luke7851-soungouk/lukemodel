'use strict';
(() => {
  let panel, panelOwner, busy=false, stop=false, controller=null, selected=null, product=null, items=[], higgsUploadApproved=false;
  const $=id=>document.getElementById('ms-'+id);
  const el=(tag,text,cls)=>{const n=document.createElement(tag); if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const status=t=>{$('status').textContent=t;};
  const db=new Promise((resolve,reject)=>{const r=indexedDB.open('luke-model-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  db.catch(()=>{});
  function owner(){return typeof studioStorageKey==='function'?studioStorageKey():'local';}
  async function storage(mode,value){const d=await db;return new Promise((resolve,reject)=>{const tx=d.transaction('projects',mode);const s=tx.objectStore('projects');const r=mode==='readonly'?s.get(panelOwner):s.put(value,panelOwner);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async function save(){try{await storage('readwrite',{items,selected: selected?.id||null,product,fields:fields()});return true;}catch{status('기기 저장 공간이 부족하거나 저장이 차단됐어요. 이미지를 다운로드해 주세요.');return false;}}
  function fields(){return Object.fromEntries(['name','gender','age','height','hair','mood','brief','outfit','background'].map(k=>[k,$(k).value]));}
  function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
  function options(id,values){const s=el('select');s.id='ms-'+id;values.forEach(v=>s.add(new Option(v,v)));return s;}
  function field(parent,label,id,values){const l=el('label',label);let n=Array.isArray(values)?options(id,values):el(values==='textarea'?'textarea':'input');n.id='ms-'+id;if(n.tagName==='INPUT'||n.tagName==='TEXTAREA')n.maxLength=id==='brief'?1200:150;l.append(n);parent.append(l);return n;}
  const safeImage=url=>typeof url==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
  function draw(){
    const grid=$('gallery');grid.replaceChildren();$('chosen').textContent=selected?'확정 모델: '+selected.name:'후보 카드에서 기준 모델을 확정하세요.';
    if(!items.length)grid.append(el('p','조건을 입력해 후보를 생성하거나 모델 사진을 불러오세요.','ms-empty'));
    items.forEach(item=>{const card=el('article',null,'ms-card');if(selected?.id===item.id)card.classList.add('chosen');const image=el('img');image.src=item.url;image.alt=item.name;card.append(image,el('h3',item.name),el('p',item.kind));
      const actions=el('div',null,'ms-actions');if(item.kind==='모델 후보'||item.kind==='불러온 모델')actions.append(button(selected?.id===item.id?'✓ 확정됨':'이 모델 확정',async()=>{if(busy)return;selected=item;draw();await save();}));
      const a=el('a','다운로드');a.href=item.url;a.download='luke-model-'+item.id+'.png';actions.append(a);card.append(actions);grid.append(card);});
  }
  async function readImage(file){if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('JPG·PNG·WebP 이미지 8MB 이하를 선택해 주세요.');
    const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
    const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('이미지를 읽지 못했어요.'));image.src=raw;});
    const canvas=document.createElement('canvas'),scale=Math.min(1,1536/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');}
  function fileInput(parent,label,fn){const l=el('label',label),input=el('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.onchange=async()=>{if(busy)return;try{const url=await readImage(input.files[0]);await fn(url);}catch(e){status(e.message);}input.value='';};l.append(input);parent.append(l);}
  function connections(){const cfg=loadStudioCfg();return (cfg.connections||[]).filter(c=>c.enabled!==false&&c.kind==='image'&&((c.provider==='google'&&/^gemini-[\w.-]+image[\w.-]*$/.test(c.model))||(c.provider==='openai'&&/^gpt-image-[\w.-]+$/.test(c.model))||c.provider==='higgsfield'));}
  function refresh(){const s=$('connection'),previous=s.value;s.replaceChildren();connections().forEach(c=>s.add(new Option(c.name+' · '+(c.provider==='higgsfield'?'SOUL V2 / Z-Image':c.model),c.id)));if(!s.options.length)s.add(new Option('AI 연결 설정에서 Gemini Image, GPT Image 또는 Higgsfield를 추가하세요',''));if([...s.options].some(o=>o.value===previous))s.value=previous;}
  async function higgsRefs(refs){
    if(!refs.length)return [];
    if(!higgsUploadApproved){
      const ok=confirm('Higgsfield가 참고 사진을 사용하려면 사진을 lukemodel의 공개 미디어 저장소에 올린 뒤 Higgsfield로 전달해야 해요. 얼굴·제품 사진의 사용 권한이 있고 전송에 동의하면 확인을 눌러 주세요.');
      if(!ok)throw new Error('참고 사진 전송을 취소했어요.');
      higgsUploadApproved=true;
    }
    if(!window.LukeHF||typeof LukeHF.uploadInput!=='function')throw new Error('Higgsfield 참고 사진 업로드 기능을 불러오지 못했어요. 새로고침해 주세요.');
    const urls=[];
    for(let i=0;i<refs.length;i++){
      if(!safeImage(refs[i]))throw new Error('참고 이미지가 손상됐어요. 다시 불러와 주세요.');
      const blob=await (await fetch(refs[i])).blob();
      const ext=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
      urls.push(await LukeHF.uploadInput(new File([blob],'model-studio-reference-'+(i+1)+'.'+ext,{type:blob.type||'image/png'})));
    }
    return urls;
  }
  async function keepResult(url){
    if(safeImage(url))return url;
    if(!/^https:\/\//i.test(String(url||'')))throw new Error('Higgsfield 응답에 이미지가 없어요.');
    try{
      const blob=typeof fetchAsBlob==='function'?await fetchAsBlob(url):await (await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'})).blob();
      if(!/^image\/(png|jpeg|webp)$/i.test(blob.type))throw new Error('not-image');
      return typeof blobToDataUrl==='function'?await blobToDataUrl(blob):await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    }catch{throw new Error('Higgsfield 생성은 완료됐지만 결과를 기기에 보관하지 못했어요. Higgsfield 결과 페이지에서 바로 다운로드해 주세요.');}
  }
  async function generate(prompt,refs,connection,cfg){
    controller=new AbortController();const timer=setTimeout(()=>controller.abort(),150000);
    try{let url,body,headers;
      if(connection.provider==='higgsfield'){
        if(typeof studioGenHiggs!=='function')throw new Error('Higgsfield 생성 모듈을 불러오지 못했어요. 새로고침해 주세요.');
        const publicRefs=await higgsRefs(refs);
        const result=await studioGenHiggs(prompt,Date.now()%2147483647,false,{raw:true,refImage:publicRefs[0]||null,refUrl:publicRefs[0]||null});
        return await keepResult(result&&result.url);
      }else if(connection.provider==='google'){
        url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(connection.model)+':generateContent';headers={'Content-Type':'application/json','x-goog-api-key':cfg.googleGeminiKey};
        const parts=[{text:prompt},...refs.map(r=>{if(!safeImage(r))throw new Error('참고 이미지가 손상됐어요. 다시 불러와 주세요.');const m=r.match(/^data:([^;]+);base64,(.+)$/);return {inline_data:{mime_type:m[1],data:m[2]}};})];body=JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseModalities:['TEXT','IMAGE']}});
      }else{headers={Authorization:'Bearer '+cfg.openaiKey};url='https://api.openai.com/v1/images/'+(refs.length?'edits':'generations');
        if(refs.length){body=new FormData();body.append('model',connection.model);body.append('prompt',prompt);body.append('n','1');body.append('size','1024x1024');for(const [i,r] of refs.entries()){if(!safeImage(r))throw new Error('참고 이미지가 손상됐어요.');body.append('image[]',await (await fetch(r)).blob(),'reference-'+i+'.png');}}
        else{headers['Content-Type']='application/json';body=JSON.stringify({model:connection.model,prompt,n:1,size:'1024x1024'});}}
      const response=await fetch(url,{method:'POST',headers,body,signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)throw new Error(({402:'API 결제·잔액을 확인해 주세요.',429:'사용량 한도에 도달했어요. 잠시 후 다시 시도해 주세요.',401:'API 키를 확인해 주세요.',403:'API 접근 권한을 확인해 주세요.'})[response.status]||'생성 요청 실패 ('+response.status+'). 연결 모델과 설정을 확인해 주세요.');
      const data=await response.json();let result;
      if(connection.provider==='google'){const p=(data.candidates||[]).flatMap(c=>c.content?.parts||[]).find(p=>!p.thought&&(p.inlineData||p.inline_data));const im=p&&(p.inlineData||p.inline_data);if(im)result='data:'+(im.mimeType||im.mime_type||'image/png')+';base64,'+im.data;}
      else if(data.data?.[0]?.b64_json)result='data:image/png;base64,'+data.data[0].b64_json;
      if(!safeImage(result))throw new Error('이미지 응답이 없어요. 조건을 바꾸거나 이미지 모델 연결을 확인해 주세요.');return result;
    }finally{clearTimeout(timer);controller=null;}
  }
  function lock(value){busy=value;panel.querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=value);$('stop').disabled=!value;}
  async function run(kind){if(busy)return;const f=fields(),cfg=loadStudioCfg(),c=connections().find(c=>c.id===$('connection').value);
    if(!c||connectionKeyMissing(c,cfg)){status('기존 AI 연결 설정에 본인 API 키와 이미지 모델을 먼저 연결해 주세요.');return;}
    if(kind!=='candidate'&&!selected){status('먼저 기준 모델을 확정해 주세요.');return;}
    const jobs=kind==='candidate'?Array.from({length:Number($('count').value)},(_,i)=>['후보 '+(i+1),'Create a distinct fictional adult casting model; variation '+crypto.randomUUID()+'.']):kind==='angles'?[['정면','front view'],['좌측면','left profile'],['우측면','right profile'],['뒷면','back view'],['클로즈업','face close-up']]:kind==='outfits'?['비즈니스 정장','스트리트 캐주얼','스포티룩'].map(x=>[x,'Change clothing to '+x]):[[kind==='outfit'?'의상 테스트':'배경 테스트',kind==='outfit'?'Change clothing to '+f.outfit:'Place the model in '+f.background]];
    if(items.length+jobs.length>40){status('프로젝트당 최대 40장이에요. 프로젝트를 내보낸 뒤 새 프로젝트를 시작해 주세요.');return;}
    stop=false;lock(true);let done=0;const original=selected,refs=kind==='candidate'?(product?[product]:[]):[original.url,...(kind==='background'&&product?[product]:[])];
    try{for(const [label,direction] of jobs){if(stop)break;status(label+' 생성 중 · '+(done+1)+'/'+jobs.length+' · 선택한 API 사용량이 청구돼요.');
      const identity=kind==='candidate'?'Do not imitate any real person. '+(product?'The reference is a PRODUCT mood reference. Cast a model suited to its design and audience; do not copy people from the product photo.':''):'Reference image 1 is the confirmed person. Preserve their exact facial identity, age, hair and body proportions. '+(refs.length>1?'Reference image 2 is the product; preserve its design.':'');
      const prompt=[identity,'Natural editorial photograph, realistic skin texture, subtle asymmetry, no plastic skin, no beauty filter, one adult person, no collage.',kind==='candidate'?JSON.stringify({gender:f.gender,age:f.age,height:f.height,hair:f.hair,mood:f.mood}):'', 'Campaign brief: '+f.brief, direction,kind==='candidate'||kind==='angles'?'Plain white T-shirt and blue jeans, neutral gray studio background.':'', 'One image, no captions.'].filter(Boolean).join('\n');
      const result=await generate(prompt,refs,c,cfg);const item={id:crypto.randomUUID(),name:(f.name.trim()||'LUKE')+' · '+label,kind:kind==='candidate'?'모델 후보':label,url:result,prompt,parentId:original?.id||null,createdAt:new Date().toISOString()};items.push(item);done++;draw();if(!await save())break;}
      status((stop?'중지했어요.':'작업을 마쳤어요.')+' '+done+'장 생성 · 확정 모델과 얼굴 일관성을 직접 비교해 주세요.');
    }catch(e){const raw=String(e&&e.message||e);const friendly=raw==='no-higgs'?'Higgsfield 자격증명(key-id:key-secret)을 AI 연결 설정에 입력해 주세요.':raw;status((e.name==='AbortError'?'요청이 중지되었거나 시간이 초과됐어요. 서버에서 이미 처리 중이면 비용이 발생할 수 있어요.':friendly)+' 완료된 '+done+'장은 유지돼요.');}finally{lock(false);}}
  function downloadProject(){const data=JSON.stringify({version:1,items,selected:selected?.id||null,product,fields:fields()},null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=el('a');a.href=url;a.download='luke-model-studio.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function open(){if(panel && panelOwner!==owner()){panel.remove();panel=null;items=[];selected=null;product=null;}panelOwner=owner();if(panel){panel.hidden=false;refresh();return;}panel=el('section');panel.id='model-studio-panel';panel.setAttribute('aria-label','모델 스튜디오');
    const style=el('style');style.textContent=`#model-studio-panel{position:fixed;inset:0;z-index:90;overflow:auto;background:#0c0e14;color:#f1f2f7;padding:24px;font:15px system-ui,sans-serif}#model-studio-panel *{box-sizing:border-box}#model-studio-panel [hidden]{display:none!important}.ms-shell{max-width:1280px;margin:auto}.ms-head,.ms-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.ms-head{justify-content:space-between}.ms-kicker{color:#c9fb68;letter-spacing:3px;font-size:12px}.ms-layout{display:grid;grid-template-columns:310px 1fr;gap:24px;margin-top:25px}#model-studio-panel h1{font-size:36px;margin:14px 0}#model-studio-panel h2{font-size:19px;margin:20px 0 12px}#model-studio-panel p{line-height:1.7;color:#b4bacd}#model-studio-panel label{display:block;margin:12px 0;color:#c4c9d8;font-size:13px}#model-studio-panel input,#model-studio-panel select,#model-studio-panel textarea{display:block;width:100%;margin-top:6px;padding:11px;background:#141824;color:#fff;border:1px solid #394055;border-radius:9px;font:16px system-ui}#model-studio-panel textarea{min-height:90px}#model-studio-panel button,#model-studio-panel a{background:#252b3c;border:1px solid #424b65;color:#fff;border-radius:9px;padding:11px 14px;cursor:pointer;font:14px system-ui;text-decoration:none}#model-studio-panel button:disabled{opacity:.45;cursor:default}#model-studio-panel :focus-visible{outline:3px solid #c9fb68;outline-offset:2px}#ms-generate{background:#c9fb68;color:#142008;font-weight:800;width:100%}.ms-box{padding:20px;background:#141722;border:1px solid #2c3243;border-radius:16px}.ms-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:18px}.ms-card{background:#191e2c;border:2px solid transparent;border-radius:13px;overflow:hidden}.ms-card.chosen{border-color:#c9fb68}.ms-card img{width:100%;aspect-ratio:3/4;object-fit:contain;background:#10121a;display:block}.ms-card h3,.ms-card p,.ms-card .ms-actions{margin:12px;font-size:13px}.ms-card .ms-actions{gap:6px}.ms-card button,.ms-card a{font-size:12px!important;padding:8px!important}.ms-empty{grid-column:1/-1;padding:50px 15px;text-align:center;border:1px dashed #46516a;border-radius:16px}#ms-status{position:sticky;bottom:0;padding:14px;background:#273124;color:#dfffad;border-radius:10px;z-index:2}#ms-product-preview{max-height:100px;max-width:100%;margin-top:10px}@media(max-width:800px){.ms-layout{grid-template-columns:1fr}.ms-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#model-studio-panel{padding:15px}#model-studio-panel h1{font-size:29px}}`;
    const shell=el('div',null,'ms-shell'),head=el('div',null,'ms-head');head.append(el('span','LUKE MODEL / CASTING STUDIO','ms-kicker'),button('← 사이트로',()=>{panel.hidden=true;history.replaceState(null,'',location.pathname+location.search);document.getElementById('model-studio-link')?.focus();}));shell.append(head,el('h1','브랜드에 어울리는 한 사람.'),el('p','01 모델 조건 → 02 후보 확정 → 03 각도·의상·배경 테스트'));
    const layout=el('div',null,'ms-layout'),left=el('div',null,'ms-box'),right=el('div');
    left.append(el('h2','01 / 모델 캐스팅'));field(left,'프로젝트 이름','name').value='새 캠페인';field(left,'성별 표현','gender',['여성','남성','중성']);field(left,'성인 나이','age',['20대 성인','30대','40대','50대','60대 이상']);field(left,'키','height',['160cm','165cm','170cm','175cm','180cm','185cm']);field(left,'헤어스타일','hair',['자연스러운 긴 머리','단발','짧은 머리','웨이브','직접 설명은 브리프에']);field(left,'분위기','mood',['자연스럽고 친근함','차분하고 고급스러움','밝고 활기참','도시적이고 세련됨']);field(left,'캠페인·제품 설명','brief','textarea');
    fileInput(left,'제품 사진 (선택 · 8MB 이하)',async url=>{product=url;$('product-preview').src=url;$('product-preview').hidden=false;await save();});const pp=el('img');pp.id='ms-product-preview';pp.alt='선택한 제품 참고 사진';pp.hidden=true;left.append(pp,button('제품 사진 제거',async()=>{product=null;pp.removeAttribute('src');pp.hidden=true;await save();}));
    field(left,'이미지 생성 연결','connection',[]);left.append(button('AI 연결 설정',()=>{panel.hidden=true;openStudioSettings();}),button('연결 새로고침',refresh));field(left,'후보 생성 수','count',['1','4']);const gen=button('후보 생성하기',()=>run('candidate'));gen.id='ms-generate';left.append(gen,el('p','Gemini·OpenAI·Higgsfield를 선택할 수 있어요. 4명은 4회, 각도 세트는 5회 요청하며 선택한 제공자의 요금이 적용돼요. Higgsfield 참고 사진은 동의 후 공개 미디어 저장소를 거쳐 전달돼요.'));
    fileInput(left,'내 모델 사진으로 시작',async url=>{if(items.length>=40)throw new Error('프로젝트당 최대 40장이에요.');const item={id:crypto.randomUUID(),name:fields().name+' · 내 모델',kind:'불러온 모델',url};items.push(item);selected=item;draw();await save();});
    right.append(el('h2','02 / 모델 후보 & 결과'));const chosen=el('p');chosen.id='ms-chosen';right.append(chosen);const work=el('div',null,'ms-box');work.append(el('h2','03 / 확정 모델로 제작'));const actions=el('div',null,'ms-actions');actions.append(button('5개 각도 생성',()=>run('angles')),button('3가지 의상 비교',()=>run('outfits')));work.append(actions);field(work,'원하는 의상','outfit').value='현대적인 한국 전통 한복';field(work,'장면·배경','background').value='따뜻한 오후 햇살의 서울 한옥';const more=el('div',null,'ms-actions');more.append(button('의상 적용 · 1장',()=>run('outfit')),button('배경·제품 적용 · 1장',()=>run('background')));work.append(more,el('p','확정 사진을 매번 참조해요. 생성 AI의 얼굴 일관성은 결과를 보고 확인해 주세요.'));right.append(work);
    const grid=el('div',null,'ms-grid');grid.id='ms-gallery';right.append(grid);const footer=el('div',null,'ms-actions');footer.append(button('프로젝트 저장',async()=>{if(await save())status('이 기기에 저장했어요.');}),button('프로젝트 내보내기',downloadProject),button('새 프로젝트',async()=>{if(!confirm('현재 작업을 비울까요? 보관하려면 먼저 프로젝트를 내보내세요.'))return;items=[];selected=null;product=null;pp.hidden=true;pp.removeAttribute('src');draw();await save();}));right.append(footer);
    const importLabel=el('label','저장한 프로젝트 불러오기'),imp=el('input');imp.type='file';imp.accept='.json,application/json';imp.onchange=async()=>{try{const file=imp.files[0];if(!file||file.size>100*1024*1024)throw new Error('100MB 이하 프로젝트를 선택해 주세요.');const x=JSON.parse(await file.text());if(x.version!==1||!Array.isArray(x.items)||x.items.length>40||x.items.some(i=>!i||typeof i.id!=='string'||typeof i.name!=='string'||typeof i.kind!=='string'||!safeImage(i.url))||new Set(x.items.map(i=>i.id)).size!==x.items.length||(x.product&&!safeImage(x.product)))throw new Error('올바른 모델 스튜디오 프로젝트가 아니에요.');if(items.length&&!confirm('현재 작업을 불러온 프로젝트로 바꿀까요?'))return;items=x.items;selected=items.find(i=>i.id===x.selected)||null;product=x.product||null;Object.keys(fields()).forEach(k=>{if(typeof x.fields?.[k]==='string')$(k).value=x.fields[k].slice(0,k==='brief'?1200:150);});pp.hidden=!product;if(product)pp.src=product;draw();await save();}catch(e){status(e.message);}imp.value='';};importLabel.append(imp);right.append(importLabel,el('p','작업은 이 브라우저에 저장돼요. 다른 기기로 옮길 때 프로젝트를 내보내세요.'));
    layout.append(left,right);const st=el('p','후보 생성 또는 내 모델 사진으로 시작하세요.');st.id='ms-status';st.setAttribute('role','status');const cancel=button('생성 중지',()=>{stop=true;controller?.abort();});cancel.id='ms-stop';cancel.disabled=true;shell.append(layout,st,cancel);panel.append(style,shell);document.body.append(panel);refresh();draw();lock(true);
    try{const data=await storage('readonly');if(data){items=data.items||[];selected=items.find(i=>i.id===data.selected)||null;product=data.product||null;Object.keys(fields()).forEach(k=>{if(typeof data.fields?.[k]==='string')$(k).value=data.fields[k];});pp.hidden=!product;if(product)pp.src=product;draw();}}catch{status('기기 저장을 사용할 수 없어요. 작업 후 프로젝트를 내보내 주세요.');}finally{lock(false);}
  }
  window.LukeModelStudio={open};
  document.getElementById('model-studio-link')?.addEventListener('click',e=>{e.preventDefault();location.hash='model-studio';open();});
  window.addEventListener('hashchange',()=>{if(location.hash==='#model-studio')open();});
  if(location.hash==='#model-studio')open();
})();
