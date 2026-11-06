export const viewerTutorialSteps = [
  ['두 영역 보기', '두 영역에서 서로 다른 페이지를 나란히 볼 수 있어요. 각 영역의 페이지와 확대 위치는 따로 움직이고, 가운데 경계로 너비를 조절해요.', 'split'],
  ['집중 보기 켜기', '주변 도구를 접고 카운터와 타이머를 남겨 도안에 집중해요. 해제 버튼이나 Escape로 돌아올 수 있어요.', 'focus'],
  ['진행선', '지금 뜨는 위치를 표시해요. 선을 끌어 위치를 옮기고, 짧게 누르면 메뉴가 열려요.', 'progress-tool'],
  ['진행선 메뉴', '마커와 스타일을 바꾸고 참고선을 추가하거나 선택한 선을 삭제할 수 있어요. 스타일에서 선의 색과 두께를 조절해요.', 'progress-tool'],
  ['집중선 설정', '스타일에서 집중선을 켜면 현재 줄 주변이 밝게 보여요. 집중 강도와 띠 두께를 조절할 수 있어요.', 'progress-tool'],
  ['카운터 관리', '단수를 세고 보조 카운터를 관리해요. 카운터 이름을 누르면 설정이 열리고, − / +로 값을 바꿔요.', 'counter-manage'],
  ['작업 타이머', '재생을 눌러 작업시간을 재고, 일시정지하면 저장돼요. 시간을 누르면 날짜별 기록을 볼 수 있어요.', 'timer'],
  ['도안 회전', '현재 영역의 도안을 시계 방향으로 90도 돌려요. 좁은 화면에서는 더보기 메뉴 안에 있어요.', 'rotate'],
  ['뜨개보고서', '게이지·실·바늘과 완성 기록을 정리해요. 뜨개보고서에서 내용을 작성하고 PDF나 공유 이미지로 남길 수 있어요.', 'report'],
] as const

export function viewerTutorialPlacement(target: DOMRect | null, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  if (!target) return { left: Math.max(12, (viewportWidth - width) / 2), top: Math.max(12, (viewportHeight - height) / 2), diameter: 0, side: 'center' as const }
  const diameter = Math.min(Math.max(target.width, target.height) + 24, Math.max(48, Math.min(viewportWidth, viewportHeight) - 32))
  const left = Math.min(Math.max(12, target.left + target.width / 2 - width / 2), Math.max(12, viewportWidth - width - 12))
  const centerY = target.top + target.height / 2
  const radius = diameter / 2
  const circleTop = centerY - radius
  const circleBottom = centerY + radius
  const spaceAbove = circleTop - 18 - 12
  const spaceBelow = viewportHeight - circleBottom - 18 - 12
  const side = spaceAbove >= height || spaceAbove >= spaceBelow ? 'top' as const : 'bottom' as const
  const preferredTop = side === 'top' ? circleTop - height - 18 : circleBottom + 18
  const top = Math.min(Math.max(12, preferredTop), Math.max(12, viewportHeight - height - 12))
  return { left, top, diameter, side }
}
