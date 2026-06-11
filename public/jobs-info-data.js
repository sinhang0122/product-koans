/* KoAus 취업 정보 (Work Guide) 데이터 — jobs-info.html 이 로드.
 * 구조: window.KOAUS_JOBS_INFO = { common: {id,label,sub,items}, states: [{id,label,sub,items}] }
 * item: { slug: 'URL 딥링크용 고유 슬러그(?q=slug)', q: '질문', a: '답변 HTML' }
 * 콘텐츠 갱신은 이 파일만 수정하면 됨 (페이지 마크업 무변경).
 * 원문 관리: docs/jobs-info-content.md (콘텐츠 수정 시 원문 먼저 갱신).
 * ⚠️ 2026-07 최저임금·슈퍼 변경 — minimum-wage·super 항목 최종 확인일 갱신 필요. */
window.KOAUS_JOBS_INFO = {
  common: {
    id: 'common',
    label: '전국 공통',
    sub: 'Australia-wide',
    items: [
      {
        slug: 'tfn',
        q: 'TFN(택스 파일 넘버), 어떻게 만들어요?',
        a: '<p>TFN은 호주에서 일하기 위한 세금 번호예요. 없이도 일은 시작할 수 있지만, 28일 안에 고용주에게 제출하지 않으면 급여에서 최고 세율로 원천징수됩니다.</p><ul><li><b>신청 방법:</b> 호주 입국 후 <a href="https://www.ato.gov.au/individuals-and-families/tax-file-number" target="_blank" rel="noopener">ATO 홈페이지</a>에서 온라인 신청 (여권 + 호주 주소만 있으면 됨). 무료이고 10분이면 끝나요.</li><li><b>발급 기간:</b> 우편으로 약 28일 이내 도착. 신청 직후 받은 접수번호로도 고용주에게 "신청 중"이라고 알릴 수 있어요.</li><li><b>주의:</b> TFN을 대신 만들어준다며 수수료를 받는 업체는 전부 불필요한 중개입니다. 공식 신청은 무료예요. TFN은 은행, 고용주 외에는 알려주지 마세요 (명의도용 위험).</li></ul><div class="faq-note">참고용 일반 정보 — 정확한 절차는 ATO 공식 안내를 따르세요. · 최종 확인일: 2026-06-11</div>'
      },
      {
        slug: 'minimum-wage',
        q: '최저시급이 얼마예요? 못 받으면 어떡해요?',
        a: '<p>호주 법정 최저시급(National Minimum Wage):</p><ul><li><b>2026년 6월 30일까지:</b> 시간당 $24.95 (캐주얼은 25% 로딩 포함 $31.19)</li><li><b>2026년 7월 1일부터:</b> 시간당 $26.44 (캐주얼은 약 $33.05)</li></ul><p>워홀러 대부분이 캐주얼 고용이라, 캐주얼 로딩 25%가 붙은 금액이 본인 기준이에요. 업종별 어워드(Award)에 따라 이보다 높을 수 있으니 <a href="https://calculate.fairwork.gov.au" target="_blank" rel="noopener">Fair Work 페이 계산기</a>로 확인하세요.</p><ul><li>현금잡(cash job)으로 최저시급 미만을 주는 것은 불법입니다. 비자와 무관하게 워홀러도 호주 노동법의 동일한 보호를 받아요.</li><li><b>신고:</b> <a href="https://www.fairwork.gov.au/pay-and-wages/minimum-wages" target="_blank" rel="noopener">Fair Work Ombudsman</a>에 익명 신고 가능, 한국어 통역 서비스(131 450) 지원. 신고해도 비자에 불이익 없습니다.</li><li>급여명세서(payslip)는 급여일로부터 1일 내 받을 권리가 있어요. 못 받았다면 그 자체가 위반입니다.</li></ul><div class="faq-note">최저임금은 매년 7월 1일 갱신됩니다. · 최종 확인일: 2026-06-11</div>'
      },
      {
        slug: 'super',
        q: '슈퍼애뉴에이션(연금)은 뭐고, 출국할 때 돌려받나요?',
        a: '<p>슈퍼(Super)는 호주 퇴직연금이에요. 고용주가 급여의 12%를 별도로 슈퍼 계좌에 넣어줘야 합니다 (급여에서 떼는 게 아니라 급여 외 추가 — 2025년 7월부터 12%).</p><ul><li><b>확인 방법:</b> 본인 슈퍼 계좌 앱이나 myGov에서 입금 내역 확인. 2026년 7월 1일부터는 급여일로부터 7영업일 내 입금이 의무화돼서(Payday Super), 밀리는지 바로 알 수 있어요.</li><li><b>계좌 선택:</b> 첫 직장에서 고용주가 정해주는 펀드에 자동 가입되는 경우가 많은데, 본인이 직접 수수료 낮은 펀드를 골라 지정할 수 있어요. 직장을 옮겨도 계좌는 하나로 유지하는 게 수수료 측면에서 유리합니다.</li><li><b>출국 시 환급 (DASP):</b> 워홀 비자가 끝나고 호주를 떠나면 슈퍼를 환급 신청할 수 있어요. 단 워홀러는 65%의 세금이 떼이고 지급됩니다. 신청은 <a href="https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/departing-australia-superannuation-payment-dasp" target="_blank" rel="noopener">ATO의 DASP 온라인 시스템</a>에서 무료 — 대행업체에 수수료 낼 필요 없어요.</li></ul><p>자세한 내용은 <a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals" target="_blank" rel="noopener">ATO Super 안내</a>를 참고하세요.</p><div class="faq-note">최종 확인일: 2026-06-11</div>'
      },
      {
        slug: 'resume',
        q: '호주 레쥬메, 한국 이력서랑 뭐가 달라요?',
        a: '<p>호주 레쥬메는 한국 이력서와 반대라고 생각하면 쉬워요. 사진·생년월일·비자 종류·결혼 여부를 쓰지 않습니다 (차별 방지 문화 — 쓰면 오히려 마이너스).</p><p><b>기본 구성 (1~2페이지):</b></p><ul><li>이름 + 연락처 (호주 전화번호, 이메일, 거주 서버브)</li><li>한 줄 소개 (예: "Reliable barista with 2 years of cafe experience, available weekends")</li><li>경력 — 최신순. 직책, 가게 이름, 기간, 한 일 2~3줄. 한국 경력도 영문으로 그대로 쓰면 돼요</li><li>스킬·자격증 — RSA, 화이트카드, 포크리프트, 커피 머신, 운전면허 등</li><li>레퍼런스 — "Available upon request" 한 줄이면 충분</li></ul><p><b>팁:</b></p><ul><li>카페·접객 잡은 직접 방문해서 레쥬메를 종이로 돌리는 게 아직도 제일 잘 먹혀요. 오전 피크 끝난 10시 반~11시쯤이 좋은 타이밍.</li><li>"Available: Mon–Sun, full availability"처럼 가능 시간대를 적으면 캐주얼 채용에서 큰 플러스예요.</li><li>파일명은 FirstName_Lastname_Resume.pdf — 한글 파일명은 깨질 수 있어요.</li></ul><p>공식 구직 사이트: <a href="https://www.workforceaustralia.gov.au" target="_blank" rel="noopener">Workforce Australia</a></p><div class="faq-note">최종 확인일: 2026-06-11</div>'
      },
      {
        slug: 'cafe-english',
        q: '카페·레스토랑에서 바로 쓰는 영어 표현',
        a: '<p><b>잡 구할 때 (레쥬메 돌리기):</b></p><ul><li>"Hi, I was wondering if you’re hiring at the moment?" — 지금 채용 중인가요?</li><li>"Could I leave my resume with you?" — 레쥬메 두고 가도 될까요?</li><li>"I’m available any day, including weekends." — 주말 포함 아무 때나 가능해요</li></ul><p><b>트라이얼(시험 근무) 때:</b></p><ul><li>"Where would you like me to start?" — 뭐부터 할까요?</li><li>"Just to confirm, is this a paid trial?" — 확인차 여쭤보는데, 트라이얼은 유급인가요? (2시간 넘는 무급 트라이얼은 불법 소지가 커요)</li></ul><p><b>홀에서:</b></p><ul><li>"Are you ready to order, or do you need another minute?" — 주문하시겠어요?</li><li>"How’s everything so far?" — 식사 어떠세요?</li><li>"Sorry about the wait." — 기다리게 해서 죄송해요</li><li>"I’ll be right with you." — 금방 갈게요</li></ul><p><b>주방·바리스타:</b></p><ul><li>"Behind you!" — 뒤에 지나가요 (주방 필수)</li><li>"86 the salmon" = 연어 품절됐다는 뜻</li><li>"Takeaway or have here?" — 포장인가요, 드시고 가나요?</li></ul><div class="faq-note">KoAus 자체 콘텐츠 · 최종 확인일: 2026-06-11</div>'
      }
    ]
  },
  states: [
    {
      id: 'nsw',
      label: 'NSW',
      sub: '뉴사우스 웨일스 주 · 시드니',
      items: [
        {
          slug: 'nsw-jobs',
          q: 'NSW(시드니) 일자리는 어디서 찾나요?',
          a: '<p>KoAus <a href="jobs.html?state=nsw">구인구직 (Jobs)</a> 게시판에서 NSW 지역 구인·구직 글을 확인할 수 있습니다. 시드니 시티·이스트우드·스트라스필드 등 한인 상권 일자리가 주로 올라옵니다.</p><div class="faq-note">NSW 지역별 상세 취업 정보는 준비 중입니다.</div>'
        }
      ]
    },
    {
      id: 'vic',
      label: 'VIC',
      sub: '빅토리아 주 · 멜버른',
      items: [
        {
          slug: 'vic-jobs',
          q: 'VIC(멜버른) 일자리는 어디서 찾나요?',
          a: '<p>KoAus <a href="jobs.html?state=vic">구인구직 (Jobs)</a> 게시판에서 VIC 지역 구인·구직 글을 확인할 수 있습니다.</p><div class="faq-note">VIC 지역별 상세 취업 정보는 준비 중입니다.</div>'
        }
      ]
    },
    {
      id: 'qld',
      label: 'QLD',
      sub: '퀸즐랜드 주 · 브리즈번',
      items: [
        {
          slug: 'qld-jobs',
          q: 'QLD(브리즈번) 일자리는 어디서 찾나요?',
          a: '<p>KoAus <a href="jobs.html?state=qld">구인구직 (Jobs)</a> 게시판에서 QLD 지역 구인·구직 글을 확인할 수 있습니다. 농장(세컨 비자 카운트) 잡은 상세 필터의 「세컨/써드 비자 카운트」 체크를 활용하세요.</p><div class="faq-note">QLD 지역별 상세 취업 정보는 준비 중입니다.</div>'
        },
        {
          slug: 'forklift-qld',
          q: '포크리프트(LF) 자격증, 브리즈번에서 따는 법',
          a: '<p>포크리프트는 <b>고위험 작업 면허(HRW Licence)</b>라 주 정부(WorkSafe QLD) 인가 학원(RTO)에서 교육·평가를 통과해야 해요. 창고·물류 잡 시급이 확 올라가는 대표 자격증입니다.</p><ul><li><b>조건</b> — 만 18세 이상, 기초 영어 (필기는 구술 평가 — 통역 허용 여부는 학원마다 다르니 예약 시 확인)</li><li><b>구조</b> — 초보자 기준 교육 2일 + 평가 1일 (평가일은 따로 예약). 야간 과정(저녁 3회 + 평가)도 있어서 일하면서 딸 수 있어요</li><li><b>비용</b> — 학원별 $390~550 선 (평가비 포함 여부 확인 필수, 시기별 변동)</li><li><b>브리즈번 학원 예시</b> — Licences 4 Work (Coopers Plains·Caboolture, 평일·주말·야간 운영), FMS Training (Lawnton, 주말 집중), Brisbane Truck Licences (Logan 등) — 예약 전 전화로 원하는 요일 조합 가능한지 확인하세요</li><li><b>팁</b> — 부킹하면 주는 사전 학습 워크북을 미리 한 번 읽고 가는 게 합격률 차이를 제일 크게 만들어요. 유튜브에 한국인 후기 영상도 많으니 시험 과정을 미리 봐두세요</li></ul><p>면허는 QLD에서 따도 전 주에서 통용돼요 (상호 인정).</p><p>공식 안내: <a href="https://www.worksafe.qld.gov.au/licensing-and-registrations/work-health-and-safety-licences/licences-to-perform-high-risk-work" target="_blank" rel="noopener">WorkSafe QLD — High Risk Work Licence</a></p><div class="faq-note">교육비·학원 운영 일정은 수시로 바뀝니다. 예약 전 학원에 직접 확인하세요. · 최종 확인일: 2026-06-11</div>'
        }
      ]
    },
    {
      id: 'wa',
      label: 'WA',
      sub: '웨스턴 오스트레일리아 주 · 퍼스',
      items: [
        {
          slug: 'wa-jobs',
          q: 'WA(퍼스) 일자리는 어디서 찾나요?',
          a: '<p>KoAus <a href="jobs.html?state=wa">구인구직 (Jobs)</a> 게시판에서 WA 지역 구인·구직 글을 확인할 수 있습니다.</p><div class="faq-note">WA 지역별 상세 취업 정보는 준비 중입니다.</div>'
        }
      ]
    },
    {
      id: 'sa',
      label: 'SA',
      sub: '사우스 오스트레일리아 주 · 애들레이드',
      items: [
        {
          slug: 'sa-jobs',
          q: 'SA(애들레이드) 일자리는 어디서 찾나요?',
          a: '<p>KoAus <a href="jobs.html?state=sa">구인구직 (Jobs)</a> 게시판에서 SA 지역 구인·구직 글을 확인할 수 있습니다.</p><div class="faq-note">SA 지역별 상세 취업 정보는 준비 중입니다.</div>'
        }
      ]
    },
    {
      id: 'tas',
      label: 'TAS',
      sub: '태즈메이니아 주 · 호바트',
      items: [
        {
          slug: 'tas-jobs',
          q: 'TAS(호바트) 일자리는 어디서 찾나요?',
          a: '<p>KoAus <a href="jobs.html?state=tas">구인구직 (Jobs)</a> 게시판에서 TAS 지역 구인·구직 글을 확인할 수 있습니다.</p><div class="faq-note">TAS 지역별 상세 취업 정보는 준비 중입니다.</div>'
        }
      ]
    },
    {
      id: 'act',
      label: 'ACT',
      sub: '호주 수도 준주 · 캔버라',
      items: [
        {
          slug: 'act-jobs',
          q: 'ACT(캔버라) 일자리는 어디서 찾나요?',
          a: '<p>KoAus <a href="jobs.html?state=act">구인구직 (Jobs)</a> 게시판에서 ACT 지역 구인·구직 글을 확인할 수 있습니다.</p><div class="faq-note">ACT 지역별 상세 취업 정보는 준비 중입니다.</div>'
        }
      ]
    },
    {
      id: 'nt',
      label: 'NT',
      sub: '노던 준주 · 다윈',
      items: [
        {
          slug: 'nt-jobs',
          q: 'NT(다윈) 일자리는 어디서 찾나요?',
          a: '<p>KoAus <a href="jobs.html?state=nt">구인구직 (Jobs)</a> 게시판에서 NT 지역 구인·구직 글을 확인할 수 있습니다.</p><div class="faq-note">NT 지역별 상세 취업 정보는 준비 중입니다.</div>'
        }
      ]
    }
  ]
};
