export type FruitMode = 'meeting' | 'theatre';
export type FruitRole = 'system' | 'user' | 'assistant';
export interface FruitDiagnostic { code: string; severity: 'info' | 'warning' | 'error'; message: string; sourceId?: string }
export interface FruitPrompt {
  identifier: string; name: string; role: FruitRole; content: string; marker: boolean;
  originalEnabled: boolean; position: number; depth: number; injectionOrder: number;
  group: string; blockedReason?: string; styleEntry: boolean;
}
export interface FruitOrder { identifier: string; enabled: boolean }
export interface FruitRegex {
  id: string; name: string; enabled: boolean; pattern: string;
  side: 'prompt' | 'display' | 'other'; placement: number[];
  hasExecutableMarkup: boolean; status: 'disabled-safety' | 'unsupported'; reason: string;
}
export interface FruitPreset {
  raw: Uint8Array; sha256: string; fileName: string; name: string; version: string; importedAt: number;
  prompts: FruitPrompt[]; order: FruitOrder[]; orderGroup: number;
  regex: FruitRegex[]; extensions: string[]; modelParameters: Record<string, string | number | boolean>;
  outputTags: string[]; diagnostics: FruitDiagnostic[];
}
export interface FruitLength { min: number; max: number }
export type FruitPromptEdit = Partial<Pick<FruitPrompt,'name'|'role'|'content'|'position'|'depth'|'injectionOrder'>>;
export type FruitCustomPrompt = Pick<FruitPrompt,'identifier'|'name'|'role'|'content'|'position'|'depth'|'injectionOrder'>;
export interface FruitProfile {
  edits?: Record<string,FruitPromptEdit>;
  order?: string[];
  customPrompts?: FruitCustomPrompt[];
  overrides: Record<string, boolean>; style: string; length: FruitLength;
  output: { scene: boolean; summary: boolean; characters: boolean; auxiliary: boolean };
}
export interface FruitState {
  schema: 1; revision: number; enabled: boolean; preset: FruitPreset | null;
  profiles: Record<FruitMode, FruitProfile>;
}
export type FruitLayer = 'identity' | 'relationship' | 'episodic' | 'currentState';
export interface FruitSource {
  id: string; text: string; layer: FruitLayer; knownBy: string[]; at: number;
  scope: string; active: boolean; revisionValid: boolean; marker?: string;
}
export interface FruitContext {
  source: 'isolated-fixture'; mode: FruitMode; actorId: string; scope: string; now: number;
  user: string; char: string; facts: FruitSource[];
  history: { id: string; role: FruitRole; text: string; knownBy: string[]; at: number; scope: string; active: boolean; revisionValid: boolean }[];
  examples: { role: FruitRole; text: string }[];
  capabilities: { keywordRetrieval: boolean; semanticRetrieval: boolean; completeRevisionChain: boolean };
}
export interface FruitCompiledMessage {
  role: FruitRole; content: string; sourceId: string; sourceName: string; orderIndex: number;
  marker?: string; depth?: number; injectionOrder?: number; sourceIds?: string[];
}
export interface FruitCompilation {
  previewOnly: true; sendAllowed: false; valid: boolean; mode: FruitMode; length: FruitLength;
  messages: FruitCompiledMessage[]; diagnostics: FruitDiagnostic[];
  variables: { local: Record<string,string>; global: Record<string,string> };
  memorySources: { id: string; layer: FruitLayer; at: number; scope: string; knownBy: string[] }[];
  excluded: { id: string; reason: string }[];
  modelParameters: FruitPreset['modelParameters'];
}
