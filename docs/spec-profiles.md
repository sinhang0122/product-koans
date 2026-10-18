# KoAus 프로필 설계서 (2단계) — 2026-10-11 초안

> 결정 기록: `docs/plan-2026-10.md` §3. 이 문서는 구현 직전의 상세 스펙. 바뀌면 여기부터 고친다.
> 원칙: 한 번 저장되기 시작한 필드·enum·rules 는 바꾸기 어렵다 → **enum 은 한 파일(`public/koaus-enums.js`)에서만 정의**하고 글쓰기 폼·프로필·추천이 전부 그 파일을 쓴다.

## 0. 확정 사항 (사용자)
- 프로필 작성·수정·공개 토글·상태 변경은 **마이페이지 '내 프로필' 탭에서만**. 보드에는 "프로필 만들기 →" 링크만.
- 상태: `구하는 중 / 구했어요` 토글 + **30일 무활동 자동 일시정지**(비공개 전환 + "아직 구하시나요?" 메일 1통, 누르면 재개).
- Work 방향: **사장님은 글 올리고 연락만 받는다. 대신 사장님(사업체) 프로필은 공개**되어 구직자에게 추천·알림으로 간다. 구직자 프로필은 비공개(조건 전용).
- Living 방향: 쌍방. 집 구하는 사람 프로필은 **근처 집주인에게만** 카드로 보이고, 집주인은 채팅으로 먼저 연락.
- 이름은 성 제외, 연락처·이메일·생년월일·여권/비자번호·TFN·도로명은 어디에도 없음. 문구는 "~다/~까".

## 1. 프로필 종류 3개

| 종류 | 누가 | 공개 범위 | 쓰임 |
|---|---|---|---|
| ① 집 구해요 (Living seeker) | 집 구하는 사람 | **공개 카드**는 로그인+휴대폰 인증 사용자 중 **방 글을 올린 사람이 "근처 구하는 사람 보기"로 볼 때만**. 조건·알림 설정은 비공개 | 집주인→채팅 연락, 새 방 추천·알림 |
| ② 사업체 (Work employer) | 직원 구하는 사람 | **공개** — 구인 글에 카드로 붙고, 구직자 추천·알림에 사업체명으로 노출 | 신뢰(ABN 확인 라벨), 구직자에게 "어떤 곳인지" |
| ③ 일 구해요 조건 (Work seeker) | 일 구하는 사람 | **비공개** — 본인만 | 일자리 추천·알림 |

집 있는 사람(세입자 구해요)은 별도 프로필 없음 — 기존 공개 카드(`profiles/{uid}` 닉네임·사진)와 글로 충분.

## 2. ① 집 구해요 프로필 — 단계·필드

작성은 한 화면에 질문 하나, 단계마다 자동 저장(중간 이탈해도 조건은 남아 알림에 쓰임). 라벨 옆 "(필수)/(선택)" 일반 글씨.

| 단계 | 질문 | 키 | 입력 | 값 | 필수 | 공개 카드 | 매칭 |
|---|---|---|---|---|---|---|---|
| 1 | 어디서 구하세요? | `suburbs[]` | 동네 검색(Places, suburb 단위) 최대 3개 | `{name, state, postcode, lat, lng}` | 필수(1개 이상) | 동네명·주만 | 반경 5km |
| 2 | 주당 예산 | `budgetMin`, `budgetMax` | 범위 슬라이더/입력 ($50 단위) | 정수(주당 AUD) | 필수 | 공개 | 가격 겹침 |
| 3 | 언제부터, 얼마나 | `moveInDate`, `stay` | 날짜 + 칩 | `stay: short(3개월 미만) / long` | 필수 | 공개 | 입주일 ±2주, 최소 거주 |
| 4 | 방 조건 | `roomTypes[]`, `bathroom`, `furnished` | 칩(복수) / 칩 / 칩 | `roomTypes: master/single/double/shared2/living` · `bathroom: any/private` · `furnished: any/required` | 선택 | 공개 | 일치 시 가점 |
| 5 | 나에 대해 | `firstName`, `ageBand`, `gender`, `status`, `smoker`, `pet` | 입력/칩 | `ageBand: 20e/20m/20l/30e/30l/40p` · `gender: f/m/none` · `status: whv/student/worker/pr/other` · `smoker: bool` · `pet: bool` | firstName 필수, 나머지 선택 | 공개 | gender→여성 전용, smoker/pet→집 조건 |
| 6 | 자기소개 | `intro` | 300자 | 문자열(연락처·카톡ID 패턴 자동 차단) | 선택 | 공개 | — |
| 7 | 사진 | `photoURL` | 업로드(compress.js) | https | 선택(기본 켜짐) | 공개 | — |
| 8 | 공개·알림 | `visible`, `alerts` | 토글/칩 | `visible: bool` · `alerts: {enabled, mode: instant/threshold5/daily/off, email}` | — | visible 만 | — |

