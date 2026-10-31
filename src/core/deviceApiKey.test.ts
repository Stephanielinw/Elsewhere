import test from 'node:test';
import assert from 'node:assert/strict';
import {readDeviceApiKey,saveDeviceApiKey} from './deviceApiKey';

test('device key survives reopening only for its saved endpoint and is not part of application data',()=>{
 const values=new Map<string,string>();
 const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
 saveDeviceApiKey(store,'https://example.invalid/v1/','synthetic-key');
 assert.equal(readDeviceApiKey(store,'https://example.invalid/v1'),'synthetic-key');
 assert.equal(readDeviceApiKey(store,'https://other.invalid/v1'),'');
 saveDeviceApiKey(store,'https://example.invalid/v1','');
 assert.equal(readDeviceApiKey(store,'https://example.invalid/v1'),'');
 assert.equal(readDeviceApiKey({getItem:()=>'{bad'},'https://example.invalid/v1'),'');
 assert.throws(()=>saveDeviceApiKey({...store,setItem:()=>{throw new Error('quota')}},'https://example.invalid/v1','synthetic'),/quota/);
});
