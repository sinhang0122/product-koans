# KoAus (코오스)

호주 한인 커뮤니티 웹사이트 — `koaus.com.au`. Firebase Hosting + Firestore + Storage + Auth + App Check + Cloud Functions(제재 callable 2종만) 기반 정적 다중 페이지 앱. 일반 기능은 클라이언트 직접 SDK 호출 + 보안 규칙으로 게이트, 운영자 제재만 callable 경유.

- **Firebase project:** `koaus-f564c` (`.firebaserc`)
- **운영자 이메일:** `sinhang0122@gmail.com`, `koaus.official@gmail.com` (관리자 화이트리스트)
- **GitHub:** `sinhang0122/product-koans`

**먼저 읽을 문서:** `docs/plan-2026-10.md`(현재 개편 계획·결정 기록) · `docs/handoff-site-review-session.md`(2026-07~09 세션 맥락). `docs/old-sessions/` 는 이전 대화 export(로컬 전용, gitignore).

---

## 디렉토리 규칙 (반드시 준수)

웹 자산은 **모두 `public/`** 아래. 루트는 Firebase·하네스·운영 자산 전용.

| 경로 | 역할 |
|---|---|
| `public/*.html` (33개) | 모든 페이지 — index, 카테고리(accom/rent/jobs/auto/restaurants/salon/gp/trades/care/...), 계정(mypage/settings/security), 채팅(chat — 1:1 인앱 채팅), 운영(admin/admin-ads/admin-marquee/admin-pinned), 정적(terms/privacy/contact/about/faq/guide/jobs-info/delete-account) |
| `public/*.js` (14개) | `app.js`(메인 부트스트랩·sidebar·auth-modal), `auth-extra.js`, `koaus-phone-auth.js`, `admin-mark.js`, `koaus-gallery.js`, `koaus-dedupe.js`, `hero-banner.js`, `marquee.js`, `compress.js`, `local-analytics.js`, `offline.js`, `pw-toggle.js`, `search-bar.js`, `session-timeout.js` |
| `public/style.css` | 단일 글로벌 스타일시트(~200KB) |
| `public/ads.txt` | AdSense 인증 |
| 루트 `firebase.json` `.firebaserc` `firestore.rules` `storage.rules` | Firebase 설정 |
| 루트 `functions/` | Cloud Functions (Node 22, 시드니 리전) — `suspendUser`/`unsuspendUser` callable 2종만. `node_modules`는 gitignore |
| 루트 `setAdmin.js` | Node Admin SDK 스크립트 — 관리자 custom claim 부여 |
| 루트 `koaus-f564c-firebase-adminsdk-*.json` | 서비스 계정 키 (`.gitignore` 처리) |
| 루트 `package.json` | `firebase-admin` 의존성 + `deploy:rules` 스크립트 |

**중요:** 페이지·스크립트 수정은 항상 `public/<file>` 경로로. 루트의 `index.html` 등은 존재하지 않음 (2026-06-03 Hosting 이전 완료).

---

## 페이지·라우팅 구조

페이지가 곧 라우트 (`<page>.html?state=<nsw|vic|qld|wa|sa|act>`). 사이드바(topbar+aside)는 31개 페이지에 **동일하게 복제**되어 있음(실측 2026-07 — `admin-ads`/`exchange` 만 제외) — 사이드바 변경 시 31페이지 일괄 patch 필요(perl/awk 루프).

**카테고리 페이지** (사용자 글쓰기 + List/Map 토글 + 상세 모달):
- Living: `accom`(쉐어), `rent`, `jobs`, `auto`(차량/렌터카/동행), `points`(비자/포인트)
- Services: `restaurants`, `salon`, `trades`(일상 자기 PR 보드 — 2026-07 개편), `gp`(병원), `care`(돌봄)
- Info: `state`, `emergency`, `exchange`, `powerball`, `calculator`, `car-sale`
- 운영: `index`(홈/로그인 모달), `mypage`, `settings`(환경설정), `security`(보안), `chat`(1:1 채팅), `admin`, `contact`, `terms`, `privacy`

**계정 3페이지 구조 (2026-07 마이페이지 슬림 개편):**
- `mypage.html` — 프로필 카드(사진·이름·이메일)+로그아웃 + 탭 4종 `mine`(내가 쓴 글)/`saved`(저장한 글)/`recent`(최근 본 글)/`videos`(최근 본 영상) **만**. 히어로·마퀴 없음(광고 배제 — 사용자 확정). 계정 관리 행(닉네임/사진/휴대폰/자기소개서/영상/탈퇴)을 여기 **다시 넣지 말 것**. auth 모달(가입 v2 reCAPTCHA + phone-auth)은 mypage 잔존 — 로그인 게이트의 종착지.
- `settings.html` — ⚙️ 환경설정 (mypage 프로필 카드 우측 톱니 → `settings.html?uid=<본인uid>` 고유링크, onAuth 가 `?uid=` 정규화). 닉네임 변경·프로필 사진·휴대폰 인증·자기소개서·영상 등록/내 등록 영상(`#mpMyVideos`, `koaus-video-reg.js` 로드) + "보안 설정 →" 링크. `window.koausAuth.openAuthModal` 은 mypage 리다이렉트로 자체 정의.
- `security.html` — 🔐 보안 (settings 에서 진입, 동일 `?uid=` 정규화). 비밀번호 재설정(password provider → `sendPasswordResetEmail`+60초 쿨다운 / 구글 전용 → Google 계정 관리 링크) + **계정 삭제**(Danger Zone — 비번 재설정과 같은 고유 페이지에 두라는 사용자 확정). phone-auth·video-reg 미로드.
- 고유링크는 UI 편의일 뿐 — 모든 연산은 `auth.currentUser` 기준(타인 uid 로 열어도 본인 설정만 보임, 보안 무결).

---

## Firebase 인프라

### Firestore (`firestore.rules`, ~780줄)
설계 원칙(상단 주석에 명시): **빌링 폭탄 방어 우선**.
- 쓰기: 로그인 + 정지 아님(`notSuspended()`) + 필드/타입/길이 검증 + 본인 소유만
- 수정/삭제: 작성자 본인만 (단 `hiddenBy:'admin'` 글은 작성자가 status/isHidden 변경 불가)
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
- `app.js:24` (글로벌 init) + 15개 페이지에 자체 init 블록 복제 (`accom/admin/admin-marquee/admin-pinned/auto/chat/gp/jobs/mypage/rent/restaurants/salon/trades/settings/security`)
- `contact.html`은 Formspree 폼 토큰 발급용으로 별도 사용

