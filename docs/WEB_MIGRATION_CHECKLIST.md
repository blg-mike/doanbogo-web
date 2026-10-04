# 웹 전환 검증 체크리스트

기록일: 2026-10-04  
프로젝트: React + TypeScript + Vite 웹, PDF.js, IndexedDB, PWA  
기준 계획: WEB_MIGRATION_PHASE_PLAN.md

## 검증 상태 기준

- **구현됨**은 코드가 연결된 상태다.
- **자동 브라우저 확인**은 데스크톱 Edge에서 생성 PDF와 CDP 입력으로 통과한 상태다.
- **실기기 확인**은 Android 태블릿에서 실제 조작해 통과한 상태다.
- 자동 브라우저 확인을 실기기 확인으로 간주하지 않는다.

## 서버 없는 단일 HTML 실행

| 기능 | 상태와 확인 증거 | 남은 확인 |
|---|---|---|
| `npm run build:portable`로 단일 HTML 생성 | 통과 · HTML 약 7.39 MB, 앱 코드·PDF.js CMap·글꼴·WASM 포함, 외부 JS/CSS/manifest 참조 없음 | 다른 PC 복사 후 실행 확인 |
| Edge에서 `file://`로 워크스페이스 열기 | 통과 · PDF 추가 버튼과 임시 저장 안내 표시 | Chrome GUI 및 Android 파일 관리자 실행 |
| PDF.js 메인 스레드 처리와 JPEG 2000 자산 | 통과 · 제공된 도안 PDF를 Edge `file://`에서 추가하고 9페이지 canvas 도안 표시 확인; PDF.js 자산 설정으로 15페이지 이미지 해독 성공 | Android 태블릿과 큰 PDF에서 처리 속도 확인 |
| 웹/PWA PDF.js 자산 | 통과 · CMap 168개, 표준 글꼴 14개, WASM 4개가 번들에 포함되고 PWA precache에 등록; OpenJPEG 대체 스크립트는 고정 URL 제공 | GitHub Pages 공개 주소의 새 배포 확인 |
| IndexedDB 제한 안내와 임시 메모리 저장 | 통과 · Edge 파일 실행에서 저장 검사 timeout 후 임시 저장 상태 표시 | Android Chrome 브라우저별 저장 결과 |
| `.doanbogo` v2 작업 파일 내보내기/가져오기 | 구현됨 · PDF·페이지 작업·진행선·필기 저장 round-trip과 v1 불러오기 단위 검사 통과 | 실제 자료가 든 사용자 백업 교차 기기 확인 |
| IndexedDB v1→v2 페이지 작업 저장소 migration | 통과 · 기존 v1 stores를 유지하고 pageWork 추가·읽기·쓰기 확인 | 실제 이전 브라우저 데이터 재진입 확인 |

## 원본 프로젝트에서 이관할 기능

