const MODEL_READ_TIMEOUT = 90_000;

/** Only transport and body reading belong in read. Persist results after this promise resolves. */
export function startRequestDeadline<T>(read:(signal:AbortSignal)=>Promise<T>,parent?:AbortSignal,timeoutMs=MODEL_READ_TIMEOUT) {
  if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>600_000)throw new Error('请求截止时间无效');
  const controller=new AbortController();
  const deadline=Date.now()+timeoutMs;
  let settled=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let rejectResult!:(error:unknown)=>void;

  const finish=()=>{
    settled=true;
    clearTimeout(timer);
    parent?.removeEventListener('abort',cancel);
  };
  const stop=(error:DOMException)=>{
    if(settled)return;
    finish();
    rejectResult(error);
    controller.abort(error);
  };
  const cancel=()=>stop(new DOMException('请求已中断','AbortError'));
  const check=()=>{
    if(!settled&&Date.now()>=deadline)stop(new DOMException('等待模型响应超时','TimeoutError'));
  };
  const tick=()=>{
    check();
    if(!settled)timer=setTimeout(tick,deadline-Date.now());
  };
  const result=new Promise<T>((resolve,reject)=>{
    rejectResult=reject;
    if(parent?.aborted){cancel();return;}
    parent?.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(tick,timeoutMs);
    void (async()=>{
      try {
        const body=await read(controller.signal);
        check();
        if(!settled){finish();resolve(body);}
      } catch(error) {
        check();
        if(!settled){finish();reject(error);}
      }
    })();
  });
  return {result,cancel,check};
}
