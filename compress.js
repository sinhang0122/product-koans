// ════════════════════════════════════════════════════════════════════
//  KoAus · 클라이언트 사이드 이미지 압축 + Firebase Storage 업로드 모듈
//  사용처: accom.html (쉐어, 최대 6장) · car-sale.html (중고차, 최대 6장)
//          mypage.html (프로필 1장 · 500px)
//  목적: 서버 비용 방어 — 원본 고용량 사진을 브라우저에서 200~300KB 로 강제 압축.
// ════════════════════════════════════════════════════════════════════

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject }
  from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js';

/**
 * Canvas API 로 원본 File 을 다운스케일 + JPEG 재인코딩.
 * @param {File} file   - <input type="file"> 으로 선택한 원본 사진
 * @param {Object} opts - { maxDim:1200, quality:0.7, mimeType:'image/jpeg' }
 * @returns {Promise<Blob>} 압축된 JPEG Blob (목표 ≈ 200–300 KB / 1200px)
 */
export function compressImage(file, opts = {}) {
  const { maxDim = 1200, quality = 0.7, mimeType = 'image/jpeg' } = opts;
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('not_image')); return; }
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

/**
 * 다중 파일 일괄 업로드 (게시글용).
 * @param {Object} app - Firebase app 인스턴스
 * @param {string} basePath - 예: 'post_images/accom/<docId>'
 * @param {FileList|File[]} files - 선택한 원본 파일들
 * @param {Object} opts - { maxDim:1200, quality:0.7, onProgress:(i,total)=>{} }
 * @returns {Promise<string[]>} 다운로드 URL 배열
 */
export async function uploadPostImages(app, basePath, files, opts = {}) {
  const { maxDim = 1200, quality = 0.7, onProgress } = opts;
  const list = Array.from(files);
  const urls = [];
  for (let i = 0; i < list.length; i++) {
    const name = `${Date.now()}-${i}.jpg`;
    const url = await uploadCompressed(app, `${basePath}/${name}`, list[i], { maxDim, quality });
    urls.push(url);
    if (typeof onProgress === 'function') onProgress(i + 1, list.length);
  }
  return urls;
}
