const admin=require('firebase-admin');const path=require('path');const fs=require('fs');
const f=fs.readdirSync(__dirname).find(n=>/firebase-adminsdk.*\.json$/i.test(n));
admin.initializeApp({credential:admin.credential.cert(require(path.resolve(__dirname,f)))});
const db=admin.firestore();
const BOARDS=['accom_posts','rent_posts','jobs_posts','auto_posts','services'];
const lbl=d=>(d.title||d.name||d.businessName||(d.content?String(d.content).slice(0,30):'')||'(제목없음)').replace(/\s+/g,' ').trim();
(async()=>{const by={};for(const c of BOARDS){const s=await db.collection(c).get();for(const x of s.docs){const d=x.data();const a=d.authorEmail||d.authorNickname||d.uid||'(작성자미상)';(by[a]=by[a]||[]).push(`${c} | ${lbl(d)} | status=${d.status||'-'} | ${x.id}`);}}
for(const a of Object.keys(by).sort()){console.log(`\n■ ${a} — ${by[a].length}건`);by[a].forEach(l=>console.log('   '+l));}
process.exit(0);})().catch(e=>{console.error(e);process.exit(1);});