| 기능 | 웹 상태 | 확인 증거 | 남은 확인 |
|---|---|---|---|
| PDF 추가, PDF.js 실제 파싱, 페이지 수와 첫 표지 저장 | 구현됨 · 자동 브라우저 확인 | 3페이지 PDF 추가 및 첫 표지 생성 | 사용자가 겪은 실패 PDF, 한글 파일명, 큰 PDF |
| 브라우저 로컬에 PDF Blob과 메타데이터 보관 | 구현됨 · 자동 브라우저 확인 | IndexedDB에 저장된 PDF를 새로고침 뒤 다시 렌더 | 브라우저 저장 한도에 가까운 대용량 자료 |
| 표지/목록 보기, 이름·태그 검색, 정렬 | 구현됨 | UI와 IndexedDB 연동 | 선호도 변경 후 재방문 E2E |
| 태그 편집, 도안 복사, 원본 다운로드, 삭제 | 구현됨 · 자동 브라우저 확인 | 태그 저장·검색과 복사 통과, 다운로드 바이트가 원본과 동일, 삭제 뒤 문서·페이지·뷰어 저장소가 모두 비는 것 확인 | 실제 기기의 공유 시트 |
| 단일 PDF 페이지 이동과 번호 직접 입력 | 구현됨 · 자동 브라우저 확인 | 3페이지 샘플에서 페이지 이동 | 키보드·터치 입력의 실기기 확인 |
| 단일 보기 작업 캔버스 전체 폭 사용 | 통과 · Edge `file://`에서 pane 폭과 작업 영역 폭이 모두 750px | 태블릿·다른 화면 크기 확인 |
| 전체 페이지 썸네일 표시와 바로 선택 | 통과 · 생성한 2페이지 PDF에서 썸네일 2개와 2페이지 선택 확인 | 더 많은 페이지 PDF 성능·모바일 탐색 확인 |
| 1–5배 확대, 더블탭 확대/맞춤, touch pan/pinch | 구현됨 · 부분 자동 브라우저 확인 | 합성 touch pinch로 배율 변경, 작업 중심과 세로 위치 재로드 복원 | Android Chrome의 실제 손가락 제스처 |
| 페이지 북마크 | 구현됨 | 페이지별 IndexedDB 상태 및 뷰어 표시 연결 | 브라우저 E2E 재방문 확인 |
| 페이지 숨김·복구, 마지막 보이는 페이지 숨김 방지 | 구현됨 · 자동 브라우저 확인 | 숨김 후 양쪽 페이지 보정, 관리창에서 복구 | 실기기 확인 |
| 같은 PDF의 두 독립 뷰어 영역 | 구현됨 · 자동 브라우저 확인 | 양쪽을 서로 다른 페이지에 놓고 새로고침 후 각각 복원 | 실기기에서 긴 세션과 메모리 사용 확인 |
| 가로/세로 분할 방향과 25–75% 비율 | 구현됨 · 자동 브라우저 확인 | 데스크톱 Edge viewport를 세로로 전환하고 별도 비율 적용·복귀 확인 | 실제 기기 회전 확인 |
| 가로·세로 진행선과 스타일 설정·드래그 | 통과 · 설정 항목 표시, 진행선 위치 드래그와 새로고침 후 복원 | 실기기 터치 정밀도 |
| 펜·직선·형광펜·지우개·텍스트, 실행 취소/다시 실행 | 통과 · 생성 PDF에서 그리기·지우기·텍스트 추가/이동/삭제·undo/redo 확인 | 실기기 펜/손가락 사용성 |
| 분할 비율 조절 후 PDF 렌더 안정성 | 통과 · `file://`에서 경계 드래그 뒤 양쪽 pane의 로딩 표시가 사라지고 오류 없음 | 모바일 회전과 장시간 확대 테스트 |
| 페이지·배율·정규화된 중심 위치 저장 | 구현됨 · 자동 브라우저 확인 | pinch/pan 후 새로고침 시 페이지·배율·scroll 위치 복원 | 실제 확대 중심을 여러 PDF 비율로 비교 |
| 페이지별 진행선·필기 상태 저장 | 통과 · Edge `file://` 페이지 새로고침 뒤 작업 복원, 백업 round-trip 통과 | 사용자 자료 교차 기기 확인 |
| 설정의 브라우저 저장 안내와 저장 용량 추정 | 구현됨 | navigator.storage.estimate 기반 안내 연결 | 서로 다른 Android 브라우저 결과 기록 |
| 손상·암호 요구·저장 한도 초과 안내 구분 | 구현됨 | PDF.js 파싱 오류와 실제 QuotaExceededError 분기 | 손상·암호·저장 한도 경계 입력별 E2E |
| 오프라인 앱 화면·PDF 처리 worker 재사용 | 구현됨 · production preview 확인 | PWA 설치 뒤 네트워크 차단, 브라우저 새로고침, IndexedDB PDF 재렌더; 설치용 192px·512px PNG 아이콘 포함 | HTTPS 공개 Pages와 Android 기기 |

## PDF 입력 등록부

| ID | 자료 | 현재 상태 |
|---|---|---|
| AUTO-3P | 브라우저 자동 검사용으로 생성한 3페이지 PDF | Edge 개발 서버 및 production preview에서 추가·표시·상태 복원 통과 |
| USER-FAIL | 사용자가 태블릿에서 추가하지 못한 정상 PDF | 파일이 현재 작업공간에 없어 미검증 |
| JPX-15P | JPEG 2000 이미지가 포함된 15페이지 도안 PDF | 로컬 Edge `file://`에서 추가·9페이지 표시, PDF.js로 1–15페이지 이미지 해독 통과; 파일 자체는 저장소에 포함하지 않음 |
| KO-NAME | 한글 파일명을 가진 PDF | 미검증 |
| LARGE | 용량이 큰 PDF | 미검증 |
| ROTATED | 회전된 페이지를 포함한 PDF | 미검증 |
| PASSWORD | 암호가 설정된 PDF | 미검증 |
| INVALID | PDF가 아닌 파일과 손상 PDF | 미검증 |
| QUOTA | IndexedDB 저장 한도 초과를 재현하는 브라우저 프로필 | 미검증 |

