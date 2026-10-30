import {analyzeFramePixels, FRAME_REFERENCE_SIZE, type FrameFit} from './avatarFrameLayout';

export async function inspectFrameBlob(blob:Blob):Promise<FrameFit|undefined>{
  const url=URL.createObjectURL(blob),img=new Image();let decoded=false;
  try {
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('头像框解码超时')),8000);img.onload=()=>{clearTimeout(timer);resolve()};img.onerror=()=>{clearTimeout(timer);reject(new Error('头像框无法解码'))};img.src=url});
    decoded=true;
    const factor=Math.min(1,256/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*factor));canvas.height=Math.max(1,Math.round(img.naturalHeight*factor));
    const ctx=canvas.getContext('2d');if(!ctx)return;
    // shortcut: uploaded animations are measured at load; sample phases if their visible centre moves.
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,measured=analyzeFramePixels(canvas.width,canvas.height,pixels);
    let left=canvas.width,right=-1,top=canvas.height,bottom=-1;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>=32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left)return measured;
    const visible=Math.max(right-left+1,bottom-top+1),side=Math.max(canvas.width,canvas.height),size=Math.min(4,1.21*side/visible);
    const bounds={left:(left-canvas.width/2)/side,right:(right+1-canvas.width/2)/side,top:(top-canvas.height/2)/side,bottom:(bottom+1-canvas.height/2)/side};
    if(measured.method==='opening')return {...measured,bounds,scale:size,x:measured.x/measured.scale*size,y:measured.y/measured.scale*size};
    return {...measured,bounds,scale:size,x:(canvas.width/2-(left+right+1)/2)/side*size*FRAME_REFERENCE_SIZE,y:(canvas.height/2-(top+bottom+1)/2)/side*size*FRAME_REFERENCE_SIZE};
  }catch(error){if(!decoded)throw error;return undefined}finally{img.src='';URL.revokeObjectURL(url)}
}

/** Mutate the existing owner only after blob storage, and restore it if the world write fails. */
export async function persistAppearance<T extends {avatarMediaId?:string}>(owner:T,patch:Partial<T>,avatar:{blob:Blob|null;remove:boolean},io:{put:(id:string,blob:Blob)=>Promise<void>;remove:(id:string)=>Promise<void>;save:()=>boolean;uid:()=>string;current:()=>boolean}):Promise<boolean>{
  const previous={...owner};let id='',mutated=false;
  try{
    if(avatar.blob){id=io.uid();await io.put(id,avatar.blob)}
    if(!io.current()){if(id)await io.remove(id).catch(()=>{});return false}
    mutated=true;Object.assign(owner,patch);
    if(id)owner.avatarMediaId=id;else if(avatar.remove)owner.avatarMediaId='';
    if(!io.save())throw new Error('本地存储写入失败');
    return true;
  }catch(error){
    if(mutated){
      for(const key of Object.keys(owner))if(!Object.hasOwn(previous,key))delete owner[key as keyof T];
      Object.assign(owner,previous);
    }
    if(id)await io.remove(id).catch(()=>{});
    throw error;
  }
}
