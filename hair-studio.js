/* Hair photo editing through the authenticated server endpoint. */
(function(){
  'use strict';
  let statsPromise;
  const styles=['자연스러운 레이어드','단발 보브','긴 웨이브','허쉬컷','숏컷','가르마 펌','댄디컷','원하는 스타일 직접 입력'];
  const el=(tag,cls,value)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(value!=null)x.textContent=value;return x;};
  const fileUrl=f=>URL.createObjectURL(f);
  function showMedia(frame,url,kind){frame.querySelectorAll('img,video,.hair-placeholder').forEach(x=>x.remove());const media=el(kind==='video'?'video':'img');media.src=url;if(kind==='video'){media.controls=true;media.playsInline=true;media.preload='metadata';}else media.alt=frame.dataset.label||'사진';frame.appendChild(media);}
  function loadRecent(box){
    const c=window.LUKE_SHARED;if(!c||!c.url||!c.anonKey){box.textContent='아직 공개된 결과가 없습니다.';return;}
    const q=c.url+'/rest/v1/'+(c.table||'shared_media')+'?select=title,path,external_url,created_at,kind,mime&title=ilike.*%23hair*&hidden=eq.false&order=created_at.desc&limit=8';
    fetch(q,{headers:{apikey:c.anonKey,Authorization:'Bearer '+c.anonKey}}).then(r=>r.ok?r.json():[]).then(rows=>{
      box.textContent='';rows.forEach(row=>{const url=row.external_url||(row.path?c.url+'/storage/v1/object/public/'+encodeURIComponent(c.bucket)+'/'+String(row.path).split('/').map(encodeURIComponent).join('/'):null);if(!url)return;
        const ext=row.kind==='video'?'mp4':/\.(jpe?g|png|webp)(?:\?|$)/i.exec(url)?.[1]||'png',name='hair-'+(String(row.title).includes('변경 전')?'before':'after')+'.'+ext;const a=el('a');a.href=url+'?download='+encodeURIComponent(name);a.rel='noopener';a.download=name;const media=el(row.kind==='video'?'video':'img');media.src=url;if(row.kind==='video'){media.muted=true;media.playsInline=true;media.preload='metadata';}else{media.alt='최근 공개된 헤어 변경 결과';media.loading='lazy';}a.append(media,el('span','',String(row.title||'헤어 변경').replace(/#hair\b/i,'').trim()));box.appendChild(a);});
      if(!box.children.length)box.textContent='아직 공개된 결과가 없습니다.';
    }).catch(()=>{box.textContent='최근 결과를 불러오지 못했습니다.'});
  }
  function render(app){
    const stats=el('div','hair-stats');stats.setAttribute('aria-label','사이트 통계');
    const metrics=[['오늘 방문자','todayCounts','uv'],['누적 방문자','totals','uv'],['AI 제작','events','generate']];
    const nums=metrics.map(([label])=>{const item=el('span','',label),n=el('strong','','—');item.appendChild(n);stats.appendChild(item);return n;});
    if(window.FaceLookTraffic){statsPromise=statsPromise||FaceLookTraffic.loadStats();statsPromise.then(s=>metrics.forEach(([,key,field],i)=>{nums[i].textContent=Number(s[key][field]||0).toLocaleString('ko-KR')})).catch(()=>{statsPromise=null});}
    const statsLink=el('a','','통계 자세히 →');statsLink.href='/stats.html';stats.appendChild(statsLink);app.appendChild(stats);

    const section=el('section','hair-studio');section.id='hair-studio';
    const head=el('div','hair-heading'),copy=el('div');copy.append(el('div','hair-kicker','AI HAIR STUDIO'),el('h2','','내 사진으로 헤어스타일 바꾸기'),el('p','','사진을 올리고 원하는 머리 스타일을 선택하세요. Higgsfield API로 변경한 뒤 전후 비교와 다운로드를 할 수 있습니다.'));
    head.append(copy,el('div','hair-price','사이트 결제 없음 · Higgsfield 크레딧 사용'));section.appendChild(head);
    const layout=el('div','hair-layout'),left=el('div','hair-panel'),right=el('div','hair-panel');left.appendChild(el('h3','','1. 원본과 스타일 선택'));
    const drop=el('label','hair-drop'),dropText=el('span','hair-placeholder','사진 또는 영상 선택 · 클릭해서 업로드'),input=el('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,video/mp4';input.setAttribute('aria-label','원본 사진 또는 영상');drop.append(dropText,input);left.append(drop,el('p','hair-hint','사진: JPG·PNG·WebP 최대 10MB · 영상: MP4 최대 20MB. 원본은 Higgsfield API로 전송되며 전후 결과가 자동 공개됩니다.'));
    left.appendChild(el('label','hair-field','바꿀 헤어스타일'));const select=el('select','hair-select');styles.forEach(s=>{const o=el('option','',s);o.value=s;select.appendChild(o)});left.appendChild(select);
    left.appendChild(el('label','hair-field','추가 요청'));const prompt=el('textarea','hair-prompt');prompt.placeholder='예: 어깨 길이의 자연스러운 웨이브, 앞머리 없이';prompt.maxLength=500;left.appendChild(prompt);
    const voice=el('button','hair-voice','🎙 말로 스타일 설명');voice.type='button';left.appendChild(voice);
    const H=window.LukeHF,server=String(window.LUKE_SHARED?.hairBackendUrl||'').trim();
    const ownerLink=el('a','hair-hint','운영자 Higgsfield 키 설정 →');ownerLink.href='/admin/hair-key/';ownerLink.style.display='inline-block';ownerLink.style.marginTop='12px';left.appendChild(ownerLink);
    head.querySelector('.hair-price').textContent='로그인 회원 무료 · 운영자 크레딧 사용';
    right.appendChild(el('h3','','2. 변경 전 · 변경 후'));const compare=el('div','hair-result'),before=el('div','hair-frame'),after=el('div','hair-frame hair-after'),divider=el('div','hair-divider'),handle=el('span','','‹ ›'),slider=el('input','hair-compare-range');before.dataset.label='변경 전';after.dataset.label='변경 후';before.append(el('span','','변경 전'),el('div','hair-placeholder','원본 미리보기'));after.append(el('span','','변경 후'),el('div','hair-placeholder','Higgsfield 결과가 여기에 표시됩니다'));divider.appendChild(handle);slider.type='range';slider.min='0';slider.max='100';slider.value='50';slider.setAttribute('aria-label','변경 전후 비교 위치');const setSplit=()=>{const v=Number(slider.value);after.style.clipPath='inset(0 0 0 '+v+'%)';divider.style.left=v+'%';};slider.oninput=setSplit;setSplit();compare.append(before,after,divider,slider);right.appendChild(compare);
    const actions=el('div','hair-action'),generate=el('button','','무료로 머리 변경하기'),download=el('a','','↓ 변경 후 파일 다운로드');generate.type='button';download.hidden=true;download.download='hair-after.png';actions.append(generate,download);right.appendChild(actions);
    right.appendChild(el('p','hair-share','사진은 변경 전·후 사진으로, 영상은 변경 전·후 영상으로 공개 갤러리에 자동 등록됩니다. 모든 방문자가 볼 수 있고 다운로드할 수 있습니다.'));
    const retryPublish=el('button','hair-voice','공개 등록 다시 시도');retryPublish.type='button';retryPublish.hidden=true;right.appendChild(retryPublish);
    const status=el('div','hair-status','로그인한 회원은 무료로 이용할 수 있습니다. 결과는 자동 공개됩니다.');status.setAttribute('role','status');right.appendChild(status);
    layout.append(left,right);section.appendChild(layout);const recent=el('div','hair-recent'),recentList=el('div','hair-recent-list');recent.append(el('h3','','최근 공개된 헤어 변경 · 최신순'),recentList);section.appendChild(recent);app.appendChild(section);loadRecent(recentList);

    let selected=null,originalUrl=null,resultUrl=null,resultRemoteUrl=null,resultBlob=null,publishedBefore=false,publishedAfter=false;
    const mediaKind=()=>selected?.type==='video/mp4'?'video':'image';
    async function publishPair(){
      if(!H?.shared)throw new Error('공개 갤러리 저장소에 연결할 수 없습니다.');
      retryPublish.disabled=true;
      try{
        if(!publishedBefore){status.textContent='변경 전 '+(mediaKind()==='video'?'영상':'사진')+'을 공개 갤러리에 등록하는 중입니다…';await H.publish(selected,'변경 전 · '+select.value+' #hair','hair');publishedBefore=true;}
        if(!publishedAfter){status.textContent='변경 후 '+(mediaKind()==='video'?'영상':'사진')+'을 공개 갤러리에 등록하는 중입니다…';const title='변경 후 · '+select.value+' #hair';if(resultBlob){try{await H.publish(new File([resultBlob],download.download,{type:resultBlob.type||(mediaKind()==='video'?'video/mp4':'image/png')}),title,'hair');}catch(e){await H.shareResult({url:resultRemoteUrl,kind:mediaKind(),title});}}else await H.shareResult({url:resultRemoteUrl,kind:mediaKind(),title});publishedAfter=true;}
        retryPublish.hidden=true;loadRecent(recentList);if(typeof window.pollHomeNew==='function')window.pollHomeNew();
        status.textContent='완료되었습니다. 변경 전·후 '+(mediaKind()==='video'?'영상을':'사진을')+' 최신순으로 공개 등록했습니다. 결과를 다운로드할 수 있습니다.';
      }catch(e){retryPublish.hidden=false;status.textContent='사진 변경은 완료됐지만 공개 등록에 실패했습니다: '+(e.message||e)+' · 공개 등록 다시 시도를 눌러주세요.';}
      finally{retryPublish.disabled=false;}
    }
    retryPublish.onclick=publishPair;
    input.onchange=()=>{const f=input.files&&input.files[0];if(!f)return;const video=f.type==='video/mp4';if(!(/^image\/(jpeg|png|webp)$/.test(f.type)||video)||f.size>(video?20:10)*1048576){status.textContent='사진은 JPG·PNG·WebP 10MB 이하, 영상은 MP4 20MB 이하로 선택해 주세요.';input.value='';return;}
      if(originalUrl)URL.revokeObjectURL(originalUrl);if(resultUrl&&resultUrl.startsWith('blob:'))URL.revokeObjectURL(resultUrl);resultUrl=null;resultRemoteUrl=null;resultBlob=null;publishedBefore=false;publishedAfter=false;retryPublish.hidden=true;selected=f;originalUrl=fileUrl(f);showMedia(before,originalUrl,mediaKind());after.querySelectorAll('img,video,.hair-placeholder').forEach(x=>x.remove());after.appendChild(el('div','hair-placeholder','변경 결과 대기 중'));compare.classList.remove('has-result');slider.value='50';setSplit();download.hidden=true;download.removeAttribute('href');download.onclick=null;dropText.textContent=f.name;status.textContent='스타일을 확인하고 Higgsfield로 변경하기를 누르세요. 결과는 자동 공개됩니다.';};
    voice.onclick=()=>{const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){status.textContent='이 브라우저는 음성 입력을 지원하지 않습니다. 요청란에 직접 적어주세요.';return;}const rec=new Speech();rec.lang='ko-KR';rec.onresult=e=>{prompt.value=(prompt.value+' '+e.results[0][0].transcript).trim();status.textContent='음성 설명을 입력했습니다.'};rec.onerror=()=>{status.textContent='음성을 인식하지 못했습니다. 직접 적거나 다시 시도해 주세요.'};rec.start();};
    async function serverGenerate(){
      const auth=window.LukeAuth;
      if(!auth){status.textContent='회원 인증을 불러오지 못했습니다. 새로고침해 주세요.';return;}
      await auth.ensure();
      if(!auth.user()||auth.isAnon()){status.textContent='로그인한 회원만 무료로 이용할 수 있습니다.';auth.openAccount();return;}
      generate.disabled=true;download.hidden=true;status.textContent='사진을 보내고 머리 스타일 변경을 시작하는 중입니다…';
      try{
        const form=new FormData();form.set('file',selected);form.set('style',select.value);form.set('instruction',prompt.value.trim());
        const send=await fetch(server,{method:'POST',headers:auth.headers(),body:form});
        const started=await send.json();if(!send.ok)throw new Error(started.error||'요청에 실패했습니다.');
        if(!started.jobId)throw new Error('작업 번호를 받지 못했습니다.');
        const deadline=Date.now()+10*60*1000;let url='';
        while(Date.now()<deadline){
          await new Promise(resolve=>setTimeout(resolve,4000));
          await auth.ensure();
          const response=await fetch(server+'?job='+encodeURIComponent(started.jobId),{headers:auth.headers()});
          const result=await response.json();if(!response.ok)throw new Error(result.error||'결과를 확인하지 못했습니다.');
          if(result.status==='completed'){url=result.resultUrl;break;}
          status.textContent='이미지 변경 중'+(result.phase?' · '+result.phase:'')+'…';
        }
        if(!url)throw new Error('변경 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.');
        let blob=null;try{const response=await fetch(url);if(response.ok)blob=await response.blob();}catch(e){}
        resultBlob=blob;resultRemoteUrl=url;
        if(resultUrl&&resultUrl.startsWith('blob:'))URL.revokeObjectURL(resultUrl);
        resultUrl=blob?fileUrl(blob):url;showMedia(after,resultUrl,mediaKind());compare.classList.add('has-result');
        download.href=resultUrl;download.download='hair-after.'+(mediaKind()==='video'?'mp4':blob?.type==='image/webp'?'webp':blob?.type==='image/jpeg'?'jpg':'png');download.hidden=false;
        download.onclick=blob?null:async e=>{e.preventDefault();const saved=await H.download({url,kind:mediaKind(),fileName:download.download});if(!saved)status.textContent='파일을 새 탭에서 열었습니다. 우클릭하거나 길게 눌러 저장하세요.';};
        status.textContent='변경이 완료되었습니다. 변경 전·후 파일을 공개 등록합니다…';
        if(window.FaceLookTraffic)FaceLookTraffic.trackEvent('generate');
        await publishPair();
      }catch(e){status.textContent=e.message||'잠시 후 다시 시도해 주세요.';}
      finally{generate.disabled=false;}
    }
    generate.onclick=async()=>{
      if(!selected){status.textContent='원본 사진을 먼저 선택해 주세요.';return;}
      if(!server){status.textContent='헤어 변경 서버가 연결되지 않았습니다.';return;}
      await serverGenerate();
    };
  }
  window.LukeHair={render};
})();
