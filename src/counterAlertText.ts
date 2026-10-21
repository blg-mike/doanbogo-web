import { formatNumber, t, type LocaleKey } from './locales/index'

export function translateCounterAlert(message: string) {
  let match = /^목표 (\d+)단을 완료했어요\.$/.exec(message)
  if (match) return t('목표 {row}단을 완료했어요.', { row: formatNumber(Number(match[1])) })
  match = /^다음 단에 목표 (\d+)단이에요\.$/.exec(message)
  if (match) return t('다음 단에 목표 {row}단이에요.', { row: formatNumber(Number(match[1])) })
  match = /^(.+) · (늘림|줄임) 작업 단이에요\.$/.exec(message)
  if (match) return t('{name} · {task} 작업 단이에요.', { name: match[1], task: t(match[2] as LocaleKey) })
  match = /^(.+) · 무늬 반복 단이에요\.$/.exec(message)
  if (match) return t('{name} · 무늬 반복 단이에요.', { name: match[1] })
  match = /^다음 단에 (.+) (늘림|줄임) 작업이 있어요\.$/.exec(message)
  if (match) return t('다음 단에 {name} {task} 작업이 있어요.', { name: match[1], task: t(match[2] as LocaleKey) })
  match = /^다음 단에 (.+) 무늬단이 시작돼요\.$/.exec(message)
  if (match) return t('다음 단에 {name} 무늬단이 시작돼요.', { name: match[1] })
  return message
}
