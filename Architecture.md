# 니트피크 기술 요약

기준일: 2026-10-17. 소스 경로는 별도 표시가 없으면 `doanbogo-web/src` 기준이다.

## 실행·소스 지도
React·TypeScript·Vite·PDF.js·IndexedDB 기반이다. `App.tsx`는 시작·미등록 경로를 프로젝트로 연결한다. 일반 빌드는 `dist/`, portable 빌드는 앱·홈페이지 단일 HTML을 생성한다.

| 담당 | 소스 |
|---|---|
| 프로젝트·언어·보고서 목록 | `Workspace.tsx`, `AppNavigation.tsx`, `WorkspaceLanguageSelect.tsx`, `ReportsPage.tsx`, `reportCollection.ts` |
| Viewer 상태·그룹·저장 | `Viewer.tsx`, `pageManagement.ts`, `pageWorkPersistence.ts` |
| 페이지 렌더·좌표·입력 | `PdfPage.tsx`, `viewerInteraction.ts` |
| 진행선·행별 좌표 | `ProgressLineOverlay.tsx`, `progressLines.ts`, `focusGeometry.ts` |
| 차트 행 분석·보정 | `chartRowDetection.ts`, `chartRows.worker.ts`, `chartRowsWorker.ts`, `ChartRowRecognitionDialog.tsx` |
| 필기 한도·텍스트 | `annotationLimits.ts`, `textNote.ts` |
| 카운터·타임랩·타이머 시작 연동 | `CounterPanel.tsx`, `smartCounter.ts`, `timerCounterLink.ts` |
| 작업시간·기록 패널 | `DocumentWorkTimer.tsx`, `WorkTimeRecordPanel.tsx`, `ReportWorkTime.tsx`, `workTime.ts` |
| 보고서·출력 | `KnittingReport.tsx`, `StandaloneReportRoute.tsx`, `reportFormatting.ts`, `reportMeasurementSelection.ts`, `knittingReportPdf.ts`, `InstagramReportDialog.tsx` |
| 사진·렌더 자원·인식 | `photoImages.ts`, `photoDocument.ts`, `pdfPageRenderQueue.ts`, `pdfRenderResources.ts`, `pdfRecognition.ts` |
| 타입·영속화·호환성 | `types.ts`, `storage.ts`, `backup.ts` |
| UI·다국어 | `designTokens.ts`, `index.css`, `App.css`, `locales/` |

## 저장 계약
- IndexedDB `doanbogo-web` v11: documents·pages·viewers·pageWorks·charts·knittingReportEntries·photoPages·pageRecognition·homeProjects·homeReports·preferences.
- 문서는 원본·표지·총/오늘/일별 작업시간·세션·날짜별 메모를 보관한다. 문서와 프로젝트 요약의 시간 합계는 같은 트랜잭션에서 갱신한다.
- 페이지 작업은 진행선·마커·필기·구간 강조·컬러워크를 원본 페이지 기준 정규화 좌표로 저장한다. 선택한 진행선의 위·아래 이동은 표시 두께를 페이지 좌표로 환산해 기존 실행 취소·저장 경로를 사용하며, 회전된 차트 자동 따라가기는 실제 표시 오프셋을 기준으로 이동한다. Viewer가 페이지 작업을 처음 불러올 때 주 진행선이 없으면 기본선을 만들어 같은 경로로 저장한다.
- `ProgressGuide.chartRegion`은 행별 양끝 좌표·진행 순서·분석 회전·따라가기 상태를 선택 필드로 저장한다. 화면 표시와 카운터 저장이 공통 행 좌표 계산을 사용한다.
- `ViewerSnapshot`은 영역별 페이지·배율·중심·회전, 카운터·이력·타임랩, 라벨·레일 순서를 보관한다.
- `CounterSnapshot.knittingMode`는 선택 필드이며 누락값은 평면으로 정규화한다. 평면은 기존 RS/WS 계산을 쓰고 원통은 현재 단과 목표 단을 RS로 계산한다. 데이터베이스·백업 버전은 유지한다.
- 카운터 팝오버는 카운터·설정·타임랩 탭을 제공하고 보조 카운터 추가는 카운터·설정 탭에서 시작할 수 있다. `groupCounterTimeLaps`는 세션과 세션 내 기록을 최신순으로 파생하며 시간 범위는 24시간제로 날짜 없이 표시한다. 설정은 기존 저장 트랜잭션을 자동 호출하고 실패 시 현재 입력 초안에서 재시도한다.
- `thumbnailGroups`는 라벨 순서, `thumbnailRailOrder`는 최상위 페이지·그룹 위치다. 소속 변경과 순서를 함께 정리·저장한다.
- 선택·팝오버·드래그·Floating Bar 위치와 집중 보기는 세션 UI 상태다. 집중 보기는 Viewer 재진입 때 기본 UI로 시작한다.
- Viewer 가용 너비 600px 이하에서만 모바일 헤더·푸터·카운터/타이머 배치를 압축한다. CSS 동적 뷰포트 갱신과 safe area를 사용하며 저장 형식은 바꾸지 않는다.
- dirty 페이지는 순차 저장하고 이동·종료·탭 전환 시 flush한다. 카운터·연결 진행선·타임랩은 `saveViewerAndPageWorks`로 함께 저장한다.
- 페이지 읽기는 문서·페이지·요청 ID별로 추적한다. 실패를 빈 작업으로 대체하지 않고 준비 전 편집을 차단한다. 저장 실패 시 기존 데이터와 재시도 상태를 유지한다.
- IndexedDB 불가 시 임시 메모리 경로를 사용하며 브라우저 종료 시 작업이 사라질 수 있음을 알린다.
- 내부 백업 검증은 `.doanbogo` v14·v1~v14 입력 호환을 유지한다. 현재 UI 기능과 내부 호환 모듈을 구분한다. 인식 캐시는 재생성 가능한 데이터다.
- 보고서는 기존 선택 필드에 게이지 무늬·전후 실측·단위와 바늘 브랜드·mm/us/uk/jp 표기를 저장한다. 화면에서 뜬 사이즈와 수정사항 상세값을 감춰도 저장된 값은 유지되며 공유·PDF 출력은 기존 필드를 계속 사용한다. 공유 문구 생성에는 `#니트피크 #knitpeek`을 포함하며 데이터 타입과 백업 버전을 유지한다.

