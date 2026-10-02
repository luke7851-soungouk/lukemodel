/* Hair studio entry for the home page. Payment and generation require a verified server endpoint. */
(function(){
  'use strict';
  const API=window.LUKE_HAIR_API||'';
  let statsPromise;
  const styles=['자연스러운 레이어드','단발 보브','긴 웨이브','허쉬컷','숏컷','가르마 펌','댄디컷','원하는 스타일 직접 입력'];
  const el=(tag,cls,content)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(content!=null)x.textContent=content;return x;};
  function media(frame,file){frame.querySelectorAll('img,video').forEach(x=>x.remove());const old=frame.querySelector('.hair-placeholder');if(old)old.remove();const url=URL.createObjectURL(file);const v=document.createElement(file.type.startsWith('video/')?'video':'img');v.src=url;if(v.tagName==='VIDEO'){v.controls=true;v.muted=true;}v.onload=()=>{};frame.appendChild(v);return url;}
  function render(app){
    const stats=el('div','hair-stats');stats.setAttribute('aria-label','사이트 통계');
    const metrics=[['오늘 방문자','todayCounts','uv'],['누적 방문자','totals','uv'],['AI 제작','events','generate']];
    const numbers=metrics.map(([label])=>{const item=el('span','',label);const n=el('strong','', '—');item.appendChild(n);stats.appendChild(item);return n;});
    if(window.FaceLookTraffic){statsPromise=statsPromise||FaceLookTraffic.loadStats();statsPromise.then(s=>metrics.forEach(([,key,field],i)=>{numbers[i].textContent=Number(s[key][field]||0).toLocaleString('ko-KR')})).catch(()=>{statsPromise=null});}
    const link=el('a','','통계 자세히 →');link.href='/stats.html';stats.appendChild(link);app.appendChild(stats);
    const section=el('section','hair-studio');section.id='hair-studio';
    const head=el('div','hair-heading'),copy=el('div'),kicker=el('div','hair-kicker','AI HAIR STUDIO'),title=el('h2','','내 사진으로 헤어스타일 바꾸기'),intro=el('p','','사진 또는 영상을 올리고 원하는 머리 스타일을 선택하세요. 변경 전후를 나란히 확인하고 완성본을 바로 내려받을 수 있습니다.');
    copy.append(kicker,title,intro);head.append(copy,el('div','hair-price','AI 머리 변경 1건 · 900원'));section.appendChild(head);
    const layout=el('div','hair-layout'),inputPanel=el('div','hair-panel'),resultPanel=el('div','hair-panel');
    inputPanel.appendChild(el('h3','','1. 원본과 스타일 선택'));
    const drop=el('label','hair-drop'),dropText=el('span','hair-placeholder','사진 또는 영상 선택 · 클릭해서 업로드');const fileInput=el('input');fileInput.type='file';fileInput.accept='image/jpeg,image/png,image/webp,video/mp4,video/webm';fileInput.setAttribute('aria-label','원본 사진 또는 영상');drop.append(dropText,fileInput);inputPanel.append(drop,el('p','hair-hint','본인 사진 또는 사용 허락을 받은 파일을 올려주세요. JPG, PNG, WebP, MP4, WebM · 최대 50MB'));
    inputPanel.appendChild(el('label','hair-field','바꿀 헤어스타일'));const select=el('select','hair-select');styles.forEach(s=>{const o=el('option','',s);o.value=s;select.appendChild(o)});inputPanel.appendChild(select);
    inputPanel.appendChild(el('label','hair-field','추가 요청'));const prompt=el('textarea','hair-prompt');prompt.placeholder='예: 어깨 길이의 자연스러운 웨이브, 앞머리 없이, 얼굴과 배경은 그대로';prompt.maxLength=500;inputPanel.appendChild(prompt);
    const voice=el('button','hair-voice','🎙 말로 스타일 설명');voice.type='button';inputPanel.appendChild(voice);
    resultPanel.appendChild(el('h3','','2. 변경 전 · 변경 후'));const compare=el('div','hair-result'),before=el('div','hair-frame'),after=el('div','hair-frame');before.append(el('span','','변경 전'),el('div','hair-placeholder','원본 미리보기'));after.append(el('span','','변경 후'),el('div','hair-placeholder','결제 후 AI 결과가 여기에 표시됩니다'));compare.append(before,after);resultPanel.appendChild(compare);
    const actions=el('div','hair-action'),pay=el('button','','900원 결제하고 변경하기'),download=el('a','','결과 다운로드');pay.type='button';download.hidden=true;download.setAttribute('download','hair-after');actions.append(pay,download);resultPanel.appendChild(actions);
    const status=el('div','hair-status',API?'원본을 선택하면 결제를 진행할 수 있습니다.':'결제 서비스 연결 준비 중입니다. 현재 결제와 AI 변환은 이용할 수 없습니다.');status.setAttribute('role','status');resultPanel.appendChild(status);
    pay.disabled=!API;layout.append(inputPanel,resultPanel);section.appendChild(layout);
    const recent=el('div','hair-recent'),recentList=el('div','hair-recent-list');recent.append(el('h3','','최근 등록된 헤어 변경 · 최신순'),recentList);section.appendChild(recent);app.appendChild(section);
    const cfg=window.LUKE_SHARED;
    if(cfg&&cfg.url&&cfg.anonKey){
      const q=cfg.url+'/rest/v1/'+(cfg.table||'shared_media')+'?select=title,path,external_url,kind,created_at&title=ilike.*%23hair*&hidden=eq.false&order=created_at.desc&limit=8';
      fetch(q,{headers:{apikey:cfg.anonKey,Authorization:'Bearer '+cfg.anonKey}}).then(r=>r.ok?r.json():[]).then(rows=>{rows.forEach(row=>{const url=row.external_url||(row.path?cfg.url+'/storage/v1/object/public/'+encodeURIComponent(cfg.bucket)+'/'+String(row.path).split('/').map(encodeURIComponent).join('/'):null);if(!url)return;const a=el('a');a.href=url;a.download='hair-after';a.target='_blank';a.rel='noopener';if(row.kind==='video'){const v=el('video');v.src=url+'#t=0.1';v.muted=true;v.preload='metadata';a.appendChild(v);}else{const img=el('img');img.src=url;img.alt='최근 헤어 변경 결과';img.loading='lazy';a.appendChild(img);}a.appendChild(el('span','',String(row.title||'헤어 변경').replace(/#hair\b/i,'').trim()));recentList.appendChild(a)});if(!recentList.childNodes.length)recentList.textContent='아직 공개된 헤어 변경 결과가 없습니다.';}).catch(()=>{recentList.textContent='최근 결과를 불러오지 못했습니다.'});
    }else recentList.textContent='아직 공개된 헤어 변경 결과가 없습니다.';
    let selected=null,previewUrl=null;
    fileInput.onchange=()=>{const f=fileInput.files&&fileInput.files[0];if(!f)return;if(!/^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/.test(f.type)||f.size>50*1024*1024){status.textContent='지원하는 JPG, PNG, WebP, MP4, WebM 파일을 50MB 이하로 선택해 주세요.';fileInput.value='';return;}if(previewUrl)URL.revokeObjectURL(previewUrl);selected=f;previewUrl=media(before,f);dropText.textContent=f.name;dropText.style.display='none';status.textContent=API?'스타일을 확인하고 결제를 진행해 주세요.':'원본 준비 완료 · 결제 서비스 연결 후 이용할 수 있습니다.';};
    voice.onclick=()=>{const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){status.textContent='이 브라우저는 음성 입력을 지원하지 않습니다. 요청란에 직접 적어주세요.';return;}const rec=new Speech();rec.lang='ko-KR';rec.onresult=e=>{prompt.value=(prompt.value+' '+e.results[0][0].transcript).trim();status.textContent='음성 설명을 입력했습니다.'};rec.onerror=()=>{status.textContent='음성을 인식하지 못했습니다. 다시 시도하거나 직접 적어주세요.'};rec.start();};
    pay.onclick=async()=>{if(!selected){status.textContent='사진 또는 영상을 먼저 선택해 주세요.';return;}if(!API)return;pay.disabled=true;status.textContent='결제 요청을 준비하는 중입니다…';try{const form=new FormData();form.append('file',selected);form.append('style',select.value);form.append('prompt',prompt.value);form.append('amount','900');const r=await fetch(API+'/checkout',{method:'POST',body:form,credentials:'include'});const data=await r.json();if(!r.ok||!data.checkoutUrl)throw new Error(data.error||'결제를 시작할 수 없습니다.');sessionStorage.setItem('lukeHairJob',data.jobId||'');location.href=data.checkoutUrl;}catch(e){status.textContent=e.message||'결제 요청에 실패했습니다.';pay.disabled=false;}};
    const job=new URLSearchParams(location.search).get('hair_job')||sessionStorage.getItem('lukeHairJob');
    if(API&&job){const update=()=>fetch(API+'/jobs/'+encodeURIComponent(job),{credentials:'include'}).then(r=>{if(!r.ok)throw new Error('작업 상태를 확인하지 못했습니다.');return r.json()}).then(j=>{if(j.originalUrl){const v=document.createElement(j.kind==='video'?'video':'img');v.src=j.originalUrl;if(v.tagName==='VIDEO')v.controls=true;before.querySelectorAll('img,video,.hair-placeholder').forEach(x=>x.remove());before.appendChild(v);}if(j.status==='completed'&&j.paid===true&&j.resultUrl){const v=document.createElement(j.kind==='video'?'video':'img');v.src=j.resultUrl;if(v.tagName==='VIDEO')v.controls=true;after.querySelector('.hair-placeholder')?.remove();after.appendChild(v);download.href=j.downloadUrl||j.resultUrl;download.hidden=false;status.textContent='변경이 완료되었습니다. 결과를 다운로드할 수 있습니다.';sessionStorage.removeItem('lukeHairJob');}else if(j.status==='processing'){status.textContent='결제가 확인되어 AI가 머리 스타일을 변경하는 중입니다.';setTimeout(update,5000);}else if(j.status==='failed'){status.textContent='생성에 실패했습니다. 결제 내역에서 환불 상태를 확인해 주세요.';}else{status.textContent='결제 확인을 기다리는 중입니다.';setTimeout(update,5000);}}).catch(e=>{status.textContent=e.message});update();}
  }
  window.LukeHair={render};
})();
