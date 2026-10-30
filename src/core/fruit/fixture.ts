import { createRole } from '../defaults';
import { retrieve } from '../prompt';
import type { FruitContext, FruitMode, FruitSource } from './types';

export function makeFruitFixtureContext(mode:FruitMode):FruitContext {
  const now=Date.UTC(2026,9,29,10),actorId='fruit-fixture-actor';
  const scope=mode==='meeting'?'real:fixture':'play:fixture';
  const char=mode==='meeting'?'林澈（测试角色）':'守灯人（戏内人物）';
  const user=mode==='meeting'?'旅伴（测试用户）':'访客（戏内人物）';
  const role=createRole(char,'','档案管理员','克制、善于观察','旧书店');
  role.id=actorId;role.events=[{id:'fixture-event',kind:mode==='meeting'?'scene':'drama',title:'旧书约定',detail:mode==='meeting'?'昨日约好在旧书店见面；约定已确认。':'本幕中守灯人答应替访客保管一封信。',at:now-3600000,knownBy:[actorId,'user']}];
  const facts:FruitSource[]=[];
  const add=(id:string,layer:FruitSource['layer'],marker:string,text:string)=>facts.push({id,text,layer,marker,knownBy:[actorId,'user'],at:now-60000,scope,active:true,revisionValid:true});
  add('fixture-persona','identity','personaDescription',`${user}：只包含本模式允许的公开身份。`);
  add('fixture-canon','identity','charDescription',`${char}：${mode==='meeting'?'当前人生阶段：独立经营旧书店；既往约定属于真实 Canon。':'当前剧本：虚构的海港灯塔；人物不知道演员的私生活。'}`);
  add('fixture-traits','identity','charPersonality',`${char}性格克制，习惯先观察再表达。`);
  add('fixture-relationship','relationship','worldInfoBefore',mode==='meeting'?'与旅伴认识三个月，尚未承诺未来。':'戏内人物刚刚相识，关系仅限当前剧本。');
  for(const event of retrieve(role,'旧书约定 信',6,now))facts.push({id:event.id,text:event.detail,layer:'episodic',marker:'worldInfoAfter',knownBy:event.knownBy||[],at:event.at,scope,active:true,revisionValid:true});
  add('fixture-current','currentState','scenario',`${new Date(now).toISOString()}；${mode==='meeting'?'旧书店门前，双方刚碰面。':'当前幕：海港灯塔；舞台事件不写入演员真实 Canon。'}`);
  return {source:'isolated-fixture',mode,actorId,scope,now,user,char,facts,
    history:[{id:'fixture-h1',role:'assistant',text:'约好的地方就在前面。',knownBy:[actorId,'user'],at:now-30000,scope,active:true,revisionValid:true},{id:'fixture-h2',role:'user',text:'我带来了那本旧书。请接着写当前场景。',knownBy:[actorId,'user'],at:now-10000,scope,active:true,revisionValid:true}],
    examples:[{role:'user',text:'这扇门还开着吗？'},{role:'assistant',text:'他扶住门沿，侧身让出一条路。'}],
    capabilities:{keywordRetrieval:true,semanticRetrieval:false,completeRevisionChain:false}};
}
