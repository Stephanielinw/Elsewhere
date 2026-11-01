import {escHtml as esc} from './core/footprints';
import type {ChatMessage} from './core/types';

export function novelAuxiliaryHtml(message:ChatMessage):string {
 const output=message.novelOutput;if(!output||message.editedAt||output.memoryEligible!==false)return '';
 let html='';
 if(output.scene)html+=`<aside class="fruit-notice" data-novel-aux="scene">${esc(output.scene)}</aside>`;
 for(const [key,title]of [['summary','剧情摘要'],['characters','人物辅助'],['choices','剧情选项'],['generatedAuxiliary','生成辅助文本（非真实内心或正式事实）']]as const){
  if(output[key])html+=`<details data-novel-aux="${key}"><summary>${title}</summary><div class="sub" style="white-space:pre-wrap">${esc(output[key])}</div></details>`;
 }
 return html;
}

export function novelMessageHtml(message:ChatMessage,roleId:string,stageId:string,mode:'meeting'|'theatre'):string {
 if(message.speaker!=='char'||!message.novelOutput||message.editedAt)return esc(message.text);
 // Display only the canonical body until the owning role's current privacy switches have loaded.
 return `<div class="novel-document" data-novel-document="${esc(message.id)}" data-role-id="${esc(roleId)}" data-stage-id="${esc(stageId)}" data-mode="${mode}">${esc(message.text)}</div>`;
}
