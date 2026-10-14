export const DESIGN_SYSTEM_COLORS = {
  primary: '#47613F',
  primaryHover: '#3D5537',
  primaryPressed: '#35492F',
  primarySoft: '#E6EDE0',
  secondary: '#4F6B7A',
  secondaryHover: '#435D69',
  secondarySoft: '#E9EEF1',
  tertiary: '#3D705C',
  tertiarySoft: '#E5F0EB',
  background: '#F7F4EE',
  surface: '#FFFCF7',
  surfaceSubtle: '#F4F1EC',
  viewerBackground: '#E9E6DF',
  text: '#2E332D',
  textSecondary: '#666B60',
  textMuted: '#918B84',
  border: '#E5DDD2',
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
  pattern: '#7A6A94',
  task: '#D46A4C',
} as const
