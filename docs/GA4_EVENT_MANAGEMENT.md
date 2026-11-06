# GA4 이벤트 관리

이 문서는 KnitPeek 운영 웹의 GA4 이벤트 계약과 검증 기준이다. 이벤트 코드나 매개변수 변경 시 이 문서와 검증 결과를 함께 갱신한다. 이벤트 설계는 `03_AI_Skills/marketingskills-main/skills/analytics`의 분석 질문 역산, 이벤트 명명·중복 방지·개인정보 최소화 기준을 따른다.

## 속성 및 수집 범위

- 속성: KnitPeek (`562866443`), 웹 스트림: KnitPeek (`16283716090`)
- 운영 URL: `https://knitpeek.pages.dev`, 측정 ID: `G-38SHZWCP19`
- 시간대·통화: Asia/Seoul · KRW. 이벤트 및 사용자 데이터 보관: 14개월.
- Cloudflare Web Analytics는 그대로 유지한다. GA4 태그는 운영 호스트에서만 활성화한다. `VITE_GA_MEASUREMENT_ID`가 배포 빌드에 있을 때만 삽입하며 개발·미리보기·Android·portable 빌드에는 넣지 않는다.
- GA 태그는 분석 허용 후에만 로드한다. 거부·철회 시 전송을 중지하고 GA 쿠키를 삭제한다. 동의 선택은 브라우저 로컬 저장소에 180일간 저장한다. 광고 저장·광고 개인화·Google Signals는 비활성화한다.
- HashRouter의 고정 화면 경로를 수동 전송한다. URL의 문서·프로젝트 ID와 비허용 쿼리는 제외한다. GTAG 자동 page_view와 향상된 자동 측정은 끈다.
- GA4 관리자 설정 확인: Asia/Seoul·KRW, 이벤트·사용자 데이터 보관 14개월, Google Signals 및 향상된 측정 비활성. 이벤트 범위 맞춤 측정기준 17개를 KnitPeek 속성에 등록했다.

기능 순위는 사용자 수를 우선하고 이벤트 수를 보조 지표로 본다. GA4에는 분석에 동의한 방문자만 포함된다. 이탈은 마지막으로 관측한 단계와 다음 단계 전환율로 추정하며 브라우저 종료 순간까지 완전하게 수집한다고 보지 않는다.

## 공통 데이터 규칙

- 이벤트 이름은 소문자 snake_case, 매개변수 값은 고정된 영문 식별자를 쓴다.
- 파일명, 문서·프로젝트·보고서 ID, 도안·보고서 내용, 검색어, 메모, 측정값, 오류 원문 및 연락처를 보내지 않는다.
- 참조 URL은 도메인만 보낸다. 초기 URL의 UTM 5종(source, medium, campaign, content, term)만 허용하며 이메일·URL·연속 숫자 등 PII 의심 값은 제외한다.
- 동의 전에 발생한 이벤트를 저장하거나 나중에 재전송하지 않는다. 타이머 초 갱신, 드래그 중간 좌표, 입력 글자별 이벤트는 보내지 않는다.
- `feature_name`: `progress_line`, `counter`, `timer`, `annotation`, `chart`, `report`, `gauge_calculator`만 허용한다. `action`은 `activate`, `start`, `pause`, `step`, `pen`, `highlight`, `erase`, `text`, `select_region`, `highlight_region`, `toggle`, `open`, `apply`, `export` 중 하나만 허용한다.

## 이벤트 계약

