# KoAus (코오스)

호주 한인 커뮤니티 웹사이트 — `koaus.com.au`. Firebase Hosting + Firestore + Storage + Auth + App Check 기반 정적 다중 페이지 앱. 백엔드 서버 없음(클라이언트 직접 SDK 호출 + 보안 규칙으로 게이트).

- **Firebase project:** `koaus-f564c` (`.firebaserc`)
- **운영자 이메일:** `sinhang0122@gmail.com`, `koaus.official@gmail.com` (관리자 화이트리스트)
- **GitHub:** `sinhang0122/product-koans`

---

## 디렉토리 규칙 (반드시 준수)

웹 자산은 **모두 `public/`** 아래. 루트는 Firebase·하네스·운영 자산 전용.

| 경로 | 역할 |
|---|---|
| `public/*.html` (22개) | 모든 페이지 — index, 카테고리(accom/rent/jobs/auto/restaurants/salon/gp/trades/care/...), 모달 페이지(mypage/admin/points), 정적(terms/privacy/contact) |
| `public/*.js` (14개) | `app.js`(메인 부트스트랩·sidebar·auth-modal), `auth-extra.js`, `koaus-phone-auth.js`, `admin-mark.js`, `koaus-gallery.js`, `koaus-dedupe.js`, `hero-banner.js`, `marquee.js`, `compress.js`, `local-analytics.js`, `offline.js`, `pw-toggle.js`, `search-bar.js`, `session-timeout.js` |
| `public/style.css` | 단일 글로벌 스타일시트(~200KB) |
| `public/ads.txt` | AdSense 인증 |
| 루트 `firebase.json` `.firebaserc` `firestore.rules` `storage.rules` | Firebase 설정 |
| 루트 `setAdmin.js` | Node Admin SDK 스크립트 — 관리자 custom claim 부여 |
| 루트 `koaus-f564c-firebase-adminsdk-*.json` | 서비스 계정 키 (`.gitignore` 처리) |
| 루트 `package.json` | `firebase-admin` 의존성 + `deploy:rules` 스크립트 |

**중요:** 페이지·스크립트 수정은 항상 `public/<file>` 경로로. 루트의 `index.html` 등은 존재하지 않음 (2026-06-03 Hosting 이전 완료).

---

## 페이지·라우팅 구조

페이지가 곧 라우트 (`<page>.html?state=<nsw|vic|qld|wa|sa|act>`). 사이드바는 21개 페이지에 **동일하게 복제**되어 있음 — 사이드바 변경 시 21페이지 일괄 patch 필요(perl/awk 루프).

**카테고리 페이지** (사용자 글쓰기 + List/Map 토글 + 상세 모달):
- Living: `accom`(쉐어), `rent`, `jobs`, `auto`(차량/렌터카/동행), `points`(비자/포인트)
- Services: `restaurants`, `salon`, `trades`, `gp`(병원), `care`(돌봄)
- Info: `state`, `emergency`, `exchange`, `powerball`, `calculator`, `car-sale`
- 운영: `index`(홈/로그인 모달), `mypage`, `admin`, `contact`, `terms`, `privacy`

---

## Firebase 인프라

### Firestore (`firestore.rules`, 304줄)
설계 원칙(상단 주석에 명시): **빌링 폭탄 방어 우선**.
- 쓰기: 로그인 + 필드/타입/길이 검증 + 본인 소유만
- 수정/삭제: 작성자 본인만
- list: 페이지당 **최대 20개** 강제
- 미정의 경로: deny-all
- 관리자: Admin SDK가 부여한 `custom claim {admin: true}` **또는** 화이트리스트 이메일 (이중 안전망)

### Storage (`storage.rules`, 88줄)
이미지 업로드 게이트. 글 등록 모달의 `compress.js`로 클라이언트 압축 후 업로드.

### Auth
- **Email/Password + Google 팝업** — `app.js` 부트스트랩
- **Phone Auth (강제)** — `koaus-phone-auth.js`: 가입·로그인 시 SMS 본인 인증. 이중 타이머(메인 3분 + 재전송 10초 쿨다운). 2026-06 이메일 인증 흐름은 폐기됨.
- **회원가입 UI**: 보안질문 15개, nickname/secA 기반 계정 복구 흐름
- **세션**: `session-timeout.js` — 비활성 타임아웃 + 캐시 wipe

### App Check (reCAPTCHA v3)
봇·외부 스크립트의 백엔드 접근 차단. **현재 키:** `6Ld1mAwtAAAAADURkCq0J6GOr3wFg9DQVOsxVG5v`
- `app.js:24` (글로벌 init) + 10개 페이지에 자체 init 블록 복제 (`accom/admin/auto/gp/jobs/mypage/rent/restaurants/salon/trades`)
- `contact.html`은 Formspree 폼 토큰 발급용으로 별도 사용

### 가입 시 visible reCAPTCHA v2
인증 모달 안의 "로봇이 아닙니다" 체크박스. **사이트 키:** `6LcUgAItAAAAAElFzz2TQxoCSR0uSPvcVS4N6PiO`
- 12개 페이지의 `<div class="g-recaptcha" data-sitekey="…">`에 박혀 있음

### 관리자 (`setAdmin.js`)
```
node setAdmin.js   # ADMIN_EMAIL='sinhang0122@gmail.com'에 {admin:true} 부여
```
서비스 계정 키 파일 (`./service-account-key.json` 또는 자동 감지 `koaus-f564c-firebase-adminsdk-*.json`) 필요. **절대 커밋 금지**.

