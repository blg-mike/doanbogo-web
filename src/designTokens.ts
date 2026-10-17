export const DESIGN_SYSTEM_COLORS = {
  primary: '#21A366',
  primaryText: '#111111',
  primaryHover: '#107C41',
  primaryPressed: '#0B5A30',
  primarySoft: '#E7F5EC',
  secondary: '#111111',
  secondaryHover: '#303030',
  secondarySoft: '#FFFFFF',
  tertiary: '#107C41',
  tertiarySoft: '#E7F5EC',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSubtle: '#FFFFFF',
  viewerBackground: '#E9E6DF',
  text: '#111111',
  textSecondary: '#525650',
  textMuted: '#777C76',
  border: '#CFCFC8',
  divider: '#E4E2DC',
  danger: '#B9473F',
  dangerSoft: '#F7E9E6',
  warning: '#B88732',
  warningSoft: '#F6EEDC',
  progress: '#21A366',
} as const

export const DEFAULT_VERTICAL_GUIDE_COLOR = '#4F6B7A'

export const FUNCTIONAL_COLOR_PRESETS = [
  { name: '먹색', color: '#2C2B27' },
  { name: '따뜻한 빨강', color: '#C85E4B' },
  { name: '차분한 파랑', color: '#557A95' },
  { name: '차분한 초록', color: '#5C8167' },
  { name: '부드러운 보라', color: '#7A6A94' },
  { name: '회색', color: '#7D7A76' },
] as const

export const ANNOTATION_COLOR_PRESETS = [
  { name: '핑크', color: '#EC4899' },
  { name: '빨강', color: '#EF4444' },
  { name: '주황', color: '#F97316' },
  { name: '노랑', color: '#FACC15' },
  { name: '초록', color: '#22C55E' },
  { name: '청록', color: '#14B8A6' },
  { name: '하늘', color: '#38BDF8' },
  { name: '파랑', color: '#3B82F6' },
  { name: '보라', color: '#A855F7' },
  { name: '진회색', color: '#374151' },
] as const

export const PROGRESS_LINE_COLOR_PRESETS = ANNOTATION_COLOR_PRESETS

export const DEFAULT_COUNTER_COLORS = {
  simple: '#557A95',
  pattern: '#5C8167',
  task: '#D46A4C',
} as const
