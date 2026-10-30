const paths: Record<string, string> = {
      chat: '<path d="M4 5.5h16v10.5H9l-5 4v-4z"/><path d="M8 10h8"/>',
      diary: '<path d="M6 3.5h13v17H6z"/><path d="M9 3.5v17M12 8h4m-4 4h4"/>',
      focus: '<circle cx="12" cy="13" r="8"/><path d="M12 7.5v5.5l3.3 2M10 2h4"/>',
      monitor:
        '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><circle cx="12" cy="12" r="3.2"/><path d="M7.5 5.5l1-2h7l1 2"/>',

      presets:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
      drama:
        '<path d="M4 5c2 0 4 1 7 1s5-1 7-1v7c0 5-3 8-7 9-4-1-7-4-7-9z"/><path d="M7 10h2m4 0h2m-7 4c2 1.5 5 1.5 7 0"/>',

      terminal:
        '<path d="m5 8 4 4-4 4M11 17h8"/><rect x="2.5" y="3.5" width="19" height="17" rx="3"/>',

      tasks:
        '<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 9l1.6 1.6L12 8m2 2h3M8 16l1.6 1.6L12 15m2 2h3"/>',
      deadline:
        '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16m-8 3v3l2 1"/>',
  ellipsis:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  photo:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="2"/><path d="m4 18 5-5 4 3 3-4 4 6"/>',
  sticker:'<path d="M14 21H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7zM14 21v-4a3 3 0 0 1 3-3h4M8 9h.01M15 9h.01M8 13q3 3 6 0"/>',
  voice:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8"/>',
  packet:'<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 10h18M9 6l3-4 3 4M12 11v7"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',
  send:'<path d="M12 20V4m-6 6 6-6 6 6"/>',up:'<path d="M12 20V4m-6 6 6-6 6 6"/>',down:'<path d="M12 4v16m-6-6 6 6 6-6"/>',
  edit:'<path d="m16 3 5 5-12 12-6 1 1-6zM13 6l5 5"/>',drag:'<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>',
  sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/>',
  language:'<path d="M3 5h12M9 3v2M5 8q2 5 8 7M13 5q-1 7-10 11M14 21l4-11 4 11m-6-4h4"/>',
  memory:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 8h8m-8 4h8m-8 4h4"/>',
  shield:'<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6zM8 12l3 3 5-6"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  file:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8m-8 4h5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  paw:'<ellipse cx="6" cy="8" rx="2" ry="3"/><ellipse cx="11" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="7" rx="2" ry="3"/><ellipse cx="20" cy="11" rx="2" ry="3"/><path d="M6 17c0-3 4-6 7-5s6 4 5 7-4 1-6 1-6 2-6-3Z"/>',
  leaf:'<path d="M20 3c-9 0-16 2-16 9a7 7 0 0 0 7 7c7 0 9-7 9-16ZM4 21 15 10"/>',
  hourglass:'<path d="M6 3h12M6 21h12M7 3v4l10 10v4M17 3v4L7 17v4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  warning:'<path d="m12 3 10 18H2zM12 8v5m0 4h.01"/>',
  plug:'<path d="M8 3v5m8-5v5M5 8h14v3a7 7 0 0 1-14 0zM12 18v4"/>',
  bell:'<path d="M4 17h16l-2-3V9a6 6 0 0 0-12 0v5zM9 21h6"/>',
  square:'<rect x="4" y="4" width="16" height="16" rx="3"/>',
  check:'<path d="m5 12 4 4L19 6"/>',checked:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
  coffee:'<path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 9h2a3 3 0 0 1 0 6h-2M7 3v2m5-2v2"/>',
  book:'<path d="M3 4c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 2-2-2-5-3-9-2zM12 6v16"/>',
  map:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  home:'<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>',
  moon:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  ruler:'<path d="m3 16 13-13 5 5L8 21zM13 6l3 3m-6 0 3 3m-6 0 3 3"/>',
  undo:'<path d="M9 4 3 10l6 6M3 10h11a7 7 0 0 1 7 7v3"/>',
};

// Legacy stored icons remain unchanged; only the UI maps them to house vectors.
const legacy:Record<string,string>={'💬':'chat','📍':'map','⏱️':'focus','⏳':'hourglass','🎭':'drama','📖':'book','🌿':'leaf','🍃':'leaf','📝':'edit','✒️':'edit','📐':'ruler','👀':'eye','💭':'chat','☕':'coffee','🔔':'bell','⏹️':'square','📅':'deadline','🐾':'paw','👁️':'eye','🌙':'moon','🏡':'home','📚':'book','🍜':'coffee','🌳':'leaf'};
export function uiIcon(name:string,className='ui-icon'):string {
 const path=paths[legacy[name]||name]||paths.file;
 return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}
export function plainUiLabel(name:string):string {
 return String(name||'').replace(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\uFE0E\uFE0F\u200D\u20E3])/gu,'').replace(/\s+/g,' ').trim();
}
