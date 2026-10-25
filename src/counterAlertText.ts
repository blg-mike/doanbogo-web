import { formatNumber, t, type LocaleKey } from './locales/index'
import type { RepeatCounterStepBlockReason } from './smartCounter'

export function repeatCounterBlockLabel(reason: RepeatCounterStepBlockReason | null) {
  if (reason === 'base-complete') return t('연동한 일반 카운터의 목표에 도달했거나 완료되어 반복 진행을 늘릴 수 없습니다.')
  if (reason === 'base-limit') return t('연동한 일반 카운터가 9999단이라 반복 진행을 늘릴 수 없습니다.')
  if (reason === 'missing-base') return t('연동한 일반 카운터를 찾을 수 없어 진행할 수 없습니다.')
  return undefined
}

export function translateCounterAlert(message: string, includeCounterName = true) {
  let match = /^목표 (\d+)단을 완료했어요\.$/.exec(message)
  if (match) return t('목표 {row}단을 완료했어요.', { row: formatNumber(Number(match[1])) })
  match = /^다음 단에 목표 (\d+)단이에요\.$/.exec(message)
  if (match) return t('다음 단에 목표 {row}단이에요.', { row: formatNumber(Number(match[1])) })
  match = /^(.+) · (늘림|줄임) 작업 단이에요\.$/.exec(message)
  if (match) return includeCounterName ? t('{name} · {task} 작업 단이에요.', { name: match[1], task: t(match[2] as LocaleKey) }) : t('{task} 작업 단이에요.', { task: t(match[2] as LocaleKey) })
  match = /^(.+) · 무늬 반복 단이에요\.$/.exec(message)
  if (match) return includeCounterName ? t('{name} · 무늬 반복 단이에요.', { name: match[1] }) : t('무늬 반복 단이에요.')
  match = /^다음 단에 (.+) (늘림|줄임) 작업이 있어요\.$/.exec(message)
  if (match) return t('다음 단에 {name} {task} 작업이 있어요.', { name: match[1], task: t(match[2] as LocaleKey) })
  match = /^다음 단에 (.+) 무늬단이 시작돼요\.$/.exec(message)
  if (match) return t('다음 단에 {name} 무늬단이 시작돼요.', { name: match[1] })
  return message
}
