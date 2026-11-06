import {matchesMessageSource,phoneMessagesAt,sceneMessagesAt} from './messageProvenance';
import type {RoleData,SceneData} from './types';
const place=(s:SceneData)=>({where:s.where,agreement:s.agreement,locationEvidence:s.locationEvidence});
/** Only current derived state is repaired; archives and original prose are never rewritten. */
export function reconcileSceneSources(r:RoleData):void {
 const active=new Map([...phoneMessagesAt(r,Infinity),...sceneMessagesAt(r,r.scene?.messages,Infinity)].map(m=>[m.id,m]));
 for(const event of [...r.events].reverse()){
  const change=event.sceneChange;if(!change)continue;
  if(!r.scene||r.scene.endedAt!==undefined||change.sceneId!==r.scene.id)continue;
  const valid=change.sources.every(s=>matchesMessageSource(active.get(s.id),s));
  if(valid&&event.status!=='retracted'&&event.status!=='superseded')continue;
  if(!valid&&event.status!=='retracted')event.status='superseded';
  const scene=r.scene;
  if(!scene||scene.endedAt!==undefined||scene.id!==change.sceneId||JSON.stringify(place(scene))!==JSON.stringify(change.after))continue;
  scene.where=change.before.where;
  if(change.before.agreement)scene.agreement=structuredClone(change.before.agreement);else delete scene.agreement;
  if(change.before.locationEvidence)scene.locationEvidence=structuredClone(change.before.locationEvidence);else delete scene.locationEvidence;
 }
}
