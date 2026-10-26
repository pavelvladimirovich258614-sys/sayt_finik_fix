// Фирменные линейные иконки FinikFix (viewBox 64×64, обводка currentColor).
// Силуэты обобщённые, без логотипов производителей.
export const ICONS = {
  ps: `<path d="M25 5C13 12 12 50 25 58C20 46 20 17 25 5z"/><path d="M39 5c12 7 13 45 0 53c5-12 5-41 0-53z"/><rect x="28" y="9" width="8" height="46" rx="2"/><path d="M32 15v6"/><path d="M17 61h30"/>`,
  xbox: `<rect x="16" y="6" width="32" height="46" rx="3"/><circle cx="32" cy="17" r="4"/><path d="M24 30h16M24 35h16M24 40h16"/><path d="M20 58h24"/>`,
  switch: `<rect x="5" y="16" width="54" height="32" rx="8"/><rect x="17" y="20" width="30" height="24" rx="2"/><circle cx="11" cy="27" r="2.5"/><path d="M9 38h4M11 36v4"/><circle cx="53" cy="27" r="1.6"/><circle cx="53" cy="37" r="1.6"/><circle cx="50" cy="32" r="1.6"/><circle cx="56" cy="32" r="1.6"/>`,
  gamepad: `<path d="M7 34c0-10 6-17 15-17h20c9 0 15 7 15 17l1 10c1 7-5 10-9 6l-6-7H21l-6 7c-4 4-10 1-9-6z"/><path d="M17 23.5v7M13.5 27h7"/><circle cx="47" cy="23.5" r="1.4"/><circle cx="50.5" cy="27" r="1.4"/><circle cx="47" cy="30.5" r="1.4"/><circle cx="43.5" cy="27" r="1.4"/><rect x="28" y="20" width="8" height="5" rx="2"/><circle cx="25" cy="35" r="4.5"/><circle cx="39" cy="35" r="4.5"/>`,
  laptop: `<rect x="12" y="12" width="40" height="28" rx="3"/><path d="M5 46h54l-4 6H9z"/><path d="M28 43h8"/>`,
  phone: `<rect x="19" y="5" width="26" height="54" rx="5"/><path d="M28 11h8"/><circle cx="32" cy="52" r="1.6"/>`,
  pc: `<rect x="14" y="6" width="26" height="50" rx="3"/><path d="M19 14h16M19 19h16"/><circle cx="27" cy="44" r="4"/><path d="M46 20h8M46 26h8"/><path d="M18 60h18"/>`,
  recycle: `<path d="M48 24A18 18 0 0 0 16 22M15 11v12h12"/><path d="M16 40a18 18 0 0 0 32 2M49 53V41H37"/>`,
  stick: `<circle cx="32" cy="32" r="23" stroke-dasharray="2 5"/><circle cx="37" cy="27" r="12"/><circle cx="37" cy="27" r="5"/><path d="M32 4v5M32 55v5M4 32h5M55 32h5"/><path d="M13 51l9-9M22 48v-6h-6"/>`,
  hdmi: `<path d="M8 16h48v14l-6 8H14l-6-8z"/><path d="M15 23h34" stroke-dasharray="1.5 3"/><path d="M20 38v7h24v-7"/><path d="M26 45v12h12V45"/>`,
  fan: `<circle cx="32" cy="32" r="23"/><circle cx="32" cy="32" r="4"/><path d="M32 28c-2-8 2-14 8-14 4 0 4 8-2 14"/><path transform="rotate(120 32 32)" d="M32 28c-2-8 2-14 8-14 4 0 4 8-2 14"/><path transform="rotate(240 32 32)" d="M32 28c-2-8 2-14 8-14 4 0 4 8-2 14"/>`,
  power: `<path d="M32 8v22"/><path d="M20 16A21 21 0 1 0 44 16"/>`,
  battery: `<rect x="6" y="20" width="46" height="24" rx="4"/><path d="M52 28h5v8h-5"/><path d="M34 24l-9 11h8l-3 9"/>`,
  scope: `<g transform="rotate(-20 33 22)"><rect x="28" y="9" width="10" height="24" rx="2.5"/><rect x="30.5" y="4" width="5" height="6" rx="1"/><rect x="30.5" y="33" width="5" height="6" rx="1"/></g><path d="M43 17c14 4 15 26 1 36"/><rect x="16" y="43" width="22" height="3.5" rx="1"/><path d="M10 57h38M44 53v4"/>`,
  meter: `<rect x="16" y="6" width="32" height="52" rx="5"/><rect x="21" y="11" width="22" height="13" rx="2"/><path d="M24 20l3-4 3 5 3-6 3 5"/><circle cx="32" cy="42" r="8"/><path d="M32 42l4-4"/>`,
  chip: `<rect x="20" y="20" width="24" height="24" rx="3"/><rect x="27" y="27" width="10" height="10" rx="1.5"/><path d="M26 20v-8M32 20v-8M38 20v-8M26 44v8M32 44v8M38 44v8M20 26h-8M20 32h-8M20 38h-8M44 26h8M44 32h8M44 38h8"/>`,
  code: `<path d="M22 20L10 32l12 12M42 20l12 12-12 12M36 14l-8 36"/>`,
  chat: `<path d="M9 12h46v30H30l-11 11V42H9z"/><path d="M21 25h22M21 32h14"/>`,
  search: `<circle cx="27" cy="27" r="16"/><path d="M39 39l15 15"/><path d="M17 28h5l3-6 4 12 3-6h3"/>`,
  tag: `<path d="M8 31L31 8h23v23L31 54z"/><circle cx="43" cy="19" r="3"/>`,
  shield: `<path d="M32 5l20 7v16c0 14-9 24-20 30-11-6-20-16-20-30V12z"/><path d="M23 31l7 7 12-14"/>`,
};

export const icon = (name, size = 28, cls = "") =>
  `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
