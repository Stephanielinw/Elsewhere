import type {ChatMessage, RoleData, UserProfileData} from './types';
import {messageSourceIndex, rolePlays, roleScenes, scenePlaceAt} from './messageProvenance';
import {compactRoleMemory, eventSourceValid, memoryRuleConflicts, projectedUserFields, projectRoleMemory, relationshipContext} from './memory';
import {personalSourceValid, confirmedPersonalLife} from './roleLife';
import {diaryFingerprint} from './diaryFingerprint';
import {replyThought} from './worldTimeline';

export type DiarySourceKind = 'message' | 'quote' | 'scene' | 'play' | 'event' | 'shared-diary' | 'diary' | 'thread' | 'thought' | 'fact' | 'role' | 'user';
export interface DiarySource {
  kind: DiarySourceKind;
  id: string;
  version: string;
  revision?: number;
  profileDenials?: string[];
}
export interface DiaryEvidence {
  version: 1;
  cutoff: number;
  sources: DiarySource[];
}
export interface DiaryScope {
  worldId: string;
  roleId: string;
  dateKey: string;
  zone: string;
  attempt: string;
}
export interface DiaryReceiptEvidence extends DiaryEvidence {
  scope: DiaryScope;
}

const unique = <T extends {id: string}>(items: T[], id: string): T | undefined => {
  const matches = items.filter(item => item?.id === id);
  return matches.length === 1 ? matches[0] : undefined;
};
const visible = (r: RoleData, m: ChatMessage) => !r.events.some(e => (e.messageId === m.id || !!m.sourceMessageId && e.messageId === m.sourceMessageId) &&
  e.status !== 'retracted' && e.status !== 'superseded' && (e.sourceRevision === undefined || e.sourceRevision === (m.revisionCount || 0)) &&
  e.knownBy?.length && !e.knownBy.includes(r.id));

export function diaryUserFields(r: RoleData, user: UserProfileData, at: number, memory = compactRoleMemory(r, at)) {
  const fields = Object.fromEntries(projectedUserFields(user, r, at, memory).map(f => [f.key, f.conflicts.length ? '' : f.text]));
  return {name: fields.name || '', pronouns: user.pronouns || '', identity: fields.identity || '', background: fields.background || '', notes: fields.notes || ''};
}

