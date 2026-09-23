# 페이스루크 (lukemodel) — AI 스튜디오

GitHub Pages용 정적 SPA. 메인 파일은 `index.html` 하나.

## AI 스튜디오

내비 **AI 스튜디오**에서 이미지·영상을 프롬프트로 생성합니다. 로그인 후 **내 모델로 저장**하면 `localStorage`(`facenaru.v2`)에 등록되고, 큰 파일은 IndexedDB(`facenaru.files.v1`)에 보관합니다.

### 내 AI 연결 (자체 토큰)

**내 AI 연결** 설정에서 제공자 API 키와 모델/엔드포인트를 등록합니다.  
저장 키: `facenaru.studio.v1` (브라우저만, 서버 전송·로그 없음, 입력은 password).

| 제공자 | 키 | 이미지 | 영상 |
|--------|----|--------|------|
| Pollinations Flux | 불필요 | ✓ | — |
| Fal | Fal API Key | Flux Dev / SDXL 등 | MiniMax / Kling 등 |
| Replicate | `r8_…` | owner/name | 사용자 지정 모델 |
| Higgsfield | `key-id:key-secret` | ✓ | ✓ |
| OpenAI Images | `sk-…` | gpt-image-1 / dall-e-3 | — |
| 데모 | 불필요 | 오프라인 플레이스홀더 | — |

**커스텀 모델 추가:** 설정 → 이름 · 제공자 · 이미지/영상 · 모델 ID  
(예: `fal-ai/flux/dev`, `black-forest-labs/flux-schnell`, `gpt-image-1`) → 연결 추가 → 저장. 끄기/삭제 가능.

스튜디오에서 **이미지 | 영상**을 고르면 해당 종류·활성화된 연결만 엔진 목록에 표시됩니다. 키 없는 연결에는 「연결 안 됨」 표시.

### 같은 얼굴 · 공유
- 저장한 AI 얼굴 아래 **이미지/영상 무제한 추가** (동일 faceId/faceSeed)
- **공유 코드**: 서버 없는 정적 사이트용. 소유자 코드 → 상대 「가져오기」(재생성 없음). 팩: `facenaru.shares.v1`
- **소유자 전체 다운로드**: ZIP / iOS 공유 시트. `saveBlobToDevice` 단일 경로 유지

### 한계
공유·카탈로그·키는 브라우저 로컬입니다. 기기 간 클라우드 동기화는 백엔드가 필요합니다.
