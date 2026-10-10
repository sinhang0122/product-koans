// ════════════════════════════════════════════════════════════════════
//  KoAus · Cloud Functions — 운영자 제재 callable 2종
//  -----------------------------------------------------------------
//  · suspendUser / unsuspendUser — admin custom claim 보유자만 호출 가능.
//  · 동작: Auth disable/enable + refresh token 폐기 + users/{uid}.status
//    동기화 + moderation_logs 기록 (Admin SDK — firestore.rules 우회).
//  · Auth disable 만으로는 기존 ID 토큰이 최대 1시간 유효
//    → firestore.rules 의 notSuspended() get 체크가 그 창을 닫는다.
//  · enforceAppCheck — App Check 토큰 없는 호출(외부 스크립트) 차단.
//  · region: australia-southeast1 (시드니) — CSP connect-src 와 동기.
// ════════════════════════════════════════════════════════════════════
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const CALL_OPTS = {
  region: 'australia-southeast1',
  enforceAppCheck: true,
  maxInstances: 2,   // 빌링 폭탄 방어 — admin 전용 호출이라 충분
};

function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', '관리자 권한이 필요합니다.');
  }
}

function requireTargetUid(request) {
  const uid = request.data && request.data.uid;
  if (typeof uid !== 'string' || !uid.trim() || uid.length > 128) {
    throw new HttpsError('invalid-argument', '대상 uid 가 올바르지 않습니다.');
  }
  return uid.trim();
}

