# Portable 홈페이지

실행 파일은 `portable/homepage.html`입니다. 이 파일은 단일 HTML이며, 스타일·동작 코드와 로고·제품 화면·생성 아이콘 이미지를 내부에 포함합니다.

## 다시 만들기

저장소 루트에서 다음 명령을 실행하면 앱 portable 파일과 홈페이지를 함께 만듭니다. 앱 빌드가 `portable` 폴더를 비운 뒤 홈페이지를 다시 생성합니다.

```powershell
npm run build:portable
```

홈페이지 파일만 다시 만들려면 `npm run build:homepage`를 실행합니다.

## 원본 파일

- 화면 구조와 문구: `homepage/index.html`
- 스타일: `homepage/homepage.css`
- 언어 선택과 메뉴 동작: `homepage/homepage.js`
- 홈페이지 이미지: `homepage/assets/`
- 단일 HTML 생성기: `scripts/build-homepage.mjs`

생성 HTML은 직접 편집하지 말고 원본을 수정한 뒤 다시 빌드합니다. `.gitignore`는 다른 portable 빌드 산출물은 계속 제외하고 `portable/homepage.html`만 저장소에서 추적할 수 있게 둡니다.
