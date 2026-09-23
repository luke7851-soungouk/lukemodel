# 페이스루크 (lukemodel) — AI 스튜디오

GitHub Pages용 정적 SPA입니다. 메인 파일은 `index.html` 하나입니다.

## AI 스튜디오

내비 **AI 스튜디오**에서 합성 얼굴을 생성하고, 로그인 후 **카탈로그에 올리기**로 `localStorage` DB(`facenaru.v2`)에 등록할 수 있습니다.

### 엔진

| 엔진 | 키 | 비고 |
|------|----|------|
| Pollinations Flux | 불필요 | GitHub Pages에서 바로 동작하는 기본 경로 |
| Fal Flux / Fal SDXL | Fal API Key | 설정 모달에 저장 (`facenaru.studio.v1`) |
| Higgsfield | `key-id:key-secret` | 이미지(z-image/turbo 등) 시도. Seedance 얼굴 비디오는 Phase 2 |
| 데모(오프라인) | 불필요 | 내장 SVG `faceImg` 폴백 |

API 키는 브라우저 `localStorage`에만 저장되며 하드코딩하지 않습니다.

### CSP

`connect-src`에 Pollinations / Fal / Replicate / Higgsfield 호스트가 포함되어 있습니다.
