import type {RoleData} from './types';
import {experienceContext} from './roleExperience';
export const MEETING_CONTINUITY_TOKENS=1000;
export function meetingContinuity(r:RoleData,query:string,at:number,rejected:ReadonlySet<string>){return experienceContext(r,query,at,rejected);}
