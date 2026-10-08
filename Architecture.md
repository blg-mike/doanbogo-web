# 도안보고 기술 아키텍처

## 현재 웹 아키텍처 — 2026-10-08

현재 개발·검증 대상은 `doanbogo-web`이다. 다음 웹 구조를 우선하며 이후 React Native 명세는 초기 네이티브 구현 참고 자료다. 웹 기능을 먼저 확정하고 앱 이관은 별도 요청으로 진행한다.

### 실행·렌더링 구조

```text
React + TypeScript / Vite
├─ Home / AppNavigation / ProjectDetail / ReportsPage / NewProject: 반응형 홈·프로젝트·보고서 탐색
├─ Workspace: PDF·사진 도안·차트 목록과 로컬 가져오기
├─ Viewer: 영역별 상태, 페이지 작업, 실행 취소/다시 실행
│  ├─ PDF.js 또는 사진 페이지 어댑터 → Canvas + 영역별 확대/축소/회전 조작
│  ├─ Footer 썸네일 → 페이지 이동·Ctrl/터치 다중 선택·숨김·연속 구간 압축/복구
│  ├─ SVG 필기·진행선 + HTML 텍스트 객체 (회전 포함 정규화 좌표)
│  ├─ 컬러워크 모눈 패널
│  └─ PDF 링크 주석·본문 URL + jsQR → 클릭 가능한 새 탭 링크
├─ ChartEditor / KnittingReport
├─ 썸네일 직렬 작업 큐 + 크기 제한 공유 캐시
├─ QR 인식 inline Worker
└─ IndexedDB 또는 임시 메모리 저장
```

- React Router를 사용한다. PDF 원본과 페이지별 작업 데이터를 분리하며 원본 바이트를 변경하지 않는다.
- 사진 도안은 `DocumentRecord.kind='photos'` 문서와 IndexedDB `photoPages`의 개별 JPEG Blob으로 저장한다. 이미지 페이지 어댑터는 페이지 크기·렌더·썸네일·빈 링크 메타데이터를 PDF.js Viewer 인터페이스로 제공해 기존 도구를 재사용한다. 가져올 때 이미지 한 장씩 긴 변 2,560px·최대 6MP로 줄여 JPEG 품질 0.9로 저장하며 확대하지 않는다. 렌더와 QR 처리마다 이미지 비트맵을 만들고 닫아 디코딩 이미지를 장기간 메모리에 두지 않는다.
- 워크스페이스 사진 입력은 `capture="environment"` 파일 입력으로 기기 카메라를 요청하고, `multiple`·`webkitdirectory` 입력으로 앨범/폴더 가져오기를 제공한다. 초안은 자연 파일명/상대 경로 순으로 배치하고 저장 전에 이동·제거할 수 있다. 취소하면 문서를 만들지 않으며, 기존 폴더에 추가한 사진은 마지막 페이지 뒤에 저장한다.
- 사용자 실행 기준은 `portable/index.html`이다. `npm run build:portable`은 코드·스타일·PDF 처리 모듈을 단일 HTML에 포함한다. 루트 웹 index.html은 Vite 개발 진입점이다.
- 웹 UI 로고와 파비콘·Apple touch icon은 `src/assets`의 YY 브랜드 자산을 사용한다. 설치형 PWA manifest는 YY 192px·512px 및 maskable 512px 아이콘을 등록하고, portable 빌드는 manifest를 포함하지 않는다.
- portable PDF 처리는 메인 스레드에서 실행한다. 일반 웹 빌드에는 별도의 PDF 처리 구성이 있으므로 단일 HTML 실행 결과와 서버 실행 결과를 구분한다.
- 기존 Expo 앱은 `doanbogo-app`에 유지한다. `app.json`과 `assets`는 사용자 제공 문어 이미지를 앱 아이콘·Android adaptive icon·favicon 및 앱 내 브랜드 이미지로 사용하며, 이 자산은 현재 웹 UI에 자동 적용되지 않는다. 웹 기능의 자동 이관이나 최신 APK 생성은 이루어지지 않았다.

### 상태·저장 계약

- `storage.ts`에서 IndexedDB 접근과 임시 메모리 대체를 관리한다. 저장소는 documents, pages, viewers, preferences, pageWork, charts, 기존 호환용 knittingReports, 다중 보고서용 knittingReportEntries, 재생성 가능한 pageRecognition, 페이지별 photoPages, 홈 요약용 homeProjects·homeReports로 구성된다. 보고서 항목은 고유 ID와 문서별 인덱스를 사용한다. IndexedDB v9은 `[documentId, pageNumber]` photoPages를, v10은 기존 문서·차트·보고서에서 채우는 홈 요약 저장소를 추가한다.
- `HomeProject`는 PDF·사진 폴더·차트 각각의 제목·표지·태그·작업 상태·보관·휴지통·최근 작업 시각을 요약한다. 홈 화면은 이 저장소와 최근 ViewerSnapshot만 조회하고 PDF Blob과 사진 페이지 본문을 가져오지 않는다. `KnittingReportSummary`는 작성 중/완료 상태와 완료 시각을 별도로 보존한다. 문서·차트·보고서 저장 및 삭제 경로에서 본문 레코드와 요약 레코드를 함께 갱신한다.
- `.doanbogo` v14는 홈 프로젝트 상태와 보고서 상태를 저장한다. 프로젝트 메타데이터에서 표지 Blob은 제외하고 문서 표지를 가져와 다시 연결한다. 기존 v1~v13 가져오기는 프로젝트 요약이 없는 경우 기본 상태를 만들어 유지한다. 프로젝트 이동은 ID 충돌 시 새 ID로 매핑하고 원본 ID별 상태를 새 엔티티에 적용한다.
- PDF는 Blob으로 저장한다. 서버 업로드·계정·클라우드 동기화 없이 브라우저 로컬에서 처리한다.
- 사진 페이지는 문서별 페이지 번호와 이미지 Blob·정규화 후 너비/높이·추가 시각·원본 파일명을 저장한다. 도안 카드 표지는 원본 페이지를 정규화할 때 함께 만든 320px JPEG를 사용하므로 카드 표시 때 대형 페이지 이미지를 디코딩하지 않는다. 별도 PDF는 만들지 않는다. 사진 폴더 이름에는 `.pdf`를 붙이지 않고, PDF 이름 변경은 기존처럼 확장자를 유지한다.
- `DocumentRecord.fileName`은 업로드된 PDF의 표시·다운로드 이름이다. 워크스페이스 도안 관리 메뉴와 뷰어 파일명 버튼에서 변경하며, PDF Blob과 페이지 작업 데이터는 그대로 둔다. 저장 시 `.pdf` 확장자를 붙인다.
- `ViewerSnapshot`은 primary/secondary 페이지·zoom·center와 영역별 페이지 회전 `rotations`, split과 `splitInitialized`, 가로/세로 분할 비율, 진행선/필기 스타일, 카운터 종류별 상태와 작업 이력·연동·집중 보기 관련 설정을 PDF별로 저장한다. 두 영역 보기는 가로 화면에서 좌우, 세로 화면에서 상하로 나뉘며 처음 50:50으로 시작한다. 사용자가 조정한 방향별 비율은 저장한다. 구분을 처음 켤 때만 기본 보조 영역을 만들고, 이후 전환에서는 사용자 보조 영역 상태를 유지한다.
- Footer 페이지 조작 그룹은 `ViewerSnapshot.activePane`의 페이지를 대상으로 숨김·회전·확대/축소한다. 분할 보기에서는 활성 영역 위치와 페이지 번호를 표시하고, PDF 영역을 눌러 활성 대상을 바꾼다. 숨김은 기존 `PageRecord.hidden` 저장 경로를 사용하며 마지막 표시 페이지는 숨길 수 없다. 회전과 배율은 기존 pane별 snapshot 데이터에 저장한다.
- 페이지의 숨김·북마크 상태는 기존 `PageRecord.hidden`·`PageRecord.bookmarked` 필드에 저장한다. Footer 썸네일 선택·저장 진행 상태는 임시 UI 상태이며 PDF 세션 종료 시 사라지고 백업 형식을 바꾸지 않는다. 표시 페이지는 클릭으로 이동·선택하며 컴퓨터 Ctrl+좌클릭과 태블릿 450ms 길게 누른 후 좌우 드래그로 연속 선택한다. 선택 마지막 페이지 위에 숨김 버튼 하나를 표시한다. 연속된 숨김 페이지는 썸네일 카드 없이 기존 크기의 절반인 `•••` 버튼 하나로 압축하고 해당 버튼에서 구간 전체를 복구한다. 페이지 묶음 변경은 `setPagesFlag` 한 번의 저장 작업으로 반영한다. 최소 한 페이지 표시를 유지하고, 숨겨진 현재 페이지를 보고 있던 각 영역은 다음 표시 페이지 또는 이전 표시 페이지로 이동한다. 숨김 썸네일은 렌더·공유 캐시 대상에서 제외한다.
- 썸네일 접힘 상태는 `Viewer` 세션의 임시 UI 상태로 관리한다. 문서 ID가 바뀌면 Viewer를 다시 마운트해 펼침으로 시작하고 `ViewerSnapshot`·IndexedDB·백업에는 저장하지 않는다. 레일 우측 상단 경계에 아이콘만 있는 작은 화살표 버튼을 겹쳐 배치해 별도 헤더 행을 만들지 않는다. CSS 아이콘 위치는 둥근 표시 영역의 중앙과 정렬한다. 접어도 선택 상태와 레일 DOM을 유지해 재펼침 때 선택·가로 스크롤 위치가 보존된다.
- 카운터는 `CounterSnapshot`의 simple/pattern/task 항목과 `ViewerSnapshot.counterHistory`로 PDF별 저장한다. `counterMainId`, 메인 단의 목표·첫 면·마지막 면·완료 상태, 소리·진동·미리 알림과 알림 확인 키는 ViewerSnapshot에 선택 필드로 저장해 기존 v8 IndexedDB 레코드도 그대로 읽는다. `CounterHistoryEntry.baseCounterId`는 새 작업 이력을 그룹에 연결하며 이전 이력은 단일한 카운터 이름으로 모호하지 않을 때만 추론한다. 정확한 되돌리기는 기준 그룹의 저장 스냅샷과 해당 그룹 진행선만 복원하고 다른 그룹 이력을 유지한다. 새 카운터 화면은 PDF 영역을 밀지 않는 우측 팝오버이며 헤더 이동, 모바일 하단 접기, 내부 스크롤을 지원한다. 카운터와 진행선은 `saveViewerAndPageWorks`의 기존 IndexedDB 트랜잭션으로 저장한다.
- `PageWorkRecord.rotation`은 이전 버전이 저장한 공용 회전값 호환용으로 읽는다. 새 회전은 각 `PaneSnapshot.rotations`에 페이지 번호별로 저장하므로 두 영역은 같은 페이지를 서로 다른 각도로 표시할 수 있다. PDF에 붙는 오버레이 입력 좌표는 표시 회전을 역변환해 원본 정규화 좌표로 기록하며, 새 주 진행선은 모든 회전 각도에서 화면 기준 수평을 유지한다. 집중보기는 화면의 수평 밴드를 원본 캔버스 좌표로 역변환하고, 회전 후에도 페이지와 차트 영역에 맞춰 갱신한다.
- 진행선 UI는 `ProgressLineOverlay`가 담당하고 저장 모델은 `PageWorkRecord.horizontalGuides`를 주선·참고선 배열로 사용한다. 주선 1개와 참고선 최대 2개에 ID·역할·페이지 상대 위치·길이·마커·스타일·회전별 위치·단 간격을 저장한다. 별도 조정 모드 없이 선 본체 드래그로 위치를 바꾸고, 선택 때만 표시되는 끝 핸들로 길이를 조절한다. 마커와 핸들은 가로 이동만 허용하며 본체는 8px 뒤에 선택된 축으로 고정한다. 드래그 중 좌표는 Overlay 로컬 미리보기로만 유지하고 pointer up에서 PageWork를 한 번 저장한다. 카운터 연결은 사용자가 두 단 위치를 드래그해 간격을 맞춘 경우에만 저장한다. +1은 활성 패널에서 고정한 페이지의 연결 주선만 이동하고 marker를 초기화한다. 숫자 직접 보정은 현재 선 위치·marker를 유지한 채 간격 기준 단만 재설정한다. 참고선은 독립적인 직접 조작·추가·삭제를 제공한다. 집중 보기는 페이지 상대 좌표의 Dim Overlay이며 PDF/Image 재렌더나 Blur를 쓰지 않는다.
- 기존 진행선은 해당 페이지 작업을 불러올 때 `prepareProgressGuidesForDirectInteraction`·`migrateProgressGuides`로 호환 전환하고 즉시 저장한다. 연결된 기존 가로선, 첫 가로선, 첫 선 순으로 주선을 정하고 원본 후보는 `legacyProgressGuides`에 복구용으로 보존한다. 빈 새 페이지는 사용자가 시작하기 전까지 주선을 만들지 않으며 진행선 시작 버튼으로 생성한다.
- 카운터 연결 차트 영역은 원본 정규화 좌표로 저장하고 선택한 화면 행 배치는 선택 사항인 `rowLayout`에 별도로 기록한다. 90·270도에서는 연결된 카운터의 현재 단 위치와 자동 화면 이동도 계속 동작한다. 집중보기 줄 간격은 0.5% 단위 소수를 입력할 수 있고, 임시 입력 문자열을 보존해 7.5% 같은 값을 반올림하지 않는다.
- 텍스트는 기존 AnnotationRecord의 text, 정규화된 points, boxWidth/boxHeight, style을 사용한다. 생성 미리보기·선택·편집·툴바 상태는 UI 상태다.
- 뜨개보고서는 문서 ID와 보고서 ID로 독립 저장한다. IndexedDB v6가 기존 문서당 1개인 `knittingReports`를 ID 기반 저장소로 복사하며, 기존 저장소는 호환 목적으로 유지한다. 표지 제목 인라인 편집은 `fields['project.name']`와 기존 `title` 요약 동기화 및 지연 저장 경로를 이용한다. 작업 사진마다 `uploadedAt`과 `activityDate`를 저장한다. `ReportYarn.usedMeters`·`memo`, `ReportMeasurement.unit`, 선택·검토 상태를 갖는 `analysisCandidates`는 보고서 레코드의 선택 필드로 저장하며 기존 IndexedDB 저장소 버전은 바꾸지 않는다. 수정 후보는 PDF 페이지의 텍스트 Annotation, 보고서 메모, 완성 상태의 작업 카운터에서 로컬 정규식으로 추출하고 fingerprint로 중복을 막는다. 사용자가 승인한 후보만 `modifications`로 복사하며 OCR·네트워크 분석은 하지 않는다. Instagram 합성은 최대 8개 과정 사진과 완성 사진 1개를 캔버스에서 1080×1350 JPEG로 만든 뒤 투명한 앱 아이콘을 삽입한다.
- 컬러워크는 차트 cm, 10cm 기준 게이지, 계산된 열·행, 표시 영역과 칸별 색상·투명도를 저장한다. 지우개 모드에서 컬러피커를 클릭하면 지우개를 끄고 색상 선택창을 연다. 초기 자유 사각형 데이터는 현재 모눈 구조와 다르며 기존 rectangles는 정규화에서 제거한다.
- 진행선 배열이 없는 이전 작업 데이터는 기존 horizontalPosition/verticalPosition으로 정규화한다. 페이지 작업은 변경 중 지연 저장하고 작업 종료 시 즉시 저장한다.
- `.doanbogo` 작업 파일은 PDF 원본·표지·뷰어·페이지 작업·차트·다중 보고서·사진 페이지 Blob을 포함한다. 현재 v14 형식이며 이전 v1~v13 가져오기를 유지한다. v13은 사진 페이지 Blob을 추가했고 v14는 홈 프로젝트·보고서 상태와 진행선 전환·마커 데이터를 보존한다. 사진 경로는 문서 순서와 페이지 번호로 검증하고 사진 폴더의 페이지 수·총 바이트 크기를 확인한다. v7 보고서는 PDF당 한 개로 읽고 보고서 ID·작업 사진 필드를 초기화한다. 보고서 후보·사용 실 메모와 길이·실측 단위를 보고서 레코드 그대로 보존한다. v9 카운터는 ID 기반 세 종류의 카운터와 이력으로 이전한다.
- IndexedDB v5 업그레이드는 기존 Viewer 레코드의 `techniqueSlots`를 삭제한다. v6 업그레이드는 기존 보고서를 ID 기반 저장소로 옮기고, v7은 페이지 인식 캐시를 추가하며 v8은 기존 카운터를 새 모델로 정규화한다. 이전 백업은 나머지 유효한 작업 데이터를 가져오며 기법 좌표를 버린다.
- IndexedDB 사용 불가 시 임시 저장으로 동작한다. 실제 저장 한도 초과와 PDF 읽기 실패를 구분한다.

