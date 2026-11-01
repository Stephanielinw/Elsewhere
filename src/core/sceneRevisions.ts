import type {RoleData,SceneData} from './types';
const place=(s:SceneData)=>({where:s.where,agreement:s.agreement,locationEvidence:s.locationEvidence});
/** Only current derived state is repaired; archives and original prose are never rewritten. */
export function reconcileSceneSources(r:RoleData):void {
 const phone=new Map(r.chats.filter(m=>!['retracted','superseded','deleted'].includes(String(m.status))).map(m=>[m.id,m]));
 const active=new Map([...r.chats,...(r.scene?.messages||[])].filter(m=>{
  if(['retracted','superseded','deleted'].includes(String(m.status)))return false;
  if(!m.sourceMessageId)return true;const source=phone.get(m.sourceMessageId);
  return source?.text===m.text&&source.at===m.at&&(source.revisionCount||0)===(m.revisionCount||0);
 }).map(m=>[m.id,m]));
 for(const event of [...r.events].reverse()){
  const change=event.sceneChange;if(!change)continue;
  if(!r.scene||r.scene.endedAt!==undefined||change.sceneId!==r.scene.id)continue;
  const valid=change.sources.every(s=>{const m=active.get(s.id);return m?.text===s.text&&m.at===s.at&&(m.revisionCount||0)===s.revisionCount;});
  if(valid&&event.status!=='retracted'&&event.status!=='superseded')continue;
  if(!valid&&event.status!=='retracted')event.status='superseded';
  const scene=r.scene;
  if(!scene||scene.endedAt!==undefined||scene.id!==change.sceneId||JSON.stringify(place(scene))!==JSON.stringify(change.after))continue;
  scene.where=change.before.where;
  if(change.before.agreement)scene.agreement=structuredClone(change.before.agreement);else delete scene.agreement;
  if(change.before.locationEvidence)scene.locationEvidence=structuredClone(change.before.locationEvidence);else delete scene.locationEvidence;
 }
}