### 가입 시 visible reCAPTCHA v2
인증 모달 안의 "로봇이 아닙니다" 체크박스. **사이트 키:** `6LcUgAItAAAAAElFzz2TQxoCSR0uSPvcVS4N6PiO`
- 12개 페이지의 `<div class="g-recaptcha" data-sitekey="…">`에 박혀 있음

### Cloud Functions (`functions/index.js`) — 제재 callable 2종
`suspendUser` / `unsuspendUser` (v2 onCall). **리전 `australia-southeast1`(시드니) 고정** — admin.html 의 `getFunctions(app, 'australia-southeast1')` 및 firebase.json CSP `connect-src` 의 cloudfunctions.net 도메인과 한 세트.
- 호출 게이트: `enforceAppCheck: true` + 함수 내부 `request.auth.token.admin === true` 검증 (화이트리스트 이메일은 **불충분** — custom claim 필수, `node setAdmin.js` 선행)
- 동작: Auth disable/enable + `revokeRefreshTokens` + `users/{uid}.status` 동기화 + `moderation_logs` 기록
- `moderation_logs` 는 **Admin SDK 전용 쓰기** — firestore.rules 에서 클라이언트 create/update/delete 전부 `false`. 클라에서 쓰는 코드를 만들지 말 것.
- `maxInstances: 2` 는 빌링 방어 — 늘리지 말 것.
- 정지 강제의 실시간 차단은 rules 의 `notSuspended()` (users/{uid}.status get 체크)가 담당 — Auth disable 만으로는 기존 ID 토큰이 최대 1시간 살아 있음.

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