| 이벤트 | 목적 및 발생 조건 | 매개변수 | 중복·개인정보 기준 | GA4 확인 위치 |
|---|---|---|---|---|
| `page_view` | 홈페이지·법률 페이지·앱의 고정 화면 경로 진입 | `page_title`, `page_location`, `page_referrer`, `page_type`, 허용된 `utm_*` | 같은 고정 화면 경로·유형은 한 번. HashRouter의 ID는 제외. 자동 전송을 끈 뒤 수동 1회 | 실시간, 페이지 및 화면, 탐색 |
| `homepage_section_viewed` | 홈 섹션 50% 이상 노출이 활성 탭에서 1초 누적 | `section_id` | 섹션별 화면 방문당 한 번. 섹션 ID는 고정 목록 | 탐색 |
| `homepage_section_engaged` | 해당 섹션의 활성 노출 10초 누적 | `section_id` | 숨긴 탭 시간 제외, 섹션별 화면 방문당 한 번 | 탐색 |
| `homepage_scroll_reached` | 홈페이지에서 문서 스크롤 25·50·75·90% 도달 | `percent_scrolled` | 임계값별 화면 방문당 한 번. 법률 페이지·앱에서는 제외 | 탐색 |
| `cta_clicked` | 홈페이지의 시작하기·프로젝트 열기 클릭 | `cta_id`, `location` | 위치와 CTA는 고정 식별자. 버튼 문구는 수집하지 않음 | 탐색 |
| `language_changed` | 홈·앱 언어 선택 변경 | `language`, `previous_language` | 허용 locale 또는 `auto`만 전송 | 탐색 |
| `support_clicked` | 실 한 볼 선물하기 링크 선택 | `location` | 후원 위치만 전송. 외부 URL·링크 문구는 제외 | 이벤트, 탐색 |
| `import_started` | PDF·사진 파일 선택기 열기 | `file_type` | 선택기 동작당 한 번. 파일명 미수집 | 이벤트, 탐색 |
| `import_completed` | PDF·사진 자료가 로컬 저장되고 목록 갱신 | `file_type` | 선택 작업당 완료 이벤트. 파일 수·이름 미수집 | 이벤트, 퍼널 탐색 |
| `import_failed` | 파일 가져오기 일부 또는 전체 실패 | `file_type`, 고정 `error_code` | 오류 코드는 코드에 정의된 목록으로 매핑. 오류 원문 미수집 | 이벤트, 퍼널 탐색 |
| `viewer_opened` | 문서 데이터와 뷰어가 준비됨 | `document_type` | 뷰어 문서 ID마다 한 번, ID 미전송 | 실시간, 이벤트, 퍼널 탐색 |
| `feature_used` | 카운터·타이머·진행선·필기·차트·보고서의 의도된 실행 | `feature_name`, `action` | 고정 허용 목록만 사용. 초 단위·드래그·입력 변경은 제외 | 이벤트, 탐색 |
| `report_created` | 새 보고서 저장 성공 | 없음 | 저장 성공마다 한 번. 보고서 내용·ID 미전송 | 이벤트, 퍼널 탐색 |
| `gauge_calculation_applied` | 게이지 계산값을 기본·추가 게이지와 세탁 단계에 적용 | `gauge_target`, `wash_stage` | 대상·단계만 허용. 게이지 숫자·실측값 미전송 | 이벤트, 퍼널 탐색 |
| `report_export_completed` | 보고서 PDF 내보내기 성공 | `format: pdf` | 성공 후 한 번. 파일명·내용 미전송 | 핵심 이벤트, 실시간, 퍼널 탐색 |
| `share` | 보고서 문구 클립보드 복사 또는 PDF 네이티브 공유 완료 | `method`, `content_type` | 완료한 경로만 기록. 공유 내용·파일명 미전송 | 이벤트, 퍼널 탐색 |

## 맞춤 측정기준 및 보고서

탐색에 필요한 이벤트 범위 맞춤 측정기준: `page_type`, `section_id`, `percent_scrolled`, `cta_id`, `location`, `language`, `previous_language`, `file_type`, `error_code`, `document_type`, `feature_name`, `action`, `gauge_target`, `wash_stage`, `format`, `method`, `content_type`. UTM 및 GA 기본 페이지 매개변수는 기본 획득·페이지 보고서에서 확인한다.

탐색 보고서:

1. 유입경로·캠페인별 방문 → `viewer_opened`
2. 홈페이지 섹션 도달·활성 체류·CTA 위치
3. `feature_name`별 활성 사용자 및 반복 사용 횟수
4. 시작하기 → 가져오기 완료 → 뷰어 열기 → 기능 사용
5. 보고서 생성 → 게이지 적용 → PDF 내보내기·공유

핵심 이벤트는 `viewer_opened`와 `report_export_completed`로 지정한다. 분석 메뉴는 계정에서 이벤트를 수신한 뒤 실제로 등록·저장됐는지 확인한다. 맞춤 측정기준은 이벤트 수신 후 표준 보고서·탐색에서 값 표시까지 처리 시간이 필요할 수 있다.

## 검증표

| 확인 | 예상 | 실제 결과 |
|---|---|---|
| GA 속성·스트림 | KnitPeek, 운영 URL, ID 일치 | KnitPeek 속성 `562866443`·웹 스트림 `16283716090`·`G-38SHZWCP19` 확인 |
| 시간대·통화·보관 | Asia/Seoul·KRW·14개월 | KnitPeek 속성 세부정보와 데이터 보관 UI에서 확인·저장 |
| Google Signals·자동 측정 | 비활성 | KnitPeek 속성 Google Signals 꺼짐, 웹 스트림 향상된 측정 꺼짐 확인 |
| 맞춤 측정기준 | 이벤트 범위 17개 | KnitPeek 속성 맞춤 정의에서 17개 이벤트 매개변수 등록·검색 확인 |
| 미선택·거부·철회 | Google 태그/수집 요청 0건 | 운영 배포 후 확인 |
| 허용·라우트 | 태그 로드, 고정 화면당 page_view 1회 | 운영 배포 후 DebugView/요청으로 확인 |
| 섹션·스크롤 | 규정한 기준별 한 번, 숨긴 탭 시간 제외 | 운영 배포 후 확인 |
| 가져오기·뷰어·기능 | 성공 트리거와 고정 매개변수 확인 | 운영 배포 후 개별 확인 |
| 보고서·게이지·PDF·공유 | 성공 동작만 이벤트 전송 | 운영 배포 후 개별 확인 |
| 개인정보 | 문서 콘텐츠·식별자·검색어·오류 원문 없음 | 운영 배포 후 실제 요청 검사 |
| 7개 언어·모바일·오프라인·차단 | 설정 UI locale, 핵심 앱 기능 유지 | 빌드·운영 검증 후 결과 기록 |
