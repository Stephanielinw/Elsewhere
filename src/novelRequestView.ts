import type {NovelAttempt} from './core/types';
import {presetIssueText} from './core/fruit/presetIssue';

export type NovelPhase='preparing'|'compiling'|'checking'|'requesting'|'reading'|'parsing'|'saving'|'archived'|'failed';

export function novelControl(active:boolean,phase?:NovelPhase){
 const saving=phase==='saving'||phase==='archived';
 return active?{label:saving?'正在保存回复':'停止本次等待',icon:saving?'hourglass':'square',stop:!saving,disabled:saving}
  :{label:'发送描写',icon:'send',stop:false,disabled:false};
}

export function novelFailureDetails(attempt:Pick<NovelAttempt,'state'|'code'|'presetIssue'>){
 const descriptions={preset:'当前预设尚未准备好。',compile:'当前预设配置无法编译。',timeout:'等待已超过本次截止时间。',cancelled:'你已停止本次等待。',provider:'服务商返回错误或拒绝了请求。',format:'收到的回复未满足正文或完成格式要求。',save:'已收到回复，但保存尚未确认。',stale:'场景或消息来源已经变化，回复未归档。',connection:'本次连接未能正常完成。'};
 const code=attempt.code&&Object.hasOwn(descriptions,attempt.code)?attempt.code:'connection';
 return {code:'NOVEL_'+code.toUpperCase(),description:descriptions[code],detail:attempt.presetIssue&&Object.hasOwn(presetIssueText,attempt.presetIssue)?presetIssueText[attempt.presetIssue]:'',
  recovery:code==='stale'?'请返回当前场景核对记录；不能直接重试旧请求。':attempt.state==='returned'?'优先保留已收到的安全正文，再核对存档。重新调用会再次生成。':attempt.state==='not-sent'?'本次请求未发送，原话与配置保留；修正问题后可主动重新调用。':'上次请求可能已经计费，重新调用可能再次产生费用。应用不会自动重发。'};
}
