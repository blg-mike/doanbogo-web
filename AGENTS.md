# 니트피크 작업 기준

프로젝트 이름: 니트피크 · English: KnitPeek

기준일: 2026-10-15 · 개발 대상: `doanbogo-web`

## 먼저 확인할 문서
- 제품과 화면: `DESIGN.md`
- 소스 구조와 저장 계약: `Architecture.md`
- UI 토큰과 승인 팔레트: `design_system.md`
- 변경 전 관련 소스와 호출 경로를 확인한다. 문서와 코드가 다르면 현재 코드를 확인한 뒤 문서를 갱신한다.

## 실행·검사
- 사용자 실행 파일은 `doanbogo-web/portable/index.html`이다.
- 웹 소스 변경 후 `npm run build:portable`로 실행 파일과 홈페이지를 재생성한다.
- `index.html`은 Vite 진입점, `npm run dev`는 개발 서버다.
- 기본 검사: `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:design-system`, `npm run build:portable`.
- 타입 검사를 우회한 빌드를 표준 빌드 통과로 보고하지 않는다.
- 코드 검사, portable 생성, 실제 브라우저 조작, Android 실기, GitHub 배포를 각각 구분해 보고한다.

## 변경 규칙
- 가정·변경 범위·성공 기준을 먼저 밝히고 필요한 부분만 수정한다.
- 기존 로컬 변경을 보존한다. 관련 없는 리팩터링·파일 삭제·정리를 하지 않는다.
- 기존 저장·실행 취소·백업 경로를 재사용하고 저장 실패 시 사용자 데이터를 유지한다.
- 저장 형식 변경은 `types.ts`, `storage.ts`, `backup.ts`와 관련 테스트를 함께 확인한다.
- UI는 시맨틱 토큰, 승인 팔레트, 최소 44px 조작 영역을 사용한다. 저장된 객체 색상은 보존한다.
- 설정 팝오버는 연결 요소 옆에 표시하고 바깥 클릭·Escape로 닫는다. Escape 후 연결 요소로 포커스를 돌린다.
- 카운터 작업 패널은 PDF 조작 중 유지한다. 입력창의 선택·복사·키보드 편집은 보존한다.
- 7개 locale의 문구·접근성 이름을 함께 갱신한다. 사용자 제목·메모·PDF 원문은 번역하지 않는다.
- GitHub 커밋·푸시·배포는 사용자가 요청한 범위에서 진행한다.

## 문서 유지
- 현재 구현의 요약과 작업에 필요한 계약만 기록한다.
- 변경 이력·과거 계획·반복 검증 로그를 누적하지 않고 해당 요약을 갱신한다.
- 루트와 웹의 `AGENTS.md`, `DESIGN.md`, `Architecture.md`, `design_system.md`를 같은 기준으로 유지한다.