- 공개 카드에 보이는 것: 닉네임·이름(성 제외)·사진·나이대·성별·신분·흡연/반려동물·희망 동네(동네명)·예산·입주일·거주 기간·방 조건·자기소개·"약 N km"·마지막 활동("3일 전").
- 보이지 않는 것: 이메일·알림 설정·정확 좌표(동네 중심점만, 그것도 카드엔 거리로만).
- 상태: `status: looking/found`, `lastActiveAt`(로그인·프로필 열람 시 갱신). 30일 무활동 → `visible=false, pausedAt` (함수) + 메일(엔진 생기면). 마이페이지 진입 시 "일시정지됨 — 다시 켜기" 배너.

## 3. 집주인 → "근처 구하는 사람 보기"

- 진입: 내 방 글(accom/rent) 상세·작성 완료 화면의 버튼. 글이 없으면 버튼 없음(= 글 올린 사람만).
- 조회: `seeker_profiles` `where('states','array-contains', 글의 state) + where('visible','==',true) + orderBy('lastActiveAt','desc') + limit(20)` → 클라가 글 좌표(오프셋) 기준 **희망 동네 중 하나라도 반경 내**(기본 10km, 5/10/20/50 슬라이더)인 프로필만 표시, "약 N km". 복합 인덱스 1개 필요(states + visible + lastActiveAt).
- 칩 필터: 예산 겹침(내 방 가격이 범위 안) · 입주일 창 · 성별(내 글이 여성 전용일 때만) · 흡연/반려동물.
- 연락: 카드의 "채팅으로 연락" → 기존 chats 규칙 그대로. `chatId = {seekerUid}_{landlordUid}`, `postId = seekerUid`, `board = 'seeker'`, `ownerUid = seekerUid`(프로필 주인), `inquirerUid = landlordUid`. 프로필에 `chatAllowed` 개념은 없음(공개 = 연락 허용).
- 빈 결과 문구: 목록 끝 "더 이상 표시할 프로필이 없습니다. 범위를 늘리시겠습니까?" → "범위 늘리기".

## 4. ② 사업체 프로필 (공개)

| 키 | 입력 | 필수 | 비고 |
|---|---|---|---|
| `name` | 상호(지점명 포함, 60자) | 필수 | "하나로마트 써니뱅크점" |
| `industry` | 업종 칩(단일) | 필수 | enum 공유(§7) |
| `suburb`, `state` | 동네 검색 | 필수 | 동네·주만 공개 |
| `intro` | 소개 300자 | 선택 | 연락처 패턴 차단 |
| `logoURL` | 이미지 | 선택 | |
| `abn`, `abnName`, `abnState`, `abnVerifiedAt` | **함수(`verifyAbn`)만 기록** | 선택 | 클라이언트 쓰기 금지. 라벨 "ABN 확인됨 · 상호"(정부 ABN Lookup 링크) |
| `hiring` | 자동 | — | 활성 구인 글 수(표시용) |

- 노출: 구인 글 상세 상단 카드, 구직자 추천 목록("사업체명 · 업종 · 동네"), 알림 메일.
- 한 계정 = 사업체 프로필 1개. 한 ABN 에 계정 여러 개 허용(지점).

## 5. ③ 일 구해요 조건 (비공개)

| 단계 | 키 | 값 | 필수 |
|---|---|---|---|
| 1 | `regions[]` | `{state, city}` 최대 3개 — 도시 목록은 §7 | 필수 |
| 2 | `industries[]`, `empTypes[]` | 업종 복수, `fulltime/parttime/casual/contract` | 업종 필수 |
| 3 | `days[]`, `hours[]`, `startDate`, `availableFor` | 요일 칩, `morning/afternoon/evening/night`, 날짜, `6m+/1y+/any` | 시작일 필수 |
| 4 | `visa`, `secondVisaNeeded` | `whv1/whv2/whv3/student/pr/citizen/other`, bool | 선택 |
| 5 | `intro` | 300자 | 선택 |
| 6 | `alerts` | ①과 동일 구조 | — |

