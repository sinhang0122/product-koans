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