2026-10-08 반응형 홈 아키텍처: HashRouter의 루트는 홈이고 `/projects`는 기존 라이브러리, `/projects/new`는 프로젝트 생성 선택, `/projects/:kind/:id`는 상세, `/reports`와 `/report/:documentId/:reportId`는 보고서 경로다. 모바일 내비게이션은 하단 탭, 태블릿·데스크톱은 고정 사이드바를 사용한다. 프로젝트 요약 상태와 보고서 작성 상태는 서로 독립적이며 삭제는 `deletedAt`으로 보관한 뒤 사용자가 영구 삭제를 선택할 때 기존 종속 레코드를 제거한다.

### PDF·QR 처리

- 본문 PDF 렌더는 Viewer 공용 직렬 큐를 쓴다. 각 영역의 대기 작업은 최신 요청 하나로 합치고 현재 작업 영역을 우선한다. 활성 패널 변경만으로 현재 페이지 렌더를 취소·재시작하지 않는다. QR 분석의 낮은 우선순위 래스터 렌더는 뷰어 렌더 요청 시 취소 완료를 기다린 뒤 우선권을 넘긴다. PDF.js `RenderTask.promise`가 취소·완료로 끝난 뒤 다음 렌더를 시작해 취소 중 작업이 겹치지 않게 한다. 페이지 렌더 제한 시간 20초는 큐 대기부터 포함하며 초과 시 로딩을 끝내고 재시도 오류를 표시한다.
- PC의 본문 PDF 캔버스는 단일 보기 최대 5MP, 분할 보기 영역당 3MP이며 표시·staging 캔버스는 44MiB를 넘지 않는다. coarse pointer와 두 개 이상의 터치를 지원하는 기기에서는 각각 2.5MP·1.5MP·24MiB로 낮춘다. 렌더 실패 시 픽셀 수를 1/4로 낮춰 한 번 재시도한다. 확대 중 기존 래스터를 CSS로 미리 확대하고 입력 종료 200ms 뒤 최종 래스터를 그린다. 컬러워크는 PC 영역당 1MP, 터치 기기 영역당 0.5MP다.
- Footer 썸네일 레일은 표시 페이지와 숨김 구간을 원래 순서에 맞춰 보여 준다. 터치 기기는 기본 접힘, PC는 기본 펼침으로 시작한다. 접힌 동안 레일과 썸네일 컴포넌트를 만들지 않아 관찰자·렌더 요청이 없고, 접을 때 공유 캔버스 캐시를 해제한다. 펼치면 화면에 들어온 표시 페이지만 생성하며 가로 스크롤 중 썸네일 렌더를 멈추고 200ms 정지 뒤 재개한다. 썸네일 작업은 직렬 큐 한 건이며 PDF 본문이 우선한다. 취소한 렌더 Promise가 끝난 뒤 캔버스를 비우고 Viewer가 접힐 때 모든 대기 작업을 취소한다. PC 공유 캐시는 128개 또는 8MiB, 터치 기기는 8개 또는 512KiB다. 숨김 구간은 썸네일 카드 없이 `•••` 버튼으로 표시해 해당 구간 전체를 복구하며 숨김 페이지 캔버스는 생성하지 않는다.
- 썸네일 접기 버튼은 레일 가로 스크롤 컨테이너 밖에서 Viewer Footer 우측 상단 경계에 겹쳐 고정하며 펼친 상태에서 추가 높이를 차지하지 않는다. Footer는 컨트롤바와 버튼이 겹치지 않게 22px의 얇은 공간만 남기며, 편집 도구·페이지 이동은 유지한다. 접기 후 200ms 내 PDF 본문·썸네일·링크 작업이 모두 유휴 상태면 PDF.js 문서 캐시를 정리하고, 재펼침하면 보이는 항목부터 렌더한다.
- 필기·텍스트·진행선은 페이지별 정규화 좌표를 사용하며 PDF 표시 크기에 맞춰 배치한다. 새 주 진행선은 회전 중 화면 기준 수평을 유지하고 필기는 페이지 회전을 따른다. 텍스트 객체·입력 미리보기·서식 도구막대는 페이지 좌표 위치를 유지하면서 역회전해 화면에서 읽는 방향을 보존한다. 편집 중 텍스트는 객체별 로컬 초안을 먼저 갱신하고 페이지 작업 저장 상태에 반영해 한글 IME 조합 중 지연된 작업 상태가 입력값을 덮지 않게 한다. 저장 상태와 입력 이벤트는 Viewer/PdfPage 사이에서 전달한다.
- PDF 링크 주석의 사각형과 PDF 텍스트 콘텐츠의 한 줄 http(s) 주소를 viewport transform으로 정규화 좌표에 옮긴다. 겹치는 영역은 PDF 링크 주석을 우선하며 일반 URL은 이동 도구에서 새 탭으로 연다.
- PDF 업로드 뒤 숨기지 않은 페이지의 링크·QR을 백그라운드에서 순차 분석한다. 페이지당 대기 간격을 두고, 이미 완료된 캐시는 건너뛴다. 숨긴 페이지는 분석을 생략하며 Viewer의 숨김 해제 이벤트에서 다시 큐에 넣는다. PDF 링크 주석과 본문 URL은 PDF.js 페이지 메타데이터·텍스트에서 추출하며 이 단계는 본문 렌더 직렬 큐를 점유하지 않는다. QR 픽셀은 최대 1400px·2MP이며 캔버스와 ImageData를 포함해 8 bytes/pixel로 공유 메모리 예산을 예약한다. 완료된 페이지에서만 lazy inline Worker 하나를 사용한다. QR 결과와 해상도는 IndexedDB v7의 `[documentId, pageNumber]` 인식 저장소에서 재사용하며 최근 4페이지 결과만 메모리에 둔다. 실패·취소는 완료된 빈 결과로 저장하지 않는다. 탭 숨김 시 진행 중 분석을 취소하고 PDF·Worker를 해제한 뒤, 복귀하면 저장 캐시를 기준으로 미완료 페이지를 재개한다. `.doanbogo`에는 이 재생성 캐시를 넣지 않는다. http(s) QR 영역은 도구·활성 영역과 관계없이 새 탭 링크로 제공한다.
- 사진 도안 페이지는 PDF 링크 주석·본문 텍스트를 빈 결과로 완료 처리하고 저장된 이미지 렌더로 QR만 분석한다. 동일한 직렬 렌더 큐·숨김 페이지 생략·결과 캐시를 적용하며 PDF 세션 대신 사진 페이지 어댑터를 지연 열고 닫는다.
- 뜨개보고서 모드가 열려 있는 동안 문서별 PDF 링크·QR 인식 작업을 취소·보류한다. 브라우저 탭 복귀가 보고서 모드와 겹치면 분석을 재개하지 않으며, Viewer로 돌아오면 보류된 문서와 현재 PDF 세션을 연결해 IndexedDB 캐시부터 다시 처리한다.

