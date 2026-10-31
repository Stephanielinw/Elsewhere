import {normalizeApiBase} from './modelDiscovery';
export const DEVICE_API_KEY = 'elsewhere-device-api-key-v1';
type KeyReader = Pick<Storage,'getItem'>;
type KeyStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function readDeviceApiKey(storage:KeyReader,endpoint:string):string {
  try {
    const value:unknown=JSON.parse(storage.getItem(DEVICE_API_KEY)||'null');
    return value&&typeof value==='object'&&'endpoint'in value&&'key'in value&&value.endpoint===normalizeApiBase(endpoint)&&typeof value.key==='string'?value.key:'';
  } catch { return ''; }
}
export function saveDeviceApiKey(storage:KeyStorage,endpoint:string,key:string):void {
  if(key.trim())storage.setItem(DEVICE_API_KEY,JSON.stringify({endpoint:normalizeApiBase(endpoint),key:key.trim()}));
  else storage.removeItem(DEVICE_API_KEY);
}
