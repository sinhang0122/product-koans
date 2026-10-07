/**
 * KoAus — 테스트 junk 글만 선별 삭제 (Admin SDK)
 *   삭제 = (1) 외부 유저 글 전부 + (2) 운영자 글 중 순수 테스트 junk 제목
 *   보존 = 운영자의 시드/실제 콘텐츠 (한식당·중고차·일상도움·숙소 등)
 *   node wipe-junk.js           # dry-run (안전 — 지울 목록+남길 목록 출력)
 *   node wipe-junk.js --delete  # 실제 삭제
 */
const admin=require('firebase-admin');const path=require('path');const fs=require('fs');
const f=fs.readdirSync(__dirname).find(n=>/firebase-adminsdk.*\.json$/i.test(n));
if(!f){console.error('✗ 서비스 계정 키 없음');process.exit(1);}
admin.initializeApp({credential:admin.credential.cert(require(path.resolve(__dirname,f)))});
const db=admin.firestore();

const BOARDS=['accom_posts','rent_posts','jobs_posts','auto_posts','services'];
const OP_EMAILS=['sinhang0122@gmail.com'];
const OP_UIDS=['av9b3RnYjSWrz2PoH2Z9VUfhjeP2'];
const DO_DELETE=process.argv.includes('--delete');
const lbl=d=>(d.title||d.name||d.businessName||(d.content?String(d.content).slice(0,40):'')||'(제목없음)').replace(/\s+/g,' ').trim();
const isOperator=d=>OP_EMAILS.includes((d.authorEmail||'').toLowerCase())||OP_UIDS.includes(d.uid)||OP_UIDS.includes(d.authorUid);
function isJunkTitle(t){
  const s=(t||'').trim(); if(!s) return true;
  const n=s.replace(/\s/g,'');
  if(/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(n)) return true;                 // 자모만 (ㅎㅇㅎㅇ·ㅂㅂ·ㄹㅇ·ㅗㅑ)
  if(/^(test\d*|ttest|tttest|hi|hihi|hello|ㄱㄱ|ㅇㅇ|asdf|qwer|굿굿|cafe|예>)$/i.test(s)) return true;
  if(n.length<=4 && !/[0-9]/.test(n) && /(.)\1/.test(n)) return true; // 짧고 반복 (ㅗㅑㅗㅑ)
  if(n.length<=2) return true;                              // 2자 이하 초단문
  return false;
}
(async()=>{
  const del=[],keep=[];
  for(const c of BOARDS){const s=await db.collection(c).get();
    for(const x of s.docs){const d=x.data();const op=isOperator(d);
      const reason=!op?'외부유저':(isJunkTitle(lbl(d))?'테스트junk':null);
      const row=`${c} | ${lbl(d)} | ${op?'운영자':'외부유저'} | status=${d.status||'-'} | ${x.id}`;
      if(reason) del.push({ref:x.ref,row:`[${reason}] `+row}); else keep.push(row);}}
  console.log(`\n===== 삭제 후보 ${del.length}건 =====`);del.forEach(o=>console.log('  ✗ '+o.row));
  console.log(`\n===== 보존(남김) ${keep.length}건 =====`);keep.forEach(r=>console.log('  ○ '+r));
  if(DO_DELETE){for(const o of del){const pd=await o.ref.collection('private_data').get();
      for(const p of pd.docs) await p.ref.delete(); await o.ref.delete();}
    console.log(`\n✅ ${del.length}건 삭제 완료 · 보존 ${keep.length}건`);}
  else console.log(`\n(dry-run — '삭제 후보' 확인 후 실제 삭제하려면 --delete)`);
  process.exit(0);
})().catch(e=>{console.error('✗ 실패:',e.message||e);process.exit(1);});