/** The prompt selects sources once; verification looks up those same IDs without reselecting excerpts. */
export function diarySourceReader(r: RoleData, cutoff: number, now = cutoff, user?: UserProfileData, seen = new Set<string>()) {
  const messages = messageSourceIndex(r, cutoff, true);
  const locations = new Map<string, string>();
  for (const m of r.chats) if(m)locations.set(m.id, 'phone');
  for (const s of roleScenes(r)) for (const m of s.messages || []) if(m)locations.set(m.id, 'scene:' + s.id);
  for (const p of rolePlays(r)) {
    for (const m of p.messages || []) if(m)locations.set(m.id, 'play:' + p.id);
    for (const m of p.intermissionMessages || []) if(m)locations.set(m.id, 'intermission:' + p.id);
  }
  const memory = compactRoleMemory(r, cutoff);
  const current = now === cutoff ? memory : compactRoleMemory(r, now);
  const denied = current.denied;
  const facts=new Map(projectRoleMemory(r,cutoff,Infinity).facts.map(f=>[f.id,f]));
  const validFacts=new Set(current.trace.filter(f=>['selected','same-current-fact'].includes(f.reason)).map(f=>f.id));
  const accessibleMessage=(id:string)=>{
    const message=messages.get(id);
    return message&&message.speaker!=='note'&&visible(r,message)?message:undefined;
  };
  const validMessage=(id:string)=>{
    const message=accessibleMessage(id);
    if(!message||current.supersededSources.has(id)||message.sourceMessageId&&current.supersededSources.has(message.sourceMessageId))return;
    return message;
  };
  const validFact=(fact:typeof memory.facts[number])=>validFacts.has(fact.id)&&
    accessibleMessage(fact.source.id)&&(!fact.contextSource||accessibleMessage(fact.contextSource.id));
  const projected={...memory,denied,facts:memory.facts.filter(validFact)};
  const read = (kind: DiarySourceKind, id: string): DiarySource | undefined => {
    let value: unknown;
    let revision: number | undefined;
    let profileDenials: string[] | undefined;
    switch (kind) {
      case 'message': {
        const m = validMessage(id);
        if (!m || m.sourceMessageId && !validMessage(m.sourceMessageId)) return;
        revision = m.revisionCount || 0;
        value = [m.speaker, m.text, m.at, m.editedAt, revision, m.kind, m.sourceMessageId, locations.get(id)];
        break;
      }
      case 'quote': {
        const quote=validMessage(id)?.quote;
        if(!quote||!validMessage(quote.id))return;
        value=quote;
        break;
      }
      case 'thought': {
        const m = validMessage(id), thought = m && replyThought(r, m);
        if (!m || !thought || !m.privateThought?.group.every(ref => validMessage(ref.id))) return;
        value = [thought, m.privateThought.group];
        break;
      }
      case 'scene': {
        const scene = unique([...(r.meetings || []), ...(r.scene ? [r.scene] : [])], id);
        if (!scene || scene.startedAt > cutoff) return;
        value = [scene.startedAt, scenePlaceAt(r, scene, cutoff)];
        break;
      }
      case 'play': {
        const play = unique([...(r.plays || []), ...(r.play ? [r.play] : [])], id);
        if (!play || play.startedAt > cutoff) return;
        value = [play.startedAt, play.title, play.world, play.user, play.char];
        break;
      }
      case 'event': {
        const e = unique(r.events, id);
        if (!e || !eventSourceValid(r, e, cutoff, messages, current.supersededSources) || e.messageId && !validMessage(e.messageId)) return;
        if (e.kind === 'life') {
          if (!confirmedPersonalLife(r, e, cutoff, memory) || e.lifeRecord?.timeline &&
            (!['ended','interrupted'].includes(e.lifeRecord.timeline.state) || e.lifeRecord.until > cutoff)) return;
        }
        value = [e.at, e.kind, e.title, e.detail, e.where, e.messageId, e.sourceRevision, e.lifeRecord || null];
        break;
      }
      case 'shared-diary': {
        const d = unique(r.diaries, id), sharedAt = d?.sharedAt?.[r.id] ?? d?.at;
        if (!d || d.speaker !== 'me' || !d.sharedWith?.includes(r.id) || !Number.isFinite(sharedAt) || d.at > cutoff || sharedAt! > cutoff) return;
        value = [d.at, sharedAt, d.text];
        break;
      }
      case 'diary':
      case 'thread': {
        const source = personalSourceValid(r, kind, id, cutoff, now, seen);
        if (!source) return;
        value = [source.at, source.version];
        break;
      }
      case 'fact': {
        const fact = facts.get(id);
        if (!fact || !validFact(fact)) return;
        value = [fact.attribute, fact.value, fact.polarity, fact.mutual, fact.source, fact.contextSource];
        break;
      }
      case 'role': {
        if (id !== r.id) return;
        const notes = r.notes && !memoryRuleConflicts('用户补充：' + r.notes, denied).length ? r.notes : '';
        value = [r.name, r.job, r.place, r.traits, r.profile, r.canonNotes, relationshipContext(r, cutoff, projected), r.userAlias, notes, Boolean(r.demoSample)];
        break;
      }
      case 'user': {
        if (id !== r.id || !user) return;
        const fields = diaryUserFields(r, user, cutoff, projected);
        if(fields.identity||fields.background||fields.notes)profileDenials=denied.map(f=>f.id).sort();
        value = [fields.name, fields.pronouns, fields.identity, fields.background, fields.notes];
        break;
      }
      default: return;
    }
    return {kind, id, version: diaryFingerprint(value), ...(revision === undefined ? {} : {revision}), ...(profileDenials ? {profileDenials} : {})};
  };
  return {read, memory:projected};
}

export function diaryEvidenceValid(r: RoleData, evidence: DiaryEvidence, now: number, user?: UserProfileData, seen = new Set<string>()): boolean {
  if (!evidence || evidence.version !== 1 || !Number.isFinite(evidence.cutoff) || evidence.cutoff > now ||
    !Array.isArray(evidence.sources) || !evidence.sources.some(ref => ref?.kind === 'role' && ref.id === r.id)) return false;
  const reader = diarySourceReader(r, evidence.cutoff, now, user, seen);
  return evidence.sources.every(ref => {
    if (!ref || typeof ref.id !== 'string' || !ref.id || typeof ref.version !== 'string') return false;
    // Later memory readers lack the player profile. Keep uncertain identity excerpts out of memory.
    if (ref.kind === 'user' && !user) return ref.id===r.id&&/^[a-f0-9]{64}$/.test(ref.version)&&
      (ref.profileDenials===undefined||Array.isArray(ref.profileDenials)&&reader.memory.denied.every(f=>ref.profileDenials!.includes(f.id)));
    const current = reader.read(ref.kind, ref.id);
    return current?.version === ref.version && current.revision === ref.revision;
  });
}
