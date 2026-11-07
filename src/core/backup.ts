import {ensureFocusStateNormalized} from './focus';
import {buildBackupPayload,validateBackupAttachments,verifyBackupMedia} from './media';
import {normalizeStoredWorld,validateStoredWorld} from './storageSession';
import type {AppData} from './types';

export function readBackupFile(file:File):Promise<string> {
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=reader.onabort=()=>reject(Error('无法读取备份文件。'));
  reader.readAsText(file);
 });
}

export function prepareBackup(text:string) {
 let parsed:unknown;
 try{parsed=JSON.parse(text);}
 catch{throw Error('无法识别此备份文件，请选择 Elsewhere 导出的备份。');}
 const record=validateStoredWorld(parsed);
 const attachments=validateBackupAttachments(record._media);
 delete record._media;
 delete record._backupIntegrity;
 const world=normalizeStoredWorld(record);
 world.focus=ensureFocusStateNormalized(world.focus,world.roles);
 if(world.focus.active)delete world.focus.active.liveLogBusy;
 world.selected=null;
 delete world.draftWorldId;
 validateStoredWorld(world);
 const attachmentCount=verifyBackupMedia(world,attachments);
 return {world,attachments,attachmentCount};
}

export function backupImpact(backup:ReturnType<typeof prepareBackup>,overwrites:boolean):string {
 const contents=`备份校验通过，包含 ${backup.world.roles.length} 个角色和 ${backup.attachmentCount} 个附件。`;
 return contents+(overwrites?'确认后会替换本机主档。建议先导出原有数据。':'确认后会将备份保存到本机。');
}

function download(blob:Blob,name:string):void {
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;
 link.download=name;
 link.click();
 setTimeout(()=>URL.revokeObjectURL(url),500);
}

export function downloadRawSave(raw:string):void {
 const utf8=new TextEncoder().encode(raw);
 if(new TextDecoder('utf-8',{ignoreBOM:true}).decode(utf8)===raw){
  download(new Blob([utf8],{type:'text/plain;charset=utf-8'}),'elsewhere-raw-save.txt');
  return;
 }
 // Preserve unpaired UTF-16 code units even in corrupt input.
 const bytes=new ArrayBuffer(2+raw.length*2),view=new DataView(bytes);
 view.setUint16(0,0xfeff,true);
 for(let i=0;i<raw.length;i++)view.setUint16(2+i*2,raw.charCodeAt(i),true);
 download(new Blob([bytes],{type:'text/plain;charset=utf-16le'}),'elsewhere-raw-save-utf16.txt');
}

export async function downloadBackup(data:AppData,name:string):Promise<string> {
 const {payload,missingCount}=await buildBackupPayload(data);
 if(missingCount&&!window.confirm(`缺少 ${missingCount} 个附件。抢救性不完整备份会保留可读取的数据，但当前可能无法直接恢复为完整世界。仍要下载吗？`)){
  return '已取消导出不完整备份。';
 }
 const filename=missingCount?name.replace(/\.json$/i,'-不完整.json'):name;
 download(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),filename);
 return missingCount?`已发起抢救性不完整备份下载，缺少 ${missingCount} 个附件。`:'附件齐全，已发起完整备份下载。';
}