### 편집 입력과 작업 데이터 보호

- 페이지별 작업이 로드되기 전에는 작업 레이어를 덮고 진행선 설정을 비활성화하며 저장 콜백도 차단한다. 구분 모드의 모든 표시 페이지를 병렬 로드하고 최근 사용한 최대 8개의 `PageWorkRecord`를 재사용한다. 캐시에서 페이지를 내보내기 전에 dirty 작업을 저장하고 실행 취소 기록을 정리하며, 재방문 때 IndexedDB에서 다시 읽는다.
- `splitInitialized`는 기존 사용자 작업 영역의 보조 상태를 처음 초기화했는지 나타낸다. 최초 구분 진입에서는 현재 작업 영역을 복제하고 그 이후의 구분 전환은 보조 페이지·배율·중심을 보존한다. 페이지 작업·실행 취소 캐시는 PC 최근 8페이지, Android 태블릿 최근 4페이지로 제한하며 표시 중인 페이지는 보호한다. 캐시 퇴출 전 dirty 작업을 저장한다.
- 페이지 작업 변경은 문서·페이지별 dirty record만 requestAnimationFrame 단위의 UI 갱신과 순차 저장으로 처리한다. 저장 실패 dirty record는 재시도하며 페이지 이동·뷰어 정리·탭 숨김·`pagehide`에서 대기 중인 저장을 flush한다. 컬러워크는 스트로크 도중 전체 40,000칸 배열을 복사하지 않고 변경 칸만 추적한 뒤 한 번 반영한다. 실행 취소는 칸 변경 delta 또는 일반 페이지 작업 snapshot을 사용하며 최근 30개, PC 32MiB·태블릿 8MiB 상한을 적용한다. Android 브라우저에서 탭이 숨겨지면 새 처리 요청을 막고 저장·렌더·썸네일·링크 작업을 취소한 뒤 PDF와 QR Worker를 해제한다. 백그라운드 인식은 IndexedDB 캐시를 보존한 채 중지하고 복귀 후 미완료 페이지만 재개한다. Viewer는 페이지·배율·위치·회전·분할 상태를 복원하고 저장 실패는 사용자에게 알린 뒤 재시도한다. PDF.js `cleanup()`은 렌더·썸네일·링크 처리 유휴 시점에 실행한다.

### 검증·배포 상태

2026-10-05 확인: PDF 렌더 직렬화·해상도/메모리 상한·확대 미리보기·8페이지 작업 캐시 변경 후 타입 검사·린트·15개 테스트 파일(60개 테스트)·일반 빌드·portable 빌드 통과. portable HTML은 7,392.91 kB다. `file://` 실행이 브라우저 정책에서 차단되어 UI 검증은 못 했으며 Android 태블릿 재현과 전후 성능 수치는 미검증이다. GitHub Pages 배포는 하지 않았다.

2026-10-05 뜨개보고서 확인: IndexedDB v6 보고서 마이그레이션, v8 작업 파일 호환, 날짜별 작업 사진과 Instagram 문구·합성 이미지 기능을 반영했다. 타입 검사·린트·일반 빌드·portable 빌드·16개 테스트 파일(61개 테스트)이 통과했고 portable HTML은 7,432.70 kB다. 자동 브라우저 조작은 실행 환경 오류로 미검증이며 GitHub 배포는 하지 않았다.

2026-10-05 썸네일 숨김 확인: Viewer Footer에 문서 세션 선택 상태와 Ctrl/터치 선택 처리를 연결하고, `PdfThumbnail`은 숨김 카드에서 PDF 캔버스를 렌더하지 않으며 썸네일 캐시에서 제외한다. `PageRecord.hidden` 저장·`setPagesFlag` 묶음 저장과 두 영역 페이지 이동은 그대로 사용한다. 타입 검사·린트(경고 없음)·16개 테스트 파일(61개 테스트)·일반/portable 빌드가 통과했고 portable HTML은 7,433.00 kB다. 자동 브라우저 조작 오류로 실제 마우스·태블릿 상호작용은 미검증이며 GitHub 배포는 하지 않았다.

2026-10-05 썸네일 접기 확인: Viewer Footer 우측 상단 경계에 작은 화살표 아이콘 전용 버튼을 겹쳐 배치하고 별도 헤더 줄을 제거했다. 문서 세션별 펼침 기본값을 사용하며 접힘 상태를 저장 데이터에 포함하지 않는다. 접힘 중 진행 중인 터치 선택·자동 스크롤을 종료하고 썸네일 렌더를 중지한다. 검증 결과와 portable 크기는 아래 최신 기록을 따른다.

2026-10-05 썸네일 버튼 크기 조정 확인: 타입 검사·린트·16개 테스트 파일(61개 테스트)·일반 빌드·portable 빌드가 통과했고 portable HTML은 7,434.69 kB다. 일반 빌드는 PDF 청크 크기 경고를 출력했다. 브라우저 보안 정책이 로컬 `file://` 실행을 차단해 우회하지 않았으므로 실제 브라우저·태블릿 조작은 미검증이며 GitHub 배포는 하지 않았다.

2026-10-05 숨김 썸네일 압축 확인: 연속 숨김 페이지 구간을 Footer에서 썸네일 카드 없이 절반 크기의 `•••` 버튼 하나로 표시하고 클릭 시 구간 전체를 복구한다. 타입 검사·린트·16개 테스트 파일(62개 테스트)·portable 빌드가 통과했고 portable HTML은 7,436.10 kB다. 브라우저 자동화 런타임 초기화 오류로 실제 상호작용은 미검증이며 GitHub 배포는 하지 않았다.

2026-10-05 컬러워크 도구 확인: 지우개 모드에서 컬러피커를 클릭하면 지우개를 끄고 색상 선택창을 연다.

2026-10-05 말줄임표 크기 조정 확인: 숨김 구간은 테두리 있는 썸네일 카드 없이 이전 표시의 50% 크기인 말줄임표 버튼만 사용한다. 타입 검사·portable 빌드는 통과했고 린트에는 `PdfPage.tsx` Fast Refresh 경고 1건이 있다. 전체 테스트는 16개 파일 중 15개 통과, QR 스케줄러 테스트 2건이 실패했다. portable HTML은 7,437.99 kB다. 실제 화면 조작은 브라우저 자동화 초기화 오류로 미검증이며 GitHub 배포는 하지 않았다.

2026-10-05 컬러피커 동작 확인: 지우개 모드에서 컬러피커를 누르면 지우개를 끄고 색상 선택창을 연다. `npx vite build --mode portable`은 성공해 portable HTML 7,442.97 kB를 생성했다. 표준 타입 검사·portable 빌드는 Viewer의 미사용 선언과 `Map.add` 타입 오류 13건으로 실패했다. 린트에는 Fast Refresh 경고 1건, 전체 테스트에는 QR 스케줄러 실패 2건이 있으며 실제 클릭은 미검증이다.

2026-10-05 썸네일 화살표 조정 확인: 버튼은 아이콘만 보이고 레일 위에 살짝 겹치며, 펼친 상태에서 레일 높이를 추가로 차지하지 않는다. 접힌 상태는 22px만 남겨 편집 도구와 페이지 이동에 겹치지 않게 했다. 타입 검사·린트·16개 테스트 파일(62개 테스트)·일반 빌드·portable 빌드가 통과했다. portable HTML은 7,436.16 kB다. 일반 빌드는 PDF 청크 크기 경고를 출력했다. 브라우저 보안 정책이 로컬 `file://` 실행을 거부해 우회하지 않았으므로 실제 브라우저·태블릿 조작은 미검증이다.

2026-10-05 화살표 중앙 정렬 확인: `.thumbnail-accordion-button svg`를 둥근 표시 영역의 중앙에 정렬했다. `npm run build:portable`은 `qrScanScheduler.test.ts`의 QR 요청 타입 불일치로 타입 검사 단계에서 실패했다. 해당 외부 작업은 수정하지 않고 `npx vite build --mode portable`로 portable HTML을 갱신했으며 파일 크기는 7,437.99 kB다. 브라우저 보안 정책이 로컬 파일 실행을 차단해 UI 조작은 검증하지 않았다.

