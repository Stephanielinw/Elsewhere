import type {ChatMessage} from './types';

export function uploadedStickers(messages:ChatMessage[]) {
  const unique=new Map<string,{mediaId:string;caption:string}>();
  for(const m of messages)if(m.speaker==='me'&&m.kind==='sticker'&&m.mediaId&&m.status!=='retracted')
    unique.set(m.mediaId,{mediaId:m.mediaId,caption:m.caption||'自定义表情'});
  return [...unique.values()];
}
