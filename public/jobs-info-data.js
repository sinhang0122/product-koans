/* KoAus 취업 정보 (Work Guide) 데이터 — jobs-info.html 이 로드.
 * 구조: window.KOAUS_JOBS_INFO = { common: {id,label,sub,items}, states: [{id,label,sub,items}] }
 * item: { slug: 'URL 딥링크용 고유 슬러그(?q=slug)', q: '질문', a: '답변 HTML' }
 * 콘텐츠 갱신은 이 파일만 수정하면 됨 (페이지 마크업 무변경). */
window.KOAUS_JOBS_INFO = {
  common: {
    id: 'common',
    label: '전국 공통',
    sub: 'Australia-wide',
    items: [
      {
        slug: 'tfn',
        q: 'TFN(택스 파일 넘버)이 뭔가요? 꼭 필요한가요?',
        a: '<p>TFN(Tax File Number)은 호주 국세청(ATO)이 발급하는 개인 세금 번호로, 합법적으로 일하려면 사실상 필수입니다. TFN 없이 일하면 최고 세율로 원천징수됩니다.</p><p>호주 입국 후 <a href="https://www.ato.gov.au" target="_blank" rel="noopener">ATO 홈페이지</a>에서 무료로 온라인 신청할 수 있으며, 보통 우편으로 수령까지 1~2주 걸립니다. 고용주에게는 근무 시작 후 28일 이내에 제출하면 됩니다.</p><div class="faq-note">참고용 일반 정보입니다. 정확한 절차는 ATO 공식 안내를 따르세요.</div>'
      },
      {
        slug: 'minimum-wage',
        q: '호주 최저임금과 근로 권리는 어디서 확인하나요?',
        a: '<p>호주는 연방 최저임금(National Minimum Wage)이 법으로 정해져 있고 매년 7월 1일 갱신됩니다. 업종·직무별 최저 조건은 어워드(Award)에 따라 더 높을 수 있습니다.</p><p>최신 최저임금, 캐주얼 로딩(casual loading), 주말·공휴일 수당 등 근로 권리는 공식 기관 <a href="https://www.fairwork.gov.au" target="_blank" rel="noopener">Fair Work Ombudsman</a>에서 확인하세요. 임금 미지급·부당대우 신고도 같은 곳에서 할 수 있습니다.</p><div class="faq-note">현금(cash-in-hand)으로 최저임금 미만을 제안받았다면 거절하고, 페이슬립(payslip)을 항상 받아 보관하세요.</div>'
      },
      {
        slug: 'super',
        q: '슈퍼애뉴에이션(Super)은 무엇인가요?',
        a: '<p>슈퍼애뉴에이션(Superannuation)은 호주의 퇴직연금 제도입니다. 고용주는 임금과 별도로 일정 비율을 직원의 슈퍼 계좌에 의무 납입해야 하며, 페이슬립에서 납입 내역을 확인할 수 있습니다.</p><p>워킹홀리데이 등 임시 비자 소지자는 출국 후 DASP(Departing Australia Superannuation Payment)로 슈퍼를 환급받을 수 있습니다. 자세한 내용은 <a href="https://www.ato.gov.au" target="_blank" rel="noopener">ATO</a>를 참고하세요.</p>'
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
