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

// ════════════════════════════════════════════════════════════════════
//  KoAus · 알림 메일 (2026-10 ③) — Resend
//  -----------------------------------------------------------------
//  · 보내는 곳: Resend REST API (https://api.resend.com/emails). 키는 Secret RESEND_API_KEY
//    (`firebase functions:secrets:set RESEND_API_KEY` — 채팅창에 붙이지 말 것). 발신: MAIL_FROM.
//  · 모든 메일은 큐(mail_queue)에 쌓고 10분마다 한 번(mailPump)에 보낸다 — 무료 한도(하루 100통)를
//    mail_meta/daily 로 세고, 넘치면 다음 날 이어서. 한 통도 안 버림.
//  · ① 조건 맞는 방: accom_posts / rent_posts 생성 → 같은 주의 seeker_profiles(visible) 중
//    거리 ≤ 구하는 사람 반경(radiusKm, 기본 5) & 가격 ∈ [budgetMin, budgetMax] → seeker_private.alerts 설정대로
//      instant → 바로 큐 / threshold5 → mail_digest/{uid} 에 모아 5건 되면 한 통 / daily → 매일 08:00(시드니) 한 통 / off → 안 보냄
//  · ② 채팅: chats/{id}/messages 생성 → 받는 쪽 users/{uid}.notify (없으면 instant) — 대화당 한 통(읽기 전까지 재발송 없음),
//      10m/30m/1h/2h/5h 는 sendAfter 뒤 아직 안 읽었을 때만, daily 는 정해진 시각(hh:mm, 시드니) 한 통, off 는 안 보냄.
//  · 수신거부: 메일 하단 링크(mailUnsub?u=uid&k=kind&t=HMAC) — 로그인 없이 그 종류 알림을 끈다. List-Unsubscribe 헤더도 같이.
//  · 회원 공지(미등록 회원 포함)는 Resend 대시보드 Broadcasts 로 — syncResendAudience(관리자 callable)가 회원 목록을 오디언스로 동기화.
//  · 클라이언트는 mail_queue/mail_digest/mail_meta 를 읽고 쓸 수 없다(rules 에 match 없음 = 전부 거부). 이 파일만 Admin SDK 로 접근.
// ════════════════════════════════════════════════════════════════════
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const crypto = require('crypto');

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const MAIL_FROM = defineString('MAIL_FROM', { default: 'KoAus <noreply@mail.koaus.com.au>' });
const SITE = 'https://koaus.com.au';
const DAILY_CAP = 95;                 // Resend 무료 100통/일 — 여유 5통
const TZ = 'Australia/Sydney';
const REGION = 'australia-southeast1';
const db = () => admin.firestore();
const FV = admin.firestore.FieldValue;

