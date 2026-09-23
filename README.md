# 페이스루크 (lukemodel) — AI 스튜디오

GitHub Pages용 정적 SPA. 메인 파일은 `index.html` 하나.

## AI 스튜디오

내비 **AI 스튜디오**에서 합성 얼굴을 만들고, 로그인 후 **내 모델로 저장**하면 `localStorage`(`facenaru.v2`)에 등록됩니다. 큰 이미지는 IndexedDB(`facenaru.files.v1` / `assets`)에 보관합니다.

### 엔진
| 엔진 | 키 | 비고 |
|------|----|------|
| Pollinations Flux | 불필요 | 기본 무료 경로 |
| Fal Flux / SDXL | Fal API Key | `facenaru.studio.v1` |
| Higgsfield | `key-id:key-secret` | 이미지·짧은 영상 |
| 데모 | 불필요 | 오프라인 플레이스홀더 |

키는 브라우저에만 저장되며 하드코딩·로그하지 않습니다.

### 같은 얼굴 · 공유
- 저장한 AI 얼굴 아래 **이미지/영상 무제한 추가** (동일 faceId/faceSeed)
- **공유 코드**: 서버 없는 정적 사이트용. 소유자 코드 → 상대 「가져오기」. 얼굴 재생성 없음(토큰 절약). 팩은 `facenaru.shares.v1`
- **소유자 전체 다운로드**: ZIP(데스크톱) / 공유 시트(iOS). 단일 가중치 `saveBlobToDevice` 경로는 유지

### 한계
공유·카탈로그·키는 브라우저 로컬입니다. 기기 간 클라우드 동기화는 백엔드가 필요합니다.
