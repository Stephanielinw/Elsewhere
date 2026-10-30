import type { AppData } from './types';

const MEDIA_DB = 'elsewhere-media-v1';
const MEDIA_STORE = 'blobs';

export function mediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return reject(new Error('此浏览器不支持媒体存储'));
    }
    const req = indexedDB.open(MEDIA_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(MEDIA_STORE)) {
        req.result.createObjectStore(MEDIA_STORE);
      }
    };
    req.onerror = () => reject(req.error || new Error('媒体数据库无法打开'));
    req.onsuccess = () => resolve(req.result);
  });
}

export async function mediaPut(id: string, blob: Blob): Promise<void> {
  const db = await mediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).put(blob, id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('媒体保存失败'));
    };
  });
}

export async function mediaGet(id: string): Promise<Blob | undefined> {
  const db = await mediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const q = tx.objectStore(MEDIA_STORE).get(id);
    q.onsuccess = () => resolve(q.result as Blob | undefined);
    q.onerror = () => reject(q.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function mediaDelete(id: string): Promise<void> {
  const db = await mediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export function collectReferencedMediaIds(data: AppData): string[] {
  const rawIds: string[] = [];
  if (data.user?.avatarMediaId && typeof data.user.avatarMediaId === 'string') {
    rawIds.push(data.user.avatarMediaId);
  }
  if (data.user?.frameMediaId && typeof data.user.frameMediaId === 'string') {
    rawIds.push(data.user.frameMediaId);
  }
  for (const cf of data.customFrames || []) {
    if (cf?.mediaId && typeof cf.mediaId === 'string') {
      rawIds.push(cf.mediaId);
    }
  }
  for (const r of data.roles || []) {
    if (r.avatarMediaId && typeof r.avatarMediaId === 'string') {
      rawIds.push(r.avatarMediaId);
    }
    if (r.frameMediaId && typeof r.frameMediaId === 'string') {
      rawIds.push(r.frameMediaId);
    }
    for (const m of r.chats || []) {
      if (m.mediaId && typeof m.mediaId === 'string') {
        rawIds.push(m.mediaId);
      }
    }
  }
  return [...new Set(rawIds.filter(Boolean))];
}

export async function buildBackupPayload(data: AppData): Promise<Record<string, unknown>> {
  const pack = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  const mediaArr: { id: string; data: string }[] = [];
  const ids = collectReferencedMediaIds(data);

  for (const id of ids) {
    const media = await mediaGet(id);
    if (!media) continue;
    const uri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(media);
    });
    mediaArr.push({ id, data: uri });
  }
  pack._media = mediaArr;
  return pack;
}

export async function restoreMediaFromBackup(
  attachments: { id: string; data: string }[] | undefined
): Promise<void> {
  if (!Array.isArray(attachments)) return;
  for (const item of attachments) {
    if (
      !item ||
      !/^[a-zA-Z0-9_-]+$/.test(String(item.id || '')) ||
      !/^data:(audio|image)\/[a-z0-9+.-]+;base64,/i.test(String(item.data || ''))
    ) {
      continue;
    }
    const blob = await (await fetch(item.data)).blob();
    await mediaPut(item.id, blob);
  }
}
