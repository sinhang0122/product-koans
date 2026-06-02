// ════════════════════════════════════════════════════════════════════
//  KoAus · Local Analytics — 14일 가중치 기반 지역 활동 분석 + 4슬롯 배너 분배
//  - localStorage 'koaus-analytics-v1' = [{ ts, state }, ...]
//  - 자동 기록: 페이지 진입 시 ?state= 파라미터를 1회 push
//  - 14일 초과 데이터는 자동 만료 정리
//  - hero-banner 슬롯 4개 배분:
//      · 단일 지역 비중 ≥ 80% → 4개 모두 해당 지역
//      · 그 외 → 비율 그대로 4개 슬롯 분배 (largest remainder rounding)
//  - 모바일·데스크톱 동일 작동 (localStorage 기반, Firestore 의존 없음)
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausAnalytics) return;

  const KEY = 'koaus-analytics-v1';
  const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;   // 14 일
  const MAX_RECORDS = 500;                       // 무한 누적 방지

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }
  function save(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (_) {}
  }
  function trimWindow(arr) {
    const cutoff = Date.now() - WINDOW_MS;
    return arr.filter(r => r && typeof r.ts === 'number' && r.ts >= cutoff)
              .slice(-MAX_RECORDS);   // 최근 N 개만
  }

  function record(state) {
    const s = String(state || '').toLowerCase().trim();
    if (!s) return;
    const arr = trimWindow(load());
    arr.push({ ts: Date.now(), state: s });
    save(arr);
  }

  // 최근 14일 데이터의 지역별 빈도 → 비율
  function getDistribution() {
    const arr = trimWindow(load());
    save(arr);   // 만료 데이터 정리 (read 시 자동)
    const counts = {};
    arr.forEach(r => { counts[r.state] = (counts[r.state] || 0) + 1; });
    const total = arr.length;
    if (!total) return { total: 0, ratios: {}, sortedStates: [] };
    const ratios = {};
    Object.keys(counts).forEach(k => { ratios[k] = counts[k] / total; });
    const sortedStates = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    return { total, ratios, counts, sortedStates };
  }

  // N 개 슬롯을 지역 비율로 분배 (largest remainder rounding)
  //  · 단일 지역 비중 >= 80% → 모두 해당 지역
  //  · 데이터 없음 → 빈 배열
  function allocateSlots(slotCount) {
    const N = Math.max(1, Math.min(8, slotCount | 0));
    const { total, ratios, sortedStates } = getDistribution();
    if (!total) return [];
    // 독점 80% 룰
    const top = sortedStates[0];
    if (ratios[top] >= 0.80) return Array(N).fill(top);
    // 비율 분배 — largest remainder
    const raw = sortedStates.map(s => ({ state: s, share: ratios[s] * N }));
    const floors = raw.map(r => ({ state: r.state, base: Math.floor(r.share), rem: r.share - Math.floor(r.share) }));
    let used = floors.reduce((a, r) => a + r.base, 0);
    floors.sort((a, b) => b.rem - a.rem);
    let i = 0;
    while (used < N && i < floors.length) { floors[i].base += 1; used += 1; i += 1; }
    // 결과 배열 — 비중 큰 지역 먼저 채우기
    const out = [];
    sortedStates.forEach(s => {
      const item = floors.find(f => f.state === s);
      for (let k = 0; k < item.base; k++) out.push(s);
    });
    return out.slice(0, N);
  }

  // ── 자동 기록 — 페이지 진입 시 ?state= 파라미터 1회 push ──
  try {
    const params = new URLSearchParams(location.search);
    const state = (params.get('state') || params.get('id') || '').toLowerCase();
    if (state) record(state);
  } catch (_) {}

  window.koausAnalytics = { record, getDistribution, allocateSlots };
})();
