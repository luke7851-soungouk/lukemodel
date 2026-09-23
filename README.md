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
- 블롭은 IndexedDB(`facenaru.files.v1` assets), 메타는 `model.assets` (`source: upload`) · 갤러리「이 인물로 만든 작품」에도 표시

**정직한 한계:** 서버가 없어 이 브라우저에만 남습니다. 다른 기기 동기화는 백엔드가 필요합니다.

### 업로드한 얼굴로 바로 생성 (얼굴 유지)

모델 상세에서 **내 AI로 이미지/영상 생성 (얼굴 유지)**:
- 업로드·AI 저장 얼굴에 faceId/faceSeed/faceRef
- 연결해 둔 AI로 동일 인물 잠금 생성
- 결과는 그 얼굴 모델 아래 작품으로 자동 저장

실제 이미지 참조: Fal I2I/I2V, Google Gemini(인라인), OpenAI edits, Pollinations(`image=`).  
그 외는 강한 동일인 프롬프트+시드 잠금.

### 같은 얼굴 · 공유
- 동일 faceId/faceSeed로 작품 무제한 추가
- **공유 코드** 로컬 팩 (`facenaru.shares.v1`)
- 소유자 전체 ZIP / iOS 공유 시트

### 한계
공유·카탈로그·키는 브라우저 로컬입니다. 기기 간 클라우드 동기화·타사 OAuth 키 브로커는 백엔드가 필요합니다.
