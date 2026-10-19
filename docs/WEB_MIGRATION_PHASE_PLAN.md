# 웹 실행·전달 메모

## 산출물
- `doanbogo-web/portable/index.html`: 사용자 실행용 단일 앱.
- `doanbogo-web/portable/homepage.html`: 안내·법률 화면을 내장한 단일 홈페이지.
- `doanbogo-web/dist/`: 일반 웹·PWA 배포 결과.

## 실행
웹 폴더에서 Node.js 24·`npm ci`를 사용한다.
- 개발: `npm run dev`; 일반 빌드·미리보기: `npm run build`, `npm run preview`.
- 앱·홈페이지 생성: `npm run build:portable`; 홈페이지만: `npm run build:homepage`.
- 홈페이지 생성은 상위 프로젝트 `docs/terms-*.md`, `privacy-*.md`가 필요하다. 독립 웹 checkout의 일반 빌드·단위 테스트와 구분한다.

## 전달
- 원본을 편집하고 생성 HTML은 재생성한다. 로고·파비콘·PWA·폰트·Worker 등 인라인 자산과 진입 경로를 확인한다.
- 로컬 저장은 기기·브라우저·출처별로 분리된다. 임시 저장은 브라우저 종료 시 사라질 수 있다.
- 파일 직접 실행·HTTP·공개 웹·Android 내장을 별도 검증한다.
- main push는 `.github/workflows/pages.yml`에서 디자인·타입·린트·테스트·일반 빌드 후 Pages를 배포한다.
- 코드 검사·portable 생성·실제 화면·Android 실기·배포 결과를 각각 보고한다. GitHub 반영과 APK 생성은 사용자 요청 범위에서 수행한다.
