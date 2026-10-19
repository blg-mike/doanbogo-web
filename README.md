# 니트피크 웹

React·TypeScript·Vite·PDF.js 기반 뜨개 작업 도구. 한국어는 니트피크, 그 외 언어는 KnitPeek다. PDF·사진·독립 차트와 작업 기록을 브라우저 로컬에 저장한다.

## 실행·검사
Node.js 24 기준. 웹 폴더에서 실행한다.

```powershell
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run check:design-system
npm run build
npm run build:portable
```

- 사용자 실행 파일: `portable/index.html`; 홈페이지: `portable/homepage.html`. 생성 HTML 대신 원본을 수정한다.
- 홈페이지 빌드는 상위 프로젝트 `../docs/terms-*.md`, `privacy-*.md`를 읽는다. 독립 checkout의 단위 테스트는 상위 문서에 의존하지 않는다.
- 일반 웹은 `dist/`로 생성하고 `npm run preview`로 확인한다.
- 저장은 기기·브라우저·출처별로 분리된다. 임시 메모리 모드에서는 브라우저 종료 시 작업이 사라질 수 있다. 중요한 원본과 출력물은 별도 보관한다.

## 문서
- [작업 기준](AGENTS.md) · [화면·기능](DESIGN.md) · [소스·저장 계약](Architecture.md) · [디자인시스템](design_system.md)
- [진행선·행 인식](docs/PROGRESS_LINE_DIRECT_DRAG_PHASE_PLAN.md) · [편집·그룹](docs/FEATURE_IMPROVEMENT_PHASE_PLAN.md)
- [보고서·시간](docs/KNITTING_REPORT_PHASE_PLAN.md) · [독립 차트](docs/CHART_CREATION_PHASE_PLAN.md)
- [검증 목록](docs/WEB_MIGRATION_CHECKLIST.md) · [실행·전달](docs/WEB_MIGRATION_PHASE_PLAN.md) · [홈페이지](HOMEPAGE_PORTABLE.md)

## 공개 웹·Android
[니트피크](https://blg-mike.github.io/doanbogo-web/) · [저장소](https://github.com/blg-mike/doanbogo-web).
main push는 검사·일반 빌드 후 Pages를 자동 배포한다. 실제 서비스 상태는 별도 확인한다.
Android 테스트 앱은 형제 폴더 `doanbogo-app`에서 웹 portable을 다시 빌드해 내장한다. 기존 APK가 최신 웹을 자동 반영하지 않는다.