화이트리스트는 3곳을 동기화 유지:
1. `firestore.rules` 의 `isAdmin()`
2. `public/admin.html` 의 `ADMIN_EMAILS`
3. `public/admin-mark.js`

---

## 배포 명령

```bash
# Hosting (웹 자산)
npx firebase deploy --only hosting

# 보안 규칙
npm run deploy:rules           # firestore
npm run deploy:storage         # storage
npm run deploy:all-rules       # 양쪽
npm run deploy:rules:dryrun    # firestore dry-run
```

---

## 작업 시 주의사항

- **사이드바·헤더 일괄 변경:** 21개 페이지에 복제되어 있으므로 `cd public && for f in *.html; do perl -i -pe '...' "$f"; done` 패턴으로 처리. 빠진 페이지 없는지 grep 검증 필수.
- **App Check 키 변경:** 10개 페이지 + `app.js` + `contact.html` 모두 일괄 교체. 빠진 페이지 있으면 그 페이지에서 Firestore 호출이 거부됨.
- **Firestore 규칙 변경:** `deploy:rules:dryrun` → 실제 배포. 페이지네이션 20개 제한, 필드 길이 제한은 빌링 안전망이므로 완화하지 말 것.
- **관리자 권한:** custom claim과 화이트리스트 이메일 둘 다 작동(이중 안전망). 화이트리스트 추가 시 3곳 동기화.
- **이미지 업로드:** 반드시 `compress.js`로 압축 후 업로드 (Storage 비용 방어).
- **Phone Auth:** 가입·로그인 시점 강제 (액션 시점 정책 폐기). 우회 흐름 만들지 말 것.
- **지도/필터 UI 추가 시:** `.claude/agents/agent.md` §2-B (Map + Filter UX Standard) 강제. 신규 페이지에 Map View 가 들어가면 **공용 헬퍼 `window.koausMapCluster.attachMarkers()` 호출 1세트** 로 마커 생성 (자체 `forEach + new google.maps.Marker` 금지). 리스트 필터가 같이 있다면 `applyFilters` 안 `areaBounds AND` 분기 항상 포함, `runSearch` 의 region-없음 else 분기에서 `areaBounds = null` 금지.
- **외부 API 변경 시:** `.claude/agents/agent.md` §3-A (External API Standard) 강제. 도메인/키 변경 시 Google Cloud Console (Maps/Places key restrictions) + reCAPTCHA Admin (v2/v3 키 각각의 Allowed Domains) + Firebase Auth Authorized Domains **3개 콘솔을 한 세트** 로 점검.
- **신규 글쓰기 폼 추가 시:** `.claude/agents/agent.md` §2-C (Write-Form Mandatory Consent) 강제. 제출 버튼 위에 표준 `id="writeConsent"` 체크박스 + 라벨(`[필수] 이용약관 및 주의사항을 확인하였으며, 서비스 규정 위반 시 게시물 삭제 및 계정 제재가 이루어질 수 있음에 동의합니다.`) 필수. submit 핸들러 최상단에 표준 검증 블록(`if (!_consent.checked) { alert(...); focus + scrollIntoView; return; }`) 강제.
- **신규 상세 페이지 추가 시:** `.claude/agents/agent.md` §2-D (Detail Page Standard) 강제. 용어 단수 "Map View" (Maps View 금지). 위치 정보 있는 섹션은 **사진 / Map View / 길찾기(`detailDirBtn`) / 스트릿뷰(`detailSvBtn`) 4요소 의무**. 공용 `setupDetailLocation(p)` 함수 그대로 이식(자체 inline 지도 init 금지).
- **신규 카드/리스트 권한 액션 UI 추가 시:** `.claude/agents/agent.md` §2-E (RBAC UI Standard) 강제. **3단계 권한 분리 뷰 의무**: 일반(공유만) / 작성자(수정·삭제·공유·마감) / 운영자(블라인드·강제 수정·강제 삭제·공유). 권한 검사는 `window.koausRbac` (canEdit/canDelete/canHide/canMarkCompleted) 단일 헬퍼만 사용 — 페이지마다 자체 분기 작성 금지. 모바일(`@media max-width:640px`) 별표 vs 액션바 좌표 분리(`bookmark-btn` 우상단 / `koaus-admin-toolbar` 좌상단) + `flex-wrap` 4버튼 줄넘김 대응 + `data-status="completed/closed/hidden"` 시각 차이 표준 적용 의무.
- **상단 컴포넌트 배치 규격 (전 페이지 공통, 모바일·데스크탑 동일):** 신규/기존 페이지의 `<main class="page-container">` 본문 최상단은 반드시 다음 순서로만 마크업하라. ① `<section class="koaus-hero" data-koaus-hero-cat="<id>">` (히어로 배너 — 게시판/메인 진입 페이지) → ② `<section class="notice-section">` (마퀴 공지 바 — `marquee.js` 가 hydrate, **닫기(X) 버튼 절대 포함 금지** · 이전/다음 ‹ › 화살표만 허용) → ③ `<div class="page-header"><h1 class="page-title">...</h1></div>` (페이지 대제목). 정책·정적 콘텐츠 페이지는 ①(히어로)을 생략 가능하나 ②③ 순서는 절대 깨뜨리지 말 것. 옛 `.ticker-dismiss` 마크업이 발견되면 즉시 제거하며, `marquee.js` 가 자동으로 잔재를 정리한다.
