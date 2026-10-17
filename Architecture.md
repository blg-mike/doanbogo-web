# 니트피크 기술 요약

프로젝트 이름: 니트피크 · English: KnitPeek. 기준일: 2026-10-17 · 소스 경로는 `doanbogo-web` 기준.

## 실행 구조
- React·TypeScript·Vite, PDF.js, IndexedDB로 구성한다. 데이터는 브라우저 로컬에 저장한다.
- `App.tsx`: `/`와 미등록 경로를 `/projects`로 연결하고 프로젝트·보고서·Viewer·차트를 라우팅한다.
- 일반 빌드는 `dist/`와 PWA 자산을 생성한다.
- `npm run build:portable`: 단일 `portable/index.html`을 만들고 홈페이지를 다시 생성한다. 생성 HTML은 직접 편집하지 않는다.
- portable PDF 처리는 HTML에 포함된 코드로 수행하며 일반 웹 빌드와 실행 성능·브라우저 저장 조건을 별도로 확인한다.

## 소스 지도
| 담당 | 소스 |
|---|---|
| 프로젝트 탐색·관리 | `Workspace.tsx`, `WorkspaceLanguageSelect.tsx`, `ProjectDetail.tsx`, `NewProject.tsx` |
| 보고서 목록·필터 | `ReportsPage.tsx`, `reportCollection.ts` |
| Viewer 상태·그룹·카운터 저장 | `Viewer.tsx` |
| 페이지 렌더·입력·좌표 변환 | `PdfPage.tsx`, `viewerInteraction.ts` |
| 진행선 모델·오버레이 | `progressLines.ts`, `ProgressLineOverlay.tsx` |
| 차트 행 인식·보정 | `chartRowDetection.ts`, `chartRowsWorker.ts`, `ChartRowRecognitionDialog.tsx` |
| 필기 생성 한도 | `annotationLimits.ts` |
| 카운터·타임랩·타이머 연결 | `CounterPanel.tsx`, `smartCounter.ts`, `timerCounterLink.ts` |
| 작업시간·공통 기록 패널 | `DocumentWorkTimer.tsx`, `WorkTimeRecordPanel.tsx`, `ReportWorkTime.tsx`, `workTime.ts` |
| 보고서·출력 | `KnittingReport.tsx`, `reportFormatting.ts`, `StandaloneReportRoute.tsx`, `knittingReportPdf.ts`, `InstagramReportDialog.tsx` |
| 사진 처리·페이지 어댑터 | `photoImages.ts`, `photoDocument.ts` |
| PDF 렌더·메모리·분석 | `pdfPageRenderQueue.ts`, `pdfRenderResources.ts`, `pdfRecognition.ts` |
| 저장·백업·타입 | `storage.ts`, `backup.ts`, `types.ts` |
| UI·번역·서체 | `designTokens.ts`, `index.css`, `assets/fonts/PretendardVariable.woff2`, `assets/fonts/LICENSE.txt`, `locales/` |

- 프로젝트·보고서 검색은 제목 아래에 두고, 언어 선택은 LNB 하단에 배치한다. 기기 언어와 7개 지원 언어를 저장·복원한다.

## 저장 계약
- IndexedDB 데이터베이스 `doanbogo-web` v11. 주요 저장소: documents, pages, viewers, pageWorks, charts, knittingReportEntries, photoPages, pageRecognition, homeProjects, homeReports, preferences.
- `DocumentRecord`: 원본·표지·문서 정보, 총/오늘/일별 시간, 세션·날짜별 메모.
- `PageWorkRecord`: 페이지별 진행선·마커·필기·구간 강조·컬러워크. 좌표는 원본 페이지 기준 정규화 좌표다.
- 주 진행선의 `chartRegion`은 선택적으로 행별 정규화 위치·가로 범위, 분석 회전, 자동 따라가기 상태를 저장한다. 원본 PDF·사진의 지정 영역을 로컬 Worker로 분석하고 카운터 행에 따라 각 행의 위치와 폭을 적용한다. 기존 일정 간격 진행선은 현재 계산을 유지한다.
- `ViewerSnapshot`: 영역별 페이지·배율·중심·페이지별 회전, 카운터·이력·타임랩, 라벨과 레일 순서.
- `thumbnailGroups`는 상단 라벨 순서, `thumbnailRailOrder`는 레일 최상위 페이지·그룹 순서다.
- 선택·팝오버·드래그·플로팅 위치는 세션 UI 상태다.
- 페이지 dirty 저장을 순차 처리하고 이동·종료·탭 전환 시 flush한다. 카운터·연결 진행선·타임랩은 `saveViewerAndPageWorks` 트랜잭션으로 함께 저장한다.
- 읽기 실패를 빈 작업 데이터로 대체하지 않는다. 요청 식별자로 오래된 결과를 무시하며 데이터가 준비될 때까지 편집을 잠근다.
- IndexedDB 사용 불가 시 임시 메모리 저장을 사용하고 사용자에게 저장 상태를 표시한다.
- `.doanbogo` v14는 원본·사진 페이지·뷰어·페이지 작업·차트·보고서·프로젝트 상태를 보관한다. v1~v14 가져오기를 검증한다. 페이지 인식 캐시는 재생성 가능한 별도 데이터다.
- 차트 행 분석은 선택한 원본 영역만 처리한다. 인식 결과는 적용 전에 보정하며 행별 좌우 범위는 기존 페이지 작업 저장·실행 취소·백업 경로를 사용한다. DB v11과 백업 v14는 유지한다.
- 보고서는 기존 저장 필드에 게이지 무늬·전/후 실측 크기와 단위, 바늘 브랜드·표기(mm/US/일본)를 선택 필드로 저장한다. 표기가 없는 기존 바늘 크기는 원문을 유지하며, 기존 도안 치수와 실별 바늘 크기는 보존한다.
- 신규 보고서는 `ReportMeasurement`에 가슴둘레·총장 두 행을 기본 저장한다. 치수 추가 창은 이 두 행의 값을 체크 상태로 초기화하고, 적용 시 선택 상태와 값을 동기화한다. 기본 치수 해제는 해당 행 삭제이며 입력된 값이나 기존 숨은 패턴이 있으면 확인한다. 다른 치수와 직접 입력은 같은 목록에 추가하고, 암홀 다음에 팔길이 선택지를 제공한다. 기존 보고서 행·도안 치수 데이터와 백업 형식은 유지하며, 기본 치수 중복은 7개 언어 라벨과 구형 `기장`·`소매길이` 이름을 함께 확인한다.

