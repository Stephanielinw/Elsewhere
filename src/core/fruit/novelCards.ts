import type {FruitRegex} from './types';
import type {NovelSection} from '../novelDocument';
export interface NovelCardJob {
 rules:FruitRegex[];sections:NovelSection[];overrides:Record<string,boolean>;depth:number;isEdit:boolean;names:{char:string;user:string};night:boolean;
}
export interface NovelCard {sectionIndex:number;kind:'chapter'|'status';css:string;html:string}
export interface NovelCardDiagnostic {ruleId:string;status:'matched'|'disabled'|'skipped'|'unsupported'|'unmatched'|'failed';reason:string;elapsedMs:number}
export interface NovelCardResult {cards:NovelCard[];diagnostics:NovelCardDiagnostic[]}
export const AUTHOR_CARD_IDS={chapter:'591b44bf-955e-4c2b-a862-345da140f623',status:'d3aab2ca-6dd1-4570-85ff-332781e7dff0'} as const;
export const SYNTHETIC_NOVEL='<novel_header>[CHAP]01[TITLE]星港来信[CP]旅人甲 × 旅人乙[LOC]风铃书塔·东侧回廊[TAGS]黄昏/重逢[PREFACE]风把未寄出的信，带回了这里。</novel_header>\n<status_bar>日期：星历七月初九\n时间：黄昏 18:20\n天气：微风\n地点：风铃书塔·东侧回廊\n题记：我们在微光里，读完未寄出的信。\n之间：并肩而立，尚有一句话未说。</status_bar>\n<content>回廊响起脚步声。\n「你也收到这封信了？」旅人甲问。\n旅人乙抬眼，笑着把信放在灯下。</content>';
