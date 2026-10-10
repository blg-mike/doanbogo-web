export const DESIGN_SYSTEM_COLORS = {
  primary: '#4B6334',
  primaryHover: '#40552C',
  primaryPressed: '#354624',
  primarySoft: '#E9EEE4',
  secondary: '#4F6B7A',
  secondaryHover: '#435D69',
  secondarySoft: '#E9EEF1',
  tertiary: '#3D705C',
  tertiarySoft: '#E5F0EB',
  background: '#FBF9F5',
  surface: '#FFFFFF',
  surfaceSubtle: '#F4F1EC',
  text: '#2C2B27',
  textSecondary: '#6E6A64',
  textMuted: '#918B84',
  border: '#E4DED6',
  divider: '#ECE6DF',
  danger: '#B9473F',
  dangerSoft: '#F7E9E6',
  warning: '#B88732',
  warningSoft: '#F6EEDC',
  progress: '#D46A4C',
} as const

export const FUNCTIONAL_COLOR_PRESETS = [
  { name: '먹색', color: '#2C2B27' },
  { name: '따뜻한 빨강', color: '#C85E4B' },
  { name: '차분한 파랑', color: '#557A95' },
  { name: '차분한 초록', color: '#5C8167' },
  { name: '부드러운 보라', color: '#7A6A94' },
  { name: '회색', color: '#7D7A76' },
] as const

export const ANNOTATION_COLOR_PRESETS = [
  { name: '레드', color: '#E5494D' },
  { name: '오렌지', color: '#F28C44' },
  { name: '옐로우', color: '#F4C84B' },
  { name: '그린', color: '#43A979' },
  { name: '민트', color: '#45BDB1' },
  { name: '블루', color: '#438EE9' },
  { name: '퍼플', color: '#9469D5' },
  { name: '핑크', color: '#E77CAA' },
  { name: '그레이', color: '#848A96' },
  { name: '블랙', color: '#292C33' },
] as const

export const PROGRESS_LINE_COLOR_PRESETS = [
  { name: '진행선 코랄', color: DESIGN_SYSTEM_COLORS.progress },
  ...FUNCTIONAL_COLOR_PRESETS.slice(1),
] as const

export const DEFAULT_COUNTER_COLORS = {
  simple: '#557A95',
  pattern: '#7A6A94',
  task: '#D46A4C',
} as const