경력·언어·희망 시급은 **받지 않음**(사장님 열람을 여는 날 추가). 저장 위치 `users/{uid}.work`(본인만 읽기).

## 6. 데이터 모델·규칙

- `seeker_profiles/{uid}` — ①의 **공개 필드만**. `get/list`: `isVerifiedUser()`(로그인+휴대폰) · list ≤20 · `visible==true` 조건 강제. `create/update`: 본인, hasOnly, 길이·enum 검증(별도 검증기 `validSeekerProfile()` — 기존 검증기에 합치지 말 것, 1,000 표현식 한도). `delete`: 본인·admin.
- `users/{uid}.living` — ①의 비공개(alerts, suburbs 좌표 원본). `users/{uid}.work` — ③ 전체. 기존 users 규칙(본인만) 그대로, hasOnly 에 키 추가.
- `business_profiles/{uid}` — ② 공개. `get`: 누구나(글 상세에 붙음). `list`: ≤20. `create/update`: 본인, hasOnly, **abn* 4개 키는 클라 쓰기 거부**(함수 전용). 
- 글 ↔ 프로필 연결: 구인 글에 `businessUid`(작성자 uid) 자동 저장 → 상세에서 `business_profiles/{businessUid}` get 1회.
- 인덱스: `seeker_profiles(states ARRAY, visible ASC, lastActiveAt DESC)`. `firestore:indexes` 별도 배포 필수.
- 빌링: 집주인 조회 1회 = ≤20 read. 추천 탭은 기존 보드 쿼리 재사용(새 쿼리 없음) + 클라 매칭.

## 7. 공유 enum (`public/koaus-enums.js`, 새 파일)
- 주/도시: `qld: 브리즈번·골드코스트·선샤인코스트·케언즈·기타` · `nsw: 시드니·뉴캐슬·기타` · `vic: 멜번·기타` · `wa: 퍼스` · `sa: 애들레이드` · `tas: 호바트` · `act: 캔버라` · `nt: 다윈` (**사용자 확정 필요**)
- 업종(구인·구직·사업체 공통): `food(식당·카페) · factory(공장·농장) · clean(청소·건설) · office(사무·서비스) · beauty(뷰티) · drive(운전·배달) · retail(마트·판매) · other` (**사용자 확정 필요**)
- 방 종류: `master · single · double · shared2(2인 1실) · living(거실)` — 글쓰기 폼(2단계 폼 개편)도 같은 값.
- 나이대: `20e(20대 초반) · 20m · 20l · 30e · 30l · 40p` (**확정 필요**)
- 신분: `whv · student · worker · pr · other`
- 비자(일 구해요): `whv1 · whv2 · whv3 · student · pr · citizen · other`

## 8. 마이페이지 '내 프로필' 탭
카드 3장(집 구해요 / 일 구해요 / 사업체) — 각각 "만들기" 또는 "상태 칩(구하는 중·일시정지·구했어요) + 수정 + 공개 토글". 작성 모달은 단계별, 뒤로가기 가능, 단계별 저장. 완료 화면에 "조건 맞는 방 N건 지금 보기"(Living) / "지금 올라온 일자리 보기"(Work).

## 9. 작업량(실제 되는 선)
enum 파일 0.5일 → ① 프로필 모달+마이페이지 탭+rules/테스트 2일 → 집주인 '근처 구하는 사람' 화면+거리 1.5일 → ② 사업체 프로필+글 카드(ABN 함수는 3단계와 묶음) 1.5일 → ③ 일 구해요 조건 1일 → 추천 탭 1일 → 30일 일시정지 함수 0.5일(메일은 엔진 뒤). 합계 약 8일. 배포는 매 묶음마다 rules → indexes → hosting.

## 10. 미결
- ① 공개 카드의 사진·성별 기본값(제안: 사진 선택·기본 켜짐, 성별 선택)
- §7 enum 목록 확정(도시·업종·나이대)
- 희망 동네 입력: Places 자동완성(suburb 제한) 비용 — 세션당 몇 건이라 무시 가능 수준이나 확인

