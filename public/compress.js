// ════════════════════════════════════════════════════════════════════
//  KoAus · 클라이언트 사이드 이미지 압축 + Firebase Storage 업로드 모듈
//  사용처: accom.html (쉐어, 최대 6장) · car-sale.html (중고차, 최대 6장)
//          mypage.html (프로필 1장 · 500px)
//  목적: 서버 비용 방어 — 원본 고용량 사진을 브라우저에서 200~300KB 로 강제 압축.
// ════════════════════════════════════════════════════════════════════

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject }
  from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js';

// ── 클라이언트 사이드 사전 검증 (입구컷) ──
//   · Storage Rules 는 서버에서 5MB + image/* 강제 (최종 업로드 결과 보호).
//   · 입구컷은 압축 파이프라인으로 넘기기 전 *원본* 파일 크기 사전 검증 — 20MB 까지 허용.
//     스마트폰 고화질 원본(10~15MB)이 압축 전에 alert 로 차단되지 않게 여유 확보.
//     Canvas 압축 후 보통 200~300KB 로 줄어들어 서버 5MB 게이트 통과 보장.
//   · 글쓰기 폼에서 호출 가능한 공용 헬퍼 — throws on rejection (UI 에서 alert + return)
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;  // 20 MB (입구컷 — 압축 전 원본 허용 한도)
export function validateImageFile(file) {
  if (!file) throw new Error('파일이 비어 있습니다.');
  if (!/^image\//.test(file.type)) {
    throw new Error(`이미지 파일만 업로드 가능합니다. (현재: ${file.type || '알 수 없음'})`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`파일이 너무 큽니다 (${mb}MB). 최대 20MB 까지 업로드 가능합니다.`);
  }
  return true;
}

/**
 * Canvas API 로 원본 File 을 다운스케일 + JPEG 재인코딩.
 * @param {File} file   - <input type="file"> 으로 선택한 원본 사진
 * @param {Object} opts - { maxDim:1200, quality:0.7, mimeType:'image/jpeg' }
 * @returns {Promise<Blob>} 압축된 JPEG Blob (목표 ≈ 200–300 KB / 1200px)
 */
export function compressImage(file, opts = {}) {
  const { maxDim = 1200, quality = 0.7, mimeType = 'image/jpeg' } = opts;
  return new Promise((resolve, reject) => {
    // 1차 사전 검증 — 원본 파일이 image/* 가 아니거나 5MB 초과면 즉시 reject
    try { validateImageFile(file); } catch (e) { reject(e); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          if (!blob) { reject(new Error('compress_fail')); return; }
          resolve(blob);
        }, mimeType, quality);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_load_fail')); };
    img.src = url;
  });
}

/** 미리보기 썸네일용 — 작은 dataURL 반환 (Storage 업로드 X) */
export function thumbDataURL(file, maxDim = 240) {
  return compressImage(file, { maxDim, quality: 0.7 }).then(blob => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload  = () => res(fr.result);
    fr.onerror = () => rej(new Error('read_fail'));
    fr.readAsDataURL(blob);
  }));
}

/** Firebase Storage 업로드 — 압축된 blob 을 지정 경로에 저장하고 다운로드 URL 반환 */
export async function uploadCompressed(app, storagePath, file, compressOpts = {}) {
  const blob = await compressImage(file, compressOpts);
  const storage = getStorage(app);
  const r = storageRef(storage, storagePath);
  await uploadBytes(r, blob, { contentType: compressOpts.mimeType || 'image/jpeg' });
  return await getDownloadURL(r);
}

/** Storage 객체 삭제 (실패는 무시 — 베스트 에포트) */
export async function deleteFromStorage(app, storagePath) {
  try {
    const storage = getStorage(app);
    await deleteObject(storageRef(storage, storagePath));
    return true;
  } catch (_) { return false; }
}

// 파일명 난독화 — 사용자 입력 원본 파일명을 절대 보존하지 않음.
//   · 의도: 파일명에 포함된 잠재적 XSS payload / path traversal / PII 차단 + 추측 공격 방어.
//   · 패턴: `${Date.now()}-${crypto.randomUUID()}.jpg` → 충돌 확률 사실상 0 + 시간 정렬 가능.
//   · crypto.randomUUID 미지원 환경(legacy 브라우저) fallback: Math.random + Date.now 조합.
function randomFilename() {
  let uuid;
  try {
    uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  } catch (_) {
    uuid = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  return `${Date.now()}-${uuid}.jpg`;
}

/**
 * 다중 파일 일괄 업로드 (게시글용).
 *   · 업로드 전 전체 파일 사전 검증 (size + type) — 한 장이라도 실패하면 즉시 throws.
 *   · 파일명은 crypto.randomUUID() 기반 난독화로 자동 치환 (원본 파일명 절대 미보존).
 * @param {Object} app - Firebase app 인스턴스
 * @param {string} basePath - 예: 'post_images/accom/<docId>'
 * @param {FileList|File[]} files - 선택한 원본 파일들
 * @param {Object} opts - { maxDim:1200, quality:0.7, onProgress:(i,total)=>{} }
 * @returns {Promise<string[]>} 다운로드 URL 배열
 */
export async function uploadPostImages(app, basePath, files, opts = {}) {
  const { maxDim = 1200, quality = 0.7, onProgress } = opts;
  const list = Array.from(files);
  // 사전 일괄 검증 — 한 장이라도 5MB 초과 / image/* 아니면 업로드 시작 전 차단
  list.forEach(validateImageFile);
  const urls = [];
  for (let i = 0; i < list.length; i++) {
    const name = randomFilename();
    const url = await uploadCompressed(app, `${basePath}/${name}`, list[i], { maxDim, quality });
    urls.push(url);
    if (typeof onProgress === 'function') onProgress(i + 1, list.length);
  }
  return urls;
}
