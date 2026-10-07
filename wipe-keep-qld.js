/**
 * KoAus — QLD 쉐어(accom)만 보존, 나머지 전부 삭제 (Admin SDK)
 *   node wipe-keep-qld.js          # dry-run (안전)
 *   node wipe-keep-qld.js --delete # 실삭제
 */
const admin=require('firebase-admin');const path=require('path');const fs=require('fs');
const f=fs.readdirSync(__dirname).find(n=>/firebase-adminsdk.*\.json$/i.test(n));
if(!f){console.error('✗ 키 없음');process.exit(1);}
admin.initializeApp({credential:admin.credential.cert(require(path.resolve(__dirname,f)))});
const db=admin.firestore();
const BOARDS=['accom_posts','rent_posts','jobs_posts','auto_posts','services'];
const DO_DELETE=process.argv.includes('--delete');
const lbl=d=>(d.title||d.name||d.businessName||(d.content?String(d.content).slice(0,40):'')||'(제목없음)').replace(/\s+/g,' ').trim();
const stateOf=d=>(d.state||d.region||d.stateCode||'').toString().toLowerCase();
const isQldShare=(c,d)=> c==='accom_posts' && stateOf(d)==='qld';
(async()=>{
  const del=[],keep=[];
  for(const c of BOARDS){const s=await db.collection(c).get();
    for(const x of s.docs){const d=x.data();
      const row=`${c} | ${lbl(d)} | state=${stateOf(d)||'?'} | status=${d.status||'-'} | ${x.id}`;
      if(isQldShare(c,d)) keep.push(row); else del.push({ref:x.ref,row});}}
  console.log(`\n===== 보존(QLD 쉐어) ${keep.length}건 =====`);keep.forEach(r=>console.log('  ○ '+r));
  console.log(`\n===== 삭제 후보 ${del.length}건 =====`);del.forEach(o=>console.log('  ✗ '+o.row));
  console.log('\n--- 참고: accom_posts 전체 state 필드 (QLD 누락 점검) ---');
  const a=await db.collection('accom_posts').get();
  a.forEach(x=>{const d=x.data();console.log(`   accom | ${lbl(d)} | state=${stateOf(d)||'(없음)'} | suburb=${d.suburb||d.address||d.location||'?'} | ${x.id}`);});
  if(DO_DELETE){for(const o of del){const pd=await o.ref.collection('private_data').get();for(const p of pd.docs)await p.ref.delete();await o.ref.delete();}
    console.log(`\n✅ ${del.length}건 삭제 · 보존 ${keep.length}건`);}
  else console.log(`\n(dry-run — 확인 후 --delete)`);
  process.exit(0);
})().catch(e=>{console.error('✗',e.message||e);process.exit(1);});
