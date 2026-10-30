export type SaveState='saving'|'saved'|'failed';
export function createProfileAutosave<T>(write:(key:string,value:T)=>Promise<void>,notify:(key:string,state:SaveState,message?:string)=>void,delay=150){
  const pending=new Map<string,T>(),failed=new Map<string,T>(),states=new Map<string,SaveState>();
  let running:Promise<void>|null=null,timer:ReturnType<typeof setTimeout>|null=null;
  const status=(key:string,state:SaveState,message?:string)=>{states.set(key,state);notify(key,state,message);};
  function start():Promise<void>{
    if(timer){clearTimeout(timer);timer=null;}
    if(running)return running;if(failed.size)return Promise.resolve();
    running=(async()=>{while(pending.size){const [key,value]=pending.entries().next().value!;pending.delete(key);try{await write(key,value);status(key,pending.has(key)?'saving':'saved');}catch(error){failed.set(key,value);status(key,'failed',error instanceof Error?error.message:'保存失败，修改已保留');break;}}})().finally(()=>{running=null;});
    return running;
  }
  return {
    enqueue(key:string,value:T){pending.set(key,structuredClone(value));if(failed.size){if(failed.has(key))status(key,'failed','保存失败，最新修改已保留；请重试');return;}status(key,'saving');if(!running){if(timer)clearTimeout(timer);timer=setTimeout(()=>void start(),delay);}},
    async flush(retry=false):Promise<boolean>{
      if(retry){for(const [key,value]of failed){if(!pending.has(key))pending.set(key,value);status(key,'saving');}failed.clear();}
      await start();return !failed.size&&!pending.size;
    },
    state(key:string){return states.get(key)||'saved';},
    hasPending(){return Boolean(running||pending.size||failed.size);},
    discardFailed(key:string){if(running)return false;pending.delete(key);failed.delete(key);status(key,'saved');return true;},
  };
}
