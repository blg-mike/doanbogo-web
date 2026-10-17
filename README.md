# 니트피크 웹

React·TypeScript·Vite·PDF.js 기반 뜨개 작업 도구. PDF·사진 도안·차트와 작업 기록을 브라우저 로컬에 저장한다.

## 시작
Node.js 24 기준으로 실행한다.

```powershell
npm ci
npm run build:portable
```

사용자 실행 파일은 `portable/index.html`, 홍보 홈페이지는 `portable/homepage.html`이다. 원본 수정 후 재생성하고 생성 HTML은 직접 편집하지 않는다.

## 개발·검사
```powershell
npm run dev
npm run typecheck
npm run lint
npm test
npm run check:design-system
npm run build
npm run preview
npm run build:portable
```

브라우저 저장 사용 여부를 확인하고 임시 저장 상태에서는 .doanbogo 작업 파일을 내보낸다. 현재 백업은 v14이며 v1~v14 가져오기를 지원한다.

## 문서
- [작업 규칙](AGENTS.md) · [화면 요약](DESIGN.md) · [기술 구조](Architecture.md) · [디자인시스템](design_system.md)
- [검증 목록](docs/WEB_MIGRATION_CHECKLIST.md) · [진행선](docs/PROGRESS_LINE_DIRECT_DRAG_PHASE_PLAN.md)
- [편집·그룹](docs/FEATURE_IMPROVEMENT_PHASE_PLAN.md) · [보고서](docs/KNITTING_REPORT_PHASE_PLAN.md) · [차트](docs/CHART_CREATION_PHASE_PLAN.md)
- [홈페이지 생성](HOMEPAGE_PORTABLE.md)

## 공개 웹
[니트피크](https://blg-mike.github.io/doanbogo-web/) · [저장소](https://github.com/blg-mike/doanbogo-web).
main 변경은 `.github/workflows/pages.yml`에서 검사·일반 빌드 후 GitHub Pages로 배포한다. 공개 반영은 워크플로와 실제 서비스 상태를 확인한다.
