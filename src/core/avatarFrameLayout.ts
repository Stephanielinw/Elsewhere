export const FRAME_REFERENCE_SIZE = 68;
export interface FrameAdjustment { scale: number; x: number; y: number }
export interface FrameFit extends FrameAdjustment {
  method: 'opening' | 'canvas'; width: number; height: number;
  bounds?: {left:number;right:number;top:number;bottom:number};
}
export interface FrameFields {
  frameId?: string; frameMediaId?: string; frameData?: string;
  frameScale?: number; frameX?: number; frameY?: number;
  frameAdjustments?: Record<string, FrameAdjustment>;
}
export const DEFAULT_FRAME: FrameAdjustment = {scale: 1.25, x: 0, y: 0};
export const frameKey = (owner: FrameFields) => owner.frameId || owner.frameMediaId || 'none';
export function framePlacement(owner: FrameFields, defaults: FrameAdjustment = DEFAULT_FRAME): FrameAdjustment {
  const safe=(n:unknown,fallback:number,min:number,max:number)=>Number.isFinite(Number(n))?Math.max(min,Math.min(max,Number(n))):fallback;
  const base={scale:safe(defaults?.scale,1.25,.25,4),x:safe(defaults?.x,0,-80,80),y:safe(defaults?.y,0,-80,80)};
  const explicit = Object.hasOwn(owner.frameAdjustments || {}, frameKey(owner)) ||
    (Number.isFinite(owner.frameScale) && owner.frameScale !== 1.25) || Boolean(owner.frameX || owner.frameY);
  if (!explicit) return base;
  return {
    scale: safe(owner.frameScale,base.scale,.25,4),
    x: Math.max(-80, Math.min(80, Number(owner.frameX) || 0)),
    y: Math.max(-80, Math.min(80, Number(owner.frameY) || 0)),
  };
}
export function rememberFrame(owner: FrameFields): void {
  owner.frameAdjustments = {...owner.frameAdjustments, [frameKey(owner)]: {
    scale: Number(owner.frameScale) || 1.25, x: Number(owner.frameX) || 0, y: Number(owner.frameY) || 0,
  }};
}
export function frameStyle(owner: FrameFields, defaults: FrameAdjustment = DEFAULT_FRAME): string {
  const p = framePlacement(owner, defaults);
  return `--frame-size:${p.scale};--frame-x:${p.x / FRAME_REFERENCE_SIZE * 100}%;--frame-y:${p.y / FRAME_REFERENCE_SIZE * 100}%`;
}
export function frameCompositionSpan(owner:FrameFields,defaults:FrameAdjustment & Pick<FrameFit,'bounds'>=DEFAULT_FRAME):number {
  const p=framePlacement(owner,defaults),bounds=defaults.bounds;
  const b=bounds&&Object.values(bounds).length===4&&Object.values(bounds).every(n=>Number.isFinite(n)&&Math.abs(n)<=.5)?bounds:{left:-.5,right:.5,top:-.5,bottom:.5};
  return Math.max(1,...[p.x/FRAME_REFERENCE_SIZE+p.scale*b.left,p.x/FRAME_REFERENCE_SIZE+p.scale*b.right,p.y/FRAME_REFERENCE_SIZE+p.scale*b.top,p.y/FRAME_REFERENCE_SIZE+p.scale*b.bottom].map(n=>2*Math.abs(n)));
}

/** A closed, central transparent opening is evidence of an avatar slot; open artwork keeps its canvas. */
export function analyzeFramePixels(width: number, height: number, rgba: ArrayLike<number>): FrameFit {
  const fallback: FrameFit = {...DEFAULT_FRAME, method:'canvas', width, height};
  if (width < 1 || height < 1 || width * height > 512 * 512 || rgba.length < width * height * 4) return fallback;
  const original=Uint8Array.from({length:width*height},(_,i)=>rgba[i*4+3]>=32?1:0);
  function opening(mask:Uint8Array,padding:number):FrameFit|null {
  const seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let best: {area:number;minX:number;maxX:number;minY:number;maxY:number} | null = null;
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || mask[start]) continue;
    let head=0,tail=1,edge=false,minX=width,maxX=0,minY=height,maxY=0;queue[0]=start;seen[start]=1;
    while(head<tail){
      const i=queue[head++],x=i%width,y=Math.floor(i/width);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      if(!x||!y||x===width-1||y===height-1)edge=true;
      for(const n of [x?i-1:-1,x<width-1?i+1:-1,y?i-width:-1,y<height-1?i+width:-1]){
        if(n>=0&&!seen[n]&&!mask[n]){seen[n]=1;queue[tail++]=n;}
      }
    }
    const w=maxX-minX+1,h=maxY-minY+1,cx=(minX+maxX+1)/2,cy=(minY+maxY+1)/2;
    if(edge||tail<width*height*.08||Math.min(w,h)<Math.max(width,height)*.3||w/h<.65||w/h>1.6||Math.abs(cx-width/2)>width*.25||Math.abs(cy-height/2)>height*.3)continue;
    if(!best||tail>best.area)best={area:tail,minX,maxX,minY,maxY};
  }
  if(!best)return null;
  const diameter=(Math.min(best.maxX-best.minX+1,best.maxY-best.minY+1)+padding*2)*1.02;
  return {method:'opening',width,height,scale:Math.max(width,height)/diameter,
    x:(width/2-(best.minX+best.maxX+1)/2)/diameter*FRAME_REFERENCE_SIZE,
    y:(height/2-(best.minY+best.maxY+1)/2)/diameter*FRAME_REFERENCE_SIZE};
  }
  const direct=opening(original,0);if(direct)return direct;
  // Close tiny dithering seams for detection only; the displayed source is never changed.
  const radius=Math.max(1,Math.round(Math.min(width,height)*.01)),mask=new Uint8Array(original.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(original[y*width+x]){
    for(let yy=Math.max(0,y-radius);yy<=Math.min(height-1,y+radius);yy++)
      for(let xx=Math.max(0,x-radius);xx<=Math.min(width-1,x+radius);xx++)mask[yy*width+xx]=1;
  }
  return opening(mask,radius)||fallback;
}
