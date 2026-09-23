# 페이스루크 (lukemodel) — AI 스튜디오

GitHub Pages용 정적 SPA. 메인 파일은 `index.html` 하나.

## AI 스튜디오

내비 **AI 스튜디오**에서 이미지·영상을 프롬프트로 생성합니다. 로그인 후 **내 모델로 저장**하면 `localStorage`(`facenaru.v2`)에 등록되고, 큰 파일은 IndexedDB(`facenaru.files.v1`)에 보관합니다.

### 업로드한 얼굴로 바로 생성 (얼굴 유지)

모델 상세에서 **이 얼굴로 AI 생성 → 이미지/영상 생성**:
- 업로드·AI 저장 얼굴에 faceId/faceSeed/faceRef를 붙이고
- 연결해 둔 AI로 생성하며 동일 인물 잠금
- 결과는 그 얼굴 모델 아래 작품으로 **자동 저장**

실제 이미지 참조: Fal I2I/I2V, Google Gemini(인라인 이미지), OpenAI edits, Pollinations(`image=` URL).  
그 외·키 없는 경우는 강한 동일인 프롬프트+시드 잠금.

### Google로 쉽게 AI 연결

**내 AI 연결**에서:
1. **Google로 연결** (기존 Google 로그인)
2. [AI Studio 키 발급](https://aistudio.google.com/apikey) → 붙여넣기
3. 모델 선택 · 저장

Google 로그인 시 키/연결은 `facenaru.studio.v1:google:<sub|email>` 에 계정별로만 저장됩니다(서버 전송 없음).

**한계:** GitHub Pages에는 백엔드가 없어 Fal·Replicate·Higgsfield·OpenAI는 Google OAuth만으로 자동 연동되지 않습니다. 각 API 키가 필요합니다. Google AI(Gemini/Imagen)만 AI Studio 키로 “Google 계정으로 쓰는 AI”에 가깝습니다.

### 내 AI 연결 (자체 토큰)

저장 키: `facenaru.studio.v1` 또는 Google 스코프 키 (브라우저만, password 입력).

| 제공자 | 키 | 이미지 | 영상 | 얼굴 참조 |
|--------|----|--------|------|-----------|
| Google AI (Gemini/Imagen) | AI Studio Key | ✓ | — | 인라인 이미지 |
| Pollinations Flux | 불필요 | ✓ | — | `image=` URL |
| Fal | Fal API Key | Flux / I2I 등 | MiniMax / Kling I2V | image_url |
| Replicate | `r8_…` | owner/name | 사용자 지정 | image 필드 시도 |
| Higgsfield | `key-id:key-secret` | ✓ | ✓ | image_url 시도 |
| OpenAI Images | `sk-…` | gpt-image-1 등 | — | edits 우선 |
| 데모 | 불필요 | 오프라인 | — | — |

### 같은 얼굴 · 공유
- 동일 faceId/faceSeed로 작품 무제한 추가
- **공유 코드** 로컬 팩 (`facenaru.shares.v1`)
- 소유자 전체 ZIP / iOS 공유 시트

### 한계
공유·카탈로그·키는 브라우저 로컬입니다. 기기 간 클라우드 동기화·타사 OAuth 키 브로커는 백엔드가 필요합니다.