async function writeLog(action, targetUid, targetEmail, reason, request) {
  await admin.firestore().collection('moderation_logs').add({
    action,
    targetUid,
    targetEmail: targetEmail || '',
    reason: String(reason || '').slice(0, 1000),
    actorUid: request.auth.uid,
    actorEmail: request.auth.token.email || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

exports.suspendUser = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const uid = requireTargetUid(request);
  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', '자기 자신은 정지할 수 없습니다.');
  }
  const target = await admin.auth().getUser(uid).catch(() => null);
  if (!target) throw new HttpsError('not-found', '대상 계정을 찾을 수 없습니다.');
  if (target.customClaims && target.customClaims.admin === true) {
    throw new HttpsError('failed-precondition', '관리자 계정은 정지할 수 없습니다.');
  }

  await admin.auth().updateUser(uid, { disabled: true });
  await admin.auth().revokeRefreshTokens(uid);
  await admin.firestore().doc(`users/${uid}`).set({
    status: 'suspended',
    suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeLog('suspend', uid, target.email, request.data.reason, request);

  return { ok: true, uid, status: 'suspended' };
});

exports.unsuspendUser = onCall(CALL_OPTS, async (request) => {
  requireAdmin(request);
  const uid = requireTargetUid(request);
  const target = await admin.auth().getUser(uid).catch(() => null);
  if (!target) throw new HttpsError('not-found', '대상 계정을 찾을 수 없습니다.');

  await admin.auth().updateUser(uid, { disabled: false });
  await admin.firestore().doc(`users/${uid}`).set({
    status: 'active',
    unsuspendedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeLog('unsuspend', uid, target.email, request.data.reason, request);

  return { ok: true, uid, status: 'active' };
});

// ── 재활용(재발급) 휴대폰 자동 해제 + 재연결 (폰④, 2026-10 서버 검증판) ──
//   배경: 호주는 번호 재발급이 흔함. 새 유저 B 가 인증한 번호가 이전 유저 A 에 연결돼 있을 수 있음.
//   2026-10 변경: 예전엔 "클라이언트가 코드를 맞힌 뒤에만 호출한다"는 가정으로 번호 문자열만 받았음 →
//     로그인한 누구나 콘솔에서 아무 번호로 호출해 남의 휴대폰 인증을 떼어낼 수 있는 구멍.
//     이제 서버가 **번호 통제 증명(temporaryProof)** 을 Identity Toolkit 에 직접 검증한 뒤에만 처리한다.
//     temporaryProof = 클라가 linkWithCredential 로 코드를 맞혔으나 번호가 A 에 붙어 있어 거부될 때
//     Firebase 가 돌려주는 서버 서명 증명(PhoneAuthProvider.credentialFromError). 위조 불가·단기 유효.
//   동작: 증명 검증 → (호출자 24h 1회 제한) → A 에서 번호 해제(A 계정·데이터·이메일/구글 로그인 그대로)
//         → B 계정에 번호 연결(Admin SDK). 검증 과정의 A 토큰은 서버에서 버리고 클라로 내보내지 않는다.
//   ⚠️ 관리자 권한 불요(B 는 일반 로그인 유저). request.auth(B) 필수 + App Check enforce.
const WEB_API_KEY = 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU';   // 공개 식별자(클라 config 와 동일) — 비밀 아님
exports.releaseRecycledPhone = onCall(CALL_OPTS, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }
  const phone = request.data && request.data.phoneNumber;
  const proof = request.data && request.data.temporaryProof;
  if (typeof phone !== 'string' || !/^\+(61|82)[0-9]{8,11}$/.test(phone)) {
    throw new HttpsError('invalid-argument', '휴대폰 번호 형식이 올바르지 않습니다.');
  }
  if (typeof proof !== 'string' || proof.length < 20 || proof.length > 4096) {
    throw new HttpsError('invalid-argument', '번호 통제 증명이 없습니다. 인증번호를 다시 받아 주세요.');
  }

  // 1) 호출자 제한 — 계정당 24시간 1회 (괴롭힘·반복 호출 방어)
  const callerRef = admin.firestore().doc(`users/${request.auth.uid}`);
  const callerSnap = await callerRef.get().catch(() => null);
  const lastAt = callerSnap && callerSnap.exists && callerSnap.data().phoneReleaseAt;
  if (lastAt && typeof lastAt.toMillis === 'function' && Date.now() - lastAt.toMillis() < 24 * 3600 * 1000) {
    throw new HttpsError('resource-exhausted', '번호 재연결은 하루 1회만 가능합니다. 카카오톡 문의로 진행해 주세요.');
  }

  // 2) 서버가 직접 증명 검증 — Identity Toolkit signInWithPhoneNumber(phoneNumber + temporaryProof)
  //    성공 = 이 호출자가 그 번호의 SMS 를 실제로 받았다는 Firebase 의 보증. 응답 토큰은 사용하지 않고 버린다.
  let verified = null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${WEB_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone, temporaryProof: proof }),
    });
    verified = r.ok ? await r.json() : null;
    if (!r.ok) console.warn('[releaseRecycledPhone] proof 검증 실패', r.status, await r.text().catch(() => ''));
  } catch (e) {
    console.warn('[releaseRecycledPhone] proof 검증 호출 오류', e);
  }
  if (!verified || verified.phoneNumber !== phone) {
    throw new HttpsError('permission-denied', '번호 통제 증명이 유효하지 않습니다. 인증번호를 다시 받아 주세요.');
  }

  // 3) 현재 이 번호의 소유자(A) 조회 → 해제. A 계정/데이터는 보존(다음 로그인 시 게이트가 휴대폰 재인증 안내)
  const owner = await admin.auth().getUserByPhoneNumber(phone).catch(() => null);
  let released = false;
  if (owner && owner.uid !== request.auth.uid) {
    await admin.auth().updateUser(owner.uid, { phoneNumber: null });
    await admin.firestore().doc(`users/${owner.uid}`).set({
      phoneReleased: true,
      phoneReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeLog('phone_release', owner.uid, owner.email, 'recycled-number reclaim (server-verified proof)', request);
    released = true;
  }

  // 4) B 계정에 번호 연결 (기존 번호가 있으면 교체 = 번호 변경 케이스)
  await admin.auth().updateUser(request.auth.uid, { phoneNumber: phone });
  await callerRef.set({ phoneReleaseAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  return { ok: true, released, linked: true };
});
