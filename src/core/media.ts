import type { AppData } from './types';
import {makeUid} from './revisions';

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

export async function mediaAddMany(items: {id:string;blob:Blob}[]): Promise<void> {
  if (!items.length) return;
  const db = await mediaDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite', {durability:'strict'});
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error('媒体暂存失败'));
      const store = tx.objectStore(MEDIA_STORE);
      try {
        // Only add new IDs. A collision aborts the entire stage.
        for (const {id,blob} of items) store.add(blob,id);
      } catch {
        tx.abort();
      }
    });
  } finally {
    db.close();
  }
}

export function mediaPut(id: string, blob: Blob): Promise<void> {
  return mediaAddMany([{id,blob}]);
}

export async function mediaGet(id: string): Promise<Blob | undefined> {
  const db = await mediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const q = tx.objectStore(MEDIA_STORE).get(id);
    q.onsuccess = () => resolve(q.result as Blob | undefined);
    q.onerror = () => reject(q.error);
    tx.oncomplete = () => db.close();
    tx.onabort = tx.onerror = () => db.close();
  });
}

const mediaFields = new Set(['mediaId','avatarMediaId','frameMediaId','wallpaperMediaId']);

/** Include stored message copies and archives, even when they are not currently displayed. */
function* mediaReferences(world: unknown): Generator<{record:Record<string,unknown>;key:string;id:string}> {
  const pending: unknown[] = [world];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) pending.push(value[i]);
      continue;
    }
    const record = value as Record<string,unknown>;
    for (const [key,field] of Object.entries(record)) {
      if (!mediaFields.has(key)) pending.push(field);
      else if (typeof field === 'string' && field) yield {record,key,id:field};
      else if (field != null && typeof field !== 'string') throw Error('存档附件引用无效');
    }
  }
}

export function collectReferencedMediaIds(data: AppData): string[] {
  return [...new Set(Array.from(mediaReferences(data),ref=>ref.id))];
}

export async function buildBackupPayload(data: AppData) {
  const pack = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  delete pack._media;
  delete pack._backupIntegrity;
  const mediaArr: { id: string; data: string }[] = [];
  const ids = [...new Set(Array.from(mediaReferences(pack),ref=>ref.id))];
  let missingCount=0;
  for (const id of ids) {
    try{
      const media=await mediaGet(id);
      if(!media){missingCount++;continue;}
      const uri=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result));
        reader.onerror=reader.onabort=()=>reject(Error('附件无法读取'));
        reader.readAsDataURL(media);
      });
      mediaArr.push(...validateBackupAttachments([{id,data:uri}]));
    }catch{missingCount++;}
  }
  pack._media = mediaArr;
  if(missingCount)pack._backupIntegrity={status:'incomplete',missingMediaCount:missingCount};
  return {payload:pack,missingCount};
}

export type BackupAttachment = { id: string; data: string };

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

export function verifyBackupMedia(candidate:AppData,attachments:BackupAttachment[]):number {
  const available=new Set(attachments.map(item=>item.id));
  const ids=collectReferencedMediaIds(candidate);
  const missing=ids.filter(id=>!available.has(id)).length;
  if(missing)throw Error(`备份缺少 ${missing} 个存档引用的附件，无法恢复为完整世界。`);
  return ids.length;
}

export async function stageBackupMedia(candidate: AppData, attachments: BackupAttachment[]): Promise<void> {
  const refs = [...mediaReferences(candidate)];
  const byId = new Map(attachments.map(item=>[item.id,item.data]));
  const ids = [...new Set(refs.map(ref=>ref.id))];
  verifyBackupMedia(candidate,attachments);

  const mapping = new Map<string,string>();
  const staged: {id:string;blob:Blob}[] = [];
  for (const oldId of ids) {
    const response = await fetch(byId.get(oldId)!);
    if (!response.ok) throw Error('备份附件无法读取。');
    const id = makeUid('media');
    staged.push({id,blob:await response.blob()});
    mapping.set(oldId,id);
  }
  await mediaAddMany(staged);
  // shortcut: Keep both generations until an exclusive writer can verify all retained references.
  for (const {record,key,id} of refs) record[key] = mapping.get(id)!;
}
