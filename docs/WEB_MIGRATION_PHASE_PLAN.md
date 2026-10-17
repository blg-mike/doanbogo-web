# 웹 실행·전달 요약

## 산출물
- `doanbogo-web/portable/index.html`: 사용자가 실행하는 단일 앱 HTML.
- `doanbogo-web/portable/homepage.html`: 단일 홍보 홈페이지.
- `doanbogo-web/dist/`: 일반 웹·PWA 배포 산출물.

## 명령
웹 폴더에서 `npm ci` 후 `npm run build:portable`을 실행한다. 개발은 `npm run dev`, 일반 웹 빌드는 `npm run build`, production 미리보기는 `npm run preview`를 사용한다.

## 전달 기준
- portable은 필요한 코드·스타일·자산을 내부에 포함하며 생성 HTML 대신 원본을 편집한다.
- 브라우저 저장 상태를 확인하고 .doanbogo 백업·복원과 실제 파일 재진입을 검증한다.
- 파일 직접 실행·HTTP 실행·공개 웹·Android 실기를 구분한다.
- GitHub Pages는 `doanbogo-web/.github/workflows/pages.yml`이 main 변경을 검사하고 dist를 배포한다.
- 커밋·푸시·공개 상태는 사용자 요청에 맞춰 확인한다. 로컬 빌드 성공만으로 공개 반영을 판정하지 않는다.
