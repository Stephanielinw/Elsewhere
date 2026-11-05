import type { AppData } from './types';

const MEDIA_DB = 'elsewhere-media-v1';
const MEDIA_STORE = 'blobs';

/** Runtime URLs only. Original Blobs remain in the existing media store. */
export function createMediaSources(read:(id:string)=>Promise<Blob|undefined>){
 type Source={url?:string;pending?:Promise<string|undefined>;decoded?:HTMLImageElement;decoding?:Promise<string|undefined>};
 const entries=new Map<string,Source>();
 const prune=(active:ReadonlySet<string>)=>{for(const[id,entry]of entries)if(!active.has(id)){if(entry.url)URL.revokeObjectURL(entry.url);entries.delete(id);}};
 return {
  get(id:string):Promise<string|undefined>{
   const prior=entries.get(id);if(prior)return prior.pending||Promise.resolve(prior.url);
   const entry:Source={};entries.set(id,entry);
   entry.pending=read(id).then(blob=>{
    if(entries.get(id)!==entry)return undefined;
    if(!blob){entries.delete(id);return undefined;}
    entry.url=URL.createObjectURL(blob);entry.pending=undefined;return entry.url;
   }).catch(error=>{if(entries.get(id)===entry)entries.delete(id);throw error;});
   return entry.pending;
  },
  async getDecoded(id:string):Promise<string|undefined>{
   const url=await this.get(id),entry=entries.get(id);
   if(!url||!entry)return undefined;
   if(entry.decoded)return url;
   if(!entry.decoding){
    const image=new Image();image.src=url;
    entry.decoding=image.decode().then(()=>{
     if(entries.get(id)!==entry)return undefined;
     entry.decoded=image;return url;
    }).catch(error=>{entry.decoding=undefined;if(entries.get(id)!==entry)return undefined;throw error;});
   }
   return entry.decoding;
  },
  peek(id:string):string|undefined {const entry=entries.get(id);return entry?.decoded?entry.url:undefined;},
  prune,clear:()=>prune(new Set()),
 };
}

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
  for (const font of data.customFonts || []) {
    if (typeof font.mediaId === 'string') rawIds.push(font.mediaId);
  }
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
    if (typeof r.wallpaperMediaId === 'string') rawIds.push(r.wallpaperMediaId);
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

type BackupAttachment = { id: string; data: string };

export function validateBackupAttachments(value: unknown): BackupAttachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw Error('备份附件清单无效');
  const ids = new Set<string>();
  for (const [index, item] of value.entries()) {
    const invalid = () => Error(`备份附件第 ${index + 1} 项格式无效`);
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(item.id) || ids.has(item.id) || typeof item.data !== 'string') throw invalid();
    const comma = item.data.indexOf(','), encoded = item.data.slice(comma + 1);
    if (comma < 0 || !/^data:(?:(?:audio|image|font)\/[a-z0-9.+-]+|application\/(?:octet-stream|font-woff|x-font-ttf|x-font-opentype))?(?:;[a-z0-9.+-]+=[a-z0-9.+-]+)*;base64$/i.test(item.data.slice(0, comma))
      || encoded.length % 4 !== 0 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded)) throw invalid();
    ids.add(item.id);
  }
  return value;
}

export async function restoreMediaFromBackup(attachments: BackupAttachment[]): Promise<void> {
  for (const item of attachments) {
    // Keep the existing media restore policy for legacy data URLs of other types.
    if (!/^data:(audio|image|font)\/[a-z0-9+.-]+;base64,/i.test(item.data)) continue;
    const blob = await (await fetch(item.data)).blob();
    await mediaPut(item.id, blob);
  }
}