## 11. 구현 메모 — ① 집 구해요 1차 구현 (2026-10-11, 설계서와 다른 점)
- **사진 없음(사용자 확정)**: "얼굴이 선택에 영향을 주면 안 된다" → photoURL 필드 자체가 없음(rules hasOnly 에서 거부). 카드 아바타 = 이름 첫 글자. 단계는 8 → **7단계**.
- **성별**: 선택 입력, 여성 전용 방(글 gender==='female') 집주인 화면에서만 필터. 빼고 싶으면 enum·rules·모달 칩 3곳.
- **필드명**: 신분은 `residency`(whv/student/worker/pr/other) — `status` 는 구하는 상태(looking/found)에 씀. 방 종류·성별·거주 기간 코드는 accom 글쓰기 폼 기존 값과 동일(`master/second/single/living_share/sunroom`, `female/male`, `ultra_short/short/mid/long`).
- **단계별 저장**: rules 가 firstName·suburbs 를 필수로 요구하므로 Firestore 쓰기는 마지막 단계 1회. 중간 이탈은 **기기 로컬 임시저장**(`koaus-seeker-draft-v1`, uid 일치 시 복원). 수정 모드는 임시저장 안 함.
- **동네 입력**: Maps JS 미로드 — Geocoding REST(동네 단위, `components=country:AU`)로 locality·state·postcode·중심 좌표만 저장. 최대 3곳.
- **lastActiveAt**: 모든 본인 쓰기에 serverTimestamp(rules 강제) + 마이페이지 '내 프로필' 탭 진입 시 하루 1회 갱신. 30일 일시정지 함수는 미구현(후속) — `pausedAt` 은 함수만 세팅, 본인은 deleteField(다시 켜기)만.
- **집주인 화면**: 별도 페이지 대신 accom/rent 본인 글 상세의 "근처에서 구하는 사람 보기" 버튼 → `koaus-seekers-nearby.js` 모달. 반경 5/10/20/50(기본 10), '예산 맞음' 토글, 여성 전용 자동 필터. 글에 좌표가 없으면 주 전체.
- **채팅 연결**: chats create 규칙 무변경 — `chatId={seekerUid}_{집주인uid}`, `postId=seekerUid`, `board='seeker'`, `postTitle='집 구해요 · 이름'`. lastMsgAt 은 넣지 않음(첫 메시지 전까지 상대 목록에 빈 방이 안 뜨는 게 의도).
- **진입점**: accom/rent 컨트롤과 목록 사이 "집을 구하십니까? … 내 조건 등록 ›" → `mypage.html?tab=profile&profile=new`(로그인 확정 후 작성 모달 자동).
- **파일**: `public/koaus-enums.js`(공유 enum) · `public/koaus-seeker-profile.js`(마이페이지 탭·모달) · `public/koaus-seekers-nearby.js`(집주인 모달) · mypage/accom/rent 스크립트 태그·버튼 · `firestore.rules` seeker_profiles · `firestore.indexes.json` 1건 · `rules-test.js` 24건.
- **미구현(후속)**: 30일 일시정지 함수, 새 매물 이메일 알림 엔진(4단계), 추천 탭, ② 사업체 · ③ 일 구해요.

## 12. 10-18 변경 메모 (①)
- 실명 없음: `firstName` 폐기 → `nick`(사이트 닉네임 스냅샷, LS koaus-nickname → users.nickname). 카드 아바타 = 닉네임 첫 글자.
- 공개/비공개 분리: `seeker_profiles`(공개: nick·gender·ageBand·suburbs·states·budget·moveIn·stay·roomTypes·bathroom·visible·status·step·시각) / `seeker_private`(본인만: residency·smoker·pet·intro·alerts). 저장은 writeBatch. 옛 문서는 migrateLegacy() 자동 이전.
- 역할: users.roles{living,job} + koaus-role.js. 짧은 등록 openQuick(3단계·건너뛰기). 탭바 '프로필' = mypage?tab=people(koaus-seekers-nearby mountPage).
- 숫자 표시(동네 N명·회원 N명) 안 함. 구한 사람은 '구했습니다'로 비공개(목록에서 빠짐).
- 미구현: 알림 메일 함수(③ Resend), Job 일 구해요 프로필(②), 채팅에서 비공개 소개글 보내기.
