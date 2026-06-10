// ════════════════════════════════════════════════════════════════════
//  KoAus · 권한 기반 액션 헬퍼 (RBAC — Role-Based Access Control)
//  -----------------------------------------------------------------
//  · 모든 페이지의 <head> 에 한 줄 로드: <script type="module" src="koaus-rbac.js">
//  · 권한 확인 + Firestore 액션을 단일 인터페이스 `window.koausRbac` 로 노출
//  · admin-mark.js (운영자 인증 인프라) 와 협력 — `window.koausIsAdmin` 플래그 재사용
//  · 페이지별 isMine(p) 함수와 호환 (작성자 본인 확인 동일 로직)
//
//  사용:
//    if (window.koausRbac.canEdit(post)) { … }                 // 권한 확인
//    if (window.koausRbac.canHide())     { … }                 // admin 전용
//    await window.koausRbac.markCompleted('jobs_posts', docId); // 작성자: 완료
//    await window.koausRbac.toggleHidden('services',  docId, post.isHidden); // admin: 블라인드
//    await window.koausRbac.forceDelete('jobs_posts', docId);  // admin: 강제 삭제
//
//  Firestore Rules 정합:
//    · accom_posts/rent_posts/jobs_posts: allow update,delete: ownerOnExisting()
//      → 작성자 본인 액션은 본인 uid 매칭 시 통과
//    · services: allow update: isAdmin()
//      → 작성자 액션(markCompleted 등) 은 룰에서 거부될 수 있음
//        services 컬렉션의 작성자 액션은 별도 admin 대행 흐름 필요
// ════════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, addDoc, collection, updateDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';
import {
  getStorage, ref as storageRef, deleteObject,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js';

const firebaseConfig = {
  apiKey:            'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain:        'koaus-f564c.firebaseapp.com',
  projectId:         'koaus-f564c',
  storageBucket:     'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId:             '1:663988594088:web:ef30c2fd557407b00b299d',
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
let db = null;
try { db = getFirestore(app); } catch (_) {}
let storage = null;
try { storage = getStorage(app); } catch (_) {}

// ────────────────────────── 고아 이미지 정리 (Orphan Cleanup) ──────────────────────────
//   글 삭제 시 연결된 Storage 이미지도 함께 deleteObject 호출 → orphan 데이터 방지.
//   · imageUrls / imageUrl / thumbUrl 등 다양한 필드명을 모두 스캔.
//   · download URL → Storage path 변환은 path-pattern 파싱:
//       https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded-path}?alt=...
//       → path = decodeURIComponent(pathname.split('/o/')[1].split('?')[0])
//   · best-effort — 한 이미지 삭제 실패해도 다른 이미지 + doc 삭제는 계속 진행.

function _extractImageUrls(data) {
  if (!data || typeof data !== 'object') return [];
  const out = [];
  // 배열 필드 — 게시판 글의 표준 (imageUrls)
  if (Array.isArray(data.imageUrls)) data.imageUrls.forEach(u => u && out.push(String(u)));
  // 단일 필드 — 프로필/썸네일/대표 이미지
  ['imageUrl', 'thumbUrl', 'photoURL'].forEach(k => {
    if (typeof data[k] === 'string' && data[k]) out.push(data[k]);
  });
  return out;
}

function _urlToStoragePath(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    // KoAus 의 firebasestorage.googleapis.com URL 만 처리 (외부 URL은 skip)
    if (!url.includes('firebasestorage.googleapis.com')) return null;
    const u = new URL(url);
    const idx = u.pathname.indexOf('/o/');
    if (idx === -1) return null;
    const encoded = u.pathname.slice(idx + 3);  // '/o/' 이후
    return decodeURIComponent(encoded);
  } catch (_) { return null; }
}

// ── 삭제 결과 집계 (지시 — 부분 실패 진단용) ──────────────────────────
//   { ok: bool, failed: ['private_data'|'storage'|'parent', ...], err, remainingImageUrls, exactAddress }
//   호출자는 ok=false 시 deletion_errors 로그 컬렉션에 기록.
function _newDeleteResult() {
  return { ok: true, failed: [], err: null, remainingImageUrls: [], exactAddress: null };
}

// not-found 코드 정규화 (Firestore: 'not-found', Storage: 'storage/object-not-found')
function _isNotFound(e) {
  const code = e && e.code;
  return code === 'not-found' || code === 'storage/object-not-found';
}

async function _deleteStorageImages(urls, result) {
  if (!storage || !urls || !urls.length) return;
  // 병렬 best-effort — 한 건 실패가 다른 건 차단 X
  const settled = await Promise.allSettled(urls.map(async url => {
    const path = _urlToStoragePath(url);
    if (!path) return { url };
    try { await deleteObject(storageRef(storage, path)); return { url }; }
    catch (e) {
      if (_isNotFound(e)) return { url };  // 이미 깨끗함 — 정상으로 간주
      console.warn('[rbac] storage 이미지 삭제 실패:', path, e && e.code);
      throw Object.assign(new Error(e?.message || 'storage delete failed'), { url, code: e?.code });
    }
  }));
  if (result) {
    const failed = settled.filter(s => s.status === 'rejected').map(s => s.reason && s.reason.url).filter(Boolean);
    if (failed.length) {
      result.failed.push('storage');
      result.err = result.err || ('storage 이미지 ' + failed.length + '건 삭제 실패');
      result.remainingImageUrls = failed;
    }
  }
}

// 삭제 전 doc 의 imageUrls / exactAddress 를 스냅샷 (로그 기록 + 정리용)
//   반환: { snapData, urls, exactAddress }
async function _readDocBeforeDelete(collection, docId) {
  if (!db) return { snapData: null, urls: [], exactAddress: null };
  try {
    const snap = await getDoc(doc(db, collection, docId));
    if (!snap.exists()) return { snapData: null, urls: [], exactAddress: null };
    const data = snap.data() || {};
    const urls = _extractImageUrls(data);
    // exactAddress 는 보통 부모 doc 에 없음(stripPrivateFields 검문). private_data 에서 읽어 와야 정확.
    return { snapData: data, urls, exactAddress: null };
  } catch (_) {
    return { snapData: null, urls: [], exactAddress: null };
  }
}

// ── private_data 서브컬렉션 정리 (정확 위치 — 가장 먼저 삭제) ─────────────
//   민감정보를 부모보다 먼저 제거 → 부모 삭제 실패해도 정확 주소는 흔적 X.
//   not-found 는 이미 깨끗 → 정상.
//   권한 거부 / 네트워크 오류 → throw → 부모 doc 삭제 중단 (사용자 명시 4번 정책).
async function _purgePrivateDataFirst(collection, docId, result) {
  if (!db) return;
  // 정확 주소 로그용 스냅샷 (best-effort)
  try {
    const ps = await getDoc(doc(db, collection, docId, 'private_data', 'location'));
    if (ps.exists() && result) {
      result.exactAddress = (ps.data() || {}).exactAddress || null;
    }
  } catch (_) { /* 스냅샷 실패는 무시 */ }
  // 실제 삭제
  try {
    await deleteDoc(doc(db, collection, docId, 'private_data', 'location'));
  } catch (e) {
    if (_isNotFound(e)) return;  // 이미 깨끗
    if (result) {
      result.ok = false;
      result.failed.push('private_data');
      result.err = (e && e.message) || 'private_data delete failed';
    }
    throw e;   // 멈춤 — 부모 doc 삭제 진행 X
  }
}

// ── deletion_errors 로그 (Firestore 신설 컬렉션) ──────────────────────
//   부분 실패 시 호출. admin 만 read, 본인만 create (firestore.rules 강제)
async function _logDeletionError(collectionName, docId, result, user) {
  if (!db || !result) return;
  if (result.ok) return;
  const uid = (user && user.uid) || (window.koausAuth && window.koausAuth.user && window.koausAuth.user.uid) || null;
  if (!uid) return;
  try {
    await addDoc(collection(db, 'deletion_errors'), {
      board:    String(collectionName).slice(0, 30),
      docId:    String(docId).slice(0, 100),
      uid:      String(uid),
      failed:   Array.isArray(result.failed) ? result.failed : [],
      errorMsg: String(result.err || '').slice(0, 500),
      remainingImageUrls: Array.isArray(result.remainingImageUrls) ? result.remainingImageUrls.slice(0, 8) : [],
      exactAddress: result.exactAddress ? String(result.exactAddress).slice(0, 500) : null,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[rbac] deletion_errors 로그 기록 실패 (admin 검토용):', e?.code || e?.message);
  }
}

// ────────────────────────── 권한 확인 ──────────────────────────

// 작성자 본인 확인 — 글의 uid/authorUid 와 현재 로그인 uid 비교
//   user 미전달 시 window.koausAuth.user 사용 (글로벌 인증 표준)
function isAuthor(post, user) {
  user = user || (window.koausAuth && window.koausAuth.user);
  if (!post || !user || !user.uid) return false;
  const postUid = String(post.uid || post.authorUid || '');
  return postUid !== '' && postUid === String(user.uid);
}

// 운영자(Admin) 확인 — admin-mark.js 의 글로벌 플래그 재사용
//   (sessionStorage 패스포트 + Custom Claim + 이메일 화이트리스트 통합 결과)
function isAdmin() {
  return !!window.koausIsAdmin;
}

// 수정/삭제 권한: 작성자 본인 또는 admin
function canEdit(post, user)   { return isAuthor(post, user) || isAdmin(); }
function canDelete(post, user) { return isAuthor(post, user) || isAdmin(); }

// 블라인드(숨기기): admin 전용
function canHide() { return isAdmin(); }

// 구인/거래 완료(status='completed'): 작성자 본인 전용
//   (admin 도 호출 가능하지만 의미상 "본인 완료 처리" 액션)
function canMarkCompleted(post, user) { return isAuthor(post, user); }

// 공유 권한: 모든 사용자 (게시물 read 권한과 동일)
function canShare() { return true; }

// 신고 권한: 로그인 사용자 (본인 글 제외 가능 — UX는 페이지에서 처리)
function canReport(post, user) {
  user = user || (window.koausAuth && window.koausAuth.user);
  return !!(user && user.uid);
}

// ────────────────────────── Firestore 액션 ──────────────────────────

function _ensureDb() {
  if (!db) throw new Error('Firestore 미초기화');
  return db;
}
function _ref(collection, docId) {
  return doc(_ensureDb(), collection, docId);
}

// ── 작성자 액션 ──

// status='completed' (구인/거래 완료) — 작성자 본인만 호출
//   잔재 status 필드 그대로 두고 completedAt timestamp 추가
async function markCompleted(collection, docId) {
  await updateDoc(_ref(collection, docId), {
    status:      'completed',
    completedAt: serverTimestamp(),
  });
}

// 작성자 본인 삭제 (Rules에서 본인 uid 검증) — 연결된 Storage 이미지도 함께 정리
async function selfDelete(collectionName, docId) {
  // 지시 (좀비 데이터 방어) — 삭제 순서 재배치 (사용자 명시 4번 정책):
  //   ① private_data/location (정확 주소 — 가장 민감) — 실패 시 멈춤 + 로그
  //   ② Storage 이미지 (imageUrls 배열의 특정 파일들만, 폴더 전체 X)
  //   ③ 부모 doc (accom_posts/{id} 등) — 위 2 단계 완료 후
  const result = _newDeleteResult();
  const user = (window.koausAuth && window.koausAuth.user) || null;
  // 부모 doc 스냅샷 — imageUrls 추출 (Storage 삭제 입력)
  const pre = await _readDocBeforeDelete(collectionName, docId);
  // ① private_data 최우선 (실패 시 throw → 부모 삭제 중단)
  try {
    await _purgePrivateDataFirst(collectionName, docId, result);
  } catch (e) {
    await _logDeletionError(collectionName, docId, result, user);
    throw Object.assign(new Error('private_data 삭제 실패 — 부모 doc 삭제 중단'), {
      code: e?.code || 'private-data-fail', cause: e
    });
  }
  // ② Storage 이미지 (개별 파일 단위 — 다른 글 사진 영향 0)
  if (pre.urls && pre.urls.length) {
    await _deleteStorageImages(pre.urls, result);
  }
  // ③ 부모 doc — 위 단계 일부 실패해도 부모 doc 은 삭제 (요청 정책: 부모는 무조건 완료)
  try {
    await deleteDoc(_ref(collectionName, docId));
  } catch (e) {
    if (!_isNotFound(e)) {
      result.ok = false;
      result.failed.push('parent');
      result.err = (result.err ? result.err + ' / ' : '') + (e?.message || 'parent delete failed');
    }
  }
  // 부분 실패 로그 (admin 검토용)
  if (!result.ok || (result.failed && result.failed.length)) {
    await _logDeletionError(collectionName, docId, result, user);
  }
}

// 작성자 본인 수정 — patch 로 받은 필드만 업데이트
async function selfUpdate(collection, docId, patch) {
  if (!patch || typeof patch !== 'object') throw new Error('patch 필요');
  await updateDoc(_ref(collection, docId), patch);
}

// ── 운영자 액션 ──

// 블라인드 토글 — isHidden:true/false + status='hidden'/'approved' 동시 갱신
//   currentHidden 미전달 시 isHidden:true 강제
async function toggleHidden(collection, docId, currentHidden) {
  const next = !currentHidden;
  await updateDoc(_ref(collection, docId), {
    isHidden: next,
    status:   next ? 'hidden' : 'approved',
    hiddenAt: next ? serverTimestamp() : null,
  });
}

// 강제 수정 — admin 권한으로 임의 필드 업데이트
async function forceUpdate(collection, docId, patch) {
  if (!isAdmin()) throw new Error('관리자 권한 필요');
  if (!patch || typeof patch !== 'object') throw new Error('patch 필요');
  await updateDoc(_ref(collection, docId), patch);
}

// 강제 삭제 — admin 권한으로 doc 자체 제거 + 연결된 Storage 이미지 정리 (orphan 방지)
async function forceDelete(collectionName, docId) {
  if (!isAdmin()) throw new Error('관리자 권한 필요');
  // 지시 (좀비 데이터 방어) — selfDelete 동일 순서 (private_data 최우선, Storage 개별, 부모 마지막)
  const result = _newDeleteResult();
  const user = (window.koausAuth && window.koausAuth.user) || null;
  const pre = await _readDocBeforeDelete(collectionName, docId);
  try {
    await _purgePrivateDataFirst(collectionName, docId, result);
  } catch (e) {
    await _logDeletionError(collectionName, docId, result, user);
    throw Object.assign(new Error('[admin] private_data 삭제 실패 — 부모 doc 삭제 중단'), {
      code: e?.code || 'private-data-fail', cause: e
    });
  }
  if (pre.urls && pre.urls.length) {
    await _deleteStorageImages(pre.urls, result);
  }
  try {
    await deleteDoc(_ref(collectionName, docId));
  } catch (e) {
    if (!_isNotFound(e)) {
      result.ok = false;
      result.failed.push('parent');
      result.err = (result.err ? result.err + ' / ' : '') + (e?.message || 'parent delete failed');
    }
  }
  if (!result.ok || (result.failed && result.failed.length)) {
    await _logDeletionError(collectionName, docId, result, user);
  }
}

// ── 통합 헬퍼 ──

// 액션 실행 — 권한 자동 분기 (작성자/운영자에 따라 적절한 함수 호출)
//   action: 'edit' | 'delete' | 'complete' | 'hide' | 'share'
async function performAction(action, post, collection, docId, patch) {
  switch (action) {
    case 'edit':
      if (isAuthor(post)) return selfUpdate(collection, docId, patch);
      if (isAdmin())      return forceUpdate(collection, docId, patch);
      throw new Error('수정 권한 없음');
    case 'delete':
      if (isAuthor(post)) return selfDelete(collection, docId);
      if (isAdmin())      return forceDelete(collection, docId);
      throw new Error('삭제 권한 없음');
    case 'complete':
      if (!canMarkCompleted(post)) throw new Error('완료 처리 권한 없음 (작성자 전용)');
      return markCompleted(collection, docId);
    case 'hide':
      if (!canHide()) throw new Error('블라인드 권한 없음 (운영자 전용)');
      return toggleHidden(collection, docId, post && post.isHidden);
    default:
      throw new Error('알 수 없는 액션: ' + action);
  }
}

// ────────────────────────── 노출 ──────────────────────────
window.koausRbac = {
  // 권한 확인
  isAuthor, isAdmin,
  canEdit, canDelete, canHide, canMarkCompleted, canShare, canReport,
  // 작성자 액션
  markCompleted, selfDelete, selfUpdate,
  // 운영자 액션
  toggleHidden, forceUpdate, forceDelete,
  // 통합 실행기
  performAction,
};

// ── 글로벌 위임: 카드 .mini-hide click → 일시 숨김 토글 (지시 1/2) ───────────
//   · 페이지별 localStorage 키 매핑 + best-effort Firestore 동기화
//   · 작성자/관리자 권한 검증 후 isHidden 토글
const _BOARD_TO_STORE = { accom: 'koaus-accom-posts', rent: 'koaus-rent-posts', jobs: 'koaus-jobs-posts' };
const _BOARD_TO_COL   = { accom: 'accom_posts',       rent: 'rent_posts',       jobs: 'jobs_posts' };
document.addEventListener('click', async function (e) {
  const btn = e.target && e.target.closest && e.target.closest('.mini-hide[data-id]');
  if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  const id = btn.getAttribute('data-id');
  const fname = (location.pathname.split('/').pop() || '').toLowerCase().replace(/\.html$/, '');
  const sk = _BOARD_TO_STORE[fname];
  const col = _BOARD_TO_COL[fname] || 'services';
  let willHide = true;
  // 1) localStorage 토글 (있으면)
  if (sk) {
    try {
      const arr = JSON.parse(localStorage.getItem(sk) || '[]');
      const idx = arr.findIndex(x => String(x.id) === String(id));
      if (idx >= 0) {
        willHide = !arr[idx].isHidden;
        if (!confirm(willHide ? '이 글을 일시 숨김 처리하시겠습니까? (메인 리스트에서 제외)' : '다시 노출하시겠습니까?')) return;
        arr[idx].isHidden = willHide;
        arr[idx].status   = willHide ? 'hidden' : 'approved';
        localStorage.setItem(sk, JSON.stringify(arr));
      }
    } catch (err) { console.warn('[mini-hide] localStorage 토글 실패', err); }
  } else {
    if (!confirm('이 글을 일시 숨김 처리하시겠습니까?')) return;
  }
  // 2) Firestore 동기화 (fsDocId 매핑된 글만 — best-effort)
  try {
    if (sk) {
      const arr2 = JSON.parse(localStorage.getItem(sk) || '[]');
      const hit = arr2.find(x => String(x.id) === String(id));
      const fsDocId = hit && (hit.fsDocId || hit._fsDocId);
      if (fsDocId && db) await toggleHidden(col, String(fsDocId), !willHide);
    } else {
      if (db) await toggleHidden(col, String(id), false);
    }
  } catch (err) { console.warn('[mini-hide] Firestore 동기화 실패 (local 반영은 OK):', err); }
  // 3) 페이지 재렌더 트리거 (페이지별 함수)
  try { if (typeof window.renderPosts === 'function') window.renderPosts(); else location.reload(); }
  catch (_) { location.reload(); }
});
