import {defaults,createRole} from '../defaults';
import {buildMessagesForModel} from '../prompt';
import {makeFruitFixtureContext} from './fixture';
import {parseFruitPreset} from './preset';
import type {FruitMode} from './types';
export async function makeNativePreset(mode:FruitMode){
  const context=makeFruitFixtureContext(mode),data=defaults(),role=createRole(context.char,'','档案管理员','克制、善于观察','旧书店');
  data.roles=[role];data.preset=null;data.user.name=context.user;role.chats=[];role.profile=context.facts.find(f=>f.id==='fixture-canon')?.text||'';
  role.scene={id:'native-fixture-scene',startedAt:context.now,where:'旧书店',messages:[]};
  role.play={id:'native-fixture-play',title:'灯塔来信',world:'封闭的虚构海港灯塔',user:context.user,char:context.char,startedAt:context.now,messages:[]};
  const messages=buildMessagesForModel(data,role,mode==='meeting'?'scene':'play','请继续当前场景',{nowTs:context.now});
  const prompts=[{identifier:'native-base',name:'Elsewhere 原生场景规则',role:'system',content:messages[0].content},{identifier:'chatHistory',name:'近期对话',role:'system',marker:true},{identifier:'native-format',name:'原生输出边界',role:'system',content:messages.at(-1)!.content}];
  return parseFruitPreset(new TextEncoder().encode(JSON.stringify({name:'Elsewhere 原生预设',prompts,prompt_order:[{character_id:100001,order:prompts.map(p=>({identifier:p.identifier,enabled:true}))}]})),'Elsewhere-native.json',0);
}
