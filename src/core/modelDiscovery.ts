export function normalizeApiBase(value:string):string {
  let url:URL;try{url=new URL(value.trim());}catch{throw new Error('请输入有效的 HTTP(S) API Base URL');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('API 地址不能包含凭据、查询参数或片段；Key 请填入专用输入框');
  const path=url.pathname.replace(/\/+$/,'').replace(/\/(?:chat\/completions|models)$/,'');
  // Custom services may expose /models at their root; preserve the supplied base path.
  return url.origin+path;
}
export async function fetchModelIds(base:string,key:string,options:{signal?:AbortSignal;fetcher?:typeof fetch}={}):Promise<string[]> {
  const url=normalizeApiBase(base)+'/models';let response:Response;
  try{response=await(options.fetcher||fetch)(url,{method:'GET',headers:key?{Authorization:'Bearer '+key}:{},credentials:'omit',redirect:'error',signal:options.signal});}
  catch{throw new Error(options.signal?.aborted?'请求已取消或超时，请重试':'无法读取模型列表：网络、CORS、浏览器来源或重定向限制。可手动输入模型 ID。');}
  if(!response.ok)throw new Error(response.status===401||response.status===403?'模型列表鉴权失败，请检查 API Key 与权限。':response.status===404||response.status===405?'服务未提供兼容的模型列表接口，请手动输入模型 ID。':`模型列表请求失败（HTTP ${response.status}），请稍后重试或手动输入。`);
  if(Number(response.headers.get('content-length'))>2000000)throw new Error('模型列表响应过大，已停止处理');
  let data:unknown;try{const body=await response.text();if(body.length>2000000)throw new Error();data=JSON.parse(body);}catch{throw new Error('模型列表不是受支持的 JSON 格式，请手动输入模型 ID。');}
  if(!data||typeof data!=='object'||!('data'in data)||!Array.isArray(data.data)||data.data.length>5000)throw new Error('模型列表需要 data 数组，请手动输入模型 ID。');
  const ids=[...new Set(data.data.flatMap((item:unknown)=>item&&typeof item==='object'&&'id'in item&&typeof item.id==='string'&&item.id.trim()&&item.id.length<=512?[item.id]:[]))].sort();
  if(!ids.length)throw new Error('服务返回了空模型列表，请手动输入模型 ID。');return ids;
}
