# Portable 홈페이지 메모

## 원본·생성
- 소스: `homepage/index.html`, `homepage.css`, `pages.js`, `homepage.js`, `assets/`.
- 법률 원문·번역: 웹 폴더 상위의 `../docs/terms-{ko,en,ja,de,da,nb,fi}.md`, `privacy-{ko,en,ja,de,da,nb,fi}.md`.
- 생성기: `scripts/build-homepage.mjs`; 변환기: `scripts/markdown-to-html.mjs`.
- `npm run build:homepage` 또는 앱까지 포함하는 `npm run build:portable`로 `portable/homepage.html`을 재생성한다.
- 로고·파비콘은 `src/assets/yy-*`, Pretendard는 `src/assets/fonts/`에서 내장한다. 생성 HTML은 직접 편집하지 않는다.
- 법률 원문은 웹 Git 저장소 밖에 있으므로 전체 프로젝트 작업 폴더에서 준비한다. 일반 웹 CI 빌드는 `npm run build`를 사용한다.

## 동작
- 서비스 소개·가이드·기능·FAQ·약관·개인정보 화면은 `#page/about|guide|features|faq|terms|privacy`로 전환한다.
- 기존 섹션 앵커와 `./index.html` 앱 진입을 유지한다.
- 기기 언어 자동 감지와 7개 언어 선택을 제공하고 `doanbogo.homepage.language.v1`에 저장한다.
- Markdown은 HTML 이스케이프·HTTPS 링크 제한 후 template에 내장한다. 실행 중 원문이나 외부 폰트를 요청하지 않는다.
- 법률 문서는 초안 표시를 유지한다. 운영자·연락처·시행일·내용과 번역의 확정은 별도 검토 사항이다.

## 확인
변환기 단위 테스트는 내장 예제로 동작·이스케이프·링크를 확인한다. 법률 원문의 번역·조항 일치 확인과 구분한다.
7개 언어·언어 복원·해시 직접 진입·뒤로/앞으로·CTA·FAQ·메뉴·Escape·포커스·200% 확대·인라인 자산을 실제 화면에서 확인한다.
