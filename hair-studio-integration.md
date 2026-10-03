# Higgsfield 헤어스타일 변경

홈의 `hair-studio.js`는 기존 `LukeHF` 공용 코드를 사용합니다. 현재 구현은 `lukehf.key`에 저장된 **각 방문자 브라우저의 Higgsfield API 키**로 Qwen Image 3 편집을 요청합니다. 사이트 결제는 없습니다. API 요청 시 키 소유자의 Higgsfield 크레딧이 사용됩니다. 키는 브라우저의 `localStorage`에만 저장되고 `platform.higgsfield.ai`로 전송됩니다.

JPG/PNG/WebP 사진 한 장을 Higgsfield 파일 API에 업로드한 뒤 `alibaba/qwen-image-3/edit`에 참고 이미지로 보냅니다. 결과를 원본과 나란히 보여주고 다운로드합니다. 영상 편집은 이 화면에서 지원하지 않습니다.

기본 결과는 브라우저에만 남습니다. 방문자가 `결과를 사이트에 공개 등록`을 직접 선택하면 기존 Supabase 공개 갤러리에 `#hair` 태그로 게시되고, 홈의 최근 공개 결과에 `created_at.desc`로 표시됩니다.

소유자 키를 모든 방문자에게 제공하려면 브라우저에 키를 넣을 수 없습니다. 서버 비밀 변수에 Higgsfield 키를 저장하고 인증·사용량 제한·생성 작업 추적 기능이 있는 서버 엔드포인트가 필요합니다. 현재 GitHub Pages 정적 사이트에는 그 서버가 없습니다.

## 로그인 회원 무료 이용 전환 준비

`supabase/hair-jobs.sql`과 `supabase/functions/hair-generate/index.ts`에 서버 경로를 준비했습니다. 기존 Supabase 프로젝트의 SQL Editor에서 SQL을 적용하고 Edge Function `hair-generate`를 배포해야 합니다. SQL은 Vault에 암호화 키 저장 함수를 추가합니다. 배포 후 운영자 계정(`luke7851@gmail.com`)으로 `https://lukemodel.com/admin/hair-key/`에 로그인하여 `key-id:key-secret`을 저장하세요. 키를 GitHub 저장소나 `shared-config.js`에 넣지 마세요. 기존 Edge Function 비밀값 `HIGGSFIELD_API_KEY`도 있으면 예비 키로 읽습니다. 회원별 하루 횟수 제한은 없습니다. 같은 회원의 동시 작업만 막습니다. 생성 비용은 운영자 Higgsfield 크레딧에서 차감됩니다.

서버 배포와 키 설정, 회원 인증을 실제로 확인한 뒤에만 `shared-config.js`에 다음 공개 엔드포인트를 추가해 전환합니다: `hairBackendUrl: 'https://xiovaesccoqtmcsvwqts.supabase.co/functions/v1/hair-generate'`. 이 값은 URL만 담으며 비밀키가 아닙니다. 전환 전에는 기존 방문자 개인 키 방식이 유지됩니다. 서버 경로는 Supabase 비익명 로그인 세션을 검사하며, 로그인하지 않았거나 익명 계정인 경우 생성을 거부합니다.