자동 검사 PDF는 임시 경로에서 만들었으며 개인 자료나 테스트 PDF를 Git 저장소에 포함하지 않았다.

## 실행한 검사

| 검사 | 결과 |
|---|---|
| npm run typecheck | 통과 |
| npm run lint | 통과 |
| npm test | 통과, 전체 39개 테스트; IndexedDB 저장소·v1 migration·작업 백업 및 PDF.js 자산 확인 포함 |
| npm run build | 통과, PDF.js worker·CMap·기본 글꼴·WASM·PWA service worker 포함 |
| npm run build:portable | 통과, 외부 PDF.js 리소스 요청 없이 단일 HTML 약 7.39 MB 생성 |
| Edge E2E: PDF 추가→페이지 렌더→두 영역 독립 페이지→새로고침 복원 | 통과 |
| Edge E2E: 태그 저장·검색→도안 복사 | 통과 |
| Edge E2E: 원본 PDF 다운로드 바이트 비교 | 통과, 원본과 동일 |
| Edge touch emulation: pinch 확대→pan 위치 저장→새로고침 복원 | 통과 |
| Edge viewport 회전: 가로/세로 분할 비율 독립 저장·복원 | 통과 |
| Production preview PWA: PDF 추가→페이지 이동→네트워크 차단→새로고침→PDF 재렌더 | 통과 |
| Production preview UI: 목록 보기, 저장 공간 안내, 확인창을 거친 삭제와 전체 작업 정리 | 통과 |
| Portable build: `file://`에서 React 워크스페이스 렌더 | 통과, 외부 JS/CSS/manifest 참조 없음 |
| Portable build: PDF 파일 선택→PDF.js 파싱→2페이지/표지 표시→뷰어 canvas 렌더 | 통과, ReportLab으로 생성한 2페이지 임시 PDF를 `file://`에서 열고 뷰어 렌더 완료 확인 |
| Portable build: JPEG 2000 도안 PDF 추가→9페이지 보기 | 통과, Edge `file://`에서 업로드 후 도안 이미지가 canvas에 표시되고 브라우저 console/page error 없음 |
| Portable build: 모든 썸네일·단일 pane·필기와 진행선·페이지 재로드 | 통과, 단일 pane 가로폭 750/750px, 모든 썸네일 선택, 펜·직선·형광펜·지우개·텍스트와 undo/redo, 선 드래그 및 IndexedDB 복원 확인 |
| Portable build: split 경계 드래그 뒤 페이지 렌더 | 통과, 비율 조절 후 PDF 로딩 표시 종료·렌더 오류 없음 |
| Portable build: IndexedDB 차단 fallback과 작업 파일 가져오기 | 통과, 메모리 모드 표시 및 문서·북마크·뷰어 상태 import 확인 |
| 작업 백업 v1 하위 호환 | 통과, v1 manifest를 pageWork 없이 읽고 빈 페이지 작업 목록을 반환 |

브라우저 검사는 Android 실기기를 대신하지 않는다. hidden/background 브라우저 탭은 PDF canvas 렌더링을 늦출 수 있으므로 smoke test에서는 탭을 전면에 두었다.

## 공개 및 앱 배포 대기 항목

- GitHub 저장소 `https://github.com/blg-mike/doanbogo-web`에 `e271402`를 push했고 Pages Actions 배포가 성공했다.
- [공개 URL](https://blg-mike.github.io/doanbogo-web/)과 앱 JS·CSS·manifest의 HTTP 200 응답을 확인했다. 공개 브라우저에서 PDF 가져오기·뷰어 조작·새로고침·오프라인 흐름은 별도 검증이 남아 있다.
- 이전 Expo 앱에서 별도로 실패한 PDF는 파일을 받지 못해 미검증이며, Android 태블릿 브라우저도 확인되지 않았다.
- Capacitor Android 패키징 및 APK 생성은 웹 공개 흐름 검증 뒤 진행한다.
- 기존 Expo 앱 내부의 PDF·태그·페이지 작업 상태는 브라우저 IndexedDB로 자동 이전되지 않는다.
- portable HTML의 Android 태블릿 실행은 아직 검증하지 않았다. PDF.js가 메인 스레드에서 작동하므로 큰 PDF에서 실제 태블릿 성능을 확인해야 한다.
