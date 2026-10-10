# Handoff — 이전 Cowork 세션 "Kouas.com.au site review" (2026-07-11 ~ 2026-09-24, Fable 5)

> 2026-10-10 export(`docs/old-sessions/`, gitignore)에서 추출한 요약. 새 세션·Claude Code가 "어떻게 일해 왔는지"를 알기 위한 문서.
> 원문 대화는 `docs/old-sessions/site-review-2026-10-10/condensed.md`(로컬 전용).

## 당시 작업 방식 (사용자가 명시한 규칙)
- Cowork 세션은 **진단만** — 코드·오류를 찾고, 실제 수정은 Claude Code에서. 프롬프트는 항상 **코드 블록**으로 전달.
- 흐름 고정: Claude Code 구현 → Cowork 검증 → 사용자가 Claude Code에서 수정 → Cowork 재확인 → **그 뒤에만 배포 명령**.
- Claude Code 모델: 잘 정의된 대형 실행 작업은 **Fable 5-high**, firestore.rules 검증기·테스트 구간에서 반복 실패 시에만 **Opus 4.8 max** 로 격상.
- Cloud Functions **최소화 정책**(제재 callable 2종 + 번호 해제 1종만) — 함수가 필요한 기능(푸시·자동 알림)은 2단계로 미룸.
- `npm run test:rules` 는 firebase login 이 필요해 Cowork 샌드박스에선 불가 → **사용자 Mac에서 실행**.
- 2026-10 변경: 수정도 Cowork에서 직접 하고(삭제 없이 숨김 원칙), 커밋·푸시·배포만 Claude Code. → `docs/plan-2026-10.md`.

## 7월 (일상 PR 보드 개편) — 전부 구현·반영됨, 세부는 CLAUDE.md
- trades.html → `daily_posts` 자기 PR 보드(food/beauty/tech). 선교사 사이트 프로토타입의 **구조·애니메이션만** 차용(내용 X).
- 프로필 사진은 선택 업로드 + 카톡식 실루엣 폴백, `avatarHidden` 로 완전 숨김 가능.
- 연락 프리필: 모든 보드에서 `[KoAus] + 상세 고유링크 + "(성함과 문의 내용을 입력해 주세요)"`. 카톡은 open.kakao.com 화이트리스트, 전화는 숫자만.
- 자기소개서 Living/Work 분리 — Living 은 accom/rent 문의에만, Work 는 jobs 문의에만. **절대 교차 적용 금지**.
- 커버 사진 크롭 금지(세로=좌우 여백, 가로=상하 여백, 정사각=풀블리드), 캐러셀 ≤10, PR 목록 선착순(오래된 글이 1페이지 1번), 딥링크 getDoc 폴백.

## 9월 24일 — 사이트 감사(Flatmates 써보고 "불필요한 게 많다")
- **진입점 0 유령 페이지 6**: gp, salon, emergency(care 와 중복), car-sale(auto 중복), exchange(calculator 중복), state(홈 JS 카드로만). 반유령: points(히어로 문구 1곳), restaurants(others-nav 2곳).
- **글쓰기 폼 비대**가 체감 "불필요함"의 본체: accom/rent 27필드, trades 28, points 25, restaurants 20 / 필터 auto 39, rent 31 (Flatmates 는 10개 남짓).
- 기타 후보: 가입 보안질문 15개(폰 인증과 이중), powerball.
- **결정: 유령 페이지는 건드리지 않음**(2026-06 메뉴 정리 회귀 전례 — 진입점만 끊긴 것일 수 있음).
- 역방향 매칭 아이디어 첫 등장: 구하는 사람 프로필(`seeker_profiles`) → 집주인이 "구하는 사람 보기"로 열람 → **연락은 1:1 채팅으로만**(전화 비공개). 자동 알림은 함수 필요 → 2단계.
- 미결로 남은 것(간소화 범위, 매칭 시점)은 10월 세션에서 결정 → `docs/plan-2026-10.md`.

## 관찰된 사용자 선호
- 말보다 **보여주기**(목업·실제 화면). 긴 설명보다 "되는 선"과 소요 기간.
- 삭제에 매우 신중(회귀 경험). 플래그·숨김 선호.
- 보안·개인정보에 민감: 전화 비공개, 도로명 비노출, 채팅 외 연락 경로 금지.
- 브랜드 노출(KoAus + 링크)을 모든 외부 메시지에 자동 포함.