## 시간 저장
- 경과 측정은 시작 시각과 Date.now 차이로 계산하고 타이머 컴포넌트에서 표시를 갱신한다.
- 일시정지·저장하고 나가기·날짜 경계에서 세션을 저장한다. 매초 표시 갱신은 저장하지 않는다.
- `addDocumentWorkTime`은 수동 증가분과 날짜 합계를 문서·홈 요약에 같은 트랜잭션으로 합산한다.
- `addDocumentWorkSessions`는 세션 ID로 중복을 방지한다. 수동 입력은 세션을 생성하지 않는다.
- 표시 시간 = 저장된 오늘 합계 − 현재 Viewer에서 이미 저장한 세션 시간 + 현재 Viewer의 오늘 측정 시간.
- 타임랩은 같은 카운터·세션의 기록 간 시각 차이로 계산하며 작업시간 누계를 변경하지 않는다.

## 렌더·메모리
| 자원 | PC | coarse pointer + 2개 이상 터치 |
|---|---:|---:|
| 단일/분할 PDF | 5MP / 영역당 3MP | 2.5MP / 영역당 1.5MP |
| 표시·staging 캔버스 | 44MiB | 24MiB |
| 컬러워크 | 1MP | 0.5MP |
| 썸네일 캐시 | 128개 / 8MiB | 8개 / 512KiB |
| 페이지 작업 캐시 | 8페이지 | 4페이지 |

- 공용 직렬 큐는 같은 영역의 최신 요청을 우선한다. 취소 Promise 종료 후 다음 렌더와 메모리 반환을 진행한다.
- PDF 렌더와 페이지 작업 로딩은 각각 20초 대기 후 오류·재시도를 제공한다.
- 확대는 CSS 미리보기 후 최종 래스터로 전환하며 화면 기준점·진행선 두께를 유지한다.
- 두 영역 보기의 화면 맞춤 배율은 각 페이지 영역의 X/Y 스크롤바를 숨기고, 확대 배율에서는 기본 스크롤 표시를 사용한다.
- 이동 도구의 포인터 제스처는 Viewer에서 한 영역에만 귀속한다. 다른 영역의 동시 입력은 무시하고 같은 영역의 핀치는 처리하며, pointerup·cancel·capture loss에서 잠금을 해제한다.
- 기본 래스터가 DPR 목표보다 낮으면 정착 후 보이는 페이지 범위만 추가 렌더한다. 표시·staging 캔버스는 공용 메모리 예산을 공유하고, 정밀 렌더는 기본 렌더 뒤 처리하며 입력 재개 시 취소한다.
- 사진은 실제 시그니처·EXIF를 확인하고 한 장씩 최대 2560px·6MP JPEG와 최대 320px 표지를 생성한다.
- 링크·QR 분석은 저우선순위로 순차 처리하고 Viewer 렌더·보고서·탭 전환에 양보한다. QR은 1400px·2MP 상한이다.
- 터치 정책 기기의 비활성 탭은 PDF/Worker를 해제하고 복귀 시 저장한 영역 상태로 재개한다.

## Locale
한국어·영어·일본어·독일어·덴마크어·노르웨이어 보크몰·핀란드어를 지원한다. auto 설정은 브라우저 언어를 감지하고 미지원 언어는 한국어로 표시한다. Provider는 재마운트 없이 html lang을 갱신하며 사용자 입력은 보존한다.

## 홈페이지
- `homepage/index.html`, `homepage/homepage.css`, `homepage/pages.js`, `homepage/homepage.js`가 원본이며 `npm run build:homepage`가 `portable/homepage.html`을 단일 파일로 생성한다.
- 홈페이지 빌드는 Pretendard WOFF2와 아이콘·이미지를 HTML에 내장해 외부 폰트 CDN을 사용하지 않는다.
- 서비스 소개·사용 가이드·기능별 안내·FAQ·이용약관·개인정보 처리방침은 `#page/...` 해시 경로로 제공된다. 기존 홈페이지 섹션 앵커와 `./index.html` 앱 경로를 유지한다.
- 홈페이지는 7개 언어를 지원하고 기기 언어 자동 감지, 수동 선택, 선택 저장을 제공한다. 법률 Markdown은 프로젝트 문서의 7개 언어 파일을 빌드 시 HTML로 변환해 내장하며 실행 시 별도 파일 요청을 하지 않는다.
- 법률 문서는 운영자·연락처·시행일 미확정과 번역 검토 필요 상태를 안내한다. 해시 기반 개별 화면의 검색 색인은 보장하지 않는다.
