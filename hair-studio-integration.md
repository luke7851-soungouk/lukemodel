# 헤어스타일 변경 서비스 연결

홈의 헤어스타일 변경 화면은 `hair-studio.js`에 있습니다. 현재 `window.LUKE_HAIR_API`가 설정되지 않아 900원 결제 버튼은 비활성화됩니다. 가맹점 계약과 결제 서비스 키가 준비되기 전에는 결제나 AI 생성을 제공한다고 표시하지 않습니다.

## 서버 계약

배포 시 `hair-studio.js`보다 앞에서 `window.LUKE_HAIR_API = 'https://...';`를 설정합니다. HTTPS 서버는 다음을 제공합니다.

- `POST /checkout`: `multipart/form-data`의 `file`, `style`, `prompt`를 받습니다. 이미지 JPG/PNG/WebP 또는 영상 MP4/WebM, 최대 50MB를 서버에서 재검증합니다. 클라이언트의 `amount`는 신뢰하지 않고 서버에서 **KRW 900, 1건**으로 고정합니다. 원본을 비공개 저장하고 주문을 만든 뒤 `{jobId, checkoutUrl}`을 반환합니다.
- 결제사가 서버 웹훅을 보내면 서명, 주문 ID, 금액, 통화를 확인합니다. 중복 웹훅으로 같은 작업을 두 번 생성하지 않도록 원자적으로 처리합니다. 검증된 결제 후에만 AI 생성 작업을 시작합니다. 결제 취소 및 생성 실패의 환불 정책과 자동 환불 처리가 필요합니다.
- `GET /jobs/:id`: 작업 소유자에게만 `{status, paid, kind, originalUrl, resultUrl, downloadUrl}`을 반환합니다. `status`는 `pending`, `processing`, `completed`, `failed` 중 하나입니다. 원본과 결과는 짧은 유효 기간의 서명 URL로 제공합니다. 결제 완료 후 `https://lukemodel.com/?hair_job=<jobId>`로 돌아오게 합니다.
- 다운로드 URL은 결제 및 작업 소유권을 서버에서 다시 검사해야 합니다. 임의의 `jobId`로 다른 사용자의 사진을 볼 수 없어야 합니다. 원본과 결과의 보관 기간, 삭제, 환불 고지를 개인정보 처리방침과 약관에 반영합니다.

## 공개 최신순 목록

공개 동의를 받은 결과만 `shared_media`에 제목 끝 `#hair` 태그와 함께 등록하면 상단의 최근 결과 영역에 `created_at.desc`로 표시됩니다. 기본값은 비공개입니다. 사용자 사진을 자동 공개하지 마세요.

## 남은 연결 정보

결제대행사 가맹점 계정 및 심사, 결제 API 키와 웹훅 비밀키, AI 이미지/영상 처리 서비스의 서버 자격증명이 필요합니다. 이 값은 브라우저 코드나 GitHub에 넣지 않고 서버 비밀 변수로 설정해야 합니다.