# Cloud Functions (제재 callable)
npm run deploy:functions
```

**functions·rules·클라이언트가 같이 바뀌는 변경은 배포 순서 고정: functions → rules → hosting.** (클라가 먼저 나가면 아직 없는 callable/규칙을 호출해 첫 사용이 깨진다.)

---

## 작업 시 주의사항

- **2026-10 개편 1단계(숨김 원칙):** 자세한 결정·순서는 `docs/plan-2026-10.md`. 핵심만:
  - **히어로 배너는 배너 유무로 자동 표시** — 관리자 페이지에 배너가 0개면 섹션 숨김, 올리면 그 주(또는 전국) 사용자에게 표시. 15페이지 `<section class="koaus-hero" hidden …>` + style.css `.koaus-hero[hidden]{display:none!important}` 가드 + `hero-banner.js`(배너 ≥1 일 때만 hidden 해제, `HERO_ENABLED` 는 비상 스위치)가 한 세트. 렌더 규칙은 **주(또는 all) 매칭 배너 개수만큼만**(0=섹션 숨김, 1=화살표·점 없음) — 기본(초록/파랑) SLOTS 슬라이드로 빈 슬롯을 채우던 동작은 폐지(되돌리지 말 것: "QLD 배너 1 + 빈 기본 슬라이드" 회귀 원인).
  - **홈 화면은 아직 손대지 않음**(사용자 확정). 햄버거(주별 구조)·홈 교체·13페이지 메뉴 숨김·홈 진입 카드 전부 **보류 중** — `.home-entry` CSS 만 style.css 에 준비돼 있음(마크업 없음).
  - **글쓰기 주체 제한**: accom '방 구하기' 탭(`FIND_MODE_ENABLED=false`), jobs '구직' 탭·게시 유형(`SEEKING_ENABLED=false`) 숨김. 데이터·rules 그대로, 옛 구직 글 수정 시 유형 보존.
  - **하단 탭바 '영상' 탭 제거**(`koaus-tabbar.js`). 홈 영상 레일·settings 영상 등록은 유지.
  - **이모지 전면 제거**(라이브 페이지·스크립트). 기능 기호 ★ ☆ ✕ ✓ ☰ ‹ › 만 유지, 지도 핀·잠금·공유·경고 등 아이콘은 inline SVG. 새 문구에 이모지를 넣지 말 것. 사이트 안내 문구는 "~다/~까" 합쇼체.
  - **채팅**: 메시지 **길게 누르기(데스크탑 우클릭) 액션 시트** = 복사 · 공유 · 수정 · 삭제(수정·삭제는 본인 메시지 5분 내만). rules: 삭제 표시 text=''+deleted+deletedAt==request.time / 수정 text(1~1000)+edited=true+editedAt==request.time('수정됨' 표시 강제), 발신자만, 삭제 후 재변경 불가. 인라인 버튼 없음. · **채팅방 나가기** `chats.hiddenFor`(본인만 증감, 메시지 전송 시 전체 비우기 허용 → 상대에게 방 재노출). 목록은 클라가 hiddenFor 필터. `rules-test.js` 케이스 10건 추가.
  - **`releaseRecycledPhone` 서버 검증**: 번호 문자열만 받던 구멍 제거 — 클라가 `PhoneAuthProvider.credentialFromError` 의 `temporaryProof` 를 보내고, 함수가 Identity Toolkit 에 직접 검증 후 A 해제 + B 연결(Admin SDK). 호출자 24h 1회. 번호만 보내는 호출은 거부. 테스트는 실제 재발급 번호로만 가능.

- **사이드바·헤더 일괄 변경:** 31개 페이지에 복제되어 있으므로(실측 2026-07 — `admin-ads`/`exchange` 제외) `cd public && for f in *.html; do perl -i -pe '...' "$f"; done` 패턴으로 처리. 빠진 페이지 없는지 grep 검증 필수. ⚠️ **메뉴 항목 추가/삭제 시 카운트 전·후 비교 의무** — `for t in 항목들; do grep -l "href=\"$t.html" *.html | wc -l; done` 로 페이지 수(공통 31 / 주별 항목 31×8) 확인. **항목을 "잉여"로 일괄 제거하면 라이브 페이지 동선이 통째로 끊긴다**(2026-06: `5e13fe6` menu 청소가 powerball·salon·trades·gp·state 진입점을 전부 날려 직접 URL로만 접근 가능했던 회귀 → 복구). 진입점 없는 라이브 페이지가 생기지 않게 추가/삭제 후 0-참조 페이지 grep 점검.
- **App Check 키 변경:** 15개 페이지 + `app.js` + `contact.html` 모두 일괄 교체 (`grep -l initializeAppCheck public/*.html` 로 실측). 빠진 페이지 있으면 그 페이지에서 Firestore 호출이 거부됨.
- **Firestore 규칙 변경:** `npm run test:rules`(루트 `rules-test.js` — 회귀 스위트: create/update + 비로그인 공개 read + 제재 시스템(정지/신고/moderation_logs/hiddenBy), Rules 공식 테스트 API 사용. ⚠️ 모킹 없는 `exists()/get()` 은 테스트 API 가 에러 처리하므로 러너가 기본 `exists→false` functionMocks 를 주입함 — 새 케이스 추가 시 `mk()` 빌더 사용) 통과 → `deploy:rules:dryrun` → 실제 배포. 페이지네이션 20개 제한, 필드 길이 제한은 빌링 안전망이므로 완화하지 말 것. 단, App Check Enforce 계층 차단은 이 스위트로 못 잡으므로 콘솔 작업(키/도메인 제한 변경) 후엔 운영 도메인에서 공개 페이지 1회 열람 확인 병행.
- **게시글 스키마 필드 추가 시:** 게시판 create 검증은 **게시판별 검증기 3개** — `validShareRentCreate()`(accom+rent) / `validJobsCreate()` / `validAutoCreate()` (공통 메타는 `validBaseCreate(d)`). 클라이언트 payload 에 새 키를 넣으려면 **해당 게시판 검증기의 `hasOnly([...])` 화이트리스트**를 갱신하고 필요시 `pOptStr/pOptInt/pOptBool/pOptList(d, ...)` 검증도 추가하라. 누락 시 `create` 가 `permission-denied` 로 거부되어 글쓰기가 즉시 멈춘다. 배포 순서는 **룰 먼저(`npm run deploy:rules`) → 새 클라이언트 나중(`firebase deploy --only hosting`)**. 순서를 거꾸로 하면 옛 룰이 새 키를 차단해 출시 직후 첫 글쓰기가 깨진다. ⚠️ **검증기를 다시 단일 함수로 합치거나 헬퍼 안에서 `data()` 류 함수를 재호출하는 구조로 되돌리지 말 것** — Firestore rules 는 요청당 **최대 1,000개 표현식 평가 한도**가 있어, 필드 많은 게시판(accom/rent)의 create 가 한도 초과로 전부 deny 되는 회귀가 실제 발생했다(2026-06). 변경 후엔 Firebase Rules 공식 테스트 API(`firebaserules.googleapis.com/v1/projects/koaus-f564c:test`)로 실페이로드 시뮬레이션 검증 권장.
- **관리자 권한:** custom claim과 화이트리스트 이메일 둘 다 작동(이중 안전망). 화이트리스트 추가 시 3곳 동기화.
- **이미지 업로드:** 반드시 `compress.js`로 압축 후 업로드 (Storage 비용 방어). 사진 업로드는 **동시성 3 병렬**(compress.js `uploadPostImages` + 인라인 모듈) — 직렬로 되돌리지 말 것. 파라미터 1200px/q0.7 통일.
- **고아 이미지 정리:** 루트 `cleanup-orphan-images.js` (Node admin SDK) — **분기마다 1회 dry-run** 권장. 기본 dry-run(카운트+목록+총용량), `--delete` 로만 실삭제. 가드 내장: `post_images/maintenance/`(localStorage 보드 — Firestore 참조 없어 고아 오판) + 24h 이내 파일 제외. ⚠️ `post_images/used/` 는 2026-06 auto `used`→`auto_posts` 마이그레이션으로 이제 **Firestore 가 참조**(`auto_posts.imageUrls`) — 글 삭제 시 `koausRbac.selfDelete` 가 정리하므로 가드의 'used=LS' 가정은 낡음(과보수적·무해, 후속 정리 가능). 서비스 계정 키는 **로컬만**(`.gitignore` 처리 — repo 커밋 금지).
- **services 글쓰기 검증:** services 는 5개 보드(points/auto/gp/salon/restaurants)가 제각각 스키마로 쓰는 통합 컬렉션 (**trades 는 2026-07 `daily_posts` 전용 컬렉션으로 이탈** — 아래 '일상 자기 PR 보드' 참조). **풀 `hasOnly` 화이트리스트는 백로그** — 쉐어-클론 필드 dump 구조를 "업체 폼 표준화"로 정리한 뒤 재검토. 현재는 미검증 문자열 필드 **길이캡**만 적용(bloat 방어).
- **일상 자기 PR 보드 (trades.html, 2026-07 개편):** 전용 컬렉션 **`daily_posts`** (services 사용 중단). 카테고리 3종 `food|beauty|tech`, `title`=이름/상호(≤60) · `body`=포트폴리오(≤3000) · `intro`(≤300) · `closing`(≤200) · `coverImageUrl`/`avatarUrl`(https, 각 1장) · `imageUrls`(≤10 — 상세는 ‹›+1/N 캐러셀) · `comment`(≤500, 옛 '주의사항' 파트 대체) · `coverOrient`(portrait|landscape enum) · `primaryContact`(sms|kakao|chat enum — 커버 사진 렌더 박스 우하단 '문의하기' 버튼이 ⑥ 그리드 해당 버튼에 .click() 위임, 클라가 수단↔데이터 정합 강제) · `avatarHidden`(bool — true 면 커버 아바타 완전 미렌더). 커버는 크롭 없이 전체 노출: portrait=높이 고정·좌우 여백, landscape=폭 100%·최소높이 미달 시만 상하 여백, 정사각(~1:1 자동 감지)=풀블리드 — maxH 캡 걸릴 때만 미세 cover-crop (`fitCoverPhoto()`). rules 는 **별도 검증기 `validDailyCreate()`** (hasOnly + 길이캡 — 기존 검증기 3개에 합치지 말 것, 1,000 표현식 한도) + URL 이중 게이트: `openKakaoUrl` 은 `https://open.kakao.com/` 만, `googleReviewUrl` 은 google.com/maps·maps.app.goo.gl·g.page 만, `phone` 은 숫자만(클라 inputmode=numeric + 비숫자 즉시 필터). 위치 프라이버시는 accom/rent 와 동일(`koaus-listing-privacy.js` — redact+offsetCoords+`daily_posts/{id}/private_data`, 기본 ON). 상세는 **PR 세로 스크롤 리빌**(`prd-*` — ①커버 ②포트폴리오 ③사진(0장=타인 비노출·본인만 placeholder) ④지도(비공개 시 400m 원+길찾기/스트릿뷰 숨김) ⑤구글리뷰 링크 버튼 ⑥문의(koaus-contact-actions — `openKakaoUrl`→`kakaoLink` 매핑 전달) ⑦브랜드 태그), 뷰포트 ≥900px 은 중앙 카드 모달·미만은 풀스크린. intro/portfolio 는 `user-select:none`+copy 차단. 정렬은 **선착순**: 1페이지 = `where('status','==','approved')+orderBy('createdAt','asc')+limit(20)` onSnapshot(LS 캐시), 2페이지~ = `startAfter(커서)+limit(20)` **일회성 getDocs**(`window.koausDailyPager` — onSnapshot 금지·페이지당 20 고정·메모리 캐시 재사용, 빌링 방어) — **daily_posts 복합 인덱스 (status+createdAt) ASC·DESC 2종 보유**. LS 캐시 `koaus-daily-posts` 는 onSnapshot 전용(직접 조작 금지, 작성자 액션은 `koausRbac.*('daily_posts', …)`). Storage 경로 `post_images/daily/{uid}`. 진입점: 사이드바 Others `일상 (Daily)` = `trades.html?state=<주>`(31페이지×8주) + gp/salon/restaurants/trades others-nav 스트립.
- **공유 딥링크 getDoc 폴백 (2026-07 전 보드):** `?id=` 자동오픈은 캐시 폴링(~1.5s) 미발견 시 해당 컬렉션 `getDoc` **1회 폴백** — trades→`daily_posts`·jobs→`jobs_posts`(신규), gp/salon/restaurants→`services`(신규, category 일치 검증 포함), accom/rent/auto 는 기존 `_initDetailDeepLink` 유지(+`status=='deleted'` 차단 보강). 공개 상태(approved·비숨김·비삭제)만 오픈, 아니면 alert 안내 — 재시도 루프 금지·인프라 실패는 silent. 폴백 결과는 `window.__koausDeepLinkPost` **메모리 주입만**(신규 4보드 — LS 캐시 직접 조작 금지), openDetail 이 캐시 미발견 시 이 주입분을 조회. car-sale 은 ?id 인프라 자체가 없어 제외.
- **Firestore 쿼리 인덱스 (FS 보드):** `where('status','==','approved') + orderBy('createdAt')` 형태 onSnapshot 은 **복합 인덱스 필수**. `firestore.indexes.json` 에 정의하고 **`npx firebase deploy --only firestore:indexes` 로 별도 배포** (⚠️ `--only hosting` 은 인덱스 미포함 — 누락 시 글은 써지나 구독이 `FAILED_PRECONDITION(the query requires an index)` 으로 깨져 **목록 미표시** 회귀). 보유 인덱스: `services`(+category 복합) / `accom_posts` / `rent_posts` / `auto_posts` / `daily_posts` / `videos` ×2 (status+createdAt — 홈/admin 큐 · authorUid+createdAt — 환경설정(settings) '내 등록 영상') / `chats` (participants array-contains + lastMsgAt DESC — 채팅 목록). `jobs_posts` 는 `orderBy('createdAt')` 단독이라 복합 인덱스 불필요. **신규 FS 보드 추가·LS→FS 마이그레이션 시 인덱스 정의+`firestore:indexes` 배포 동반 필수** (2026-06 auto 중고차(`used`) LS→Firestore `auto_posts` 마이그레이션 때 인덱스 누락으로 '글 미표시' 회귀 발생 → `auto_posts` 인덱스 추가 `b6df658` 로 복구).
- **auto 저장 구조 (2026-06):** auto 중고차(`used`) 사용자 글 = **Firestore `auto_posts`** (LS→FS 마이그레이션, 크로스기기 공유). auto 정비·견인 업체(`maintenance`/`towing`) = `services` 컬렉션. 작성자 액션은 `koausRbac.*('auto_posts', _fsDocId)` 경유 — onSnapshot 이 LS(`koaus-auto-posts`)에 캐싱하므로 **작성자 수정/삭제를 LS 직접 조작(savePosts/Object.assign)으로만 처리하면 onSnapshot 에 덮여 되돌아감**. 옛 `used` LS 글(`_fsDocId` 없음)은 마이그레이션 시 제거 정책.
- **Phone Auth:** 가입·로그인 시점 강제 (액션 시점 정책 폐기). 우회 흐름 만들지 말 것.
- **찜/저장(★):** 게시글 찜은 **기기-로컬(localStorage `koaus-saved-posts`)** 저장 — Firestore 미연동(계정 귀속 아님). **로그인 게이트는 전역 `koaus-save-guard.js` 단일** (capture-phase 가 `.bookmark-btn`/`#detailSaveBtn`/`#detailSaveBtn2` 가로채 비로그인 시 `openAuthModal`). 비로그인이 ★ 만 체크되고 저장 안 되는 "가짜 체크"(신뢰 훼손) 회귀 방지 — 페이지별 자체 토글에 로그인 분기를 다시 넣거나 가드를 우회하지 말 것. drawer(지도 하단 카드)에는 ★ 미노출(`.drawer-card .bookmark-btn{display:none}` — ✕ 와 충돌). 8개 보드(accom/rent/jobs/auto/restaurants/salon/trades/gp) 에 guard 로드 필수.
- **상단 노출 2종 (혼동 금지):** ① **마퀴(전광판)** = `notices` 컬렉션(admin 카드2 "상단 공지 알림") → 전 페이지 상단 띠. `marquee.js` 가 `sponsor`(입력 광고주/게시자명, 폴백 `📢 공지`)+`text` 렌더 — **운영자 알림 채널**. ② **핀배너(상단 노출 글)** = `board_pinned_notices` 컬렉션(admin 카드3 "상단 노출 글 등록") → 카테고리 본문 최상단 `#pinnedNoticeBox`. **게시자 글 강조 노출용** — 렌더는 `data.title`(굵게)+`data.text` (확성기 📢·"공지" 하드코딩 금지 — 2026-06 제거, 제목 무시하던 회귀). 광고주 글 강조 요구는 ②(또는 히어로 배너) 로 충족 — ①(마퀴)를 광고주명 표시로 개조하지 말 것.
- **홈 영상(videos) 승인 큐 (2026-07):** 홈 영상 칸 = `public/koaus-home-videos.js` (ES module — index.html 에 `type="module"` 로드, marquee 패턴: appcheck-init import + LS 캐시 `koaus-home-videos` 즉시 렌더). **등록 진입점은 환경설정(settings.html)** (2026-07 개편: mypage → settings 이동) — `public/koaus-video-reg.js` (별도 ES module, settings.html 로드)의 `[data-koaus-video-reg]` capture 위임이 모달을 연다. **또한 하단 탭바(`koaus-tabbar.js`) '영상' 탭(채팅 왼쪽)** → `settings.html?video=1` 딥링크(발견성 개선, 2026-07) — video-reg 의 `maybeAutoOpen()` 이 onAuth 확정 후 등록 모달 자동 오픈 + 영상 섹션 스크롤(**한 번만** — `autoOpened` 플래그로 재로그인·onAuth 재발화 시 재오픈 방지). settings 의 `?uid=` 정규화는 `history.replaceState` 라 `?video=1` 를 보존. 홈 ＋ 버튼은 폐지(2026-07) — 홈 파일에 addDoc/등록 코드를 다시 넣지 말 것. 등록 → **`videos` 컬렉션 `status:'pending'`** → admin.html 카드 4-b "영상 승인"에서 승인(`status:'approved'`)/거부(delete). rules 가 create 시 `pending` 강제(자가 승인 차단) + `createdAt == request.time`(serverTimestamp 강제 — 클라 addDoc 은 반드시 `serverTimestamp()`) + 유튜브 URL 패턴 + hasOnly(`videoId,url,title,status,authorUid,createdAt,ctaText,ctaUrl` — **authorEmail 금지, H4**). **CTA(선택, UI 라벨 "리다이렉트 제목/URL"):** `ctaText`(≤60) + `ctaUrl`(**유튜브 링크만** — rules `matches('https://((www|m)[.])?(youtube[.]com|youtu[.]be)/.+')` + 클라 regex 이중 게이트, ≤300 — 2026-07 "https 어디든" 정책 폐기) 쌍 — 등록자 입력, 플레이어 하단 "제목 ›" 버튼으로 렌더. admin 영상 승인 카드가 CTA 문구+목적지 URL 을 그대로 노출하므로 **승인 전 링크 검토(스팸/피싱 게이트) 의무**. **등록 시 임베드 사전 검사(2026-07):** `koaus-video-reg.js` `checkEmbeddable(id)` — 숨김 테스트 iframe(youtube-nocookie, mute 자동재생, offscreen 2px)으로 실재생 확인. PLAYING/BUFFERING = 통과, onError 100(삭제/비공개)·101/150(퍼가기 차단·**연령 제한 19+**) = 등록 거부 alert. **8s 타임아웃은 fail-open**(오탐으로 정상 영상 막는 것 방지 — fail-closed 로 바꾸지 말 것, 승인 큐 눈검토 2차 + 플레이어 폴백 3차 안전망 존재). 연령 제한은 **영상 단위**로 걸러짐(같은 채널의 전체연령 영상은 통과). CSP frame-src 에 youtube/nocookie 기포함이라 무설정 동작. terms.html §4(EN·KO)에 임베드 재생·원저작권자 요청 시 노출 중단 조항 명시(2026-07). **풀스크린 폴백 자가치유(2026-07):** onMsg 가 postMessage `d.id`(listening 핸드셰이크의 슬라이드 인덱스 echo)로 발신 슬라이드 귀속(cur 무조건 귀속 금지) + PLAYING/BUFFERING 수신 시 "재생 제한" 폴백 자동 철회 + 재마운트 시 폴백 리셋. 진짜 차단 영상은 재생 상태가 영원히 안 와 폴백 유지 — 이 원리를 깨뜨리지 말 것. ⚠️ **폴백 상시 노출의 진짜 원인은 CSS 였음(2026-07 확정):** `.kv-fallback` 의 author `display:flex` 가 `[hidden]` UA 스타일을 덮어 문구가 전 영상에 항상 표시("재생되는데 제한 문구") → `.kv-fallback[hidden]{display:none!important}` 가드로 해결. **hidden 토글 요소에 author display 를 주면 반드시 `[hidden]` 가드 동반** — 이 가드를 지우면 즉시 재발. ⚠️ **`.kv-frame iframe` 은 반드시 `position:absolute;inset:0`** — 비positioned 로 되돌리면 absolute 인 `.kv-poster` 가 위에 페인트되어 "영상 안 흘러가고 썸네일(저화질)만 보임 + 클릭 일시정지 불가" 버그 재발(2026-07 확정 원인). 포스터는 hq720+hqdefault **다중 배경 폴백**(첫 레이어 404 시 다음 레이어 — JS 불필요). 스페이스 = 재생/일시정지(onKey — onMsg 가 `slide.__kvState` 에 최신 재생 상태 기록, mountActive 가 -1 리셋). **홈 타일 크기(2026-07 재확대 — 사용자 확정 "리얼스테이트 카드급"):** 세로 기준 `clamp(300px,45svh,470px)`(모바일 뷰포트 ~45%, 폰에 타일 1.5~1.8개, svh 미지원은 vh 폴백 선행 선언) + `aspect-ratio:9/16` 가로 자동 산출 — width 고정으로 되돌리지 말 것. 썸네일은 hq720 + onerror hqdefault 폴백(JS 리스너 — 인라인 onerror 속성은 CSP 위반). 공개 read 는 approved 만 — 홈/admin 구독 전부 `where('status','==',…)+orderBy('createdAt','desc')+limit(20)` (**videos 는 limitedList ≤20** — reports 의 100 과 다름, 초과 구독은 전체 거부). 복합 인덱스 필수(위 보유 인덱스 참조). 60초 초과·부적절 영상은 v1 에선 운영자 눈검토로 거름(Data API 미사용). 등록 로그인 게이트는 `window.koausAuth` (settings 는 `openAuthModal: () => location.href='mypage.html'` 자체 정의 — 미덮어쓰기 존중). **내 등록 영상(2026-07):** settings `#mpMyVideos` 를 `koaus-video-reg.js` 가 hydrate — `where('authorUid','==',uid)+orderBy('createdAt','desc')+limit(20)` onSnapshot (where 가 rules 본인 disjunct 를 정적 증명, **videos(authorUid+createdAt) 복합 인덱스 필수**). 승인 대기/게시 중 칩 + 본인 삭제(`[data-kv-del]` 문서 위임 — rules delete: 본인||admin 기허용, rules 무변경). 컨테이너 없으면 구독 자체를 안 여니(빌링 0) 타 페이지 로드에 안전. **인라인 자동재생(홈 레일):** iframe 은 **항상 1개**(중앙 최근접 타일만 mute 자동재생, scrollLeft≤6→첫 영상) — IntersectionObserver(threshold .25)+visibilitychange+플레이어 열림 가드로 화면 밖 재생 차단. 타일마다 iframe 을 붙이는 구조로 되돌리지 말 것(데이터/성능). 풀스크린 플레이어는 **세로 scroll-snap 피드**(위로 스와이프 = 다음 영상, 활성 슬라이드만 iframe) + 좌상단 ‹ 뒤로가기·우상단 ✕(둘 다 `history.back()` 위임 → popstate 가 닫기). **플레이어 컨트롤은 유튜브 네이티브로 일원화(2026-07 사용자 확정):** 커스텀 `.kv-set`(배속·자막) 패널·`.kv-sound`(소리 토글)·`.kv-unmute`('탭하여 소리 켜기' 힌트) **전부 제거** — 영상 탭 시 뜨는 유튜브 네이티브 컨트롤(소리·자막·설정·배속)이 담당(embedSrc 는 `controls` 기본값 유지 = 네이티브 노출, `mute=1` 로 시작). 우하단 `.kv-actions` 는 **공유(↗ 유튜브에서 보기)만** 남김. ⚠️ **`applyPrefs` 는 프로그램적 `unMute` 를 하지 않는다** — 모바일에서 사용자 제스처 없는 unMute 는 재생을 멈춰 '다음 영상 정지' 버그를 유발했음. 대신 `setPlaybackRate`+**`playVideo` 넛지**만 보내 슬라이드 전환 후에도 mute 자동재생이 바로 이어지게 한다(2026-07 모바일 자동재생 수정). 소리는 각 영상에서 네이티브 컨트롤로 사용자가 직접 켠다 — 이 unMute-금지 원리를 되돌리면 모바일 자동재생이 다시 깨진다. ⚠️ **두 모듈 모두 boot() 호출은 파일 최하단 고정** — 상단 호출 시 var 호이스팅으로 LS_KEY 미초기화 참조 + 아래쪽 `var VIDEOS=[]` 가 init 상태를 wipe 하는 회귀(2026-07 발견·수정). **최근 본 영상(2026-07):** 풀스크린 `mountActive()` 가 활성 슬라이드 iframe 마운트 시 `recordWatch()` → **기기-로컬 LS `koaus-recent-videos`** ({videoId,title,at} dedupe·cap 30, Firestore 미연동 = rules 무변경). 인라인 음소거 자동재생은 기록 안 함. mypage `videos` 탭이 읽어 썸네일 그리드 렌더(videoId 는 유튜브 ID 정규식 검증 후 삽입) → 카드 클릭 = **`index.html?v=<id>` 딥링크** — koaus-home-videos.js 가 LS 캐시/첫 스냅샷에서 매칭 시 플레이어 직행 + `history.replaceState` 로 `?v=` 제거, **첫 서버 스냅샷에도 없으면 만료 처리**(미승인/삭제 영상 소급 오픈 금지 — 이 가드를 제거하지 말 것).
- **인앱 1:1 채팅 (2026-07):** 게시글 상세 연동 별명 대화 — 자유 DM 없음(추후), AI Q&A 챗봇·FCM 푸시는 2단계(앱 출시 시).
  - **스키마:** `chats/{chatId}` — chatId = **`{postId}_{문의자uid}` 고정**(rules 강제 — 같은 글 재문의는 기존 방 재사용·임의 ID 차단), `participants=[ownerUid, inquirerUid]` 순서 고정, hasOnly 14필드, 자기 글 채팅 금지(ownerUid != auth). `chats/{id}/messages` — {senderUid, text≤1000, createdAt==serverTimestamp} hasOnly 3필드, 전송 자격은 **부모 doc get() 검증**(전송당 1 read), update 전면 금지·delete admin 만. ownerUid 위조는 rules 미검증(보드→컬렉션 매핑 get 비용) — 차단+신고로 완화(설계 확정).
  - **진입 3곳:** ① 상세 모달 `koaus-contact-actions.js` `.contact-action-btn--chat`(order:0 풀폭 상단 행 — **`chatAllowed === true` 옵트인 글만** + post uid+식별자, 본인 글 미노출) — **create-first 전략**: setDoc 성공→이동, 거부→getDoc 으로 기존 방(이동)/미인증(안내) 구분. ⚠️ **get-first 로 바꾸지 말 것** — 미존재 doc get 은 rules 가 거부해 '없음/권한없음' 구분 불가. ② 탭바 채팅 탭 ③ mypage 프로필 카드 💬(`#mpChatLink`). jobs/points/car-sale 은 이 기능 위해 koausFs 브리지에 getDoc 추가됨(2026-07).
  - **chatAllowed 옵트인 게이트 (2026-07, 사용자 확정 — "글쓰기 때 허용 선택 + 옛 글 버튼 전부 제거"):** 상세 채팅 버튼은 `post.chatAllowed === true` 일 때만 렌더 — **필드 없는 글(채팅 기능 이전 글·업체·레거시·restaurants/car-sale) = 전부 자동 미노출**(데이터 마이그레이션 불필요). 글쓰기 폼 8곳에 "🗨️ 채팅 문의 허용" 체크박스(**기본 ON**, 해제 시 `false` 명시 저장): accom/rent/jobs/auto/trades `#wChatAllowed` · points `#vwChatAllowed` · salon/gp `#rqChatAllowed`. 수정 프리필은 `p.chatAllowed === true`(옛 글 = 해제 표시 → 작성자가 수정에서 체크 후 저장하면 옵트인 — update 규칙은 hasOnly 미적용이라 통과). rules: 검증기 3개(validShareRentCreate/validJobsCreate/validAutoCreate)에 `pOptBool(d,'chatAllowed')` + hasOnly 반영, services 보드는 hasOnly 백로그라 rules 무변경. 새 보드에 채팅 버튼을 붙일 땐 이 체크박스+payload+검증기 hasOnly 3종 세트를 같이 넣을 것.
  - **별명 정책(사용자 확정 — "별명 변경해도 기록 유지"):** chats doc 은 개설 시점 닉 **스냅샷**(ownerNick/inquirerNick), 현재 별명·사진은 `profiles/{uid}` 공개 카드를 chat.html 이 lazy 참조(LS `koaus-profiles-cache` 6h TTL·60개 캡). profiles rules: get 로그인만/list 금지/본인 쓰기, nickname≤30·photoURL **https 만**≤500·updatedAt==request.time·hasOnly 3필드. settings.html `syncProfileCard()` 가 닉 저장·사진 업로드·onAuth 3곳에서 동기화 — LS `koaus-profile-synced` sig 로 동일값 재쓰기 0, **photoURL 빈 문자열은 rules 거부라 https 일 때만 필드 포함**(이 가드 유지).
  - **차단/신고:** 차단 = `blockedBy` — **본인만 증감**(diff removeAll().hasOnly([본인uid]) 양방향 가드). 차단 중 메시지·요약 update 거부(동결), 읽음 처리(unreadFor)·차단 해제는 허용(배지 잔류 방지). 신고 = `koaus-report.js` 재사용(board:'chat', postId=chatId — 인라인 addDoc 재작성 금지).
  - **안읽음 배지:** `unreadFor ⊆ participants` (**hasAll 가드 절대 제거 금지** — chats list 규칙의 `uid in unreadFor` disjunct(배지 쿼리 provability 용)가 이 불변식 위에서만 정보누출 없이 안전). 배지 쿼리 = `where('unreadFor','array-contains',uid)+limit(1)`(자동 인덱스, 호출당 ≤1 read). `koaus-tabbar.js` 가 LS `koaus-chat-unread`({n,at}) 즉시 표시(`.kt-chat-dot`) + 60s LS 스로틀·90s 폴링 — **페이지 모듈이 브리지한 koausDb/koausFs 있을 때만 쿼리**(App Check 없는 페이지에서 SDK 자체 로드 금지), 실패 전부 silent.
  - **빌링 캡(완화 금지):** chats list ≤20 · messages list ≤50 (rules 강제 — 초과 구독은 전체 거부). 전송 = writeBatch(메시지 set + 부모 요약 update) 원자 처리, 부모 update 는 affectedKeys hasOnly(['lastMsg','lastMsgAt','lastSenderUid','unreadFor','blockedBy']) — postTitle/닉 스냅샷은 개설 후 불변. chat.html 은 히어로·마퀴 미탑재(운영 페이지), App Check 자체 init 15페이지에 포함.
- **신고(reports):** 접수 진입점은 `koaus-report.js` 단일 (capture-phase 가 `.mini-report`/`.rea-report`/`#detailReportBtn` 전부 가로챔). 페이지 인라인 `addDoc(reports)` 핸들러를 다시 만들지 말 것 — 2026-06 dead code 14곳 제거됨. 문서 ID 는 `{postId}_{reporterUid}` 고정 (rules 가 ID 패턴 검증 → 중복 신고는 update 취급되어 permission-denied = 클라가 "이미 신고" 안내). admin 신고 큐 구독은 `limit(100)` — rules `limitedList ≤100` 초과 시 구독 전체가 거부된다(F-G 회귀).
- **제재(정지/블라인드):** 계정 정지는 admin.html → callable `suspendUser`/`unsuspendUser` 만 사용 (클라에서 `users/{uid}.status` 직접 쓰기 금지 — rules 가 본인 status 변조도 차단). admin 블라인드는 `hiddenBy:'admin'` 기록 → 작성자가 status/isHidden 으로 자가 해제 불가(`adminBlindLock()`). `koaus-rbac.js toggleHidden` 의 isAdmin 분기(작성자 patch 에 hiddenBy 미포함)를 깨뜨리지 말 것.
- **매물 위치 프라이버시 (accom/rent — 도로명 절대 비노출):** 핵심 규칙은 **"공개 필드 `address` 에는 절대 도로명·번지가 들어가면 안 된다"** — 비공개 매물의 공개 doc 에는 `동네(suburb) + 주(state) [+ 우편번호]` 만. 정확 주소/좌표는 **작성자 본인 기기 localStorage(부모 doc) + `private_data/location` 서브컬렉션**(firestore.rules: 본인+admin 만 read)에만 존재. 단일 헬퍼 `public/koaus-listing-privacy.js`(`window.koausListingPrivacy`) 가 전담:
  - **`PRIVATE_FIELDS = ['exactAddress','exactLat','exactLng']`** + `stripPrivateFields(payload)` — Firestore 공개 doc 저장(addDoc/updateDoc) **직전 의무 호출**. 이 함수가 exact* 를 떨궈 누수 차단. `private_data` 저장(`savePrivateLocation`)에는 **적용 금지**(그곳엔 exact* 필요).
  - **`redactAddress(addr)` → "Suburb STATE [Postcode]"** — 쓰기(작성/수정)에서 `fields.address = redactAddress(addr) || addr`, 상세 표시(`detailAddrText`/`addrText`)·길찾기 URL(`detailAddr`)에서도 동일 호출(옛 글 안전망). ⚠️ **절대 도로명을 반환하지 않게 유지** — 구버전은 **번지 없는 도로명("Pitt Street, Sydney NSW")·콤마 없는 주소·우편번호 없는 주소**에서 전체 문자열을 그대로 반환해 비공개 상세에 도로명이 새는 회귀가 있었음(2026-06 수정: 주(state) 토큰 가진 콤마 조각만 취하고 도로타입 이후만 남김, 실패 시 `'위치 비공개'` 반환). 변경 시 `node` 로 `redactAddress` 단위 테스트(번지유무·콤마유무·우편번호유무 조합)에서 **도로명 누출 0건** 확인 필수.
  - **`offsetCoords(lat,lng)`** 300~500m 랜덤 오프셋 — 공개 doc 의 `lat/lng` 는 이 오프셋 좌표. 상세 지도는 마커 대신 `drawPrivacyCircle`(400m), 길찾기/스트릿뷰 버튼 숨김, zoom 13.
  - **상세 페이지에 정확 위치 인라인 노출(옛 "🔓 정확 위치 (본인/관리자 전용)" 블록)은 폐지** — 작성자도 상세가 아니라 글 **'수정' 폼**에서만 정확 주소 확인. `setupDetailLocation` 에 `isOwnerOrAdmin` 분기/`fetchPrivateLocation` 인라인 reveal 을 **다시 넣지 말 것**(2026-06 제거).
  - **쓰기 분기:** 글쓰기 모달의 `wLocationPrivate` 체크박스(기본 ON) → `locationPrivate:true` + 위 처리. rules 의 게시판 검증기 `hasOnly` 화이트리스트에 `locationPrivate`(pOptBool) 포함되어 있어야 create 통과(누락 시 permission-denied).
- **지도/필터 UI 추가 시:** `.claude/agents/agent.md` §2-B (Map + Filter UX Standard) 강제. 신규 페이지에 Map View 가 들어가면 **공용 헬퍼 `window.koausMapCluster.attachMarkers()` 호출 1세트** 로 마커 생성 (자체 `forEach + new google.maps.Marker` 금지). 리스트 필터가 같이 있다면 `applyFilters` 안 `areaBounds AND` 분기 항상 포함, `runSearch` 의 region-없음 else 분기에서 `areaBounds = null` 금지.
- **외부 API 변경 시:** `.claude/agents/agent.md` §3-A (External API Standard) 강제. 도메인/키 변경 시 Google Cloud Console (Maps/Places key restrictions) + reCAPTCHA Admin (v2/v3 키 각각의 Allowed Domains) + Firebase Auth Authorized Domains **3개 콘솔을 한 세트** 로 점검.
- **신규 글쓰기 폼 추가 시:** `.claude/agents/agent.md` §2-C (Write-Form Mandatory Consent) 강제. 제출 버튼 위에 표준 `id="writeConsent"` 체크박스 + 라벨(`[필수] 이용약관 및 주의사항을 확인하였으며, 서비스 규정 위반 시 게시물 삭제 및 계정 제재가 이루어질 수 있음에 동의합니다.`) 필수. submit 핸들러 최상단에 표준 검증 블록(`if (!_consent.checked) { alert(...); focus + scrollIntoView; return; }`) 강제.
- **신규 상세 페이지 추가 시:** `.claude/agents/agent.md` §2-D (Detail Page Standard) 강제. 용어 단수 "Map View" (Maps View 금지). 위치 정보 있는 섹션은 **사진 / Map View / 길찾기(`detailDirBtn`) / 스트릿뷰(`detailSvBtn`) 4요소 의무**. 공용 `setupDetailLocation(p)` 함수 그대로 이식(자체 inline 지도 init 금지).
- **신규 카드/리스트 권한 액션 UI 추가 시:** `.claude/agents/agent.md` §2-E (RBAC UI Standard) 강제. **3단계 권한 분리 뷰 의무**: 일반(공유만) / 작성자(수정·삭제·공유·마감) / 운영자(블라인드·강제 수정·강제 삭제·공유). 권한 검사는 `window.koausRbac` (canEdit/canDelete/canHide/canMarkCompleted) 단일 헬퍼만 사용 — 페이지마다 자체 분기 작성 금지. 모바일(`@media max-width:640px`) 별표 vs 액션바 좌표 분리(`bookmark-btn` 우상단 / `koaus-admin-toolbar` 좌상단) + `flex-wrap` 4버튼 줄넘김 대응 + `data-status="completed/closed/hidden"` 시각 차이 표준 적용 의무.
- **상단 컴포넌트 배치 규격 (전 페이지 공통, 모바일·데스크탑 동일):** 신규/기존 페이지의 `<main class="page-container">` 본문 최상단은 반드시 다음 순서로만 마크업하라. ① `<section class="koaus-hero" data-koaus-hero-cat="<id>">` (히어로 배너 — 게시판/메인 진입 페이지) → ② `<section class="notice-section">` (마퀴 공지 바 — `marquee.js` 가 hydrate, **닫기(X) 버튼 절대 포함 금지** · 이전/다음 ‹ › 화살표만 허용) → ③ `<div class="page-header"><h1 class="page-title">...</h1></div>` (페이지 대제목). **히어로 규격(2026-06 확정, 2026-07 edge-to-edge):** 전 페이지 **풀 히어로(`koaus-hero`, 18:7, max-width 1040px 단일 캐논 폭)** 로 통일. 예외는 **광고 배제 페이지(`contact`)·스텁(`exchange`) 만 ①(히어로) 생략**, **계정 3페이지(`mypage`/`settings`/`security`)·채팅(`chat`)은 ①②(히어로+마퀴) 모두 생략** — 운영 페이지·광고 배제, 2026-07 사용자 확정. mypage 에 히어로/마퀴/hero-banner.js/marquee.js 를 다시 넣지 말 것. `koaus-hero--strip`/`data-koaus-hero-variant="strip"` **변형은 폐기**(state/care/calculator/powerball 전부 full 승격 — strip 사용 페이지 0). strip CSS 잔재는 안정화 후 후속 정리. **여백 규격(2026-07):** 데스크탑 `padding:0`(1040px 캐논 풀폭), `≤1099px` 풀블리드(`width:100vw + margin-left/right: calc(50% - 50vw)`, `padding:0`, swiper `border-radius:0`). ⚠️ `≤767px` 블록에서 **`margin` 쇼트핸드·`max-width:100%` 금지** — ≤1099 풀블리드의 margin-left/right·width 를 되돌려 폰에서 좌우 여백이 부활하는 회귀(2026-07 수정: longhand `margin-top/bottom` 만 사용). 비율 18:7 은 불변. ②③ 순서는 절대 깨뜨리지 말 것. 옛 `.ticker-dismiss` 마크업이 발견되면 즉시 제거하며, `marquee.js` 가 자동으로 잔재를 정리한다.
