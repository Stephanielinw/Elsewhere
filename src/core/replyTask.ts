import type {ChatMessage,RevisionScope,RoleData} from './types';
import {getActiveMessages,getScopeMessages} from './revisions';

export function startReplyTask(roles:()=>RoleData[], generations:Map<string,number>, role:RoleData, scope:RevisionScope, message:ChatMessage):()=>boolean {
  const generation=(generations.get(role.id)||0)+1;
  generations.set(role.id,generation);
  const session=scope==='scene'?role.scene:scope==='play'?role.play:null;
  const revision=message.revisionCount||0, text=message.text;
  return ()=>roles().includes(role) && generations.get(role.id)===generation &&
    (scope==='chat' || (scope==='scene'?role.scene:role.play)===session) &&
    getActiveMessages(getScopeMessages(role,scope)).some(m=>m.id===message.id && m.speaker==='me' && (m.revisionCount||0)===revision && m.text===text);
}
