// Supabase Edge Function. HIGGSFIELD_API_KEY is a server secret, never a browser value.
const origin = 'https://lukemodel.com';
const cors = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type','Vary':'Origin'};
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const fallbackHiggsfieldKey = Deno.env.get('HIGGSFIELD_API_KEY') || '';
const adminEmail = 'luke7851@gmail.com';
const styles = new Set(['자연스러운 레이어드','단발 보브','긴 웨이브','허쉬컷','숏컷','가르마 펌','댄디컷','원하는 스타일 직접 입력']);
type Job = {id:string;user_id:string;request_id:string|null;status:string;result_url:string|null};
const json = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const problem = (message:string,status:number) => json({error:message},status);
const adminHeaders = {'apikey':serviceKey,'Authorization':`Bearer ${serviceKey}`,'Content-Type':'application/json'};

async function admin(path:string, init:RequestInit={}) {
  const response=await fetch(`${supabaseUrl}/rest/v1/${path}`,{...init,headers:{...adminHeaders,...init.headers}});
  if(!response.ok)throw new Error(`Storage error (${response.status})`);
  const body=await response.text();return body?JSON.parse(body):null;
}
type Member = {id:string;email?:string;email_confirmed_at?:string};
async function member(request:Request):Promise<Member|null> {
  const bearer=request.headers.get('authorization')||'';
  if(!bearer.startsWith('Bearer '))return null;
  const response=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{'apikey':publishableKey,'Authorization':bearer}});
  if(!response.ok)return null;
  const user=await response.json();
  return user?.id && !user.is_anonymous ? user as Member : null;
}
async function storedKey() {
  try {
    const key=await admin('rpc/hair_get_api_key',{method:'POST',body:'{}'});
    return typeof key==='string' && key ? key : fallbackHiggsfieldKey;
  } catch(error) {
    if(fallbackHiggsfieldKey)return fallbackHiggsfieldKey;
    throw error;
  }
}
async function hf(path:string,init:RequestInit={}) {
  const key=await storedKey();if(!key)throw new Error('헤어 변경 서비스가 아직 연결되지 않았습니다.');
  const response=await fetch(`https://platform.higgsfield.ai/${path}`,{...init,headers:{'Authorization':`Key ${key}`,...init.headers}});
  const raw=await response.text();let data:Record<string,unknown>={};try{data=JSON.parse(raw)}catch{}
  if(!response.ok)throw new Error(response.status===402?'Higgsfield 크레딧이 부족합니다.':`Higgsfield 요청 실패 (${response.status})`);
  return data;
}
async function patchJob(id:string,values:Record<string,string|null>) {
  await admin(`hair_jobs?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(values)});
}
async function submit(request:Request,user:{id:string}) {
  if(!serviceKey||!(await storedKey()))return problem('헤어 변경 서비스가 아직 연결되지 않았습니다.',503);
  const form=await request.formData();const file=form.get('file');const style=String(form.get('style')||'');const extra=String(form.get('instruction')||'').trim();
  if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1048576||file.size===0)return problem('10MB 이하 JPG, PNG, WebP 사진을 올려주세요.',400);
  if(!styles.has(style)||extra.length>500)return problem('헤어스타일 또는 추가 요청을 확인해 주세요.',400);
  const reserved=await admin('rpc/reserve_hair_job',{method:'POST',body:JSON.stringify({p_user_id:user.id})}) as string|null;
  if(!reserved)return problem('진행 중인 헤어 변경이 있습니다. 완료 후 다시 요청해 주세요.',429);
  try {
    const upload=await hf('files/generate-upload-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content_type:file.type})});
    if(typeof upload.upload_url!=='string'||typeof upload.public_url!=='string')throw new Error('사진 업로드 주소를 받지 못했습니다.');
    const uploaded=await fetch(upload.upload_url,{method:'PUT',headers:(upload.upload_headers as HeadersInit)||{'Content-Type':file.type},body:file});
    if(!uploaded.ok)throw new Error('사진 전송에 실패했습니다.');
    const prompt=`Change only the hairstyle of the person in this photo to ${style}. ${extra}. Keep the same person, facial features, skin tone, expression, clothing, pose, background, framing, and lighting. Natural realistic hair, one image, no text.`;
    const result=await hf('alibaba/qwen-image-3/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,resolution:'1k',aspect_ratio:'3:4',image_urls:[upload.public_url]})});
    if(typeof result.request_id!=='string')throw new Error('Higgsfield 요청 번호를 받지 못했습니다.');
    await patchJob(reserved,{request_id:result.request_id,status:'submitted'});
    return json({jobId:reserved});
  } catch(error) {
    await patchJob(reserved,{status:'failed'}).catch(()=>{});
    return problem(error instanceof Error?error.message:'변경 요청에 실패했습니다.',502);
  }
}
async function status(url:URL,user:{id:string}) {
  const id=url.searchParams.get('job')||'';
  if(!/^[0-9a-f-]{36}$/i.test(id))return problem('작업 번호를 확인해 주세요.',400);
  const rows=await admin(`hair_jobs?select=id,user_id,request_id,status,result_url&id=eq.${encodeURIComponent(id)}&limit=1`) as Job[];
  const job=rows?.[0];if(!job||job.user_id!==user.id)return problem('작업을 찾을 수 없습니다.',404);
  if(job.status==='completed')return json({status:'completed',resultUrl:job.result_url});
  if(job.status==='failed')return problem('헤어 변경에 실패했습니다. 다시 시도해 주세요.',502);
  if(!job.request_id)return json({status:'pending'});
  const result=await hf(`requests/${encodeURIComponent(job.request_id)}/status`);
  const state=String(result.status||'').toLowerCase();
  if(state==='completed') {
    const image=Array.isArray(result.images)?result.images[0]:null;const resultUrl=image?.url;
    if(typeof resultUrl!=='string')return problem('결과 이미지를 찾지 못했습니다.',502);
    await patchJob(id,{status:'completed',result_url:resultUrl});return json({status:'completed',resultUrl});
  }
  if(['failed','nsfw','canceled','cancelled'].includes(state)){await patchJob(id,{status:'failed'});return problem('헤어 변경에 실패했습니다. 다시 시도해 주세요.',502);}
  return json({status:'pending',phase:state});
}
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.headers.get('origin')!==origin)return problem('허용되지 않은 출처입니다.',403);
  if(!supabaseUrl||!publishableKey||!serviceKey)return problem('서버 설정을 확인해 주세요.',503);
  try {
    const user=await member(request);if(!user)return problem('로그인한 회원만 이용할 수 있습니다.',401);
    const url=new URL(request.url);
    if(url.searchParams.get('action')==='key-status'||url.searchParams.get('action')==='save-key'){
      if(user.email?.toLowerCase()!==adminEmail||!user.email_confirmed_at)return problem('운영자 계정만 키를 설정할 수 있습니다.',403);
      if(url.searchParams.get('action')==='key-status'&&request.method==='GET')return json({configured:!!(await storedKey())});
      if(url.searchParams.get('action')==='save-key'&&request.method==='POST'){
        const body=await request.json();const key=String(body?.key||'').trim();
        if(!/^[^:\s]+:[^:\s]+$/.test(key)||key.length>512)return problem('key-id:key-secret 형식으로 입력해 주세요.',400);
        await admin('rpc/hair_set_api_key',{method:'POST',body:JSON.stringify({p_key:key})});return json({configured:true});
      }
      return problem('지원하지 않는 요청입니다.',405);
    }
    if(request.method==='POST')return await submit(request,user);
    if(request.method==='GET')return await status(url,user);
    return problem('지원하지 않는 요청입니다.',405);
  }catch(error){console.error(error);return problem('잠시 후 다시 시도해 주세요.',503);}
});
