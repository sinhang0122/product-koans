# KoAus 콘솔 작업 체크리스트 (K1~K6)

> 출시 전 직접 처리해야 하는 콘솔 작업 목록.
> 원본은 2026-06 보안 감사 보고(대화 내 보고, 파일 미저장)이며, 본 문서는 CLAUDE.md(§3-A 외부 API 표준)와 감사 내역 기준 **재구성본**.
> 프로젝트: `koaus-f564c` · 운영 도메인: `koaus.com.au`

---

## K1. App Check Enforce 활성화

- **콘솔:** Firebase Console → 프로젝트 `koaus-f564c` → 빌드 > **App Check**
- **메뉴:** APIs 탭 → Cloud Firestore / Cloud Storage 각각
- **확인·설정:**
  - [ ] 현재 상태가 "모니터링(Unenforced)"인지 "적용(Enforced)"인지 확인
  - [ ] 지표에서 **검증된 요청 비율이 ~100%인지 먼저 확인** 후 Enforce 전환 (미검증 트래픽이 남아 있는데 켜면 정상 사용자도 차단됨)
  - [ ] reCAPTCHA v3 provider 키가 `6Ld1mAwt...`로 등록돼 있는지 확인
  - ⚠️ App Check init 블록은 `app.js` + 10개 페이지(accom/admin/auto/gp/jobs/mypage/rent/restaurants/salon/trades)에 복제돼 있음 — Enforce 전 전 페이지에서 Firestore 호출 정상 확인

## K2. Auth Authorized Domains 정리

- **콘솔:** Firebase Console → Authentication → **Settings → Authorized domains**
- **확인·설정:**
  - [ ] `koaus.com.au` (운영 도메인) 존재 확인
  - [ ] `koaus-f564c.web.app` / `koaus-f564c.firebaseapp.com` — firebaseapp.com은 auth 리디렉션에 필요하므로 유지
  - [ ] `localhost` 등 개발용·불필요 도메인은 출시 시점에 제거 검토
  - ⚠️ Phone Auth(SMS)와 Google 팝업 로그인이 이 목록에 의존 — 제거 후 즉시 로그인 테스트

## K3. Maps/Places API 키 referrer 제한

- **콘솔:** Google Cloud Console → APIs & Services → **Credentials**
- **확인·설정:**
  - [ ] Maps JavaScript API / Places API에 쓰는 브라우저 키 선택
  - [ ] Application restrictions → **HTTP referrers**: `koaus.com.au/*`, `*.koaus.com.au/*`, (필요시 `koaus-f564c.web.app/*`)
  - [ ] API restrictions → 사용하는 API(Maps JavaScript, Places, Geocoding 등)만 허용
  - [ ] 제한 적용 후 지도 페이지(accom/rent/jobs 등 Map View)에서 지도·마커 로딩 확인

## K4. reCAPTCHA 키 도메인 제한 (v2/v3 각각)

- **콘솔:** reCAPTCHA Admin Console (https://www.google.com/recaptcha/admin)
- **확인·설정:**
  - [ ] **v3 키 `6Ld1mAwt...`** (App Check용): Allowed Domains에 `koaus.com.au` + Firebase 호스팅 도메인만
  - [ ] **v2 키 `6LcUgAIt...`** (가입 시 visible 체크박스, 12개 페이지): 동일하게 도메인 제한
  - [ ] "모든 도메인에서 허용" 옵션이 꺼져 있는지 확인
  - [ ] 변경 후 가입 모달의 체크박스 + App Check 토큰 발급(`contact.html` Formspree 포함) 정상 확인

## K5. Firestore 백업

- **콘솔:** Google Cloud Console → **Firestore → 재해 복구(Disaster Recovery)** (또는 gcloud)
- **확인·설정:**
  - [ ] **예약 백업(Scheduled Backups)**: 일일 백업 + 보존 기간(예: 7일)
    ```
    gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=7d
    ```
  - [ ] **PITR(Point-in-Time Recovery)** 활성화 검토 (7일간 분 단위 복구, 추가 스토리지 비용)
  - ⚠️ 백엔드 서버가 없어 클라이언트 오조작·rules 실수 시 백업이 유일한 복구 수단

## K6. Storage Lifecycle 규칙

- **콘솔:** Google Cloud Console → **Cloud Storage → 버킷** `koaus-f564c.firebasestorage.app` → Lifecycle 탭
- **확인·설정:**
  - [ ] 미완료 멀티파트 업로드 자동 삭제 규칙 (예: 7일 경과 시)
  - [ ] 고아 이미지(게시글 삭제 후 남은 파일) 정리 정책 검토 — 클라이언트 압축(`compress.js`)으로 용량은 방어 중이나 누적 삭제 자동화는 없음
  - [ ] 비용 절감용 스토리지 클래스 전환 규칙(예: 90일 후 Nearline)은 선택 사항

---

**처리 권장 순서:** K2~K4는 CLAUDE.md §3-A "3개 콘솔 한 세트" 원칙(Google Cloud Maps 키 + reCAPTCHA Admin + Firebase Auth Domains)에 해당하므로 같은 날 묶어서 처리. K1은 지표 100% 확인 후 마지막에. K5/K6은 독립적으로 언제든 가능.

> ✅ **2026-06-10: K1~K6 전체 완료** (Firestore/Storage App Check는 이미 Enforced 상태였음 — 사용자 확인)

---

# 후속 과제 (F1~F2) — 2026-06-10 등록

## F1. 로그인 경로 App Check 토큰 전수 점검 + Auth 미검증 31% 원인 분석

- **배경:** Firebase Console → App Check 지표에서 **Authentication 요청의 31%가 미검증(unverified)** 으로 관측됨.
- **할 일:**
  - [ ] 모든 로그인/가입 경로(이메일+비번, Google 팝업, Phone Auth SMS, 비번 재설정 메일)가 App Check 토큰을 첨부하는지 코드 전수 확인 — App Check init(`initializeAppCheck`)이 **Auth 호출보다 먼저** 실행되는지 페이지별 순서 점검 (`app.js` + 자체 init 10개 페이지)
  - [ ] 미검증 31%의 출처 분류: ①init race(토큰 발급 전 Auth 호출) ②init 블록 없는 페이지에서의 Auth 사용 ③구버전 캐시 클라이언트 ④봇
  - [ ] 원인 확정 후 Auth에 대한 App Check Enforce 가능 여부 판단 (성급한 Enforce는 정상 로그인 차단 위험)

## F2. 글 삭제 시 Storage 고아 이미지 정리

- **배경:** 게시글 삭제 시 Storage 이미지 클린업은 도입됐으나(매물 삭제 5종 패치), **과거 삭제분의 잔존 고아 이미지** + 클린업 실패(silent catch) 경로가 남음. K6 Lifecycle은 시간 기반이라 무참조 여부를 모름.
- **할 일:**
  - [ ] 전 게시판 삭제 경로(accom/rent/jobs/auto + admin 강제 삭제)가 Storage 이미지 삭제를 수행하는지 전수 확인
  - [ ] 잔존 고아 이미지 1회성 정리 방안 설계: Admin SDK 스크립트로 Storage 전체 목록 ↔ Firestore imageUrls 대조 → 무참조 객체 삭제 (dry-run 목록 보고 → 승인 → 삭제)
  - [ ] `deletion_errors` 로그 컬렉션 활용해 클린업 실패 건 재처리 흐름 검토
