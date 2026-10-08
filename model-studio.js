'use strict';
(() => {
  let panel, panelOwner, busy=false, stop=false, controller=null, selected=null, product=null, extraRefs=[], items=[], higgsUploadApproved=false, step=1, pendingKind=null, pendingCount=0, publishMeta=null;
  const faceKeyFromUrl=url=>{const m=String(url||'').match(/\/faces\/([a-z0-9-]+)\.(?:jpe?g|png|webp)(?:[?#]|$)/i);return m?'r-'+m[1].toLowerCase():null;};
  function confirmGen(rows,count){
    return new Promise(resolve=>{
      const ov=el('div',null,'ms-confirm');ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
      const box=el('div',null,'ms-confirm-box');box.append(el('h3','이대로 생성할까요?'));
      const dl=el('dl');rows.forEach(([k,v])=>dl.append(el('dt',k),el('dd',v)));box.append(dl);
      const row=el('div',null,'ms-actions');row.style.justifyContent='flex-end';const done=v=>{ov.remove();resolve(v);};
      const cancel=button('취소',()=>done(false));const go=button('생성 시작 ✦ '+count+'장',()=>done(true));go.className='ms-primary';
      row.append(cancel,go);box.append(row);ov.append(box);ov.onclick=e=>{if(e.target===ov)done(false);};ov.onkeydown=e=>{if(e.key==='Escape')done(false);};
      panel.append(ov);go.focus();
    });
  }
  async function autoPublish(remoteUrl){
    if(!publishMeta||!window.LukeHF?.shareResult||!/^https:\/\//i.test(String(remoteUrl||'')))return '';
    window.__lmSkipAutoAngle=true;
    try{const r=await LukeHF.shareResult({url:remoteUrl,kind:'image',title:publishMeta.title,faceKey:publishMeta.faceKey||null});return r&&r.share?' · lukemodel.com 갤러리에 자동 등록':'';}
    catch(e){console.warn('auto publish failed',e);return ' · 사이트 자동 등록은 실패(결과는 이 프로젝트에 보관)';}
    finally{window.__lmSkipAutoAngle=false;}
  }
  const $=id=>document.getElementById('ms-'+id);
  const el=(tag,text,cls)=>{const n=document.createElement(tag); if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const status=t=>{$('status').textContent=t;};
  const db=new Promise((resolve,reject)=>{const r=indexedDB.open('luke-model-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  db.catch(()=>{});
  function owner(){return typeof studioStorageKey==='function'?studioStorageKey():'local';}
  async function storage(mode,value){const d=await db;return new Promise((resolve,reject)=>{const tx=d.transaction('projects',mode);const s=tx.objectStore('projects');const r=mode==='readonly'?s.get(panelOwner):s.put(value,panelOwner);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async function save(){try{await storage('readwrite',{items,selected: selected?.id||null,product,extraRefs,fields:fields()});return true;}catch{status('기기 저장 공간이 부족하거나 저장이 차단됐어요. 이미지를 다운로드해 주세요.');return false;}}
  const FIELD_KEYS=['name','gender','look','age','height','body','hair','hairColor','mood','detail','brief','outfit','background'];
  function fields(){return Object.fromEntries(FIELD_KEYS.map(k=>[k,$(k)?$(k).value:'']));}
  function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
  function options(id,values){const s=el('select');s.id='ms-'+id;values.forEach(v=>s.add(new Option(v,v)));return s;}
  function field(parent,label,id,values){const l=el('label',label);let n=Array.isArray(values)?options(id,values):el(values==='textarea'?'textarea':'input');n.id='ms-'+id;if(n.tagName==='INPUT'||n.tagName==='TEXTAREA')n.maxLength=id==='brief'?1200:150;l.append(n);parent.append(l);return n;}
  const safeImage=url=>typeof url==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
  function dataImageBlob(url){
    if(!safeImage(url))throw new Error('참고 이미지가 손상됐어요.');
    const comma=url.indexOf(','),type=url.slice(5,url.indexOf(';')),bytes=atob(url.slice(comma+1));
    const array=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)array[i]=bytes.charCodeAt(i);
    return new Blob([array],{type});
  }
  async function downloadPhoto(item){
    if(window.LukeAccess&&!await LukeAccess.require())return;
    const link=document.createElement('a');link.href=item.url;link.download='luke-model-'+item.id+'.png';document.body.append(link);link.click();link.remove();
  }
  function closePhoto(){panel?.querySelector('.ms-photo-viewer')?.remove();}
  function openPhoto(item){
    closePhoto();
    const viewer=el('div',null,'ms-photo-viewer');viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label',item.name+' 사진 상세');
    const box=el('div',null,'ms-photo-box'),head=el('div',null,'ms-head');head.append(el('div',item.name+' · '+item.kind),button('닫기',closePhoto));
    const image=el('img');image.src=item.url;image.alt=item.name;
    const actions=el('div',null,'ms-actions');actions.append(button('사진 다운로드',()=>downloadPhoto(item)),button('이 프로젝트에서 삭제',async()=>{
      if(busy||!confirm('이 프로젝트에서 이 사진을 삭제할까요? 원본 모델 목록은 그대로 유지됩니다.'))return;
      const previousItems=items,previousSelected=selected;
      items=items.filter(candidate=>candidate.id!==item.id);
      if(selected?.id===item.id)selected=null;
      if(await save()){closePhoto();draw();status('프로젝트에서 사진 1장을 삭제했어요.');}
      else{items=previousItems;selected=previousSelected;}
    }));box.append(head,image,actions,el('p','삭제하면 이 브라우저의 작업 프로젝트에서만 사라집니다.'));viewer.append(box);
    viewer.onclick=event=>{if(event.target===viewer)closePhoto();};
    viewer.onkeydown=event=>{if(event.key==='Escape')closePhoto();};panel.append(viewer);head.querySelector('button').focus();
  }
  function draw(){
    const grid=$('gallery'),resultGrid=$('results');grid.replaceChildren();resultGrid.replaceChildren();$('chosen').textContent=selected?'확정 모델: '+selected.name:'후보 카드에서 기준 모델을 확정하세요.';syncSteps();
    const featured=$('featured');
    if(featured){featured.hidden=!selected;if(selected){$('featured-image').src=selected.url;$('featured-name').textContent=selected.name;$('featured-count').textContent=items.filter(i=>i.parentId===selected.id).length+'개의 파생 이미지';}}
    const angles=$('angle-viewer');
    if(angles){
      angles.replaceChildren();
      const angleNames=['정면','좌측면','우측면','뒷면','클로즈업'];
      const views=selected?items.filter(i=>i.parentId===selected.id&&angleNames.includes(i.kind)):[];
      angles.hidden=!views.length;
      if(views.length){
        angles.append(el('h2','360° 모델 이미지'));
        const preview=el('img');preview.className='ms-angle-preview';preview.src=views[0].url;preview.alt=views[0].name;
        const label=el('p',views[0].kind+' · '+views.length+'/5 각도','ms-angle-label');
        const tabs=el('div',null,'ms-angle-tabs');
        views.forEach((view,index)=>{const tab=button(view.kind,()=>{preview.src=view.url;preview.alt=view.name;label.textContent=view.kind+' · '+views.length+'/5 각도';tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));tab.setAttribute('aria-pressed','true');});tab.setAttribute('aria-pressed',String(index===0));tabs.append(tab);});
        preview.onclick=()=>openPhoto(views.find(view=>view.url===preview.src)||views[0]);preview.tabIndex=0;preview.setAttribute('role','button');preview.setAttribute('aria-label','현재 각도 사진 크게 보기');preview.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();preview.click();}};
        angles.append(preview,label,tabs);
      }
    }
    const isBase=item=>['모델 후보','불러온 모델','기존 모델'].includes(item.kind);
    const bases=items.filter(isBase),derived=items.filter(item=>!isBase(item)&&(!selected||item.parentId===selected.id));
    if(!bases.length)grid.append(el('p','1단계 조건으로 후보를 생성하거나 내 모델 사진을 불러오세요.','ms-empty'));
    if(!derived.length)resultGrid.append(el('p','확정 모델로 턴어라운드·의상·배경을 만들면 여기에 모입니다.','ms-empty'));
    [...bases,...derived].forEach(item=>{const target=isBase(item)?grid:resultGrid;const card=el('article',null,'ms-card');if(selected?.id===item.id)card.classList.add('chosen');const image=el('img');image.src=item.url;image.alt=item.name;const photoButton=button('',()=>openPhoto(item));photoButton.className='ms-photo-open';photoButton.setAttribute('aria-label',item.name+' 사진 크게 보기');photoButton.append(image);card.append(photoButton,el('h3',item.name),el('p',item.kind));
      const actions=el('div',null,'ms-actions');if(isBase(item)){const pick=button(selected?.id===item.id?'✓ 확정됨':'이 모델 확정',async()=>{if(busy)return;selected=item;draw();await save();goStep(3);});pick.className='ms-pick';actions.append(pick);}
      actions.append(button('크게 보기',()=>openPhoto(item)));card.append(actions);target.append(card);});
    if(pendingCount>0){const target=pendingKind==='candidate'?grid:resultGrid;target.querySelector('.ms-empty')?.remove();for(let i=0;i<pendingCount;i++){const sk=el('article',null,'ms-card ms-skeleton');sk.append(el('div',null,'ms-sk-img'),el('h3','생성 중…'),el('p','잠시 기다려 주세요'));target.append(sk);}}
  }
  async function readImage(file){if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('JPG·PNG·WebP 이미지 8MB 이하를 선택해 주세요.');
    const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
    const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('이미지를 읽지 못했어요.'));image.src=raw;});
    const canvas=document.createElement('canvas'),scale=Math.min(1,1536/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');}
  function fileInput(parent,label,fn){const l=el('label',label),input=el('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.onchange=async()=>{if(busy)return;try{const url=await readImage(input.files[0]);await fn(url);}catch(e){status(e.message);}input.value='';};l.append(input);parent.append(l);}
  function connections(){return [{id:'lukemodel-owner',name:'LUKE MODEL · Higgsfield',provider:'owner',kind:'image'}];}
  function refresh(){const s=$('connection'),previous=s.value;s.replaceChildren();connections().forEach(c=>s.add(new Option(c.provider==='owner'?'LUKE MODEL · 서버 Higgsfield 키':c.name+' · '+(c.provider==='higgsfield'?'SOUL V2 / Z-Image':c.model),c.id)));if([...s.options].some(o=>o.value===previous))s.value=previous;}
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
    controller=new AbortController();const timer=setTimeout(()=>controller.abort(),300000);
    try{let url,body,headers;
      if(connection.provider==='owner'){
        const auth=window.LukeAuth,server=window.LUKE_SHARED?.hairBackendUrl;
        if(!auth||!server)throw new Error('회원 인증 또는 모델 제작 서버가 연결되지 않았어요.');
        await auth.ensure();
        if(!auth.user()||auth.isAnon()){auth.openAccount();throw new Error('로그인한 회원만 모델을 제작할 수 있어요.');}
        const form=new FormData();form.append('prompt',prompt);
        for(const [i,ref] of refs.entries()){
          if(!safeImage(ref))throw new Error('참고 이미지가 손상됐어요.');
          const blob=dataImageBlob(ref);
          form.append('reference',new File([blob],`reference-${i+1}.png`,{type:blob.type||'image/png'}));
        }
        const sent=await fetch(server+'?action=model',{method:'POST',headers:auth.headers(),body:form,signal:controller.signal});
        const started=await sent.json().catch(()=>({}));
        if(!sent.ok)throw new Error(started.error||'모델 제작 요청에 실패했어요.');
        if(!started.jobId)throw new Error('모델 제작 번호를 받지 못했어요.');
        for(let i=0;i<100;i++){
          if(stop)throw new DOMException('Stopped','AbortError');
          await new Promise(resolve=>setTimeout(resolve,3000));
          await auth.ensure();
          const checked=await fetch(server+'?action=model-status&job='+encodeURIComponent(started.jobId),{headers:auth.headers(),signal:controller.signal});
          const current=await checked.json().catch(()=>({}));
          if(!checked.ok)throw new Error(current.error||'모델 제작 상태를 확인하지 못했어요.');
          if(current.status==='completed'){const kept=await keepResult(current.resultUrl);publishMeta&&(publishMeta.note=await autoPublish(current.resultUrl));return kept;}
        }
        throw new Error('제작이 오래 걸리고 있어요. 잠시 후 다시 확인해 주세요.');
      }else if(connection.provider==='higgsfield'){
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
  async function run(kind){if(busy)return;if(window.LukeAccess && !await LukeAccess.require())return;const f=fields(),cfg=loadStudioCfg(),c=connections().find(c=>c.id===$('connection').value);
    if(!c||(c.provider!=='owner'&&connectionKeyMissing(c,cfg))){status('이미지 생성 연결을 확인해 주세요.');return;}
    if(kind!=='candidate'&&!selected){status('먼저 기준 모델을 확정해 주세요.');return;}
    const jobs=kind==='candidate'?Array.from({length:Number($('count').value)},(_,i)=>['후보 '+(i+1),'Create a distinct fictional adult casting model; variation '+crypto.randomUUID()+'.']):kind==='angles'?[['정면','front view'],['좌측면','left profile'],['우측면','right profile'],['뒷면','back view'],['클로즈업','face close-up']]:kind==='outfits'?['비즈니스 정장','스트리트 캐주얼','스포티룩'].map(x=>[x,'Change clothing to '+x]):[[kind==='outfit'?'의상 테스트':'배경 테스트',kind==='outfit'?'Change clothing to '+f.outfit:'Place the model in '+f.background]];
    if(items.length+jobs.length>40){status('프로젝트당 최대 40장이에요. 프로젝트를 내보낸 뒤 새 프로젝트를 시작해 주세요.');return;}
    {const refCount=kind==='candidate'?[product,...extraRefs].filter(Boolean).length:1;
     const plan=kind==='candidate'?'후보 '+jobs.length+'명':kind==='angles'?'정면·좌측면·우측면·뒷면 + 클로즈업 5장':kind==='outfits'?'의상 3종 비교 3장':jobs[0][0]+' 1장';
     const ok=await confirmGen([['생성 모델',refCount?'Qwen Image 3 Edit (레퍼런스 고정)':'Higgsfield Soul 2.0'],['대상 모델',kind==='candidate'?(f.name.trim()||'새 캐스팅'):(selected?.name||'')],['구성',plan],['해상도',refCount?'1K':'720p'],['차감','사장님 Higgsfield 크레딧'],['저장','lukemodel.com 갤러리 자동 등록']],jobs.length);
     if(!ok){status('생성을 취소했어요.');return;}}
    stop=false;lock(true);let done=0;pendingKind=kind;pendingCount=jobs.length;draw();const original=selected,refs=kind==='candidate'?[product,...extraRefs].filter(Boolean).slice(0,4):[original.url,...(['background','outfit','outfits'].includes(kind)&&product?[product]:[])];
    try{for(const [label,direction] of jobs){if(stop)break;status(label+' 생성 중 · '+(done+1)+'/'+jobs.length+' · 잠시 기다려 주세요.');
      const identity=kind==='candidate'?'Do not imitate any real person. '+(refs.length?'The reference images are PRODUCT or MOOD references. Cast a model suited to their design and audience; do not copy people from the reference photos.':''):'Reference image 1 is the confirmed person. Preserve their exact facial identity, age, hair and body proportions. '+(refs.length>1?'Reference image 2 is the product or garment. Preserve its color, cut, material and branding when applying it to the model.':'');
      const prompt=[identity,'Natural editorial photograph, realistic skin texture, subtle asymmetry, no plastic skin, no beauty filter, one adult person, no collage.',kind==='candidate'?JSON.stringify({gender:f.gender,appearance:f.look,age:(parseInt(f.age,10)||27)+' years old adult',height:f.height,body:f.body,hair:f.hair,hairColor:f.hairColor,mood:f.mood,details:f.detail}):'', 'Campaign brief: '+f.brief, direction,kind==='candidate'||kind==='angles'?'Plain white T-shirt and blue jeans, neutral gray studio background.':'', 'One image, no captions.'].filter(Boolean).join('\n');
      publishMeta={title:(f.name.trim()||'LUKE MODEL')+' · '+label,faceKey:kind==='candidate'?null:(original?.faceKey||null),note:''};const result=await generate(prompt,refs,c,cfg);const item={id:crypto.randomUUID(),name:(f.name.trim()||'LUKE')+' · '+label,kind:kind==='candidate'?'모델 후보':label,url:result,prompt,parentId:original?.id||null,catalogModelId:original?.catalogModelId||null,faceKey:original?.faceKey||null,createdAt:new Date().toISOString()};items.push(item);done++;pendingCount=jobs.length-done;draw();if(publishMeta?.note)status(label+' 완료'+publishMeta.note);if(!await save())break;}
      status((stop?'중지했어요.':'작업을 마쳤어요.')+' '+done+'장 생성 · 확정 모델과 얼굴 일관성을 직접 비교해 주세요.');
    }catch(e){const raw=String(e&&e.message||e);const friendly=raw==='no-higgs'?'Higgsfield 자격증명(key-id:key-secret)을 AI 연결 설정에 입력해 주세요.':raw;status((e.name==='AbortError'?'요청이 중지되었거나 시간이 초과됐어요. 서버에서 이미 처리 중이면 비용이 발생할 수 있어요.':friendly)+' 완료된 '+done+'장은 유지돼요.');}finally{pendingCount=0;pendingKind=null;draw();lock(false);}}
  async function downloadProject(){if(window.LukeAccess && !await LukeAccess.require())return;const data=JSON.stringify({version:1,items,selected:selected?.id||null,product,extraRefs,fields:fields()},null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=el('a');a.href=url;a.download='luke-model-studio.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const CHOICES={
    gender:['여성','남성','중성'],
    look:['동아시아 (한국계)','동아시아 (일본·중화권)','동남아시아','남아시아','유럽계','아프리카계','라틴계','중동계','혼혈'],
    body:['슬림','표준 체형','탄탄한 운동형','글래머','건장한 체격','플러스 사이즈'],
    hair:['자연스러운 긴 머리','긴 웨이브','중단발','단발','숏컷','포니테일','업스타일 / 번','앞머리 있는 긴 머리','버즈컷','곱슬 / 펌','레이어드 컷'],
    hairColor:['자연 흑발','블랙','다크브라운','브라운','애쉬브라운','블론드','플래티넘','레드 / 구리빛','회색 / 은발'],
    mood:['청순','시크','카리스마','내추럴','럭셔리','큐트','우아','지적']
  };
  const MOOD_MAX=4;
  function chipGroup(parent,label,key,multi=false){
    const wrap=el('div',null,'ms-field'),title=el('div',label,'ms-label'),row=el('div',null,'ms-chips'),input=el('input');
    input.type='hidden';input.id='ms-'+key;input.value=multi?CHOICES[key][0]:CHOICES[key][0];
    CHOICES[key].forEach(value=>{const chip=button(value,()=>{if(busy)return;if(multi){let list=input.value?input.value.split(', ').filter(Boolean):[];if(list.includes(value)){if(list.length===1)return;list=list.filter(v=>v!==value);}else{if(list.length>=MOOD_MAX){status('분위기는 최대 '+MOOD_MAX+'개까지 고를 수 있어요.');return;}list.push(value);}input.value=list.join(', ');}else input.value=value;syncChips();save();});chip.className='ms-chip';chip.dataset.key=key;chip.dataset.value=value;row.append(chip);});
    wrap.append(title,row,input);parent.append(wrap);return input;
  }
  function slider(parent,label,key,min,max,unit,initial){
    const wrap=el('div',null,'ms-field'),title=el('div',null,'ms-label'),name=el('span',label),val=el('b'),range=el('input'),input=el('input');
    range.type='range';range.min=min;range.max=max;range.value=initial;range.id='ms-'+key+'-range';range.setAttribute('aria-label',label);
    input.type='hidden';input.id='ms-'+key;input.value=initial+unit;
    const update=()=>{input.value=range.value+unit;val.textContent=range.value+(key==='age'?'세':unit);};
    range.oninput=update;range.onchange=()=>save();update();title.append(name,val);wrap.append(title,range,input);parent.append(wrap);
  }
  function syncChips(){
    if(!panel)return;
    panel.querySelectorAll('.ms-chip[data-key]').forEach(chip=>{const input=$(chip.dataset.key);const list=String(input?.value||'').split(', ');chip.setAttribute('aria-pressed',String(list.includes(chip.dataset.value)));});
    [['age','세',27],['height','cm',168]].forEach(([key,unit,fallback])=>{const range=$(key+'-range'),input=$(key);if(!range||!input)return;let n=parseInt(input.value,10);if(!Number.isFinite(n)||n<Number(range.min)||n>Number(range.max))n=fallback;range.value=n;input.value=n+(key==='age'?'':'cm');range.dispatchEvent(new Event('input'));});
    const count=$('count');if(count)panel.querySelectorAll('.ms-count button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value===count.value)));
    const gen=$('generate');if(gen&&count)gen.textContent='후보 '+count.value+'명 생성하기 ✦';
  }
  function renderRefs(){
    const box=$('refs');if(!box)return;box.replaceChildren();
    [product,...extraRefs].filter(Boolean).forEach((url,index)=>{const thumb=el('figure',null,'ms-ref');const image=el('img');image.src=url;image.alt='레퍼런스 이미지 '+(index+1);const remove=button('×',async()=>{if(busy)return;if(index===0){product=extraRefs.shift()||null;}else extraRefs.splice(index-1,1);renderRefs();await save();});remove.setAttribute('aria-label','레퍼런스 '+(index+1)+' 제거');thumb.append(image,remove);box.append(thumb);});
    const pp=$('product-preview');if(pp){pp.hidden=!product;if(product)pp.src=product;else pp.removeAttribute('src');}
    const add=$('refs-add');if(add)add.hidden=[product,...extraRefs].filter(Boolean).length>=4;
  }
  function goStep(n){
    if(n===3&&!selected){status('먼저 2단계에서 후보 한 명을 확정해 주세요.');n=2;}
    step=n;syncSteps();panel?.scrollTo({top:0,behavior:'smooth'});
  }
  function syncSteps(){
    if(!panel)return;
    panel.querySelectorAll('.ms-pane').forEach(pane=>{pane.hidden=Number(pane.dataset.step)!==step;});
    panel.querySelectorAll('.ms-stepper button').forEach(b=>{const n=Number(b.dataset.step);b.setAttribute('aria-current',n===step?'step':'false');b.classList.toggle('done',n<step||(n===3&&!!selected&&step!==3));});
  }
  async function open(){if(panel && panelOwner!==owner()){panel.remove();panel=null;items=[];selected=null;product=null;extraRefs=[];}panelOwner=owner();if(panel){panel.hidden=false;refresh();syncSteps();return;}panel=el('section');panel.id='model-studio-panel';panel.setAttribute('aria-label','모델 캐스팅 스튜디오');
    const style=el('style');style.textContent=`#model-studio-panel{--v:#6f69f4;--v2:#8a84ff;position:fixed;inset:0;z-index:90;overflow:auto;background:#0b0b0e;color:#f1f2f7;padding:0 20px 120px;font:15px Pretendard,system-ui,sans-serif}#model-studio-panel *{box-sizing:border-box}#model-studio-panel [hidden]{display:none!important}.ms-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:1120px;margin:0 auto;padding:16px 0;background:#0b0b0e}.ms-brand{font-weight:900;letter-spacing:.06em;font-size:14px}.ms-stepper{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap}#model-studio-panel .ms-stepper button{display:flex;align-items:center;gap:8px;background:none;border:0;color:#6d7385;font:700 13px Pretendard,system-ui;padding:8px 10px;cursor:pointer;border-radius:10px}.ms-stepper button i{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#1d1f27;font-style:normal;font-size:12px}.ms-stepper button[aria-current=step]{color:#fff}.ms-stepper button[aria-current=step] i{background:var(--v);color:#fff}.ms-stepper button.done i{background:#2a2c3a;color:var(--v2)}.ms-stepper .sep{width:26px;height:1px;background:#2a2d38}.ms-card-shell{max-width:860px;margin:10px auto 0;padding:34px;background:#141418;border:1px solid #23252e;border-radius:22px}.ms-card-shell.wide{max-width:1120px}#model-studio-panel h1{font-size:28px;margin:0 0 8px;letter-spacing:-.02em}#model-studio-panel h2{font-size:18px;margin:26px 0 12px}#model-studio-panel p{line-height:1.7;color:#8c92a3;font-size:13px;margin:0}.ms-cols{display:grid;grid-template-columns:1fr 1fr;gap:6px 34px;margin-top:26px}.ms-field{margin:0 0 22px}.ms-label{display:flex;justify-content:space-between;color:#c4c8d4;font-size:12.5px;font-weight:700;margin-bottom:10px}.ms-label b{color:#fff}.ms-chips{display:flex;flex-wrap:wrap;gap:7px}#model-studio-panel .ms-chip,#model-studio-panel .ms-count button{background:#1b1c22;border:1px solid #2a2c35;color:#aab0bf;border-radius:999px;padding:8px 13px;font:600 12.5px Pretendard,system-ui;cursor:pointer}#model-studio-panel .ms-chip[aria-pressed=true],#model-studio-panel .ms-count button[aria-pressed=true]{background:var(--v);border-color:var(--v);color:#fff}#model-studio-panel input[type=range]{width:100%;accent-color:var(--v)}#model-studio-panel input[type=text],#model-studio-panel select,#model-studio-panel textarea,#model-studio-panel .ms-input{display:block;width:100%;padding:13px 14px;background:#1b1c22;color:#fff;border:1px solid #2a2c35;border-radius:12px;font:15px Pretendard,system-ui}#model-studio-panel textarea{min-height:110px;resize:vertical;line-height:1.6}#model-studio-panel textarea:focus,#model-studio-panel input:focus{outline:none;border-color:var(--v)}#model-studio-panel button,#model-studio-panel a{background:#1f2129;border:1px solid #30333e;color:#fff;border-radius:11px;padding:11px 15px;cursor:pointer;font:700 13px Pretendard,system-ui;text-decoration:none}#model-studio-panel button:disabled{opacity:.45;cursor:default}#model-studio-panel :focus-visible{outline:3px solid var(--v2);outline-offset:2px}#model-studio-panel .ms-primary{background:linear-gradient(135deg,var(--v2),#5a53e6);border:0;box-shadow:0 10px 26px #5a53e650;padding:14px 22px;font-size:14px}.ms-box{margin-top:6px;padding:20px;background:#1a1b21;border:1px solid #262832;border-radius:16px}.ms-box-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.ms-box-head b{font-size:13px}.ms-box-head small{display:block;color:#7c8294;font-size:11.5px;font-weight:400;margin-top:3px}.ms-file{position:relative;overflow:hidden}.ms-file input{position:absolute;inset:0;opacity:0;cursor:pointer}.ms-refs{display:flex;gap:10px;flex-wrap:wrap}.ms-ref{position:relative;margin:0;width:92px;height:92px;border-radius:12px;overflow:hidden;background:#101116}.ms-ref img{width:100%;height:100%;object-fit:cover}#model-studio-panel .ms-ref button{position:absolute;top:5px;right:5px;width:24px;height:24px;padding:0;border-radius:50%;background:#000a;border:0;font-size:15px;line-height:1}.ms-foot{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:28px}.ms-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ms-count{display:flex;gap:6px}.ms-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:18px}.ms-card{background:#18191f;border:2px solid #22242c;border-radius:16px;overflow:hidden}.ms-card.chosen{border-color:var(--v)}.ms-card img{width:100%;aspect-ratio:3/4;object-fit:cover;background:repeating-linear-gradient(135deg,#1b1c22 0 12px,#202129 12px 24px);display:block}.ms-card h3{margin:12px 12px 2px;font-size:13px}.ms-card p{margin:0 12px!important;font-size:11.5px!important}.ms-card .ms-actions{margin:10px 12px 12px;gap:6px}#model-studio-panel .ms-card button{font-size:11.5px;padding:8px 10px}#model-studio-panel .ms-card .ms-pick{background:var(--v);border-color:var(--v)}.ms-skeleton .ms-sk-img{aspect-ratio:3/4;background:repeating-linear-gradient(135deg,#1b1c22 0 12px,#23242c 12px 24px);background-size:200% 200%;animation:msk 2.4s linear infinite}@keyframes msk{to{background-position:100% 100%}}.ms-confirm{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:18px;background:#000b}.ms-confirm-box{width:min(380px,100%);padding:20px;background:#1b1c22;border:1px solid #2f3240;border-radius:16px}#model-studio-panel .ms-confirm-box h3{margin:0 0 14px;font-size:15px}.ms-confirm-box dl{display:grid;grid-template-columns:auto 1fr;gap:9px 16px;margin:0 0 18px;font-size:12.5px}.ms-confirm-box dt{color:#7f8698}.ms-confirm-box dd{margin:0;text-align:right;font-weight:700}.ms-empty{grid-column:1/-1;padding:46px 15px;text-align:center;border:1px dashed #30333e;border-radius:16px}#ms-status{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);width:min(760px,calc(100% - 32px));padding:13px 16px;background:#1b1c24;border:1px solid #33354a;color:#d9dbff!important;border-radius:14px;z-index:6;box-shadow:0 12px 30px #0008}#model-studio-panel #ms-stop{position:fixed;right:20px;bottom:84px;z-index:6}#model-studio-panel #ms-stop:disabled{display:none}#ms-product-preview{display:none!important}.ms-feature{display:grid;grid-template-columns:170px 1fr;gap:24px;align-items:center}.ms-feature img{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:14px}.ms-feature h3{font-size:26px;margin:4px 0}.ms-tag{display:inline-block;border-radius:999px;background:var(--v);color:#fff;padding:5px 11px;font-size:11.5px;font-weight:700}.ms-work{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px}.ms-work label{display:block;color:#c4c8d4;font-size:12.5px;font-weight:700}.ms-work label input{margin-top:8px}.ms-card .ms-photo-open{display:block;width:100%;padding:0!important;border:0!important;border-radius:0!important;background:none!important}.ms-photo-viewer{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.88);display:grid;place-items:center;padding:18px;overflow:auto}.ms-photo-box{width:min(900px,100%);max-height:100%;overflow:auto;background:#1b1d24;border:1px solid #30343f;border-radius:18px;padding:16px}.ms-photo-box .ms-head{display:flex;justify-content:space-between;align-items:center}.ms-photo-box>img{display:block;max-width:100%;max-height:65vh;object-fit:contain;margin:16px auto;border-radius:10px}#model-studio-panel .ms-photo-box .ms-actions{justify-content:center}#model-studio-panel .ms-photo-box .ms-actions button:nth-child(2){background:#5a1018;border-color:#7a1a25}.ms-photo-box p{font-size:12px;text-align:center}.ms-angle-viewer{margin:20px 0;padding:18px;background:linear-gradient(#ececec,#dcdcdc);border-radius:16px}#model-studio-panel .ms-angle-viewer h2{color:#16171c;margin:0 0 10px}.ms-angle-preview{display:block;width:min(100%,420px);max-height:520px;object-fit:contain;margin:auto;cursor:zoom-in;border-radius:12px}#model-studio-panel .ms-angle-label{text-align:center;color:#444}.ms-angle-tabs{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}#model-studio-panel .ms-angle-tabs button{background:#fff;color:#222;border-color:#ccc}#model-studio-panel .ms-angle-tabs button[aria-pressed=true]{background:var(--v);color:#fff;border-color:var(--v)}.ms-meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:20px;padding-top:18px;border-top:1px solid #23252e}.ms-meta label{color:#8c92a3;font-size:12px}@media(max-width:820px){.ms-cols,.ms-work{grid-template-columns:1fr}.ms-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ms-card-shell{padding:20px 16px;border-radius:16px}#model-studio-panel{padding:0 12px 120px}.ms-top{flex-wrap:wrap}.ms-stepper .sep{display:none}.ms-stepper button span{display:none}.ms-feature{grid-template-columns:100px 1fr;gap:14px}.ms-feature h3{font-size:18px}}`;
    const top=el('div',null,'ms-top'),brand=el('span','LUKE MODEL','ms-brand'),stepper=el('nav',null,'ms-stepper');stepper.setAttribute('aria-label','캐스팅 단계');
    [['1','프로필 설정'],['2','후보 선택'],['3','모델 확정']].forEach(([n,label],i)=>{if(i)stepper.append(el('span',null,'sep'));const b=button('',()=>goStep(Number(n)));b.dataset.step=n;const num=el('i',n),text=el('span',label);b.append(num,text);stepper.append(b);});
    const back=button('← 모델 리스트로',()=>{panel.hidden=true;history.replaceState(null,'',location.pathname+location.search);document.getElementById('model-studio-link')?.focus();});
    const hfLink=el('a','Higgsfield 스튜디오 ↗');hfLink.href='https://lukemodel-studio.higgsfield.app';hfLink.target='_blank';hfLink.rel='noopener';hfLink.hidden=true;hfLink.title='Nano Banana 2 · 내 Higgsfield 크레딧 · 히스토리 저장 · 사이트 자동 등록';
    Promise.resolve(window.LukeAccess?.check?.()).then(()=>{hfLink.hidden=!window.LukeAccess?.owner;}).catch(()=>{});
    const topRight=el('div',null,'ms-actions');topRight.append(hfLink,back);
    top.append(brand,stepper,topRight);
    /* STEP 1 — 프로필 설정 */
    const p1=el('div',null,'ms-card-shell ms-pane');p1.dataset.step='1';
    p1.append(el('h1','어떤 모델을 캐스팅할까요?'),el('p','원하는 조건을 고르면 조건에 맞는 가상 인물 후보를 만들어 드려요. 실존 인물은 만들지 않아요.'));
    const nameField=el('div',null,'ms-field');nameField.style.marginTop='22px';const nl=el('div','프로젝트 이름','ms-label'),ni=el('input');ni.type='text';ni.id='ms-name';ni.maxLength=150;ni.value='새 캠페인';nameField.append(nl,ni);p1.append(nameField);
    const cols=el('div',null,'ms-cols'),c1=el('div'),c2=el('div');cols.append(c1,c2);p1.append(cols);
    chipGroup(c1,'성별','gender');slider(c1,'나이','age',20,60,'',27);chipGroup(c1,'체형','body');
    chipGroup(c2,'인상 / 계열','look');slider(c2,'키','height',150,195,'cm',168);chipGroup(c2,'헤어스타일','hair');
    const lower=el('div');chipGroup(lower,'헤어 컬러','hairColor');chipGroup(lower,'분위기 (최대 '+MOOD_MAX+'개)','mood',true);p1.append(lower);
    const detailWrap=el('div',null,'ms-field'),dl=el('div','추가 디테일 (선택)','ms-label'),dt=el('textarea');dt.id='ms-detail';dt.maxLength=400;dt.placeholder='예: 깔끔한 얼굴, 흰 셔츠, 낮은 메이크업';detailWrap.append(dl,dt);p1.append(detailWrap);
    const briefBox=el('div',null,'ms-box'),bh=el('div',null,'ms-box-head'),bt=el('b','캠페인 브리프 (선택)');bt.append(el('small','캠페인 기획서나 브랜드 설명을 붙여 넣으면 분위기에 반영해요.'));const attach=el('label','.md / .txt 파일 첨부');attach.className='ms-file';const bf=el('input');bf.type='file';bf.accept='.md,.txt,text/plain,text/markdown';bf.onchange=async()=>{const file=bf.files[0];bf.value='';if(!file)return;if(file.size>200*1024){status('200KB 이하 텍스트 파일만 첨부할 수 있어요.');return;}const text=(await file.text()).replace(/\u0000/g,'').trim();$('brief').value=text.slice(0,1200);await save();status(file.name+' 내용을 브리프에 넣었어요.'+(text.length>1200?' (1,200자까지만 사용)':''));};attach.append(bf);attach.style.cssText='background:#24262f;border:1px solid #34374a;border-radius:10px;padding:9px 13px;font-size:12px;font-weight:700;cursor:pointer';bh.append(bt,attach);const bta=el('textarea');bta.id='ms-brief';bta.maxLength=1200;bta.placeholder='예: 20대 여성 타깃 비건 뷰티 브랜드 런칭 캠페인. 자연광 아래 건강한 피부 표현이 핵심…';briefBox.append(bh,bta);p1.append(briefBox);
    const refBox=el('div',null,'ms-box'),rh=el('div',null,'ms-box-head'),rt=el('b','제품 / 레퍼런스 이미지 (선택, 최대 4장)');rt.append(el('small','제품이나 무드 사진을 넣으면 어울리는 모델을 캐스팅해요. 사진 속 인물을 따라 만들지는 않아요.'));const ra=el('label','+ 이미지 추가');ra.id='ms-refs-add';ra.className='ms-file';ra.style.cssText='background:#24262f;border:1px solid #34374a;border-radius:10px;padding:9px 13px;font-size:12px;font-weight:700;cursor:pointer';const ri=el('input');ri.type='file';ri.multiple=true;ri.accept='image/png,image/jpeg,image/webp';ri.onchange=async()=>{if(busy)return;const files=[...ri.files];ri.value='';try{for(const file of files){if([product,...extraRefs].filter(Boolean).length>=4){status('레퍼런스는 최대 4장이에요.');break;}const url=await readImage(file);if(!product)product=url;else extraRefs.push(url);}renderRefs();await save();}catch(e){status(e.message);}};ra.append(ri);rh.append(rt,ra);const refs=el('div',null,'ms-refs');refs.id='ms-refs';const pp=el('img');pp.id='ms-product-preview';pp.alt='';pp.hidden=true;refBox.append(rh,refs,pp);p1.append(refBox);
    const f1=el('div',null,'ms-foot'),next1=button('다음: 후보 선택 →',()=>goStep(2));next1.className='ms-primary';f1.append(next1);p1.append(f1);
    /* STEP 2 — 후보 선택 */
    const p2=el('div',null,'ms-card-shell wide ms-pane');p2.dataset.step='2';
    p2.append(el('h1','후보 중 한 명을 고르세요'),el('p','같은 조건으로 서로 다른 후보를 만들어요. 마음에 드는 후보의 「이 모델 확정」을 누르면 3단계로 넘어가요.'));
    const genRow=el('div',null,'ms-actions');genRow.style.marginTop='20px';const countInput=el('input');countInput.type='hidden';countInput.id='ms-count';countInput.value='4';const countRow=el('div',null,'ms-count');['1','2','4'].forEach(v=>{const b=button(v+'명',()=>{if(busy)return;countInput.value=v;syncChips();});b.dataset.value=v;countRow.append(b);});
    const gen=button('후보 4명 생성하기 ✦',()=>run('candidate'));gen.id='ms-generate';gen.className='ms-primary';
    const conn=el('select');conn.id='ms-connection';conn.setAttribute('aria-label','이미지 생성 연결');conn.style.cssText='width:auto;display:inline-block;padding:10px 12px;font-size:12px';
    genRow.append(el('span','후보 수','ms-label'),countRow,countInput,gen,conn);genRow.querySelector('.ms-label').style.margin='0';p2.append(genRow);
    const own=el('label','또는 내 모델 사진으로 시작');own.className='ms-file';own.style.cssText='display:inline-block;margin-top:12px;color:#a7acc0;font-size:12.5px;text-decoration:underline;cursor:pointer';const oi=el('input');oi.type='file';oi.accept='image/png,image/jpeg,image/webp';oi.onchange=async()=>{if(busy)return;try{const url=await readImage(oi.files[0]);if(items.length>=40)throw new Error('프로젝트당 최대 40장이에요.');const item={id:crypto.randomUUID(),name:fields().name+' · 내 모델',kind:'불러온 모델',url};items.push(item);selected=item;draw();await save();goStep(3);}catch(e){status(e.message);}oi.value='';};own.append(oi);p2.append(own);
    p2.append(el('p','승인된 회원은 운영자의 서버 Higgsfield 키로 제작해요. 후보 4명은 4회 생성되고, 레퍼런스 사진은 제작을 위해 Higgsfield로 전송돼요. 완성된 이미지는 lukemodel.com 공개 갤러리에 자동 등록돼요.'));
    const grid=el('div',null,'ms-grid');grid.id='ms-gallery';p2.append(grid);
    const f2=el('div',null,'ms-foot');f2.append(button('← 프로필 수정',()=>goStep(1)));p2.append(f2);
    /* STEP 3 — 모델 확정 */
    const p3=el('div',null,'ms-card-shell wide ms-pane');p3.dataset.step='3';
    const chosen=el('p');chosen.id='ms-chosen';chosen.hidden=true;p3.append(chosen);
    const featured=el('section',null,'ms-feature');featured.id='ms-featured';featured.hidden=true;const fi=el('img');fi.id='ms-featured-image';fi.alt='확정한 AI 모델';const ft=el('div');ft.append(el('span','확정 모델','ms-tag'));const fn=el('h3');fn.id='ms-featured-name';const fc=el('p');fc.id='ms-featured-count';const fa=el('div',null,'ms-actions');fa.style.marginTop='14px';const turnBtn=button('360° 턴어라운드 만들기 ✦',()=>run('angles'));turnBtn.className='ms-primary';fa.append(turnBtn,button('3가지 의상 비교',()=>run('outfits')));ft.append(fn,fc,fa);featured.append(fi,ft);p3.append(featured);
    const work=el('div',null,'ms-box');work.style.marginTop='22px';work.append(el('b','화보 만들기'));const wg=el('div',null,'ms-work');
    const ol=el('label','원하는 의상'),oin=el('input');oin.type='text';oin.id='ms-outfit';oin.maxLength=150;oin.value='현대적인 한국 전통 한복';ol.append(oin);
    const bl=el('label','장면 · 배경'),bin=el('input');bin.type='text';bin.id='ms-background';bin.maxLength=150;bin.value='따뜻한 오후 햇살의 서울 한옥';bl.append(bin);wg.append(ol,bl);
    const more=el('div',null,'ms-actions');more.style.marginTop='12px';more.append(button('의상 적용 · 1장',()=>run('outfit')),button('배경 · 제품 적용 · 1장',()=>run('background')));
    work.append(wg,more,el('p','확정 사진을 매번 참조해요. 1단계에서 넣은 첫 번째 레퍼런스(제품)는 의상·배경 제작 때 함께 참고합니다. 얼굴과 제품 일치도는 직접 확인해 주세요.'));p3.append(work);
    const angleViewer=el('section',null,'ms-angle-viewer');angleViewer.id='ms-angle-viewer';angleViewer.hidden=true;p3.append(angleViewer);
    p3.append(el('h2','이 모델로 만든 이미지'));const results=el('div',null,'ms-grid');results.id='ms-results';p3.append(results);
    const f3=el('div',null,'ms-foot');f3.style.justifyContent='space-between';f3.append(button('← 다른 후보 고르기',()=>goStep(2)));p3.append(f3);
    /* 프로젝트 관리 */
    const meta=el('div',null,'ms-meta');meta.style.maxWidth='1120px';meta.style.margin='22px auto 0';
    meta.append(button('프로젝트 저장',async()=>{if(await save())status('이 기기에 저장했어요.');}),button('프로젝트 내보내기',downloadProject),button('새 프로젝트',async()=>{if(!confirm('현재 작업을 비울까요? 보관하려면 먼저 프로젝트를 내보내세요.'))return;items=[];selected=null;product=null;extraRefs=[];renderRefs();draw();await save();goStep(1);}));
    const importLabel=el('label','저장한 프로젝트 불러오기'),imp=el('input');importLabel.className='ms-file';importLabel.style.cssText='background:#1f2129;border:1px solid #30333e;border-radius:11px;padding:11px 15px;font-size:13px;font-weight:700;color:#fff;cursor:pointer';imp.type='file';imp.accept='.json,application/json';imp.onchange=async()=>{try{const file=imp.files[0];if(!file||file.size>100*1024*1024)throw new Error('100MB 이하 프로젝트를 선택해 주세요.');const x=JSON.parse(await file.text());if(x.version!==1||!Array.isArray(x.items)||x.items.length>40||x.items.some(i=>!i||typeof i.id!=='string'||typeof i.name!=='string'||typeof i.kind!=='string'||!safeImage(i.url))||new Set(x.items.map(i=>i.id)).size!==x.items.length||(x.product&&!safeImage(x.product))||(x.extraRefs&&(!Array.isArray(x.extraRefs)||x.extraRefs.length>3||x.extraRefs.some(r=>!safeImage(r)))))throw new Error('올바른 모델 스튜디오 프로젝트가 아니에요.');if(items.length&&!confirm('현재 작업을 불러온 프로젝트로 바꿀까요?'))return;items=x.items;selected=items.find(i=>i.id===x.selected)||null;product=x.product||null;extraRefs=x.extraRefs||[];FIELD_KEYS.forEach(k=>{if(typeof x.fields?.[k]==='string'&&$(k))$(k).value=x.fields[k].slice(0,k==='brief'?1200:400);});syncChips();renderRefs();draw();await save();goStep(selected?3:1);}catch(e){status(e.message);}imp.value='';};importLabel.append(imp);meta.append(importLabel,el('p','작업은 이 브라우저에 저장돼요. 다른 기기로 옮길 때 프로젝트를 내보내세요.'));
    const st=el('p','조건을 고르고 「다음」을 눌러 후보를 만들어 보세요.');st.id='ms-status';st.setAttribute('role','status');const cancel=button('생성 중지',()=>{stop=true;controller?.abort();});cancel.id='ms-stop';cancel.disabled=true;
    panel.append(style,top,p1,p2,p3,meta,st,cancel);document.body.append(panel);refresh();syncChips();renderRefs();draw();lock(true);
    try{const data=await storage('readonly');if(data){items=data.items||[];selected=items.find(i=>i.id===data.selected)||null;product=data.product||null;extraRefs=Array.isArray(data.extraRefs)?data.extraRefs.filter(safeImage).slice(0,3):[];FIELD_KEYS.forEach(k=>{if(typeof data.fields?.[k]==='string'&&$(k))$(k).value=data.fields[k];});syncChips();renderRefs();draw();}}catch{status('기기 저장을 사용할 수 없어요. 작업 후 프로젝트를 내보내 주세요.');}finally{lock(false);}
    goStep(selected?3:1);
  }
  async function openWithModel(url,name,startAngles=false,catalogModelId=null){
    if(window.LukeAccess&&!await LukeAccess.require())return;
    await open();
    try{
      const existing=catalogModelId&&items.find(item=>item.catalogModelId===catalogModelId&&item.kind==='기존 모델');
      if(existing){if(!existing.faceKey)existing.faceKey=faceKeyFromUrl(url);selected=existing;draw();await save();goStep(3);status('저장된 모델 프로젝트를 열었어요.');if(startAngles)await run('angles');return;}
      const response=await fetch(String(url));if(!response.ok)throw new Error('모델 사진을 불러오지 못했어요.');
      const blob=await response.blob();
      const type=blob.type.split(';')[0]||'image/jpeg';
      const image=await readImage(new File([blob],String(name||'model')+'.jpg',{type}));
      const item={id:crypto.randomUUID(),name:String(name||'선택한 모델'),kind:'기존 모델',url:image,prompt:'기존 모델에서 시작',parentId:null,catalogModelId:catalogModelId||null,faceKey:faceKeyFromUrl(url),createdAt:new Date().toISOString()};
      items.push(item);selected=item;draw();await save();goStep(3);status('선택한 모델을 기준으로 각도·의상·배경을 제작할 수 있어요.');
      if(startAngles)await run('angles');
    }catch(error){status(error instanceof Error?error.message:'모델 사진을 불러오지 못했어요.');}
  }
  async function resultsForModel(catalogModelId){
    if(!catalogModelId)return [];
    try{const d=await db;const data=await new Promise((resolve,reject)=>{const request=d.transaction('projects','readonly').objectStore('projects').get(owner());request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return (data?.items||[]).filter(item=>item.catalogModelId===catalogModelId&&item.kind!=='기존 모델'&&safeImage(item.url)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));}catch{return [];}
  }
  async function deleteResultForModel(catalogModelId,itemId){
    const d=await db,key=owner();
    const data=await new Promise((resolve,reject)=>{const request=d.transaction('projects','readonly').objectStore('projects').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const target=data?.items?.find(item=>item.id===itemId&&item.catalogModelId===catalogModelId&&item.kind!=='기존 모델');
    if(!target)return false;
    data.items=data.items.filter(item=>item.id!==itemId);
    if(data.selected===itemId)data.selected=null;
    await new Promise((resolve,reject)=>{const tx=d.transaction('projects','readwrite');tx.objectStore('projects').put(data,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
    if(panelOwner===key){items=data.items;selected=items.find(item=>item.id===data.selected)||null;if(panel)draw();}
    return true;
  }
  async function openWithProduct(id){
    if(window.LukeAccess&&!await LukeAccess.require())return;
    await open();
    try{
      const auth=window.LukeAuth;await auth.ensure();
      const response=await fetch(window.LUKE_SHARED.hairBackendUrl+'?action=products-list',{headers:auth.headers()});
      if(!response.ok)throw new Error('상품 목록을 불러오지 못했어요.');
      const data=await response.json(),item=(data.products||[]).find(p=>p.id===id);
      if(!item)throw new Error('상품을 찾지 못했어요.');
      const image=await fetch(item.image_url);
      if(!image.ok)throw new Error('상품 사진을 불러오지 못했어요.');
      product=await readImage(new File([await image.blob()],item.name+'.png',{type:image.headers.get('content-type')?.split(';')[0]||'image/png'}));
      selected=null;extraRefs=[];renderRefs();draw();goStep(1);
      $('name').value=item.name+' 캠페인';$('brief').value=(item.description||item.name).slice(0,1200);
      await save();status(item.name+' 상품 사진을 참고 이미지로 불러왔어요.');
    }catch(error){status(error instanceof Error?error.message:'상품을 불러오지 못했어요.');}
  }
  window.LukeModelStudio={open,openWithModel,openWithProduct,resultsForModel,deleteResultForModel};
  document.getElementById('model-studio-link')?.addEventListener('click',e=>{e.preventDefault();location.hash='model-studio';open();});
  window.addEventListener('hashchange',()=>{if(location.hash==='#model-studio')open();});
  if(location.hash==='#model-studio'){
    const productId=new URLSearchParams(location.search).get('product');
    if(productId)openWithProduct(productId);else open();
  }
})();
