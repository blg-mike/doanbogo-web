# Portable 홈페이지 생성

- 실행 파일: `portable/homepage.html`.
- 원본: `homepage/index.html`, `homepage/homepage.css`, `homepage/pages.js`, `homepage/homepage.js`, `homepage/assets/`.
- 법률 문서 원문·번역: 프로젝트 문서 폴더의 `terms-{ko,en,ja,de,da,nb,fi}.md`, `privacy-{ko,en,ja,de,da,nb,fi}.md`.
- 생성기: `scripts/build-homepage.mjs`; Markdown 변환기는 `scripts/markdown-to-html.mjs`.
- 앱·홈페이지 함께 생성: `npm run build:portable`.
- 홈페이지만 생성: `npm run build:homepage`.

생성 HTML은 편집하지 않는다. 앱 빌드는 portable 폴더를 다시 만들므로 홈페이지는 뒤이어 생성한다. 홈페이지 언어 선택은 `doanbogo.homepage.language.v1`에 저장한다. 기기 언어를 자동 감지하고 선택한 언어를 저장·복원한다.

## 안내 화면

`#page/about`, `#page/guide`, `#page/features`, `#page/faq`, `#page/terms`, `#page/privacy`를 단일 파일 안에서 전환한다. 기존 `#features`, `#how`, `#faq` 섹션 링크와 `./index.html` 앱 시작 경로를 유지한다. 모든 안내 콘텐츠와 법률 문서는 7개 언어를 제공한다. 법률 Markdown은 빌드 시 이스케이프하고 HTTPS 링크만 허용해 `<template>`에 내장하므로 실행 중 파일 요청은 없다. 운영자 정보·연락처·시행일이 미확정이고 번역 법률 검토가 필요하므로 법률 페이지는 초안으로 표시한다.

## 확인
7개 언어·기기 언어 복원, 6개 해시 화면 직접 접근·뒤로/앞으로, 기존 섹션 링크와 CTA, FAQ·모바일 메뉴, Escape·포커스, 문서 조항·표·링크, 긴 문구·200% 확대, 인라인 자산과 앱 진입 경로를 확인한다. 정적 검사와 실제 브라우저·기기 결과를 구분한다.
