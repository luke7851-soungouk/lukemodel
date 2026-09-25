# 공개 갤러리(누구나 업로드·다운로드) 켜는 법 — Supabase 무료 플랜

lukemodel.com은 GitHub Pages(정적 호스팅)라 방문자 파일을 저장할 곳이 없습니다.
`/shared-config.js`의 `url`, `anonKey` 두 값만 채우면 `lukemodel.com/higgsfield/?tab=public`이
"이 브라우저 전용" 모드에서 **전 세계 공개 갤러리**로 자동 전환됩니다. 코드 변경 불필요.

## 1. 프로젝트 만들기 (무료, 카드 불필요)
1. https://supabase.com → GitHub 계정으로 로그인 → New project (Free plan, Region: Northeast Asia (Seoul)).
2. 무료 한도(2026-09 기준, 변동 가능): 파일 저장 1GB, 월 전송량(egress) 약 5GB, DB 500MB.
   7일간 요청이 없으면 프로젝트가 일시정지될 수 있음(대시보드에서 Restore).

## 2. SQL Editor에 아래 전체를 붙여넣고 Run
```sql
-- 2-1) 공개 버킷: 50MB 제한, 이미지/영상 MIME만 허용
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-media', 'public-media', true, 52428800,
        array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 누구나 "새 파일 추가"만 가능 (덮어쓰기/삭제/목록 조회 정책 없음 → 불가)
create policy "anon insert public-media" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'public-media'
    and name ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm|mov)$');

-- 2-2) 갤러리 목록 테이블
create table public.shared_media (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  path text not null unique
    check (path ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm|mov)$'),
  kind text not null check (kind in ('image','video')),
  mime text not null check (mime in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime')),
  size bigint not null check (size > 0 and size <= 52428800),
  title text check (char_length(title) <= 80),
  source text check (source in ('upload','studio')),
  hidden boolean not null default false,
  report_count int not null default 0
);
alter table public.shared_media enable row level security;
create policy "read visible" on public.shared_media for select to anon, authenticated using (hidden = false);
create policy "insert new" on public.shared_media for insert to anon, authenticated
  with check (hidden = false and report_count = 0);
-- (update/delete 정책 없음 → 방문자는 수정·삭제 불가)

-- 2-3) 신고 + 3회 누적 시 자동 숨김
create table public.media_reports (
  id bigint generated always as identity primary key,
  media_id uuid not null references public.shared_media(id) on delete cascade,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now()
);
alter table public.media_reports enable row level security;
create policy "insert report" on public.media_reports for insert to anon, authenticated with check (true);

create or replace function public.bump_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.shared_media
     set report_count = report_count + 1,
         hidden = (report_count + 1) >= 3
   where id = new.media_id;
  return new;
end $$;
create trigger trg_bump_report after insert on public.media_reports
  for each row execute function public.bump_report();
```

## 3. 키 넣기
Project Settings → API (또는 API Keys)에서
- **Project URL** (예: `https://abcdefghijkl.supabase.co`)
- **anon public** 키(`eyJ...`) 또는 **publishable** 키(`sb_publishable_...`)

를 `/shared-config.js`의 `url`, `anonKey`에 넣고 커밋·푸시. 이 키는 원래 브라우저 공개용이라
노출돼도 위 RLS 정책 이상은 할 수 없습니다. **`service_role` / `sb_secret_` 키는 절대 넣지 마세요.**

## 4. 운영 (관리자)
- 신고로 숨겨진 항목: Table Editor → `shared_media` → `hidden = true` 행 확인 →
  Storage → `public-media`에서 해당 `path` 파일 삭제 후 행 삭제.
  (숨김은 목록에서만 빠지고, 파일 URL을 아는 사람은 삭제 전까지 접근 가능)
- 용량 관리: Storage 사용량이 1GB에 가까워지면 오래된 파일 삭제 또는 유료 전환.
- 클라이언트 제한(우회 가능하므로 참고용): 이미지 ≤10MB, 영상 ≤50MB, 매직바이트 검사, 실행 파일 거부.
  **실제 강제는 서버 쪽 버킷 file_size_limit / allowed_mime_types / 경로 정규식**이 담당.

## 한계 / 위험
- 로그인 없는 익명 업로드라 스팸·불법 콘텐츠 위험이 있습니다. 필요하면 나중에 Supabase Auth(익명 로그인 + rate limit)
  또는 Cloudflare Turnstile을 추가하세요.
- 무료 전송량(월 ~5GB)을 영상 다운로드가 빠르게 소진할 수 있습니다(50MB 영상 100회 = 5GB).

## (선택) 자동 등록 폴백용 마이그레이션 — 파일 복사가 실패할 때 원본 링크로라도 등록
힉스필드 스튜디오는 완성된 결과 파일을 Supabase로 **복사**해 자동 등록합니다(2026-09-25 기준, Higgsfield CDN
`d8j0ntlcm91z4.cloudfront.net`은 `Access-Control-Allow-Origin: *`라 브라우저 복사 가능).
50MB 초과나 CORS 차단 시 원본 URL만 등록하려면 아래를 한 번 실행하세요(미실행 시 해당 건만 등록 실패 알림).
```sql
alter table public.shared_media add column if not exists external_url text
  check (external_url ~ '^https://[a-z0-9.-]+\.(cloudfront\.net|higgsfield\.ai)/');
alter table public.shared_media alter column path drop not null;
alter table public.shared_media add constraint path_or_url check (path is not null or external_url is not null);
```
