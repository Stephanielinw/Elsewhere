import type {AppData,RoleData} from './types';
import {STORAGE_KEY} from './defaults';

export const NAIN_BACKUP_PREFIX='elsewhere-nain-preflight-backup-v1:';
export const NAIN_ATTEMPT_PREFIX='elsewhere-nain-preflight-attempt-v1:';
type LocalStore=Pick<Storage,'getItem'|'setItem'>;
const seed='那枚红色骰子，我收好了，妈咪。\n\n你让我记得写信，却没告诉我该寄到哪里去。';

export function isUntouchedNainDemo(role:RoleData):boolean {
  return role.name==='奈恩'&&role.demoSample===true&&!role.demoStartResetAt&&role.chats.length===1&&
    role.chats[0].speaker==='char'&&role.chats[0].text===seed&&!role.chats[0].proactive&&
    !role.chats[0].editedAt&&!role.chats[0].revisionCount&&role.chats[0].status!=='retracted'&&!role.messageRevisions?.length&&
    !role.scene&&!role.play&&!role.plays.length&&!role.meetings?.length&&!role.pendingReplies?.length&&
    role.diaries.every(d=>d.speaker==='char'&&d.source==='life')&&
    role.events.every(e=>e.kind==='life'||e.messageId===role.chats[0].id)&&
    !Object.values(role.footprintsByDate||{}).some(a=>a.aiGeneratedAt);
}

export function resetNainStart(data:AppData,roleId:string,storage:LocalStore,at=Date.now(),original=JSON.stringify(data)) {
  const role=data.roles.find(r=>r.id===roleId);
  if(!role||role.name!=='奈恩'||role.demoStartResetAt)return {data,cleaned:false};
  if(data.focus?.active&&(data.focus.active.ownerId===role.id||data.focus.active.participantRoleIds?.includes(role.id)))return {data,cleaned:false,error:'请先结束奈恩参与的专注，再执行清档。'};
  const clean:RoleData={...role,chats:[],events:[],diaries:[],plays:[],meetings:[],scene:null,play:null,
    pendingReplies:[],chatInvite:null,messageRevisions:[],diaryTasks:[],footprintsByDate:{},
    diaryDay:'',lastDiaryCheckDay:undefined,lastInvitation:0,lifeAt:at,demoStartResetAt:at,
    firstMessageState:{status:'awaiting_api',updatedAt:at}};
  const next={...data,roles:data.roles.map(r=>r.id===roleId?clean:r)};
  try {
    const key=NAIN_BACKUP_PREFIX+roleId+':'+at;
    const previous=storage.getItem(key);
    if(previous===null)storage.setItem(key,original);
    else if(previous!==original)throw new Error('恢复副本时间冲突，未覆盖');
    storage.setItem(STORAGE_KEY,JSON.stringify(next));
    return {data:next,cleaned:true};
  }catch{return {data,cleaned:false,error:'清档未完成：无法保存恢复副本或新存档，当前数据保留。'};}
}

export function migrateUntouchedNainDemo(data:AppData,storage:LocalStore,at=Date.now(),original?:string) {
  try {
    for(const r of data.roles)if(r.demoStartResetAt&&storage.getItem(NAIN_ATTEMPT_PREFIX+r.id)===null)
      storage.setItem(NAIN_ATTEMPT_PREFIX+r.id,String(r.demoStartResetAt));
    const candidates=data.roles.filter(isUntouchedNainDemo);
    const target=candidates.find(r=>r.id===data.selected)||(candidates.length===1?candidates[0]:undefined);
    if(!target)return {data,cleaned:false};
    // A restored world must not replay automatic cleanup of its restored history.
    const key=NAIN_ATTEMPT_PREFIX+target.id;
    if(storage.getItem(key)!==null)return {data,cleaned:false};
    storage.setItem(key,String(at));
    return resetNainStart(data,target.id,storage,at,original);
  }catch{return {data,cleaned:false,error:'清档未完成：无法记录一次性迁移状态，原数据保留。'};}
}
