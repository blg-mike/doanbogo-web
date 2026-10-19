# 독립 차트 메모

- `/charts/new`에서 대바늘 색상 모눈 또는 코바늘 Free Form 기호 차트를 생성한다.
- 대바늘은 코·단 수·게이지·cm/inch 기반 크기 계산과 색칠·지우개·채우기·선택·복사·반전을 제공한다.
- 코바늘은 기호 배치·다중 선택·이동·회전·크기 조절과 레이어 이름·순서·표시·잠금을 제공한다.
- 실 색상은 사용자 지정이며 저장·실행 취소·PNG/PDF 출력과 프로젝트 카드·검색·정렬에 반영한다.
- 관련 소스: `ChartCreate.tsx`, `ChartEditor.tsx`, `charts.ts`, `storage.ts`, `backup.ts`, `Chart.css`.
- 유형별 생성·편집·복원, 스트로크 실행 취소, 변환 경계·레이어·출력을 확인한다. 실 색은 필기 팔레트와 별도로 유지한다.
- PDF·사진의 차트 행 분석은 [진행선 메모](PROGRESS_LINE_DIRECT_DRAG_PHASE_PLAN.md)의 별도 Viewer 경로다.