2026-10-05 뜨개보고서 제목 편집 확인: 표지 제목 옆 연필 버튼은 입력 상태를 열고 제목을 `fields['project.name']`에 저장한다. 기존 제목 동기화가 `report.title`과 보고서 목록을 갱신하며 350ms 지연 저장을 사용하므로 스키마 변경은 없다. `npx vite build --mode portable`은 성공해 7,444.43 kB HTML을 생성했다. 타입 검사는 기존 `Viewer.tsx` 미사용 선언 2건 때문에 실패했고, 린트 경고 3건, QR 스케줄러 테스트 실패 2건이 남았다. 실제 브라우저 조작은 미검증이다.

2026-10-05 태블릿 성능·안정성 개선: Android + coarse pointer 정책, 표시·staging 메모리 축소, QR 지연 픽셀 캡처, IndexedDB v7 페이지 인식 캐시, 앱 전환 시 PDF·Worker 해제와 Viewer 복구를 구현했다. v6→v7 마이그레이션, 캐시 결과 병합·삭제, QR 입력 상한, 유휴 큐 대기 테스트를 포함했다. `npm run typecheck`, 경고 없는 `npm run lint`, 17개 테스트 파일(69개 테스트), 일반 빌드 및 portable 빌드가 통과했고 portable HTML은 7,446.88 kB다. GitHub Actions 배포가 성공했고 공개 홈과 현재 Viewer JS 청크는 HTTP 200이다. CUA 브라우저 초기화 시간 초과로 UI 동작과 Android 실기기 50페이지·20회 전환·30분 메모리 측정은 미검증이다.

2026-10-05 태블릿 동시보기 썸네일 개선: coarse pointer와 2개 이상 터치를 지원하는 기기는 기본 접힘, PC는 기본 펼침으로 시작한다. 접으면 썸네일 컴포넌트·공유 캐시를 해제하고 취소된 렌더가 끝난 뒤 캔버스를 비운다. 화면 밖 사전 렌더를 제거하고 스크롤 정지 200ms 후 직렬 렌더를 재개하며 접힌 뒤 PDF.js 문서 자원을 정리한다. 터치 기기 캐시는 8개/512KiB로 제한한다. 타입 검사·린트·70개 테스트·일반 빌드·portable 빌드가 통과했고 portable HTML은 7,447.85 kB다. GitHub Actions 37275404695 성공, 공개 홈·앱 스크립트·Viewer 청크 HTTP 200을 확인했다. 실제 브라우저 조작과 Android 태블릿 50페이지 이동·앱 동시보기 안정성·메모리 증가는 미검증이다.

