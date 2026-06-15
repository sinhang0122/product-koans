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

// ── 재활용(재발급) 휴대폰 자동 해제 + 재연결 (폰④) ──
//   배경: 호주는 번호 재발급이 흔함. 새 유저 B 가 인증한 번호가 이전 유저 A 에 연결돼 있을 수 있음.
//   보안 근거: 클라 linkWithCredential 가 SMS 코드 일치 시에만 credential-already-in-use 를 던짐
//     (틀리면 invalid-verification-code) → 이 호출 시점 = B 가 번호를 통제한다는 증명.
//   동작: A 에서 번호 해제(A 계정·데이터·이메일/구글 로그인은 그대로). B 는 재전송 코드로 link 성공.
//   ⚠️ 관리자 권한 불요(B 는 일반 로그인 유저). request.auth(B) 필수 + App Check enforce.
exports.releaseRecycledPhone = onCall(CALL_OPTS, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }
  const phone = request.data && request.data.phoneNumber;
  if (typeof phone !== 'string' || !/^\+61[0-9]{8,10}$/.test(phone)) {
    throw new HttpsError('invalid-argument', '휴대폰 번호 형식이 올바르지 않습니다.');
  }
  // 현재 이 번호의 소유자(A) 조회
  const owner = await admin.auth().getUserByPhoneNumber(phone).catch(() => null);
  if (!owner) return { ok: true, released: false };                          // 아무도 사용 안 함
  if (owner.uid === request.auth.uid) return { ok: true, released: false };  // 이미 본인 번호

  // 재활용 번호 — A 에서 해제. A 계정/데이터는 보존, 로그인은 이메일/구글 유지(다음 로그인 시 게이트가 휴대폰 재인증 안내).
  await admin.auth().updateUser(owner.uid, { phoneNumber: null });
  await admin.firestore().doc(`users/${owner.uid}`).set({
    phoneReleased: true,
    phoneReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeLog('phone_release', owner.uid, owner.email, 'recycled-number reclaim', request);

  return { ok: true, released: true };
});