// ── 공통 ──
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function kmBetween(a, b) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function sydney(d) {   // {ymd:'2026-10-19', hm:'08:30'}
  const p = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d || new Date());
  const g = t => (p.find(x => x.type === t) || {}).value || '';
  return { ymd: `${g('year')}-${g('month')}-${g('day')}`, hm: `${g('hour')}:${g('minute')}` };
}
function unsubToken(uid, kind) {
  return crypto.createHmac('sha256', RESEND_API_KEY.value()).update(`${uid}|${kind}`).digest('hex').slice(0, 32);
}
function unsubUrl(uid, kind) {
  return `https://${REGION}-koaus-f564c.cloudfunctions.net/mailUnsub?u=${encodeURIComponent(uid)}&k=${kind}&t=${unsubToken(uid, kind)}`;
}
// 메일 틀 — 발신자 표시 + 수신거부 링크(Spam Act). 디자인은 단순하게(스팸 점수 방어).
function wrapHtml(title, bodyHtml, uid, kind) {
  const unsub = unsubUrl(uid, kind);
  return `<!doctype html><html lang="ko"><body style="margin:0;background:#f4f4f4;font-family:-apple-system,'Noto Sans KR',Arial,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="font-size:20px;font-weight:900;letter-spacing:-.02em;margin-bottom:14px;">KoAus</div>
    <div style="background:#fff;border:1px solid #e3e3e3;border-radius:14px;padding:20px 18px;">
      <div style="font-size:17px;font-weight:800;margin:0 0 12px;">${escHtml(title)}</div>
      ${bodyHtml}
    </div>
    <div style="font-size:12px;color:#777;line-height:1.6;margin-top:14px;">
      이 메일은 KoAus(koaus.com.au)에서 회원님이 설정한 알림에 따라 보냈습니다. 답장은 받지 않습니다.<br>
      알림을 받지 않으려면 <a href="${unsub}" style="color:#555;">여기서 끄거나</a> 사이트의 환경설정에서 바꿀 수 있습니다.<br>
      KoAus Community · Queensland, Australia · koaus.official@gmail.com
    </div>
  </div></body></html>`;
}
async function enqueue(mail) {
  // mail: {to, uid, kind, subject, html, text, sendAfter?: Timestamp, dedupeKey?}
  if (!mail.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.to)) return;
  const ref = mail.dedupeKey ? db().collection('mail_queue').doc(mail.dedupeKey) : db().collection('mail_queue').doc();
  if (mail.dedupeKey) {
    const ex = await ref.get();
    if (ex.exists && ex.data().status === 'pending') return;   // 같은 대화 등 — 이미 대기 중이면 한 통만
  }
  await ref.set({
    to: mail.to, uid: mail.uid, kind: mail.kind, subject: String(mail.subject).slice(0, 200),
    html: mail.html, text: String(mail.text || '').slice(0, 5000),
    sendAfter: mail.sendAfter || FV.serverTimestamp(),
    status: 'pending', attempts: 0, createdAt: FV.serverTimestamp(),
    chatId: mail.chatId || null,
  });
}
async function sendViaResend(doc) {
  const d = doc.data();
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: MAIL_FROM.value(), to: [d.to], subject: d.subject, html: d.html, text: d.text || undefined,
      headers: { 'List-Unsubscribe': `<${unsubUrl(d.uid, d.kind)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`resend ${r.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body.id || '';
}

// ── 알림 설정 읽기 ──
async function seekerAlert(uid) {
  const s = await db().doc(`seeker_private/${uid}`).get().catch(() => null);
  const a = (s && s.exists && s.data().alerts) || null;
  if (!a || a.enabled === false) return null;
  const mode = a.mode || 'threshold5';
  if (mode === 'off') return null;
  const email = a.email || (await admin.auth().getUser(uid).then(u => u.email).catch(() => ''));
  return email ? { mode, email } : null;
}
async function chatNotify(uid) {
  const u = await db().doc(`users/${uid}`).get().catch(() => null);
  const n = (u && u.exists && u.data().notify) || {};
  const mode = n.mode || 'instant';   // instant | 10m | 30m | 1h | 2h | 5h | daily | off
  if (mode === 'off') return null;
  const email = (u && u.exists && u.data().email) || (await admin.auth().getUser(uid).then(x => x.email).catch(() => ''));
  return email ? { mode, dailyAt: n.dailyAt || '08:30', email } : null;
}

// ── ① 조건 맞는 방 — accom/rent 새 글 ──
const POST_OPTS = { region: REGION, maxInstances: 3, retry: false };
async function onNewListing(event, board) {
  const snap = event.data; if (!snap) return;
  const p = snap.data() || {};
  if (p.status && p.status !== 'approved') return;
  if ((p.mode || 'offer') !== 'offer') return;
  const st = String(p.state || '').toLowerCase();
  const lat = Number(p.lat), lng = Number(p.lng);
  if (!st || !lat || !lng) return;
  const price = Number(p.price) || 0;
  const q = await db().collection('seeker_profiles').where('states', 'array-contains', st).where('visible', '==', true).orderBy('lastActiveAt', 'desc').limit(100).get();
  const postId = event.params.postId;
  const title = String(p.title || '').slice(0, 80);
  const suburb = String(p.suburb || '').trim() || suburbFromAddress(p.address);
  const link = `${SITE}/${board === 'rent_posts' ? 'rent' : 'accom'}.html?id=${encodeURIComponent(postId)}`;
  for (const d of q.docs) {
    const s = d.data() || {}; const uid = d.id;
    if (uid === (p.uid || p.authorUid)) continue;
    if (s.pausedAt || s.status === 'found') continue;
    let km = null;
    (Array.isArray(s.suburbs) ? s.suburbs : []).forEach(x => { if (typeof x.lat === 'number' && typeof x.lng === 'number') { const k = kmBetween({ lat, lng }, x); if (km == null || k < km) km = k; } });
    const radius = Number(s.radiusKm) || 5;
    if (km == null || km > radius) continue;
    if (price && (s.budgetMin != null || s.budgetMax != null)) {
      if (s.budgetMin != null && price < Number(s.budgetMin)) continue;
      if (s.budgetMax != null && price > Number(s.budgetMax)) continue;
    }
    const al = await seekerAlert(uid); if (!al) continue;
    const item = { postId, board, title, price, suburb, km: Math.round(km * 10) / 10, link, at: Date.now() };
    if (al.mode === 'instant') {
      await enqueue({ to: al.email, uid, kind: 'listing', subject: `[KoAus] 조건에 맞는 방이 올라왔습니다 — ${title}`,
        html: wrapHtml('조건에 맞는 방이 올라왔습니다', listingItemsHtml([item]), uid, 'listing'),
        text: `${title} · 주 $${price} · ${suburb} · 약 ${item.km}km\n${link}` });
    } else {
      // threshold5 / daily → mail_digest/{uid}
      const ref = db().doc(`mail_digest/${uid}`);
      await db().runTransaction(async tx => {
        const cur = await tx.get(ref);
        const items = (cur.exists && Array.isArray(cur.data().items) ? cur.data().items : []).filter(x => x.postId !== postId).slice(-19);
        items.push(item);
        tx.set(ref, { items, mode: al.mode, email: al.email, updatedAt: FV.serverTimestamp() }, { merge: true });
      });
      if (al.mode === 'threshold5') await flushDigest(uid, 5);
    }
  }
}
function suburbFromAddress(addr) {   // "12 Main St, Sunnybank QLD 4109" / "Sunnybank QLD" → "Sunnybank"
  const m = String(addr || '').match(/([A-Za-z][A-Za-z' .-]{1,40}?)\s*,?\s+(QLD|NSW|VIC|WA|SA|TAS|ACT|NT)\b/i);
  if (!m) return '';
  return m[1].replace(/^.*,\s*/, '').replace(/^\d+[A-Za-z]?\s+/, '').trim().slice(0, 40);
}
function listingItemsHtml(items) {
  return items.map(it => `<div style="padding:10px 0;border-top:1px solid #eee;">
    <a href="${it.link}" style="color:#111;font-weight:700;text-decoration:none;font-size:15px;">${escHtml(it.title)}</a>
    <div style="font-size:13px;color:#555;margin-top:3px;">주 $${escHtml(it.price)}${it.suburb ? ' · ' + escHtml(it.suburb) : ''}${it.km != null ? ' · 내 동네에서 약 ' + escHtml(it.km) + 'km' : ''}</div>
  </div>`).join('') + `<div style="margin-top:14px;"><a href="${SITE}/accom.html" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700;font-size:14px;">조건에 맞는 방 보러 가기</a></div>`;
}
async function flushDigest(uid, minCount) {
  const ref = db().doc(`mail_digest/${uid}`);
  const snap = await ref.get(); if (!snap.exists) return;
  const d = snap.data() || {}; const items = Array.isArray(d.items) ? d.items : [];
  if (items.length < (minCount || 1) || !d.email) return;
  await enqueue({ to: d.email, uid, kind: 'listing', subject: `[KoAus] 조건에 맞는 방 ${items.length}건이 올라왔습니다`,
    html: wrapHtml(`조건에 맞는 방 ${items.length}건`, listingItemsHtml(items), uid, 'listing'),
    text: items.map(it => `${it.title} · 주 $${it.price} · ${it.link}`).join('\n') });
  await ref.set({ items: [], lastSentAt: FV.serverTimestamp() }, { merge: true });
}
exports.onAccomPostCreated = onDocumentCreated({ ...POST_OPTS, document: 'accom_posts/{postId}', secrets: [RESEND_API_KEY] }, e => onNewListing(e, 'accom_posts'));
exports.onRentPostCreated  = onDocumentCreated({ ...POST_OPTS, document: 'rent_posts/{postId}',  secrets: [RESEND_API_KEY] }, e => onNewListing(e, 'rent_posts'));

// ── ② 채팅 새 메시지 — 받는 쪽 설정대로, 대화당 한 통 ──
const DELAY_MS = { '10m': 10 * 60e3, '30m': 30 * 60e3, '1h': 3600e3, '2h': 2 * 3600e3, '5h': 5 * 3600e3 };
exports.onChatMessageCreated = onDocumentCreated({ ...POST_OPTS, document: 'chats/{chatId}/messages/{msgId}', secrets: [RESEND_API_KEY] }, async (event) => {
  const m = event.data && event.data.data(); if (!m || !m.senderUid) return;
  const chatId = event.params.chatId;
  const chat = await db().doc(`chats/${chatId}`).get().catch(() => null);
  if (!chat || !chat.exists) return;
  const c = chat.data() || {};
  const to = (Array.isArray(c.participants) ? c.participants : []).find(u => u !== m.senderUid);
  if (!to) return;
  if (Array.isArray(c.blockedBy) && c.blockedBy.includes(to)) return;
  const n = await chatNotify(to); if (!n) return;
  // 발신자 닉네임: 메시지 보낸 사람이 글쓴이면 ownerNick, 문의자면 inquirerNick
  const nick = m.senderUid === c.ownerUid ? (c.ownerNick || '상대방') : (c.inquirerNick || '상대방');
  const preview = String(m.text || (m.imageUrls ? '사진' : '')).replace(/\s+/g, ' ').slice(0, 80);
  const link = `${SITE}/chat.html?id=${encodeURIComponent(chatId)}`;
  const title = String(c.postTitle || '').slice(0, 60);
  let sendAfter = null;
  if (n.mode === 'daily') {
    // 다음 hh:mm(시드니) — mailPump 가 매 10분 돌며 due 된 것만 보냄
    sendAfter = nextDaily(n.dailyAt);
  } else if (DELAY_MS[n.mode]) {
    sendAfter = admin.firestore.Timestamp.fromMillis(Date.now() + DELAY_MS[n.mode]);
  }
  await enqueue({
    to: n.email, uid: to, kind: 'chat', chatId,
    dedupeKey: `chat_${chatId}_${to}`,   // 대화당 한 통(대기 중이면 추가 안 함)
    subject: `[KoAus] ${nick}님의 새 메시지${title ? ' — ' + title : ''}`,
    html: wrapHtml(`${escHtml(nick)}님이 메시지를 보냈습니다`,
      `<div style="font-size:14px;color:#333;line-height:1.6;">${title ? '<div style="color:#777;font-size:13px;margin-bottom:6px;">' + escHtml(title) + '</div>' : ''}<div style="background:#f6f6f6;border-radius:10px;padding:12px;">${escHtml(preview) || '(내용 없음)'}</div></div>
       <div style="margin-top:14px;"><a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700;font-size:14px;">채팅 열기</a></div>`, to, 'chat'),
    text: `${nick}: ${preview}\n${link}`,
    sendAfter,
  });
});
function nextDaily(hm) {
  const [h, mi] = String(hm || '08:30').split(':').map(x => parseInt(x, 10) || 0);
  const now = new Date();
  // 시드니 기준 오늘/내일 h:mi 를 UTC 로 환산 — Intl 로 현재 시드니 시각 알아내서 차이 계산
  const cur = sydney(now); const [ch, cm] = cur.hm.split(':').map(x => parseInt(x, 10));
  let diffMin = (h * 60 + mi) - (ch * 60 + cm);
  if (diffMin <= 0) diffMin += 24 * 60;
  return admin.firestore.Timestamp.fromMillis(now.getTime() + diffMin * 60e3);
}

// ── 큐 처리 — 10분마다: due 된 메일 발송(하루 95통 캡), 채팅은 아직 안 읽었을 때만, daily 다이제스트 08:00 ──
exports.mailPump = onSchedule({ region: REGION, schedule: 'every 10 minutes', timeZone: TZ, secrets: [RESEND_API_KEY], maxInstances: 1, retryCount: 0 }, async () => {
  const { ymd, hm } = sydney();
  // 1) 일일 다이제스트(새 매물 daily) — 08:00~08:09 창
  if (hm >= '08:00' && hm < '08:10') {
    const ds = await db().collection('mail_digest').where('mode', '==', 'daily').limit(200).get();
    for (const d of ds.docs) { try { await flushDigest(d.id, 1); } catch (e) { console.warn('[mailPump] digest', d.id, e.message); } }
  }
  // 2) 큐
  const metaRef = db().doc('mail_meta/daily');
  const meta = await metaRef.get(); let sentToday = (meta.exists && meta.data().ymd === ymd) ? (meta.data().count || 0) : 0;
  if (sentToday >= DAILY_CAP) return;
  const due = await db().collection('mail_queue').where('status', '==', 'pending').where('sendAfter', '<=', admin.firestore.Timestamp.now()).orderBy('sendAfter').limit(40).get();
  for (const doc of due.docs) {
    if (sentToday >= DAILY_CAP) break;
    const d = doc.data();
    try {
      if (d.kind === 'chat' && d.chatId) {
        // 그 사이 읽었으면 보내지 않음
        const c = await db().doc(`chats/${d.chatId}`).get();
        const unread = c.exists && Array.isArray(c.data().unreadFor) && c.data().unreadFor.includes(d.uid);
        if (!unread) { await doc.ref.set({ status: 'skipped', reason: 'read', sentAt: FV.serverTimestamp() }, { merge: true }); continue; }
      }
      const id = await sendViaResend(doc);
      sentToday += 1;
      await doc.ref.set({ status: 'sent', providerId: id, sentAt: FV.serverTimestamp() }, { merge: true });
      await metaRef.set({ ymd, count: sentToday, updatedAt: FV.serverTimestamp() }, { merge: true });
    } catch (e) {
      const attempts = (d.attempts || 0) + 1;
      const quota = /429|quota|rate/i.test(String(e.message));
      await doc.ref.set({ attempts, lastError: String(e.message).slice(0, 300), status: (attempts >= 5 && !quota) ? 'failed' : 'pending',
        sendAfter: admin.firestore.Timestamp.fromMillis(Date.now() + (quota ? 6 * 3600e3 : 30 * 60e3)) }, { merge: true });
      if (quota) break;   // 한도면 오늘은 그만
    }
  }
});

// ── 수신거부(로그인 없이) — 링크의 HMAC 토큰 검증 → 그 종류 알림 끔 ──
exports.mailUnsub = onRequest({ region: REGION, secrets: [RESEND_API_KEY], maxInstances: 2 }, async (req, res) => {
  const uid = String(req.query.u || req.body?.u || '').slice(0, 128), kind = String(req.query.k || req.body?.k || ''), t = String(req.query.t || req.body?.t || '');
  const ok = uid && ['listing', 'chat'].includes(kind) && t && t === unsubToken(uid, kind);
  res.set('Content-Type', 'text/html; charset=utf-8');
  if (!ok) { res.status(400).send('<p style="font-family:sans-serif">링크가 올바르지 않습니다.</p>'); return; }
  try {
    if (kind === 'listing') await db().doc(`seeker_private/${uid}`).set({ alerts: { enabled: false, mode: 'off' }, updatedAt: FV.serverTimestamp() }, { merge: true });
    else await db().doc(`users/${uid}`).set({ notify: { mode: 'off' } }, { merge: true });
    res.status(200).send(`<p style="font-family:sans-serif;padding:24px">${kind === 'listing' ? '새 매물 알림' : '채팅 알림'} 메일을 껐습니다. 다시 받으려면 KoAus 환경설정에서 켜 주십시오.</p>`);
  } catch (e) { res.status(500).send('<p style="font-family:sans-serif">처리하지 못했습니다. 잠시 후 다시 시도해 주십시오.</p>'); }
});

// ── 회원 목록 → Resend 오디언스 동기화(관리자) — 공지는 Resend Broadcasts 에서 수신거부 링크({{{RESEND_UNSUBSCRIBE_URL}}}) 넣어 발송 ──
const RESEND_AUDIENCE_ID = defineString('RESEND_AUDIENCE_ID', { default: '' });
exports.syncResendAudience = onCall({ ...CALL_OPTS, secrets: [RESEND_API_KEY], timeoutSeconds: 300 }, async (request) => {
  requireAdmin(request);
  const aud = RESEND_AUDIENCE_ID.value();
  if (!aud) throw new HttpsError('failed-precondition', 'RESEND_AUDIENCE_ID 가 설정되지 않았습니다.');
  let added = 0, skipped = 0, failed = 0, last = null;
  const seekers = new Set((await db().collection('seeker_profiles').select().limit(2000).get()).docs.map(d => d.id));
  for (;;) {
    let q = db().collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(200);
    if (last) q = q.startAfter(last);
    const page = await q.get(); if (page.empty) break;
    for (const d of page.docs) {
      const u = d.data() || {};
      if (!u.email || u.status === 'suspended') { skipped++; continue; }
      try {
        const r = await fetch(`https://api.resend.com/audiences/${aud}/contacts`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_API_KEY.value()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: u.email, first_name: String(u.nickname || '').slice(0, 50), unsubscribed: false,
            properties: { has_profile: seekers.has(d.id) ? 'yes' : 'no', role_living: (u.roles && u.roles.living) || 'none', role_job: (u.roles && u.roles.job) || 'none' } }),
        });
        if (r.ok || r.status === 409) added++; else { failed++; }
      } catch (e) { failed++; }
    }
    last = page.docs[page.docs.length - 1];
    if (page.size < 200) break;
  }
  await writeLog('resend_sync', 'all', '', `added ${added}, skipped ${skipped}, failed ${failed}`, request);
  return { added, skipped, failed };
});