## 시간·카운터
- 측정은 시작 시각과 `Date.now()` 차이로 계산하고 화면 갱신은 타이머 내부에서 처리한다.
- 일시정지·저장하고 나가기·날짜 경계에서 세션을 저장한다. 매초 표시·일반 자동 저장은 측정 시간을 기록하지 않는다.
- `addDocumentWorkSessions`는 세션 ID로 중복을 방지한다. 실패 시 일시정지 상태와 미저장 세션을 유지한다.
- `addDocumentWorkTime`은 날짜별 수동 증가분만 합산하고 타이머 세션을 만들지 않는다.
- 작업 기록의 날짜별 초기화는 해당 날짜의 합계·세션만 제거하고 메모를 보존하며, 전체 초기화는 합계·세션 전체를 비운다. Viewer 타이머는 초기화 전에 저장하고 실행 중이면 새 세션으로 이어간다.
- 표시 시간 = 저장된 오늘 합계 − 현재 Viewer에서 이미 저장한 세션 시간 + 현재 Viewer의 오늘 측정 시간. 수동 추가 후 일시정지에서도 중복 합산하지 않는다.
- 타임랩은 `counterTimeLapTiming`에서 같은 카운터·Viewer 세션의 직전 `recordedAt`과 현재 시각 차이로 계산한다. 첫 기록은 0이며 타이머 재생 상태와 독립적이다.
- Floating Bar 터치 이동은 450ms 롱프레스 후 포인터 캡처와 단일 animation frame으로 위치를 갱신하고 종료 시 한 번 저장한다. 8px 초과 선이동은 예약을 취소한다.
- 카운터 타이머 시작 모드는 `auto/ask-once/independent`이며 기본은 `ask-once`다. 모드·확인 선택은 preference에 저장한다.
- 저장하고 나가기는 조작을 잠그고 진행 중 저장→타이머→최신 페이지·카운터·뷰어 저장을 완료한 뒤 `/projects`로 이동한다.

## 렌더·입력
| 자원 | PC | coarse pointer + 2개 이상 터치 |
|---|---:|---:|
| 단일/분할 PDF | 5MP / 영역당 3MP | 2.5MP / 영역당 1.5MP |
| 표시·staging 캔버스 | 44MiB | 24MiB |
| 컬러워크 | 1MP | 0.5MP |
| 썸네일 캐시 | 128개 / 8MiB | 8개 / 512KiB |
| 페이지 작업 캐시 | 8페이지 | 4페이지 |

