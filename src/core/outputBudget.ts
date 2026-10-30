import type {ApiSettings} from './types';
export type GenerationTask='chat'|'scene'|'play'|'intermission'|'first-message'|'diary'|'focus-log'|'focus-summary'|'footprints';
export function completionLimit(settings:Pick<ApiSettings,'endpoint'|'model'|'maxTokens'>,task:GenerationTask):{max_tokens?:number;max_completion_tokens?:number}{
  const model=settings.model.toLowerCase().split('/').at(-1)||'';
  const reasoning=/^(?:o[1-9](?:-|$)|gpt-[5-9](?:[.-]|$))/.test(model);
  let official=false;try{official=new URL(settings.endpoint).hostname==='api.openai.com';}catch{}
  const novel=task==='scene'||task==='play';
  const taskBudget=({'chat':2048,'intermission':2048,'first-message':2048,'diary':4096,'focus-log':320,'focus-summary':300,'footprints':2048,'scene':16384,'play':16384})[task];
  if(official){
    const modern=/^(?:gpt-4\.1(?:-|$)|gpt-4o(?:-mini)?$|gpt-4o(?:-mini)?-2024-(?:07|08|11)-)/.test(model)||reasoning;
    if(!modern&&novel)return {};
    const budget=reasoning?Math.max(novel?32768:8192,taskBudget):taskBudget;
    return modern?{max_completion_tokens:budget}:{max_tokens:taskBudget};
  }
  // Unknown compatible servers own their novel/reasoning limits; do not force a legacy 550-token ceiling.
  if(novel||reasoning)return {};
  return {max_tokens:taskBudget};
}
