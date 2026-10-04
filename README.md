# 도안보고 웹

Expo 앱의 기능을 브라우저에서 먼저 검증하고 배포용 단일 HTML로 실행할 수 있는 React + TypeScript + Vite 프로젝트입니다. PDF.js로 PDF를 읽고, PDF 파일·차트·페이지별 작업 상태를 지원되는 경우 IndexedDB에 자동 저장합니다. 서버 업로드나 계정 동기화는 하지 않습니다. 별도 요청이 있을 때까지 프로젝트의 실행·사용자 동작 기준은 빌드된 `portable/index.html`을 직접 여는 방식입니다.

## 실행과 검사

Node.js 24에서 portable 실행 파일을 생성합니다.

~~~
npm ci
npm run build:portable
~~~

생성된 `portable/index.html`을 Chrome 또는 Edge에서 직접 엽니다. `npm run dev`는 소스 개발 서버가 필요할 때만 사용하고, 사용자 동작의 실행 기준으로 삼지 않습니다.

검사와 서버 기반 production 미리보기:

~~~
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
npm run build:portable
~~~

## 서버 없이 단일 HTML 실행

프로젝트의 기본 실행 파일은 `doanbogo-web/portable/index.html`입니다. 소스를 바꾼 뒤 `npm run build:portable`로 갱신하고, 갱신된 파일을 Chrome 또는 Edge에서 직접 엽니다. `doanbogo-web/index.html`은 Vite 개발 진입점이므로 실행·인수 검증 기준으로 사용하지 않습니다.

portable 빌드는 PDF.js 처리 코드를 HTML에 포함하고 메인 스레드에서 실행합니다. PDF 처리가 일반 웹 빌드보다 느릴 수 있습니다. 브라우저가 `file://`에서 IndexedDB를 허용하면 자동 저장하고, 허용하지 않으면 임시 저장으로 실행합니다. 임시 저장 상태에서는 창을 닫기 전에 설정에서 `.doanbogo` 작업 파일을 내보내야 합니다. v7 작업 파일은 PDF 원본과 표지, 페이지별 작업 상태, 대바늘·코바늘 차트, 뜨개보고서와 사진을 보관하며 v1~v6 작업 파일도 가져올 수 있습니다.

GitHub Pages 공개 주소: [https://blg-mike.github.io/doanbogo-web/](https://blg-mike.github.io/doanbogo-web/) · 소스: [GitHub 저장소](https://github.com/blg-mike/doanbogo-web). `main` 브랜치 변경 시 GitHub Actions가 검사·빌드·배포하며 저장소 경로를 자동으로 반영합니다.

## 문서

- [웹 전환 Phase Plan](docs/WEB_MIGRATION_PHASE_PLAN.md)
- [기능 이관 및 검증 체크리스트](docs/WEB_MIGRATION_CHECKLIST.md)
- [기능 개선 Phase Plan](docs/FEATURE_IMPROVEMENT_PHASE_PLAN.md)
- [워크스페이스 차트 만들기 Phase Plan](docs/CHART_CREATION_PHASE_PLAN.md)
- [마지막 페이지 뜨개보고서 Phase Plan](docs/KNITTING_REPORT_PHASE_PLAN.md)

## 현재 기능

- PDF 추가, 첫 페이지 표지, 표지/목록 보기, 이름·태그 검색과 정렬
- YY공동제작 로고를 워크스페이스·PDF 뷰어와 브라우저·설치 아이콘에 적용
- 워크스페이스에서 PDF와 차트 함께 보기, 대바늘 색상 격자 및 코바늘 Free Form 기호 차트 생성·편집·자동 저장
- 격자 색칠·지우개·영역 채우기·선택 복사와 반전, 코바늘 기호 이동·회전·크기 조절·레이어, PNG·PDF 내보내기
- 태그 편집, 워크스페이스/뷰어에서 PDF 이름 변경, 도안 복사, 원본 PDF 공유 또는 바이트를 유지한 다운로드, 삭제
- PDF 페이지 이동, 각 영역별 1–5배 확대/축소, 영역별·페이지별 90도 회전, 두 번 탭 확대/맞춤, 터치 확대·이동
- PDF.js CMap·기본 글꼴·WASM 자산 포함, JPEG 2000(OpenJPEG) 이미지 렌더링과 PWA 오프라인 캐시 지원
- 뷰어 헤더에서 여는 우측 숫자 카운터 5개, 각각 0~99 버튼 증감과 직접 입력
- 북마크, 표시 페이지 썸네일 탐색, 숨긴 페이지 썸네일 선택·전체 복구, 마지막 표시 페이지 숨김 방지
- 페이지별 가로·세로 진행선(방향별 최대 10개)과 방향별 공유 표시·색상·굵기·투명도 설정, 구분 전환 뒤 진행선 복원
- PDF 위에서 직접 입력·이동·크기 조절·삭제할 수 있는 페이지 노트
- PDF 마지막 썸네일의 뜨개보고서, 7개 영역 자동 저장, 사진과 반복 입력, 이미지 기반 다중 페이지 PDF 다운로드
- 이동, 펜, 직선, 형광펜, 지우개, 텍스트 필기와 페이지별 실행 취소·다시 실행
- 단일 보기는 작업 영역 전체를 사용하며 두 영역 보기의 분할 크기 변경 뒤 PDF를 debounce 렌더링
- 같은 PDF를 두 영역에 띄우고 각 영역의 페이지·배율·작업 위치를 독립적으로 저장
- 10개 기법 CROP 슬롯과 채워진 슬롯 사이의 좌우 순환 탐색, 이전 5개 슬롯 백업 가져오기
- PDF 링크 주석·본문 웹 URL과 자동 인식한 QR 영역을 클릭해 새 탭에서 열기(QR 버튼 없이 사용)
- 가로·세로 보기 배치와 각각의 영역 크기 비율 복원
- 브라우저 저장 공간 추정 안내, 실제 저장 한도 초과와 PDF 읽기 오류를 구분한 메시지
- 한 번 접속한 뒤 앱 화면과 PDF 처리 모듈을 오프라인에서도 다시 여는 PWA 지원

웹 프로젝트는 브라우저 저장소를 사용합니다. 브라우저 데이터를 지우거나 브라우저·기기를 바꾸면 저장한 PDF와 작업 상태가 따라가지 않으므로 PDF를 다시 추가해야 합니다. 2026-10-04에 제공된 JPEG 2000 도안 PDF를 Edge `file://` portable 실행과 공개 Pages에 각각 추가해 9페이지 도안 표시를 확인했고, 15페이지 전체의 PDF.js 이미지 해독도 통과했습니다. portable 단일 HTML은 약 7.39MB이며 필요한 PDF.js 자산을 파일에 포함합니다. Android 태블릿 실기기 확인과 이전 Expo 앱에서 겪은 별도 업로드 실패 PDF 검증은 남아 있습니다. 같은 날 타입 검사·린트·39개 테스트·일반 웹 빌드·portable 빌드가 통과했고 GitHub Pages 배포와 공개 URL 브라우저 검증도 성공했습니다.
