# PS Radar 푸시 서버 2.3.4 — 배포 준비본

현재 온라인 미리보기는 2.3.3입니다. 이 코드의 실제 서버 배포·단말 푸시 수신은 아직 검증 전입니다.

## 구성
- `server.mjs`: PostgreSQL에 기기별 구독·가격 조건·관측값·발송 대기열을 저장합니다.
- `policy.mjs`: 목표 가격, 관측 최저가, 할인 시작, 종료 24시간 이내, 할인율 기준 판정.
- `push-client.mjs` / `push-sw.js`: 브라우저 권한 요청·구독·해제·알림 표시·상품 바로 열기.
- 단말 토큰은 브라우저에서 생성하고 서버에는 SHA-256 해시만 저장합니다. DB와 비공개 VAPID 키는 프런트에 넣지 않습니다.
- 이전 가격/48시간 초과 가격/출시 전 상품은 제외. 발송 실패는 최대 5회 재시도, 만료 구독은 비활성화.
- 중복 방지를 위한 이벤트 ID는 유지합니다. 발송과 DB 기록 사이의 서버 중단 시 재전송 가능성이 있으며 브라우저 notification tag로 같은 알림을 대체합니다.

## 실행 환경
- Node.js 22 이상, PostgreSQL, `npm install` 후 `npm start`.
- Render: root directory `ps-radar/push-server`, build `npm install`, start `npm start`, health `/health`.
- 필수 비밀 환경값: `DATABASE_URL`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`.
- 키 생성: `npx web-push generate-vapid-keys`. 비공개 키와 CRON_SECRET은 서버/Actions secrets에만 저장.
- VAPID_SUBJECT는 관리자가 확인한 연락처 mailto 또는 HTTPS URL 사용.

## 배포 후 연결 순서
1. 서버 `/health` 확인 및 DB 테이블 생성 확인.
2. `push-client.mjs`, `push-sw.js`를 `preview-v2`에 배치하고 서버 URL만 설정.
3. 상품별 `alertState.rules`를 productId 기준으로 변환해 구독 설정·찜 변경 때 서버로 동기화.
4. `?product=`를 최신 catalog의 productId로 조회하여 상세 열기. SW 메시지는 앱 알림 내역에도 반영.
5. GitHub repository secrets `PSR_PUSH_API` / `PSR_PUSH_CRON_SECRET` 설정. 아래 스케줄은 20분마다 기존 수집 가격을 확인하며 Store 실시간 조회가 아닙니다.
6. 실제 사용자 기기에서 알림 허용 → 테스트 알림 → 앱 종료 후 수신 검증. 웹뷰 APK에서는 웹 푸시를 보장하지 않으며 별도 네이티브 FCM 연결이 필요합니다.

## 테스트
`npm test` 또는 `node --test policy.test.mjs`: 판정·중복·오래된 가격·요청 검증 테스트.
실제 DB·네트워크·브라우저 push 수신 테스트는 배포 뒤 수행합니다.