2026-10-05 Footer 페이지 조작 이동: 숨김·회전·확대/축소 컨트롤을 PDF 영역에서 Footer로 이동했다. `ViewerSnapshot.activePane`으로 대상을 정하고 분할 방향에 따라 왼쪽/오른쪽 또는 위쪽/아래쪽과 페이지 번호를 표시한다. 숨김은 기존 페이지 저장 경로와 마지막 표시 페이지 보호를 사용하고 회전·배율 데이터 구조는 유지한다. 타입 검사·린트·17개 테스트 파일(70개 테스트)·일반/portable 빌드가 통과했고 portable HTML은 7,447.34 kB다. GitHub Pages [배포 37296939754](https://github.com/blg-mike/doanbogo-web/actions/runs/37296939754)가 성공했고 공개 홈·앱·Viewer·CSS는 HTTP 200이며 새 컨트롤 문자열을 확인했다. CUA 커널 자산 경로 오류로 실제 UI 조작은 미검증이고 Android 태블릿 검증은 하지 않았다.

2026-10-05 스마트 반복 카운터: `ViewerSnapshot.counters`에 카운터 5개를 저장하고 `.doanbogo`를 v9로 올렸다. 이전 v1~v8 백업은 단순 카운터 기본값으로 가져오며 IndexedDB 구조 버전은 바꾸지 않았다. 반복 주기·횟수 계산, 줄임/늘림 알림 진행 수, 완료/미완료 이력, 미완료 행 이동 확인을 계산·백업 테스트로 확인했다. 타입 검사·린트·전체 테스트(19개 파일·80개 테스트)·일반 빌드·portable 빌드가 통과했고 portable HTML은 7,475.07 kB다. 로컬 파일 브라우저 검증은 보안 정책이 `file://` 방문을 막아 진행하지 못했다. 우회 시도나 GitHub 배포는 하지 않았고 Android 태블릿 실기 확인도 미실시다.

2026-10-06 PDF 성능 개선: 활성 패널 변경은 기존 페이지 렌더를 취소하지 않고, 렌더 요청은 큐 대기부터 20초 안에 끝나지 않으면 오류로 종료한다. PDF 업로드 뒤 보이는 페이지의 링크·QR을 저우선순위로 차례대로 처리하고, PDF 링크 메타데이터·텍스트 추출은 본문 렌더 큐를 점유하지 않는다. 숨김 페이지는 건너뛰고 복구 시 기존 pageRecognition 캐시를 활용한다. QR 캔버스와 ImageData는 한 변 1400px·2MP 상한과 8 bytes/pixel 예약을 적용하며 Worker는 첫 분석 때 동적 로드한다. 뷰어 렌더가 대기하면 QR 렌더를 취소 완료한 뒤 넘기고, 탭이 숨겨지면 인식을 중단해 PDF·Worker를 해제한 뒤 복귀 시 이어간다. Viewer 종료·탭 전환 때 진행 중 PDF 분석 Promise가 끝난 뒤 세션을 해제한다. 컬러워크 delta 실행 취소와 30개/PC 32MiB·태블릿 8MiB 한도, 카운터 350ms 저장 묶음을 추가했다. 타입 검사·린트·전체 테스트(21개 파일·84개 테스트)·일반/portable 빌드가 통과했고 portable HTML은 7,480.08 kB다. GitHub main 커밋 `4cd8bcd`와 [Pages 배포 37391392414](https://github.com/blg-mike/doanbogo-web/actions/runs/37391392414)가 성공했고 사이트가 HTTP 200을 반환한다. CUA 정책이 `file://` 탐색을 거부해 브라우저 UI 확인은 진행하지 않았고 Android 태블릿 전후 측정은 미검증이다.
2026-10-06 카운터·진행선 개선: 종류별 5개 카운터, 선택 그룹 진행, 중간 시작·작업 일정·단 되돌아가기, 연결 진행선과 집중 보기를 추가했다. Viewer counter와 연관 PageWork는 IndexedDB 단일 트랜잭션으로 저장하며 v7→v8 데이터 이전을 제공한다. `.doanbogo` v10은 v1~v9 가져오기를 유지한다. 차트 영역·진행선 좌표·집중 영역은 페이지 정규화 좌표를 사용하고 집중 캔버스는 화면에 보이는 페이지 영역당 0.5MP 이하로 제한한다. 타입 검사·린트·22개 테스트 파일(98개 테스트)·일반/portable 빌드 통과. portable HTML 7,535.65 kB. 커밋 `e2e5c0a`, [GitHub Pages 배포 37413903267](https://github.com/blg-mike/doanbogo-web/actions/runs/37413903267) 성공, 공개 홈·앱·Viewer 청크 HTTP 200과 기능 문자열 확인. 실제 PDF 조작과 Android 태블릿 YouTube 동시보기는 미검증이다.

2026-10-06 뜨개보고서 화면·IG 문구 개편: 보고서 첫 화면은 공유 추천 정보를 카드로 요약하고 개인 기록은 접힌 상태로 제공한다. 항목별 상세 화면에서 사진, 사용량·단위, 게이지·실측·핏·메모를 편집한다. PDF 텍스트와 보고서 메모의 명시적 수치 변경, 완료 프로젝트의 미완료 카운터 기록을 브라우저 로컬 규칙으로 후보화하며, 확인·편집·선택한 변경만 저장한다. IG 문구는 선택 항목을 바탕으로 만들고 미리보기에서 직접 편집·복사하며 2,200자 초과 시 경고하되 잘라내지 않는다. 보고서 표시 중 PDF 링크·QR 분석을 보류하고 Viewer 복귀 후 IndexedDB 캐시부터 재개한다. `.doanbogo` v11은 후보·실 메모·사용 길이·실측 단위를 보존하고 이전 v1~v10 가져오기를 유지한다. 타입 검사·린트(경고 없음)·전체 테스트(24개 파일·111개 테스트)·일반 빌드·portable 빌드가 통과했고 portable HTML은 7,571.57 kB다. portable HTML을 로컬 HTTP로 열어 보고서 화면과 IG 항목 선택·미리보기를 확인했다. `file://` 직접 실행, Android 태블릿 조작, GitHub 배포는 확인·실시하지 않았다.

---

# 초기 React Native 아키텍처 참고 자료

**목표:** iOS / Android 태블릿·모바일에서 동작하는 Local-first PDF 뜨개 도안 트래킹 앱
**기준:** 기존 PRD + UI/UX 명세
**핵심 기술 요구:** PDF 업로드, Thumbnail, Zoom/Pan, 페이지 숨김, 진행선, Annotation, 마지막 작업 위치 복원

---

# 1. 최종 권장 아키텍처

도안보고 MVP는 다음 구조를 권장한다.

```text
React Native App
│
├─ Workspace
│   ├─ PDF Import
│   ├─ Document List
│   └─ Sorting / View Mode
│
├─ Viewer
│   ├─ PDF Engine
│   ├─ Thumbnail Strip
│   ├─ Progress Tracker Layer
│   └─ Annotation Layer
│
├─ Application State
│   └─ Zustand
│
├─ Persistence
│   ├─ SQLite
│   └─ Local File System
│
└─ Native
    ├─ iOS PDFKit
    └─ Android PDF Renderer
```

핵심 원칙은 **PDF 파일 자체와 앱의 작업 데이터를 분리**하는 것이다.

```text
source.pdf
    +
Viewer State
    +
Progress State
    +
Annotations
```

PDF 원본은 수정하지 않는다.

---

# 2. React Native 기반 선택

## 권장

| 영역 | 선택 |
|---|---|
| Framework | Expo SDK 57 + React Native 0.86 |
| Language | TypeScript |
| Build | Expo Development Build |
| Architecture | React Native New Architecture |
| Navigation | Expo Router |
| Client State | Zustand |
| Database | expo-sqlite |
| File Storage | expo-file-system |
| File Picker | expo-document-picker |
| Gesture | react-native-gesture-handler |
| Animation / Transform | react-native-reanimated |
| Annotation | React Native Skia |
| PDF | PDF Engine Adapter + Native PDF renderer |
| Error tracking | Sentry — 출시 단계에서 선택 |
| Test | Jest / React Native Testing Library / Maestro |

2026년 10월 3일 기준 Expo SDK 57이 안정 릴리스이며 React Native 0.86을 사용한다. SDK 58은 현재 Beta이고 React Native 0.88 RC를 포함하고 있으므로 MVP 시작 버전으로는 SDK 57을 권장한다.

도안보고는 PDF 관련 네이티브 코드가 필요할 가능성이 높으므로 **Expo Go가 아니라 Development Build를 처음부터 사용**하는 편이 적합하다. Expo 역시 production 앱이나 custom native library를 사용하는 경우 Development Build를 권장한다.

---

# 3. PDF Engine이 가장 중요한 기술 결정

도안보고에서는 일반적인 PDF Viewer보다 요구사항이 하나 더 있다.

```text
현재 Page
+
Zoom
+
PDF상의 정확한 X/Y 위치
```

를 저장해야 한다.

그리고 다시 열었을 때:

```text
같은 Page
같은 Zoom
같은 X/Y
```

로 돌아와야 한다.

이 기능이 도안보고의 핵심 UX다.

---

# 4. 일반 react-native-pdf를 그대로 사용하면 생기는 문제

`react-native-pdf`는 현재 다음 기능을 제공한다.

```text
page
scale
minScale
maxScale
onPageChanged
onScaleChanged
setPage()
Zoom
Pan
Local PDF
```

하지만 공개 API에는 **현재 Pan X/Y Offset을 읽고 다시 설정하는 API가 문서화되어 있지 않다.**

따라서 단순히

```tsx
<Pdf />
```

를 사용하면

```text
Page 12
Zoom 2.4x
```

까지는 복원 가능하지만,

```text
Page 12의 오른쪽 하단 차트 영역
```

까지 정확하게 복원하기 어렵다.

또 Expo의 `react-native-pdf`용 공식 외부 config-plugin 문서의 호환표는 현재 SDK 56까지만 명시하고 있다. SDK 57이 반드시 동작하지 않는다는 뜻은 아니지만, MVP 핵심 컴포넌트를 여기에 강하게 결합하는 것은 피하는 것이 낫다.

---

# 5. 따라서 PDF Engine을 추상화한다

앱 전체가 특정 PDF 라이브러리에 직접 의존하지 않도록 한다.

```ts
interface PdfEngine {
  open(uri: string): Promise<PdfDocumentInfo>;

  goToPage(page: number): void;

  setViewport(viewport: PdfViewport): void;

  getViewport(): PdfViewport;

  generateThumbnail(
    page: number,
    width: number
  ): Promise<string>;

  onPageChange(
    callback: (page: number) => void
  ): () => void;

  onViewportChange(
    callback: (viewport: PdfViewport) => void
  ): () => void;
}
```

Viewport:

```ts
interface PdfViewport {
  page: number;

  zoom: number;

  centerX: number;
  centerY: number;
}
```

`centerX`, `centerY`는 screen pixel이 아니라 PDF 기준 normalized coordinate다.

```text
0.0 ~ 1.0
```

예:

```json
{
  "page": 7,
  "zoom": 2.4,
  "centerX": 0.72,
  "centerY": 0.43
}
```

---

# 6. PDF Engine 구현 전략

MVP에서는 다음 전략이 가장 현실적이다.

```text
PdfEngine Interface
        │
        ▼
ReactNativePdfAdapter
        │
        ▼
react-native-pdf
        +
small native extension/fork
```

Native Extension에서 추가할 API는 단순하다.

```text
onViewportChanged

setViewport

getViewport
```

즉 PDF renderer 전체를 처음부터 개발하는 것이 아니라, 기존 renderer를 사용하되 **도안보고에서 필요한 viewport API만 추가**한다.

장기적으로 필요하면:

```text
ReactNativePdfAdapter
        ↓ 교체
DoanbogoNativePdfEngine
```

으로 바꿀 수 있다.

---

# 7. 대안 PDF Library

최근에는 PDFKit/PdfRenderer 기반 React Native PDF 라이브러리도 등장하고 있다. 예를 들어 일부 라이브러리는 native PDF rendering, zoom/pan, thumbnail 생성, `setScale`, `goToPage` 등을 제공한다. 다만 공개 API상 현재 정확한 pan offset 복원 기능까지 명시된 것은 확인되지 않는다.

따라서 라이브러리명을 애플리케이션 코드에 직접 박아 넣지 않고 `PdfEngine` 뒤에 숨기는 구조가 중요하다.

---

# 8. Annotation Rendering

Annotation은 React Native Skia를 권장한다.

Rendering:

```text
PDF
↓
Annotation Canvas
↓
Progress Tracker
↓
Application UI
```

Skia는 고성능 2D 그래픽 렌더링에 적합하고 현재 React Native 0.79+, React 19 이상을 요구하므로 RN 0.86 환경에서 사용할 수 있다.

구조:

```tsx
<View style={styles.viewer}>
  <PdfView />

  <AnnotationCanvas />

  <ProgressTrackerLayer />
</View>
```

단, 세 Layer가 동일한 PDF Transform Matrix를 공유해야 한다.

---

# 9. 좌표 시스템

이 부분을 처음부터 정확하게 잡아야 한다.

Screen 좌표를 DB에 저장하면 안 된다.

잘못된 구조:

```text
x = 342px
y = 722px
```

태블릿 회전 또는 다른 화면 크기에서는 위치가 바뀐다.

대신 PDF 좌표를 Normalized Coordinate로 저장한다.

```text
PDF 왼쪽 = 0
PDF 오른쪽 = 1

PDF 위 = 0
PDF 아래 = 1
```

예:

```text
x = 0.723
y = 0.481
```

---

# 10. Coordinate Transform

기본 공식:

```text
Screen Coordinate
        ↓ inverse transform
PDF Coordinate
        ↓ normalize
Normalized Coordinate
```

Render:

```text
Normalized Coordinate
        ↓ PDF size
PDF Coordinate
        ↓ zoom + translation
Screen Coordinate
```

즉 다음 세 가지가 모두 같은 transform을 사용한다.

```text
Progress Line
Annotation
PDF
```

---

# 11. Progress Line 데이터

페이지별로 위치를 저장한다.

예:

```text
Page 1
Horizontal = 0.31
Vertical = 0.62

Page 2
Horizontal = 0.48
Vertical = 0.14
```

따라서 사용자가 페이지를 왔다 갔다 해도 각 페이지의 작업 위치가 유지된다.

---

# 12. App State와 DB State 분리

매우 중요한 구조다.

### Zustand

현재 화면 Interaction용.

```text
현재 선택 페이지
현재 줌
현재 선택된 Thumbnail
Multi Selection 상태
Annotation Tool
Bottom Sheet 상태
```

### SQLite

앱을 종료해도 남아야 하는 정보.

```text
Documents
Viewer State
Hidden Pages
Tracker State
Tracker Settings
Annotations
Workspace Preferences
```

따라서:

```text
Zustand ≠ Database
```

로 설계한다.

Zustand를 영구 데이터의 Source of Truth로 만들지 않는다.

---

# 13. SQLite 선택

MVP에서는 `expo-sqlite`면 충분하다.

도안보고의 DB workload는 다음 수준이다.

```text
Document metadata
Page 상태
몇 개의 tracker 값
Annotation metadata
```

초고성능 DB가 필요한 구조가 아니다.

`expo-sqlite`는 Android/iOS에서 영구 SQLite DB를 제공하며 앱 재실행 이후에도 데이터가 유지된다.

OP-SQLite나 Nitro SQLite 같은 고성능 옵션도 존재하지만 현 단계에서는 추가 native dependency와 복잡도를 가져올 필요가 없다. Nitro SQLite는 RN 0.75+를 지원하며 상당히 빠른 대안이지만 MVP 요구사항에는 과하다.

---

# 14. File Storage 구조

PDF 파일을 SQLite BLOB에 넣지 않는다.

File System:

```text
/Documents

    /{documentId}

        source.pdf

        /thumbnails

            1.webp
            2.webp
            3.webp

        /cache

```

예:

```text
/Documents
  /550e8400-e29b-41d4-a716-446655440000
      source.pdf
      thumbnails/
          1.webp
          2.webp
          3.webp
```

SQLite에는:

```text
fileUri
thumbnailUri
```

만 저장한다.

---

# 15. PDF Import Flow

`expo-document-picker`를 사용한다.

Expo DocumentPicker는 OS의 파일 선택 UI를 사용할 수 있고 `expo-file-system`과 함께 쓸 때 `copyToCacheDirectory: true`를 사용하면 선택 직후 파일 접근이 가능하다.

Flow:

```text
사용자 PDF 업로드
       ↓
DocumentPicker
       ↓
Cache URI
       ↓
UUID 생성
       ↓
Documents/{uuid}/source.pdf 로 Copy
       ↓
PDF metadata 읽기
       ↓
SQLite documents INSERT
       ↓
첫 페이지 Thumbnail 생성
       ↓
Workspace 표시
       ↓
나머지 Thumbnail Lazy 생성
```

---

# 16. DB ERD

```text
documents
    │
    ├──── 1 : 1 ──── viewer_states
    │
    ├──── 1 : N ──── page_states
    │
    ├──── 1 : 1 ──── tracker_settings
    │
    └──── 1 : N ──── annotations


app_preferences
```

---

# 17. documents

PDF 프로젝트의 기본 정보.

```sql
CREATE TABLE documents (
    id TEXT PRIMARY KEY,

    original_filename TEXT NOT NULL,

    file_uri TEXT NOT NULL,

    file_size INTEGER,

    page_count INTEGER NOT NULL DEFAULT 0,

    cover_thumbnail_uri TEXT,

    created_at INTEGER NOT NULL,

    last_opened_at INTEGER
);
```

Example:

```json
{
  "id": "4b4d...",
  "original_filename": "Mio Cardigan.pdf",
  "file_uri": ".../documents/4b4d/source.pdf",
  "file_size": 4812312,
  "page_count": 18,
  "created_at": 1790992143000,
  "last_opened_at": 1790996102000
}
```

---

# 18. viewer_states

사용자가 마지막으로 보고 있던 위치.

```sql
CREATE TABLE viewer_states (
    document_id TEXT PRIMARY KEY,

    current_page INTEGER NOT NULL DEFAULT 1,

    zoom REAL NOT NULL DEFAULT 1.0,

    center_x REAL NOT NULL DEFAULT 0.5,

    center_y REAL NOT NULL DEFAULT 0.5,

    updated_at INTEGER NOT NULL,

    FOREIGN KEY(document_id)
        REFERENCES documents(id)
        ON DELETE CASCADE
);
```

여기서 중요한 점은:

```text
offsetX
offsetY
```

를 pixel로 저장하는 대신

```text
centerX
centerY
```

를 normalized coordinate로 저장한다는 것이다.

이렇게 해야:

```text
iPad Portrait
→
iPad Landscape
```

로 바뀌어도 같은 위치에 최대한 복귀할 수 있다.

---

# 19. page_states

페이지별 상태.

```sql
CREATE TABLE page_states (
    document_id TEXT NOT NULL,

    page_number INTEGER NOT NULL,

    hidden INTEGER NOT NULL DEFAULT 0,

    horizontal_position REAL,

    vertical_position REAL,

    updated_at INTEGER NOT NULL,

    PRIMARY KEY (
        document_id,
        page_number
    ),

    FOREIGN KEY(document_id)
        REFERENCES documents(id)
        ON DELETE CASCADE
);
```

예:

```json
{
  "documentId": "4b4d",
  "pageNumber": 7,
  "hidden": false,
  "horizontalPosition": 0.462,
  "verticalPosition": 0.721
}
```

---

# 20. 왜 Tracker 위치를 page_states에 넣는가

사용자가 Page 5에서:

```text
Row 42
Stitch 61
```

까지 작업했다가 Page 7로 이동할 수 있다.

Page 7에서도 다른 Tracker 위치가 존재한다.

따라서:

```text
document tracker
```

가 아니라:

```text
document + page tracker
```

여야 한다.

---

# 21. tracker_settings

Line 디자인 설정은 문서 단위로 저장한다.

```sql
CREATE TABLE tracker_settings (
    document_id TEXT PRIMARY KEY,

    horizontal_visible INTEGER NOT NULL DEFAULT 1,

    horizontal_color TEXT NOT NULL DEFAULT '#FFD600',

    horizontal_thickness REAL NOT NULL DEFAULT 4,

    horizontal_opacity REAL NOT NULL DEFAULT 0.4,

    vertical_visible INTEGER NOT NULL DEFAULT 1,

    vertical_color TEXT NOT NULL DEFAULT '#2563EB',

    vertical_thickness REAL NOT NULL DEFAULT 1,

    vertical_opacity REAL NOT NULL DEFAULT 1,

    updated_at INTEGER NOT NULL,

    FOREIGN KEY(document_id)
        REFERENCES documents(id)
        ON DELETE CASCADE
);
```

---

# 22. annotations

펜 / 하이라이터 / 텍스트를 모두 동일 테이블에서 관리한다.

```sql
CREATE TABLE annotations (
    id TEXT PRIMARY KEY,

    document_id TEXT NOT NULL,

    page_number INTEGER NOT NULL,

    type TEXT NOT NULL,

    geometry_json TEXT NOT NULL,

    style_json TEXT,

    text_content TEXT,

    z_index INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL,

    updated_at INTEGER NOT NULL,

    FOREIGN KEY(document_id)
        REFERENCES documents(id)
        ON DELETE CASCADE
);
```

`type`:

```text
pen
highlight
text
```

Eraser는 Annotation type이 아니다.

기존 Annotation을 삭제하는 Operation이다.

---

# 23. Pen Annotation 예

```json
{
  "id": "ann-001",
  "documentId": "doc-001",
  "pageNumber": 8,
  "type": "pen",

  "geometry": {
    "points": [
      [0.21, 0.32],
      [0.22, 0.33],
      [0.24, 0.34]
    ]
  },

  "style": {
    "color": "#FF3B30",
    "width": 0.004,
    "opacity": 1
  }
}
```

좌표 역시 모두 normalized coordinate다.

---

# 24. Highlight Annotation

```json
{
  "type": "highlight",

  "geometry": {
    "points": [
      [0.20, 0.44],
      [0.70, 0.44]
    ]
  },

  "style": {
    "color": "#FFD60A",
    "width": 0.03,
    "opacity": 0.35
  }
}
```

---

# 25. Text Annotation

```json
{
  "type": "text",

  "geometry": {
    "x": 0.42,
    "y": 0.63,
    "width": 0.21
  },

  "textContent": "여기부터 3회 반복",

  "style": {
    "color": "#111111",
    "fontSize": 16
  }
}
```

---

# 26. app_preferences

Workspace UI 상태.

```sql
CREATE TABLE app_preferences (
    key TEXT PRIMARY KEY,

    value TEXT NOT NULL
);
```

Example:

```text
workspace_view = cover

workspace_sort = recent
```

---

# 27. Index

Annotation 조회는 대부분:

```text
document + page
```

조건으로 이루어진다.

따라서:

```sql
CREATE INDEX idx_annotations_document_page
ON annotations(
    document_id,
    page_number
);
```

Documents:

```sql
CREATE INDEX idx_documents_last_opened
ON documents(last_opened_at DESC);

CREATE INDEX idx_documents_created
ON documents(created_at DESC);
```

---

# 28. Foreign Key

DB 초기화 시:

```sql
PRAGMA foreign_keys = ON;
```

을 적용한다.

Document 삭제 시:

```text
viewer_states
page_states
tracker_settings
annotations
```

도 자동 삭제된다.

PDF / Thumbnail 실제 파일은 별도로 File System에서 삭제한다.

---

# 29. WAL Mode

앱 초기 DB 설정:

```sql
PRAGMA journal_mode = WAL;
```

을 권장한다.

UI에서 Read가 진행되는 동안 Annotation이나 Viewer state save가 발생하는 경우에도 DB lock 문제를 줄일 수 있다.

---

# 30. Database Migration

처음부터 migration을 둔다.

```text
001_initial.sql

002_add_annotation_z_index.sql

003_add_document_metadata.sql
```

예:

```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
);
```

앱 시작:

```text
DB Open
↓
현재 Schema Version
↓
Migration 실행
↓
Application Start
```

---

# 31. Repository Pattern

React Component에서 SQL을 직접 사용하지 않는다.

```text
UI
 ↓
Store / UseCase
 ↓
Repository
 ↓
SQLite / FileSystem
```

구조:

```text
DocumentRepository

ViewerRepository

PageRepository

AnnotationRepository

PreferenceRepository
```

예:

```ts
interface ViewerRepository {
  getState(
    documentId: string
  ): Promise<ViewerState>;

  saveState(
    state: ViewerState
  ): Promise<void>;
}
```

---

# 32. Zustand Store 구조

```text
stores/

workspaceStore.ts

viewerStore.ts

selectionStore.ts

annotationStore.ts

uiStore.ts
```

Viewer:

```ts
type ViewerStore = {
  documentId: string | null;

  page: number;

  zoom: number;

  centerX: number;

  centerY: number;

  setViewport: (
    viewport: PdfViewport
  ) => void;
};
```

---

# 33. Persist 정책

모든 움직임마다 SQLite에 쓰면 안 된다.

예를 들어 Progress Line Drag 중:

```text
60 FPS
```

로 SQL UPDATE를 실행하면 불필요하다.

따라서:

```text
Drag Start
↓
Zustand / Reanimated SharedValue
↓
Drag
↓
UI Update
↓
Drag End
↓
SQLite Save
```

방식을 사용한다.

---

# 34. Auto Save Point

DB write는 다음 시점에 한다.

| Event | Save |
|---|---|
| Viewer Close | Viewer State |
| Page Change | Viewer State |
| Zoom/Pan End | Viewer State |
| Horizontal Line Drag End | Page State |
| Vertical Line Drag End | Page State |
| Page Hide | Page State |
| Page Restore | Page State |
| Annotation Stroke End | Annotation |
| Text Edit Done | Annotation |
| App Background | Dirty State 전체 |

---

# 35. Viewer 초기화

PDF Card Tap:

```text
Document 조회
↓
Viewer State 조회
↓
Current Page 조회
↓
Page State 조회
↓
Tracker Setting 조회
↓
Annotations 조회
↓
PDF Engine Open
↓
Page 표시
↓
Viewport Restore
↓
Tracker 표시
↓
Annotation 표시
```

---

# 36. 실제 UX상 Render 순서

DB를 전부 읽을 때까지 빈 화면을 보여주지 않는다.

```text
PDF
↓
Tracker
↓
Annotation
```

순으로 Progressive Render 한다.

사용자에게 가장 중요한 것은:

```text
"내가 어디까지 떴었지?"
```

를 빨리 파악하는 것이다.

---

# 37. Thumbnail 전략

30~100페이지 PDF의 전체 Thumbnail을 Import 순간 모두 만들 필요는 없다.

다음 순서가 좋다.

```text
Import
↓
Page 1 thumbnail
↓
Workspace 표시
↓
Viewer Open
↓
Visible thumbnail부터 생성
↓
나머지는 Lazy generation
```

Cache:

```text
documents/{id}/thumbnails/{page}.webp
```

DB에는 모든 Thumbnail URI를 저장할 필요가 없다.

파일 naming convention으로 계산 가능하다.

```ts
getThumbnailUri(documentId, page)
```

로 처리한다.

---

# 38. Annotation Performance

처음부터 모든 PDF의 Annotation을 메모리에 로드하지 않는다.

예:

```sql
SELECT *
FROM annotations
WHERE document_id = ?
AND page_number = ?;
```

현재 Page를 우선 로드한다.

예측 로딩:

```text
current page
current - 1
current + 1
```

정도면 충분하다.

---

# 39. Stroke 데이터 최적화

Pen은 손가락을 조금만 움직여도 수백 개 Point가 만들어질 수 있다.

Gesture 종료 시:

```text
Raw Points
↓
Point Simplification
↓
DB
```

으로 저장한다.

초기 MVP에서는 JSON으로 충분하다.

향후 Annotation 데이터가 매우 커지는 경우:

```text
annotations table
        ↓
annotation_file_uri
```

방식으로 page 단위 Binary 파일로 이전할 수 있다.

---

# 40. Folder 구조

```text
src/

  app/
    _layout.tsx
    index.tsx

    viewer/
      [documentId].tsx

  components/

    workspace/
      DocumentCard.tsx
      DocumentList.tsx
      WorkspaceHeader.tsx

    viewer/
      PdfCanvas.tsx
      ThumbnailStrip.tsx
      PageThumbnail.tsx

    tracker/
      HorizontalTracker.tsx
      VerticalTracker.tsx
      TrackerSettings.tsx

    annotation/
      AnnotationCanvas.tsx
      AnnotationToolbar.tsx
      TextAnnotation.tsx

  stores/
    workspaceStore.ts
    viewerStore.ts
    selectionStore.ts
    annotationStore.ts

  db/
    database.ts

    migrations/
      001_initial.ts

    repositories/
      documentRepository.ts
      viewerRepository.ts
      pageRepository.ts
      annotationRepository.ts

  pdf/
    PdfEngine.ts
    ReactNativePdfEngine.ts

  services/
    documentImportService.ts
    thumbnailService.ts
    autosaveService.ts

  utils/
    coordinates.ts
    filePaths.ts

  types/
    document.ts
    viewer.ts
    annotation.ts
```

---

# 41. PDF Native Layer

추후 직접 module을 만드는 경우 구조는 다음으로 가져간다.

```text
modules/

  doanbogo-pdf/

      ios/
          DoanbogoPdfView.swift

      android/
          DoanbogoPdfView.kt

      src/
          DoanbogoPdfView.tsx
```

Expo에서는 local Expo Module을 만들어 Swift/Kotlin 기능을 프로젝트 내부에서 관리할 수 있다. Expo 공식 문서도 custom native capability가 필요할 때 local Expo Module을 지원한다.

---

# 42. iOS

PDF Renderer:

```text
PDFKit
```

Annotation은:

```text
React Native Skia
```

로 앱 레이어에서 관리한다.

향후 PencilKit이 반드시 필요해질 경우 iOS만 PencilKit integration을 추가할 수 있다.

---

# 43. Android

PDF Renderer:

```text
PdfRenderer
또는
PDFium
```

MVP에서는 기존 PDF Library가 사용하는 native renderer를 활용하는 편이 빠르다.

Android에서 큰 PDF bitmap을 지나치게 높은 resolution으로 만들면 메모리 문제가 발생할 수 있으므로 render resolution cap이 필요하다. 실제 React Native PDF renderer 구현체에서도 Android zoom 시 bitmap 크기를 제한하는 옵션을 제공하는 사례가 있다.

---

# 44. Package 설치 방향

초기 프로젝트:

```bash
npx create-expo-app doanbogo
```

Stable SDK를 사용한다.

핵심 Expo package:

```bash
npx expo install \
  expo-dev-client \
  expo-router \
  expo-document-picker \
  expo-file-system \
  expo-sqlite
```

Interaction:

```bash
npx expo install \
  react-native-gesture-handler \
  react-native-reanimated \
  @shopify/react-native-skia
```

State:

```bash
npm install zustand
```

PDF Package는 기술 Spike 이후 `PdfEngine` 구현체 안에서 추가한다.

---

# 45. PDF 기술 Spike에서 반드시 확인할 것

PDF library를 최종 결정하기 전에 다음 다섯 가지를 실제 iOS/Android 기기에서 확인해야 한다.

1. 50페이지 이상 PDF loading
2. 300~400% zoom 상태의 선명도
3. Zoom/Pan 위치 읽기
4. Zoom/Pan 위치 programmatic restore
5. Page thumbnail generation

여기서 특히 **3번과 4번**이 불가능하면 library fork 또는 native module로 넘어간다.

---

# 46. MVP에서 Backend가 필요하지 않은 이유

현재 PRD에서는 다음 기능이 없다.

```text
회원가입
로그인
Cloud Sync
여러 Device Sync
공유
웹 서비스
```

따라서:

```text
Supabase
Firebase
AWS
API Server
```

는 MVP에 필요하지 않다.

Architecture:

```text
App
│
├─ SQLite
└─ FileSystem
```

만으로 충분하다.

---

# 47. Cloud Sync 추가 시에도 DB 구조는 유지 가능

향후:

```text
iPhone
↕
Cloud
↕
iPad
```

동기화를 넣더라도 현재 구조를 그대로 활용할 수 있다.

각 Record에 추후:

```text
updated_at
sync_status
device_id
```

를 추가하면 된다.

PDF 파일은 Object Storage.

Metadata는 Server DB.

Annotation은 Record 또는 JSON Object Storage로 동기화한다.

---

# 48. 가장 중요한 Architecture Rule

PDF Viewer Component가 다음 데이터를 직접 소유하게 만들지 않는다.

```text
Hidden Pages
Tracker
Annotation
Application Viewer State
```

Viewer component는 **Rendering Engine** 역할만 해야 한다.

올바른 구조:

```text
Application State
      │
      ▼
   PdfEngine
```

잘못된 구조:

```text
PdfLibrary
   │
   ├─ annotation
   ├─ tracker
   ├─ state
   └─ everything
```

후자의 경우 PDF Library를 교체하는 순간 앱 전체를 다시 만들어야 한다.

---

# 49. 구현 난이도

| 기능 | 난이도 |
|---|---:|
| Workspace | 낮음 |
| PDF Upload | 낮음 |
| SQLite | 낮음 |
| 정렬 | 낮음 |
| Thumbnail | 중간 |
| Hidden Page | 낮음 |
| Horizontal Tracker | 중간 |
| Vertical Tracker | 중간 |
| PDF Zoom/Pan | 중간 |
| PDF 좌표 변환 | 높음 |
| 정확한 Viewport Restore | 높음 |
| Pen Annotation | 높음 |
| Text Annotation | 중간 |
| Multi-select Drag | 중간 |
| Pencil/Stylus 최적화 | 높음 |

따라서 MVP의 기술 리스크는 사실상 두 가지다.

```text
PDF Viewport
Annotation Coordinate
```

---

# 50. 개발 순서

### Sprint 1

```text
Expo Project
SQLite
Workspace
PDF Import
File Storage
```

### Sprint 2

```text
PDF Renderer
Page Navigation
Thumbnail
Viewer Resume
```

### Sprint 3

```text
Horizontal Tracker
Vertical Tracker
PDF Coordinate
Tracker Persistence
```

### Sprint 4

```text
Thumbnail Multi Selection
Hide / Show
```

### Sprint 5

```text
Skia Annotation
Pen
Highlighter
Eraser
Text
```

이 순서를 권장한다.

Annotation부터 개발하면 나중에 PDF Transform 구조가 바뀌면서 다시 만들어야 할 가능성이 높다.

---

# 51. 첫 번째 기술 검증 목표

가장 먼저 아래 Prototype 하나를 만든다.

```text
1개의 PDF
↓
Page 3 열기
↓
250% Zoom
↓
특정 차트 위치까지 Pan
↓
앱 종료
↓
재실행
↓
Page 3
250%
동일 차트 위치
복원
```

이게 정상적으로 되면 핵심 PDF Architecture가 확정된다.

그 다음에:

```text
Progress Line
Annotation
Thumbnail Hide
```

를 얹으면 된다.

---

# 52. 최종 추천 Stack

```text
Expo SDK 57
React Native 0.86
TypeScript

Expo Router

Zustand

expo-sqlite
expo-file-system
expo-document-picker

react-native-gesture-handler
react-native-reanimated

React Native Skia

PdfEngine abstraction
+
native PDF renderer / react-native-pdf adapter

Development Build
EAS Build
```

DB:

```text
documents
viewer_states
page_states
tracker_settings
annotations
app_preferences
```

File System:

```text
source.pdf
thumbnails/
```

그리고 기술적으로 가장 중요한 원칙은:

> **PDF 화면의 Page / Zoom / X / Y 상태를 애플리케이션이 직접 소유하고, PDF Library는 교체 가능한 Rendering Engine으로 취급한다.**

이 구조로 만들어야 도안보고의 핵심 기능인 **“다시 열었을 때 정확히 뜨던 위치로 돌아오는 경험”**을 안정적으로 구현할 수 있다.

## 웹 UI 공통 브랜드 로딩

- 공통 React 컴포넌트 `BrandLoading`을 앱 진입, PDF 열기·복귀·페이지 작업, 차트, 뜨개보고서 준비 상태에 연결한다.
- 48×48 SVG 바늘·코 심볼을 CSS로 애니메이션하며 Canvas, Worker, 외부 애니메이션 라이브러리를 사용하지 않는다. 요청 식별자가 달라지면 경과 시간과 문구 선택을 초기화하고, 해제 시 타이머와 탭 가시성 리스너를 제거한다.
- 경과 시간은 탭이 보이는 동안만 누적한다. 첫 400ms는 시각 표시를 숨기고, 이후 뜨개 문구 10개를 동일 확률로 선택해 2초마다 무작위로 교체한다. 직전 문구는 제외하며 시간대별 문구 제한과 5초 이후 사실 안내는 제거했다.
- 숨겨진 탭에서는 진행 시간과 SVG 애니메이션을 정지했다가 복귀 시 계속한다. reduced-motion은 정적 심볼을 사용하고 화면 낭독기는 상태 문구만 전달한다. 오류 문구는 지연·농담 없이 즉시 알림으로 노출한다.

- 2026-10-06 로딩 문구 수정: 시간대별 고정 문구와 5초 이후 사실 안내를 제거하고 10개 뜨개 문구를 동일 확률로 선택해 2초마다 교체한다. 직전 문구 연속 반복을 막고 400ms 표시 지연·숨김 탭 정지·오류 우선 표시를 유지한다. 타입 검사·린트·전체 테스트(21개 파일·84개 테스트)·일반 빌드·portable 빌드가 통과했다. portable HTML은 7,479.72 kB다. 실제 브라우저 조작과 Android 태블릿 검증은 미실시다.
- 배포 확인: 커밋 `9c75b64`, [GitHub Pages 배포 37403536503](https://github.com/blg-mike/doanbogo-web/actions/runs/37403536503) 성공. 공개 홈·현재 앱 스크립트 HTTP 200, 스크립트에서 기존 5초 이후 보고서 안내 문구 제거와 랜덤 뜨개 문구 포함을 확인했다.

- 2026-10-06 PC 썸네일 조작: 마우스 왼쪽 버튼으로 썸네일 줄을 좌우 드래그해 스크롤한다. 8px 이하 이동은 클릭으로 처리하고 드래그 후 클릭은 억제한다. Ctrl 다중 선택과 터치 길게 누르기·범위 선택을 유지한다. 클릭 시 페이지 작업 로딩을 기다리지 않고 페이지 이동을 요청하며 기존 편집 준비 보호를 사용한다. 타입 검사·린트·84개 테스트·일반/portable 빌드 통과. portable HTML 7,480.88 kB. 실제 마우스·태블릿 조작은 미검증이다.
- 배포: 커밋 `5ede589`, GitHub Pages 배포 37403819676 성공. 공개 홈과 Viewer 스크립트 HTTP 200 확인.

- 2026-10-06 Ctrl+Shift+썸네일 클릭: 선택 기준 페이지에서 클릭 페이지까지 표시 페이지를 범위 선택해 기존 선택에 추가한다. 예: 5페이지 선택 후 9페이지 클릭은 5~9페이지 선택. 숨김 페이지는 제외하며 Ctrl 개별 선택과 드래그 스크롤을 유지한다. 타입 검사·린트·84개 테스트·일반/portable 빌드 통과, portable HTML 7,481.14 kB. 실제 마우스 조작은 미검증이다.
- 배포 확인: 커밋 `f7abf74`, GitHub Pages 배포 37404072274 성공. 공개 홈·Viewer 스크립트 HTTP 200 확인.

- 2026-10-06 범위 선택 키 변경: Shift+클릭으로 선택 기준 페이지부터 클릭 페이지까지 범위 선택한다. Ctrl+클릭은 개별 선택을 유지하고 Shift 입력에서는 마우스 드래그 스크롤을 시작하지 않는다. 타입 검사·린트·84개 테스트·portable 빌드 통과. 실제 마우스 조작은 미검증이다.
- 배포 확인: 커밋 `202ef48`, GitHub Pages 배포 37404238965. portable HTML 7,481.15 kB.

- 2026-10-06 썸네일 휠: 썸네일 줄에서 세로 마우스 휠을 가로 이동으로 적용한다. 트랙패드 가로 스크롤과 Ctrl+휠 브라우저 확대를 유지한다. 타입 검사·린트·84개 테스트·portable 빌드 통과. 실제 마우스 조작은 미검증이다.
- 배포 확인: 커밋 `8cb18b8`, GitHub Pages 배포 37404843128 성공·공개 홈 HTTP 200. portable HTML 7,481.32 kB.
- 2026-10-06 집중 보기 회전 수정: 90°·270° 페이지 회전 시에도 진행선과 집중 보기 좌표를 페이지 좌표계로 변환해 표시하며 연결 카운터 줄 이동을 지원한다. 집중 보기 줄 간격은 소수점(0.5% 단위) 입력을 허용한다. 타입 검사·린트·전체 테스트(24개 파일·111개 테스트)·일반/portable 빌드 통과. portable HTML 7,571.57 kB. 실제 PDF 회전·카운터·줄간격 조작은 구현 완료 후 사용자가 직접 검증할 예정이다.
- 배포 확인: 커밋 `4a2de9d`, [GitHub Actions 37423294878](https://github.com/blg-mike/doanbogo-web/actions/runs/37423294878) 성공. 공개 홈·앱 스크립트·Viewer 청크 HTTP 200 및 새 회전 좌표 코드 포함을 확인했다. 실제 브라우저·PDF 조작은 사용자가 직접 검증할 예정이다.
- GitHub 반영: 뜨개보고서 업데이트와 집중 보기 회전을 함께 포함한 커밋 `b836acd`, [배포 작업 37423708961](https://github.com/blg-mike/doanbogo-web/actions/runs/37423708961) 성공. 공개 홈·앱 스크립트·Viewer 청크 HTTP 200, Viewer 리소스에 보고서 개선과 회전 좌표 처리가 포함된 것을 확인했다. 실제 PDF·Android 조작은 사용자가 직접 검증한다.

- 2026-10-06 텍스트 입력·회전 개선: 페이지 회전 각도의 역회전을 텍스트 객체·미리보기·서식 도구막대에 적용해 원본 페이지 좌표 위치는 유지하면서 화면 방향은 고정한다. 텍스트 편집은 객체별 로컬 초안을 사용해 한글 IME의 조합 중간값을 페이지 작업의 requestAnimationFrame 갱신이 덮지 않게 한다. 회전 보정 단위 테스트 4건, 소스 화면의 90° 회전 확인, 소스와 portable에서 조합 입력 중간값을 확인하는 Playwright 검증을 수행했다. `npm run typecheck`, `npm run lint`, 전체 테스트(24개 파일·115개 테스트), 일반 빌드·portable 빌드 통과. portable HTML 7,572.08 kB. 실제 키보드 IME와 사용 기기의 PC·태블릿 조작은 사용자가 직접 확인할 예정이다. 커밋·배포는 하지 않았다.
- 2026-10-07 펜·직선·형광펜 입력은 현재 좌표와 시작 당시 스타일을 ref에 기록하고 미리보기만 requestAnimationFrame으로 갱신한다. 정상 종료는 마지막 좌표를 포함해 주석과 undo 이력을 한 번 등록하고, 페이지 작업 상태에 확인될 때까지 임시 SVG 미리보기를 유지한다. 취소·캡처 해제는 받아 둔 점만 저장한다. SVG 밖 종료는 window listener로 받아 포인터 캡처 실패를 보완하며 페이지 교체·Viewer 종료에서 리스너를 정리하고 기존 획을 마무리한다. `crypto.randomUUID()`가 없는 경우 `crypto.getRandomValues()`로 UUID v4를 만든다. Footer는 도구·설정 그룹의 축소와 버튼 텍스트 줄바꿈을 막고 도구 레일 내부에서 가로 스크롤하며 coarse pointer 도구 높이를 44px로 맞춘다. Chromium 소스·portable 조작에서 빠른 종료·취소·undo/redo·브라우저 새로고침을, viewport 폭 600·800·1000·1280px에서 페이지 넘침과 label 줄바꿈을 검사했다. 포인터 캡처를 사용하는 실제 마우스 입력과 획 중 페이지 교체 뒤 늦은 이벤트 격리도 소스·portable에서 확인했다. 개발 서버에서는 SVG 밖 포인터 종료와 coarse pointer 44px 높이를 별도로 확인했다. 전체 자동 테스트 25개 파일·121개 테스트, 타입 검사·린트·일반 빌드·portable 빌드가 통과했다. 실제 아이뮤즈 및 정상 태블릿의 펜 입력과 GitHub HTTPS 확인은 사용자가 직접 수행해야 하며 아직 미검증이다. portable HTML은 7,577.59 kB이고 GitHub 커밋·배포는 하지 않았다.

- 2026-10-07 카운터 팝오버 구현: `CounterPanel`은 현재 메인 단, 현재 면, 목표 진행, 다음 작업, 보조 카운터와 확인 대기 알림을 표시한다. `CounterSettings`에서 PDF별 메인 기준·목표 마지막 면·첫 단 면·소리/진동/미리 알림을 편집하고, `CounterEditor`로 보조 카운터 규칙·고정·연동을 관리한다. 목표는 기준 카운터 값보다 낮게 저장하지 않는다. `counterSideForRow`로 RS/WS를 홀짝 계산하고 목표 완료는 메인 행 값을 유지한 채 완료 상태로 기록한다. `CounterHistoryEntry.baseCounterId`로 새 이력을 특정 그룹에 고정하며, 이전 이름 기반 이력은 이름이 모호하지 않을 때만 찾는다. `restoreCounterGroup`은 저장 시점의 기준 그룹과 연결 진행선을 복원하고 독립 그룹은 그대로 둔다. Viewer snapshot 필드는 optional로 추가해 IndexedDB 레코드를 그대로 읽으며 `.doanbogo`를 v12로 내보내고 v1~v11을 가져온다. 타입 검사·린트·25개 테스트 파일(124개)·일반/portable 빌드 통과, portable HTML 7,601.88 kB. 일반 빌드의 PDF.js 청크 경고는 남아 있다. 로컬 HTTP에서 portable 홈을 확인했지만 브라우저 파일 선택창에 막혀 PDF Viewer의 카운터 상호작용은 미검증이다. 커밋·배포는 하지 않았다.

2026-10-08 진행선 직접 조작: 새 페이지 작업은 주선 없이 시작하며 `ProgressLineOverlay` 본체는 상시 드래그 대상이고 8px 후 축을 고정한다. 선택 때 표시되는 길이 핸들과 marker는 X축만 이동한다. move 이벤트는 Overlay 임시 상태만 갱신하고 pointer up에서 PageWork 한 건과 Undo 스냅샷을 저장한다. 카운터 Calibration은 같은 선을 현재·다음 단 위치에 두 번 드래그하고 예상 +1/+2/+3을 확인해 연결한다. `commitCounterTransaction`은 완료 동작이 시작될 때 고정한 활성 페이지 주선만 이동하며 직접 숫자 변경은 `reanchorProgressGuideForCounter`로 선 위치를 유지한다. 이력 복원은 저장된 정확한 그룹과 해당 진행선을 되돌린다. 기존 집중 Blur 캔버스 경로를 제거하고 SVG/CSS Dim 표시로 통일했다. `.doanbogo` 버전은 바꾸지 않고 기존 v14 형식을 유지한다. 타입 검사·27개 테스트 파일(139개)·일반/portable 빌드 통과, portable HTML 7,691.42 kB. 로컬 portable 브라우저에서 초기 상태·선 시작·marker 저장/복원·90° 회전 후 수평 표시를 확인했다. 실제 드래그와 Android 동작은 미검증이다.

## 뜨개보고서 반응형 표현 계층

- KnittingReport는 동일한 IndexedDB 보고서와 저장 함수를 사용하고 화면 폭별 CSS Grid로 편집 UX를 바꾼다. 모바일에서는 한 열 본문과 하단 sheet Inspector, 태블릿에서는 2열 요약 화면과 우측 overlay Inspector, PC에서는 보고서 navigation·본문·Inspector의 3열 배치를 쓴다. Inspector의 열림 여부는 UI 상태다.
- 프로젝트 상태·완료일·사이즈·누적 작업시간은 기존 fields에서 표시하고 project.workTime은 일반 필드 값으로 저장한다. 한 줄 입력은 blur/Enter, 여러 줄 입력은 blur/Ctrl+Enter에서 기존 지연 저장 함수로 반영된다. 사진 확대는 lightbox, 순서는 workPhotos 배열로 유지하며 삭제 취소는 4초간 UI 메모리에 둔다. 데이터베이스 및 .doanbogo 버전은 바뀌지 않는다.
- 2026-10-08 보고서 반응형 UX 초기 검증 기록: `npx vite build --mode portable`과 일반 `npx vite build`가 통과했고 portable HTML은 7,701.12 kB였다. 로컬 portable의 1440·1024·390px 레이아웃에서 넘침 없음과 보고서 필드·사진 조작을 확인했다. 당시 테스트는 27개 파일·133개였고 타입 검사와 lint에 Viewer의 미사용 선언 3건이 남아 있었다. 홈 통합 검증에서 모든 체크를 다시 실행했으며 최신 결과는 아래 기록을 따른다. Android 실기·GitHub 반영은 미실시다.
- 2026-10-08 통합 검증: 진행선·마커와 반응형 홈을 포함해 `npm run typecheck`, `npm run lint`, `npm test`(27개 파일·134개 테스트), `npm run build`, `npm run build:portable`이 통과했다. portable HTML은 7,702.86 kB다. 생성된 portable 홈 화면을 Playwright로 390·1024·1440px에서 확인해 반응형 내비게이션, 검색·프로젝트·보고서 목록, 프로젝트 상세·휴지통 복원, 가로 넘침 없음, 브라우저 오류 없음과 HTTP 200을 확인했다. 진행선 PDF 실제 클릭·드래그와 Android 실기 검증은 미실시다. 일반 빌드에는 PDF.js 대용량 청크 경고가 남아 있으며 GitHub 반영 전이다.
