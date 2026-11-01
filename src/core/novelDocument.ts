import type {ChatMessage} from './types';
import type {FruitProfile} from './fruit/types';
export const NOVEL_SECTION_TYPES=['content','novel_header','status_bar','prologue','角色状态面板','meow_fm','profile','branches'] as const;
export type NovelSectionType=typeof NOVEL_SECTION_TYPES[number];
export interface NovelSection {type:NovelSectionType;text:string}
export interface NovelDocument {
 schema:1;roleId:string;stageId:string;messageId:string;mode:'meeting'|'theatre';revisionCount:number;createdAt:number;presetId:string;presetHash:string;sections:NovelSection[];
}
/** Linear token scan, not a regex that backtracks over unclosed model output. */
export function readNovelSections(input:string):{sections:NovelSection[];invalid:boolean}{
 const lower=input.replace(/[A-Z]/g,c=>c.toLowerCase()),sections:NovelSection[]=[];let cursor=0,exampleDepth=0,active:{type:NovelSectionType;start:number}|undefined;
 while(cursor<input.length){const at=lower.indexOf('<',cursor);if(at<0)break;cursor=at+1;const closing=lower[at+1]==='/',prefix=at+(closing?2:1);
  const type=NOVEL_SECTION_TYPES.find(t=>lower.startsWith(t,prefix)&&(prefix+t.length===lower.length||/^[\s/>]$/.test(lower[prefix+t.length]||'')));if(!type)continue;
  const end=prefix+type.length;if(lower[end]!=='>')return {sections:[],invalid:true};cursor=end+1;
  if(active&&['meow_fm','profile','branches'].includes(active.type)&&type==='content'){if(closing){if(!exampleDepth)return {sections:[],invalid:true};exampleDepth--;}else exampleDepth++;continue;}
  if(closing){if(exampleDepth)return {sections:[],invalid:true};if(!active||active.type!==type)return {sections:[],invalid:true};if(sections.length>=256)return {sections:[],invalid:true};sections.push({type,text:input.slice(active.start,at).trim()});active=undefined;}
  else{if(active)return {sections:[],invalid:true};active={type,start:cursor};}
 }
 return active?{sections:[],invalid:true}:{sections,invalid:false};
}
export function permittedNovelSections(sections:NovelSection[],profile:FruitProfile):NovelSection[]{
 return sections.filter(s=>s.type==='content'||(['novel_header','status_bar','prologue','角色状态面板'].includes(s.type)?profile.output.scene:s.type==='meow_fm'?profile.output.summary:profile.output.characters)).map(s=>({...s}));
}
export function bindNovelDocument(sections:NovelSection[],owner:Omit<NovelDocument,'schema'|'sections'>):NovelDocument{
 if(!owner.roleId||!owner.stageId||!owner.messageId||!owner.presetId||!/^[a-f0-9]{64}$/.test(owner.presetHash)||!Number.isFinite(owner.createdAt)||!Number.isInteger(owner.revisionCount)||owner.revisionCount<0)throw new Error('小说展示来源无效');
 return {schema:1,...owner,sections:sections.map(s=>({...s}))};
}
export function validNovelDocument(message:ChatMessage,roleId:string,stageId:string,mode:'meeting'|'theatre'):NovelDocument|null{
 const d=message.novelOutput?.document;
 if(!d||d.schema!==1||message.speaker!=='char'||message.status==='retracted'||message.editedAt||d.roleId!==roleId||d.stageId!==stageId||d.mode!==mode||d.messageId!==message.id||d.revisionCount!==(message.revisionCount||0)||d.createdAt!==message.at||d.presetId!==message.novelOutput?.presetId||!/^[a-f0-9]{64}$/.test(d.presetHash)||!Array.isArray(d.sections)||d.sections.length>256)return null;
 if(d.sections.some(s=>!s||typeof s!=='object'||!NOVEL_SECTION_TYPES.includes(s.type)||typeof s.text!=='string')||d.sections.reduce((n,s)=>n+s.text.length,0)>500000||d.sections.filter(s=>s.type==='content').map(s=>s.text).join('\n\n')!==message.text)return null;
 return d;
}
