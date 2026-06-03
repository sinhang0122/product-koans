// ════════════════════════════════════════════════════════════════════
//  KoAus · 글로벌 중복 글 안전 덮어쓰기 헬퍼 (자동 끌어올리기)
//  ─────────────────────────────────────────────────────────────────
//  · DB 레벨: 새 글 등록 100% 성공 직후에만 동일 [uid + title + address] 과거 글 삭제
//  · 새 글 등록 실패 시 과거 글 절대 미터치 (Rollback-safe)
//  · 사용법:
//      const ref = await window.koausDedupe.addAndCleanup(
//        firestore, 'accom_posts', payload, { uid, title, address }
//      );
//
//  · 지도 레벨: [좌표 + uid] 그룹 → 최신 1개만
//      const dedupedPosts = window.koausDedupe.dedupeMapByUidLoc(filteredPosts);
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausDedupe) return;

  // ── DB 레벨: 안전 자동 끌어올리기 (uid + title + address 일치) ──
  //   · Firebase modular SDK 함수들을 인자로 받음 (페이지마다 다른 인스턴스 호환)
  //   · firestore = { db, addDoc, collection, query, where, getDocs, doc, deleteDoc, limit }
  async function addAndCleanup(firestore, collectionName, payload, key) {
    const { db, addDoc, collection, query, where, getDocs, doc, deleteDoc, limit } = firestore;
    if (!db || !addDoc || !collection) throw new Error('firestore helpers required');
    // Step 1: 새 글 등록 — 반드시 먼저 성공해야 함
    const ref = await addDoc(collection(db, collectionName), payload);
    // Step 2: 등록 성공 직후만 query+delete (Rollback-safe)
    try {
      if (key && key.uid && (key.title != null) && query && where && getDocs && deleteDoc && doc && limit) {
        // title + address 동시 일치 — 사용자 명시 룰
        let q;
        if (key.address != null) {
          q = query(
            collection(db, collectionName),
            where('uid',     '==', key.uid),
            where('title',   '==', key.title),
            where('address', '==', key.address),
            limit(10)
          );
        } else {
          // address 미사용 컬렉션 (jobs 등) — title 기준 (legacy 호환)
          q = query(
            collection(db, collectionName),
            where('uid',   '==', key.uid),
            where('title', '==', key.title),
            limit(10)
          );
        }
        const snap = await getDocs(q);
        const dupes = snap.docs.filter(d => d.id !== ref.id);
        if (dupes.length) {
          console.info('[dedupe] ' + collectionName + ' 중복 ' + dupes.length + '건 삭제');
          await Promise.allSettled(dupes.map(d => deleteDoc(doc(db, collectionName, d.id))));
        }
      }
    } catch (err) {
      // 중복 정리 실패 — 새 글은 살아있음 (데이터 유실 0)
      console.warn('[dedupe] 중복 정리 실패 (새 글 정상):', err);
    }
    return ref;
  }

  // ── 지도 레벨: [좌표 + uid] 그룹화 → 최신 1개만 ──
  //   · 같은 사람이 같은 위치에 올린 글 무리 → 시각적 도배 차단
  //   · 다른 사용자의 같은 위치 글은 그대로 클러스터(+N) 합산
  //   · uid 없거나 좌표 없는 글은 그대로 통과
  function dedupeMapByUidLoc(filteredPosts) {
    if (!Array.isArray(filteredPosts) || !filteredPosts.length) return filteredPosts || [];
    const groups = new Map();
    filteredPosts.forEach(p => {
      if (!p || !p.lat || !p.lng) return;
      const uid = String(p.uid || p.authorUid || '').trim();
      if (!uid) return;
      const key = Number(p.lat).toFixed(4) + ',' + Number(p.lng).toFixed(4) + '|' + uid;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    const survivors = new Set();
    groups.forEach(arr => {
      arr.sort((a, b) => {
        const at = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : (a.id || 0);
        const bt = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : (b.id || 0);
        return bt - at;
      });
      if (arr[0]) survivors.add(String(arr[0].id));
    });
    return filteredPosts.filter(p => {
      const uid = String((p && (p.uid || p.authorUid)) || '').trim();
      if (!uid || !p.lat || !p.lng) return true;
      return survivors.has(String(p.id));
    });
  }

  // ── LocalStorage 글 (Firestore 미사용) — 본인 글 중 동일 title+address 정리 ──
  //   · accom 등 LocalStorage 기반 페이지에서 사용
  //   · savePosts(arr) 호출 전에 사용 — 중복 제거된 배열 반환
  function dedupeLocalPosts(arr, newPost) {
    if (!Array.isArray(arr) || !newPost || !newPost.uid) return arr;
    const uid = String(newPost.uid);
    const t = String(newPost.title || '');
    const a = String(newPost.address || '');
    // 새 글 자체는 보존 — id 동일성으로 자기 자신 제외
    return arr.filter(p => {
      if (!p) return false;
      if (String(p.id) === String(newPost.id)) return true;
      if (String(p.uid || '') !== uid) return true;
      if (String(p.title || '') !== t) return true;
      if (a && String(p.address || '') !== a) return true;
      return false;   // [uid + title + address] 일치 → 제거
    });
  }

  window.koausDedupe = { addAndCleanup, dedupeMapByUidLoc, dedupeLocalPosts };
})();
