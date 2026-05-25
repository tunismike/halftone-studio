export type PaletteCategory =
  | 'handheld'
  | 'console'
  | 'computer'
  | 'pc'
  | 'fantasy-console'
  | 'broadcast'
  | 'modern-designer'
  | 'monochrome';

export interface PaletteDef {
  id: string;
  name: string;
  category: PaletteCategory;
  colors: string[];
  notes?: string;
}

// Generic descriptive names. RGB values straight from research brief
// at docs/dither-and-palettes-reference.md. No commercial branding.
export const BUILTIN_PALETTES: PaletteDef[] = [
  // ── Monochrome ─────────────────────────────────────────────
  {
    id: 'mono-1bit',
    name: '1-bit black & white',
    category: 'monochrome',
    colors: ['#ffffff', '#000000'],
  },
  {
    id: 'mono-gray-4',
    name: '4 grays',
    category: 'monochrome',
    colors: ['#ffffff', '#a9a9a9', '#545454', '#000000'],
    notes: 'Pure gray ramp.',
  },
  {
    id: 'mono-handheld-green',
    name: 'Handheld 4 (green LCD)',
    category: 'handheld',
    colors: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
    notes: 'Classic green-tinted LCD reference.',
  },

  // ── 8-bit consoles ─────────────────────────────────────────
  {
    id: 'console-nes-ntsc',
    name: 'NES NTSC (64)',
    category: 'console',
    colors: [
      '#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400',
      '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#000000', '#000000',
      '#bcbcbc', '#0078f8', '#0058f8', '#6844fc', '#d800cc', '#e40058', '#f83800', '#e45c10',
      '#ac7c00', '#00b800', '#00a800', '#00a844', '#008888', '#000000', '#000000', '#000000',
      '#f8f8f8', '#3cbcfc', '#6888fc', '#9878f8', '#f878f8', '#f85898', '#f87858', '#fca044',
      '#f8b800', '#b8f818', '#58d854', '#58f898', '#00e8d8', '#787878', '#000000', '#000000',
      '#fcfcfc', '#a4e4fc', '#b8b8f8', '#d8b8f8', '#f8b8f8', '#f8a4c0', '#f0d0b0', '#fce0a8',
      '#f8d878', '#d8f878', '#b8f8b8', '#b8f8d8', '#00fcfc', '#f8d8f8', '#000000', '#000000',
    ],
    notes: 'Widely used emulator-style NTSC PPU reference.',
  },
  {
    id: 'console-master-system',
    name: 'Master System (64)',
    category: 'console',
    colors: [
      '#000000', '#550000', '#aa0000', '#ff0000', '#005500', '#555500', '#aa5500', '#ff5500',
      '#00aa00', '#55aa00', '#aaaa00', '#ffaa00', '#00ff00', '#55ff00', '#aaff00', '#ffff00',
      '#000055', '#550055', '#aa0055', '#ff0055', '#005555', '#555555', '#aa5555', '#ff5555',
      '#00aa55', '#55aa55', '#aaaa55', '#ffaa55', '#00ff55', '#55ff55', '#aaff55', '#ffff55',
      '#0000aa', '#5500aa', '#aa00aa', '#ff00aa', '#0055aa', '#5555aa', '#aa55aa', '#ff55aa',
      '#00aaaa', '#55aaaa', '#aaaaaa', '#ffaaaa', '#00ffaa', '#55ffaa', '#aaffaa', '#ffffaa',
      '#0000ff', '#5500ff', '#aa00ff', '#ff00ff', '#0055ff', '#5555ff', '#aa55ff', '#ff55ff',
      '#00aaff', '#55aaff', '#aaaaff', '#ffaaff', '#00ffff', '#55ffff', '#aaffff', '#ffffff',
    ],
  },
  {
    id: 'console-atari-2600-ntsc',
    name: 'Atari 2600 NTSC (128)',
    category: 'console',
    colors: [
      '#000000', '#444400', '#702800', '#841800', '#880000', '#78005c', '#480078', '#140084',
      '#000088', '#00187c', '#002c5c', '#00402c', '#003c00', '#143800', '#2c3000', '#442800',
      '#404040', '#646410', '#844414', '#983418', '#9c2020', '#8c2074', '#602090', '#302098',
      '#1c209c', '#1c3890', '#1c4c78', '#1c5c48', '#205c20', '#345c1c', '#4c501c', '#644818',
      '#6c6c6c', '#848424', '#985c28', '#ac5030', '#b03c3c', '#a03c88', '#783ca4', '#4c3cac',
      '#3840b0', '#3854a8', '#386890', '#387c64', '#407c40', '#507c38', '#687034', '#846830',
      '#909090', '#a0a034', '#ac783c', '#c06848', '#c05858', '#b0589c', '#8c58b8', '#6858c0',
      '#505cc0', '#5070bc', '#5084ac', '#509c80', '#5c9c5c', '#6c9850', '#848c4c', '#a08444',
      '#b0b0b0', '#b8b840', '#bc8c4c', '#d0805c', '#d07070', '#c070b0', '#a070cc', '#7c70d0',
      '#6874d0', '#6888cc', '#689cc0', '#68b494', '#74b474', '#84b468', '#9ca864', '#b89c58',
      '#c8c8c8', '#d0d050', '#cca05c', '#e09470', '#e08888', '#d084c0', '#b484dc', '#9488e0',
      '#7c8ce0', '#7c9cdc', '#7cb4d4', '#7cd0ac', '#8cd08c', '#9ccc7c', '#b4c078', '#d0b46c',
      '#dcdcdc', '#e8e85c', '#dcb468', '#eca880', '#eca0a0', '#dc9cd0', '#c49cec', '#a8a0ec',
      '#90a4ec', '#90b4ec', '#90cce8', '#90e4c0', '#a4e4a4', '#b4e490', '#ccd488', '#e8cc7c',
      '#ececec', '#fcfc68', '#ecc878', '#fcbc94', '#fcb4b4', '#ecb0e0', '#d4b0fc', '#bcb4fc',
      '#a4b8fc', '#a4c8fc', '#a4e0fc', '#a4fcd4', '#b8fcb8', '#c8fca4', '#e0ec9c', '#fce08c',
    ],
  },

  // ── 8-bit micros ───────────────────────────────────────────
  {
    id: 'micro-c64',
    name: 'Home computer 16 (C64)',
    category: 'computer',
    colors: [
      '#000000', '#ffffff', '#883932', '#67b6bd',
      '#8b3f96', '#55a049', '#40318d', '#bfce72',
      '#8b5429', '#574200', '#b86962', '#505050',
      '#787878', '#94e089', '#7869c4', '#9f9f9f',
    ],
    notes: 'RGB values disputed across composite, luma/chroma, and emulator models.',
  },
  {
    id: 'micro-zx',
    name: 'Speccy 15',
    category: 'computer',
    colors: [
      '#000000', '#0000c0', '#c00000', '#c000c0', '#00c000', '#00c0c0', '#c0c000', '#c0c0c0',
      '#0000ff', '#ff0000', '#ff00ff', '#00ff00', '#00ffff', '#ffff00', '#ffffff',
    ],
    notes: 'Normal 7 + bright 7 + shared black.',
  },
  {
    id: 'micro-cpc',
    name: 'CPC 27',
    category: 'computer',
    colors: [
      '#000000', '#000080', '#0000ff',
      '#800000', '#800080', '#8000ff',
      '#ff0000', '#ff0080', '#ff00ff',
      '#008000', '#008080', '#0080ff',
      '#808000', '#808080', '#8080ff',
      '#ff8000', '#ff8080', '#ff80ff',
      '#00ff00', '#00ff80', '#00ffff',
      '#80ff00', '#80ff80', '#80ffff',
      '#ffff00', '#ffff80', '#ffffff',
    ],
  },
  {
    id: 'micro-msx1',
    name: 'TMS9918 16',
    category: 'computer',
    colors: [
      '#000000', '#010101', '#3eb849', '#74d07d',
      '#5955e0', '#8076f1', '#b95e51', '#65dbef',
      '#db6559', '#ff897d', '#ccc35e', '#ded087',
      '#3aa241', '#b766b5', '#cccccc', '#ffffff',
    ],
  },
  {
    id: 'micro-apple-ii-hgr',
    name: 'Apple II HGR 6',
    category: 'computer',
    colors: ['#000000', '#d93cf0', '#26c30f', '#ffffff', '#d9680f', '#2697f0'],
    notes: 'Composite-artifact colors; display-dependent.',
  },

  // ── Early PC ───────────────────────────────────────────────
  {
    id: 'pc-cga-0-low',
    name: 'CGA 4-color (palette 0 low)',
    category: 'pc',
    colors: ['#000000', '#00aa00', '#aa0000', '#aa5500'],
  },
  {
    id: 'pc-cga-0-high',
    name: 'CGA 4-color (palette 0 high)',
    category: 'pc',
    colors: ['#000000', '#55ff55', '#ff5555', '#ffff55'],
  },
  {
    id: 'pc-cga-1-low',
    name: 'CGA 4-color (palette 1 low)',
    category: 'pc',
    colors: ['#000000', '#00aaaa', '#aa00aa', '#aaaaaa'],
  },
  {
    id: 'pc-cga-1-high',
    name: 'CGA 4-color (palette 1 high)',
    category: 'pc',
    colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
  },
  {
    id: 'pc-cga-mode-5',
    name: 'CGA mode 5 (cyan/red/white)',
    category: 'pc',
    colors: ['#000000', '#55ffff', '#ff5555', '#ffffff'],
  },
  {
    id: 'pc-ega-16',
    name: 'PC 16-color (EGA/CGA)',
    category: 'pc',
    colors: [
      '#000000', '#0000aa', '#00aa00', '#00aaaa',
      '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
      '#555555', '#5555ff', '#55ff55', '#55ffff',
      '#ff5555', '#ff55ff', '#ffff55', '#ffffff',
    ],
  },

  // ── Fantasy console ────────────────────────────────────────
  {
    id: 'fantasy-pico8',
    name: 'PICO-8 16',
    category: 'fantasy-console',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751',
      '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436',
      '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ],
  },
  {
    id: 'fantasy-pico8-secret',
    name: 'PICO-8 secret 16',
    category: 'fantasy-console',
    colors: [
      '#291814', '#111d35', '#422136', '#125359',
      '#742f29', '#49333b', '#a28879', '#f3ef7d',
      '#be1250', '#ff6c24', '#a8e72e', '#00b543',
      '#065ab5', '#754665', '#ff6e59', '#ff9d81',
    ],
  },

  // ── Broadcast ──────────────────────────────────────────────
  {
    id: 'broadcast-teletext',
    name: 'Teletext 8',
    category: 'broadcast',
    colors: ['#000000', '#0000ff', '#ff0000', '#ff00ff', '#00ff00', '#00ffff', '#ffff00', '#ffffff'],
  },

  // ── Modern designer ────────────────────────────────────────
  {
    id: 'modern-nord',
    name: 'Nord 16',
    category: 'modern-designer',
    colors: [
      '#2e3440', '#3b4252', '#434c5e', '#4c566a',
      '#d8dee9', '#e5e9f0', '#eceff4', '#8fbcbb',
      '#88c0d0', '#81a1c1', '#5e81ac', '#bf616a',
      '#d08770', '#ebcb8b', '#a3be8c', '#b48ead',
    ],
  },
  {
    id: 'modern-solarized-dark',
    name: 'Solarized 16',
    category: 'modern-designer',
    colors: [
      '#002b36', '#073642', '#586e75', '#657b83',
      '#839496', '#93a1a1', '#eee8d5', '#fdf6e3',
      '#b58900', '#cb4b16', '#dc322f', '#d33682',
      '#6c71c4', '#268bd2', '#2aa198', '#859900',
    ],
  },
  {
    id: 'modern-dracula',
    name: 'Dracula 11',
    category: 'modern-designer',
    colors: [
      '#282a36', '#44475a', '#f8f8f2', '#6272a4', '#8be9fd',
      '#50fa7b', '#ffb86c', '#ff79c6', '#bd93f9', '#ff5555', '#f1fa8c',
    ],
  },
  {
    id: 'modern-gruvbox-dark',
    name: 'Gruvbox dark 16',
    category: 'modern-designer',
    colors: [
      '#282828', '#3c3836', '#504945', '#665c54',
      '#bdae93', '#d5c4a1', '#ebdbb2', '#fbf1c7',
      '#fb4934', '#fe8019', '#fabd2f', '#b8bb26',
      '#8ec07c', '#83a598', '#d3869b', '#d65d0e',
    ],
  },
  {
    id: 'modern-tokyo-night',
    name: 'Tokyo night 16',
    category: 'modern-designer',
    colors: [
      '#1a1b26', '#161925', '#24263b', '#414a6b',
      '#a9b1d6', '#c0caf5', '#399add', '#2ac3de',
      '#73d0ff', '#7aa2f7', '#9d7cd8', '#bb9af7',
      '#f7768e', '#ff9e64', '#e0af68', '#9ece6a',
    ],
  },
];

import { findCustomPalette } from './custom-palettes';

export function findPalette(id: string): PaletteDef | undefined {
  const builtin = BUILTIN_PALETTES.find((p) => p.id === id);
  if (builtin) return builtin;
  return findCustomPalette(id);
}
