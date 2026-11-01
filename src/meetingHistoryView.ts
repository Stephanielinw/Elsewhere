import type {RoleData,SceneData} from './core/types';
import {escHtml as esc} from './core/footprints';
import {logTimestamp} from './core/systemLogs';
import {encounterHistory} from './core/encounter';
import {novelMessageHtml} from './novelOutputView';
import {uiIcon} from './uiIcons';
export function meetingCardHtml(scene:SceneData):string {
 return `<details class="meeting-chat-card" data-meeting-id="${esc(scene.id)}"><summary>${uiIcon('profile')}<span>见面记录 · ${esc(logTimestamp(scene.startedAt).slice(0,10))}<small>${esc(scene.where)}</small></span>${uiIcon('down')}</summary><div class="meeting-card-body"><p>开始：${esc(logTimestamp(scene.startedAt))}<br>结束：${esc(logTimestamp(scene.endedAt!))}</p><button type="button" class="btn small secondary" data-action="viewmeeting" data-id="${esc(scene.id)}">查看见面记录</button></div></details>`;
}
export function meetingRecordHtml(r:RoleData,scene:SceneData):string {
 return `<div class="novel meeting-record" id="scroll-area" data-meeting-record="${esc(scene.id)}"><h2 class="scene-title">与${esc(r.name)}的见面</h2><div class="card"><p>${esc(scene.where)}</p><p>开始：${esc(logTimestamp(scene.startedAt))}<br>结束：${esc(logTimestamp(scene.endedAt!))}</p><span class="tiny muted">已结束 · 只读档案</span></div>${encounterHistory(r,scene.messages).map(m=>`<div class="passage ${m.speaker==='me'?'mine':m.speaker==='char'?'theirs':'note'}" data-msg-id="${esc(m.id)}"><span class="speaker">${m.speaker==='me'?'你':m.speaker==='char'?esc(r.name):'场景'} · ${esc(logTimestamp(m.at))}</span>${novelMessageHtml(m,r.id,scene.id,'meeting')}</div>`).join('')||'<p class="sub">暂无有效见面对话。</p>'}</div>`;
}