- 공용 직렬 큐는 기본 페이지를 정밀 렌더보다 먼저 처리하고 취소 Promise 종료 후 메모리를 반환한다.
- 기본 래스터가 확대율×DPR 목표보다 낮으면 입력 정착 200ms 후 보이는 원본 범위만 추가 렌더한다. DPR은 최대 2이며 정밀 캔버스도 공용 예산에 포함한다.
- 새 이동·확대·전환은 정밀 작업을 취소한다. 실패 시 기본 화면을 유지하고 오래된 결과는 반영하지 않는다. 사진 어댑터도 범위 렌더를 사용한다.
- PDF 렌더와 작업 데이터 대기는 각각 20초 뒤 오류·재시도를 제공한다.
- 한 이동 제스처의 영역 소유권은 종료·cancel·캡처 해제까지 유지한다. 화면 맞춤 배율에서는 영역 X/Y 스크롤바를 표시하지 않는다.
- Viewer 배율은 50·75·100·125·150·200·300·400·500% 단계로 조절한다. 중심은 페이지 정규화 좌표로 저장하며 확대 초점은 영역·페이지·회전과 함께 검증한다. 버튼은 보이는 페이지 영역 중심을, 휠·핀치는 포인터 중심을 사용하고 여백 입력은 페이지 경계로 제한한다. 미리보기와 최종 렌더는 같은 초점을 사용한다.
- 진행선 레이어는 텍스트·필기·강조 위에 있고 선 hit target만 이벤트를 받는다. 선 팝업은 변형되지 않는 Viewer 영역에 표시하고, 정규화된 선 기준점을 화면 좌표로 바꿔 위치를 유지한다. 핀치와 Viewer 배율 버튼 조작 중에는 열어 두며 팝업 입력은 페이지 제스처로 전파하지 않는다. Escape·바깥 클릭과 포커스 복원을 유지한다.
- 썸네일 드래그 좌표·자동 스크롤은 ref·requestAnimationFrame으로 처리하며 대상 변경 때 UI를 갱신한다. 접힌 그룹과 화면 밖 썸네일 렌더를 제한한다.
- 사진은 시그니처·EXIF를 확인하고 한 장씩 최대 2560px·6MP JPEG·320px 표지로 처리한다.
- PDF 링크·텍스트 URL·QR은 Viewer에서 표시한 페이지를 300ms 안정 후 순차 인식한다. 완료 캐시는 즉시 재사용하고, 두 영역 보기에서는 활성 페이지를 먼저 분석하며 화면 전환·백그라운드에서 취소한다. URL 영역은 이동 도구에서만 클릭하고 8px 초과 드래그·핀치에서는 열지 않는다. QR은 저우선순위 렌더 큐와 1400px·2MP 상한을 사용한다.
- 터치 정책 기기의 비활성 탭은 PDF/Worker를 해제하고 저장한 영역 상태로 재개한다.

## 브랜드·홈페이지·전달
- 로고 원본: `assets/yy-logo-source.png`; 화면 로고: `yy-logo.png`; Apple 아이콘: `yy-app-icon.png`; 파비콘: `yy-favicon.png/.ico`.
- PWA는 `public/pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`와 SVG 자산을 사용한다. 동일한 그린 니트·돋보기 표식이며 기존 파일명은 참조 계약이다.
- Pretendard는 `assets/fonts/PretendardVariable.woff2`, 라이선스는 같은 폴더의 `LICENSE.txt`다.
- 홈페이지 소스는 `homepage/index.html·homepage.css·pages.js·homepage.js`다. `scripts/build-homepage.mjs`가 자산·서체·상위 `../docs/terms-*.md·privacy-*.md`를 단일 HTML에 내장한다.
- 사진 원본 프롬프트와 WebP 자산은 `homepage/assets/CRAFT_IMAGES.md`를 따른다. 홈페이지 빌드는 4개 WebP를 내장하며 진행선·카운터 동작 예시는 SVG·CSS로 표시한다.
- 안내 화면은 `#page/about|guide|features|faq|terms|privacy`다. 법률 문서는 초안 상태와 검토 필요를 표시한다.
- `scripts/markdown-to-html.mjs`는 HTML을 이스케이프하고 HTTPS 링크만 활성화한다. 단위 테스트는 저장소 밖 문서를 읽지 않는다.
- 7개 locale와 기기 언어 설정은 재마운트 없이 변경하며 사용자 입력을 보존한다.
- 웹 main push는 `.github/workflows/pages.yml`의 검사·일반 빌드·Pages 배포를 실행한다. portable 생성·실제 브라우저·실기는 각각 별도 확인한다.

## Android 내장
- `doanbogo-app/src/app/index.tsx`가 내장 HTML을 WebView에서 `https://appassets.androidplatform.net/` 출처로 연다. 공개 사이트를 실행 중 내려받는 구조가 아니다.
- 파일 출력은 요청 ID·순서 확인·청크 ACK·크기 검증 후 Android 공유 화면으로 연결한다. 외부 링크·Escape/뒤로 가기·앱 복귀·프로세스 재생성을 연결한다.
- `npm run build:preview:android -- --arm64-only`는 웹 portable 재생성→앱 자산 복사→Gradle debug APK를 수행한다. 패키지는 `com.anonymous.doanbogoapp.preview`다.
- `assets/knitpeek/build-info.json`과 `preview-artifacts/*.apk.json`의 웹 revision·dirty 여부·SHA-256·ABI가 APK 내용의 기준이다. 최신 웹 기능·브랜드가 기존 APK에 자동 적용된다고 판단하지 않는다.
- 앱별 세부 규칙은 `doanbogo-app/AGENTS.md`를 따른다.
