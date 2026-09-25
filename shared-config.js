/* 페이스루크 공개 갤러리(누구나 업로드·다운로드) 설정.
   비어 있으면 공개 갤러리는 "이 브라우저 전용(로컬)" 모드로 동작합니다.
   Supabase 무료 프로젝트를 만든 뒤 아래 두 값만 채우면 전 세계 공개 갤러리가 켜집니다.
   - url: 프로젝트 URL (예: https://abcdefghijkl.supabase.co)
   - anonKey: Project Settings → API 의 "anon public" 키 (공개용 키. service_role 키는 절대 넣지 마세요)
   설정 방법: marketing/shared-upload-setup.md */
window.LUKE_SHARED = {
  provider: 'supabase',
  url: '',
  anonKey: '',
  bucket: 'public-media',
  table: 'shared_media',
  reportsTable: 'media_reports',
  maxImageMB: 10,
  maxVideoMB: 50
};
