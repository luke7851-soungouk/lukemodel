# 페이스루크 (lukemodel) — AI 스튜디오

GitHub Pages용 정적 SPA. 메인 파일은 `index.html` 하나.

## AI 스튜디오

내비 **AI 스튜디오**에서 이미지·영상을 프롬프트로 생성합니다. 로그인 후 **내 모델로 저장**하면 `localStorage`(`facenaru.v2`)에 등록되고, 큰 파일은 IndexedDB(`facenaru.files.v1`)에 보관합니다.

### 내 AI 모델 aside (Google 로그인 후)

Google로 로그인하면 **「내 AI 모델」** aside에 계정별 슬롯이 자동 생성됩니다 (`facenaru.studio.v1:google:<sub>`).

| 슬롯 | 용도 | 키 |
|------|------|----|
| Google AI (Gemini/Imagen) | 이미지 | [AI Studio](https://aistudio.google.com/apikey) |
| OpenAI / ChatGPT Images | 이미지 | [API keys](https://platform.openai.com/api-keys) |
| Anthropic / Claude | **텍스트·프롬프트 보조만** (이미지/영상 API 없음) | [console.anthropic.com](https://console.anthropic.com/) |
| Fal (Flux · Kling · MiniMax) | 이미지+영상 | [fal.ai keys](https://fal.ai/dashboard/keys) |
| Replicate | 이미지+영상 | [tokens](https://replicate.com/account/api-tokens) |
| Higgsfield | 이미지+영상 | docs 자격증명 |
| Pollinations | 무료 이미지 | 불필요 |
| 데모 | 오프라인 미리보기 | 불필요 |

**정직한 한계:** Google Sign-In만으로 ChatGPT/Claude/Fal 등 토큰이 생기지 않습니다. 각 API 키를 1회 저장하면 생성 시 **그 계정 토큰**을 씁니다(서버 전송 없음).

헤더 **내 AI 모델** / 스튜디오 버튼 / 플로팅 FAB로 aside를 열 수 있습니다.

### 내가 만든 이미지·동영상 업로드 → 사이트 상단 자동 등록

헤더 **+ 업로드** / 모델 상세 / 내 페이지:
- 기기에서 jpg/png/webp/gif · mp4/webm 선택 → **메인 카탈로그 맨 위에 즉시 등록** (기본: 새 얼굴 카드, 커버=첫 파일 썸네일)
- 기존 모델에 붙이면 그 카드가 `bumpedAt`으로 상단으로 올라감 · 메인 정렬 기본값 **최신순**
- 등록 후 탐색 화면으로 이동·카드 하이라이트 · 토스트「사이트 상단에 등록했습니다」
- 블롭은 IndexedDB(`facenaru.files.v1` assets), 메타는 `model.assets` (`source: upload`)

**정직한 한계:** 서버가 없어 이 브라우저에만 남습니다. 다른 기기 동기화는 백엔드가 필요합니다.

### 얼굴 상세 → 「이 얼굴로 힉스필드 제작」 (`/face-hf.js`)
얼굴을 누르면 나오는 상세 페이지에서 그 얼굴 그대로 Higgsfield 이미지·영상을 만듭니다.
- 방문자 본인 Higgsfield 키 (`localStorage` `lukehf.key`, /higgsfield/ 스튜디오와 공유)
- 이미지: Soul 2(기본)·Soul Cinema → `higgsfield-ai/soul/reference` + `image_reference_url`, Ideogram 4.0 → `image_url`+`image_weight`, Qwen Image 3 → `alibaba/qwen-image-3/edit` + `image_urls`. 얼굴 사진이 항상 자동 첨부
- 영상: 이미지→영상 모델, 시작 프레임 = 얼굴 사진(또는 이 페이지에서 만든 이미지 「이 결과로 영상 만들기」)
- 얼굴 사진 URL: 저장소 얼굴 `faces/*.jpg` → `https://lukemodel.com/faces/…` / 브라우저에서 만든 얼굴 → Supabase `public-media`에 파일만 1회 업로드 후 모델에 캐시
- 완성 결과: Supabase에 파일 복사 + `shared_media` 행. 제목 끝 ` #face:<얼굴키>`(repo 얼굴 `r-<파일명>`, 브라우저 얼굴 `u-<랜덤>`)로 얼굴별 「이 얼굴로 만든 작품」을 불러오고, 홈 공개 갤러리에도 그대로 표시(태그는 화면에서 숨김)
- 공용 코드: `/hf-core.js` (`window.LukeHF` — 모델 카탈로그·요청 생성·Higgsfield 호출·Supabase 업로드·다운로드). 스튜디오 `higgsfield/app.js`도 같은 모듈 사용

### 같은 얼굴 · 공유
- **공유 코드** 로컬 팩 (`facenaru.shares.v1`)

### 한계
공유·카탈로그·키는 브라우저 로컬입니다. 기기 간 클라우드 동기화·타사 OAuth 키 브로커는 백엔드가 필요합니다.
