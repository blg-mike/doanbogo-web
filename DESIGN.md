# 도안보고 UI/UX 상세 명세서

## 현재 웹 구현 기준 — 2026-10-08 / v0.7

이 항목이 현재 웹 UI의 우선 명세다. 아래 v0.2 명세는 초기 모바일·네이티브 설계 참고 자료이며, 충돌하는 배치·동작은 현재 웹 기준을 따른다. 현재 검증 대상은 `doanbogo-web/portable/index.html`을 직접 실행하는 웹이며 앱 이관은 후속 사용자 요청으로 진행한다.

### 구현된 화면과 동작

- **홈과 프로젝트:** 홈(`/`)은 최근 작업 이어하기, 프로젝트 카드, 최근 보고서를 요약한다. 홈에서 통계 대시보드는 사용하지 않는다. PDF 도안, 사진 도안 폴더, 차트 하나를 각각 독립 프로젝트로 다룬다. 이름·태그 검색과 새 프로젝트 진입을 제공하며, 상세 화면에서 이름·태그·작업 상태(작업 중·보류·완료)·보관·휴지통·복구를 관리한다. 프로젝트 삭제는 우선 휴지통으로 이동하고, 영구 삭제는 휴지통에서 별도 확인한다.
- **화면별 탐색:** 768px 미만 모바일은 하단 홈·프로젝트·보고서 탭, 768px 이상은 사이드바를 표시한다. 좁은 태블릿 사이드바는 아이콘 모드로 접힌다. 프로젝트 상세와 보고서 목록은 공통 콘텐츠 레이아웃을 사용한다.
- **보고서 상태:** 보고서마다 작성 중/완료 상태와 완료 시각을 저장하며 프로젝트 작업 상태와 독립적으로 표시한다. 홈·보고서 목록에서 상태와 최근 변경을 확인하고 보고서 ID별 화면으로 연다.
- **홈 데이터:** 홈은 PDF 원본을 읽지 않고 IndexedDB의 경량 프로젝트·보고서 요약과 문서 표지를 사용한다. 기존 프로젝트 상태는 마이그레이션에서 작업 중/작성 중으로 채운다.
- **브랜드:** 현재 웹 워크스페이스와 뷰어에는 YY 로고를 표시하고 웹 파비콘·PWA 아이콘도 별도 YY 자산을 사용한다. 별도 Expo 앱은 사용자 제공 문어 이미지를 앱 아이콘·Android adaptive icon·favicon 및 앱 내 브랜드 이미지로 사용한다. 두 구현의 자산은 자동 동기화되지 않는다.
- **사진 도안:** 워크스페이스의 `사진 추가`는 카메라 촬영과 기존 사진 선택을 제공한다. 카메라로 한 장을 찍으면 계속 촬영하거나 완료할 수 있고, 여러 이미지 또는 한 폴더를 선택해 한 사진 도안 폴더에 페이지 순서대로 넣는다. 자연 파일명 순으로 정렬한 뒤 저장 전에 위·아래 이동과 제거로 순서를 조정한다. 폴더 이름을 지정할 수 있고, 도안 관리 메뉴에서 사진을 더 추가하거나 이름 변경·복사·삭제한다. 사진은 긴 변 2,560px·최대 6MP JPEG로 축소해 기기 로컬에 페이지별 저장한다.
- 사진 도안은 PDF와 같은 Viewer 화면·두 영역 보기·페이지 썸네일·숨김·회전·확대·필기·진행선·컬러워크·카운터를 사용한다. 이미지 원본은 PDF로 합치지 않으며 숨긴 페이지 이미지는 렌더·썸네일·QR 분석에서 건너뛴다. QR 인식은 보이는 사진 페이지에서도 계속 처리한다.
- 사진 페이지는 IndexedDB v9 `photoPages`에 저장한다. 홈 요약은 IndexedDB v10 `homeProjects`·`homeReports`에 저장하며 프로젝트 상태와 보고서 완료 상태를 포함한다. 작업 파일 `.doanbogo` v14는 사진 페이지·프로젝트/보고서 상태와 진행선 전환·마커 데이터를 보존하고 v1~v13 가져오기를 유지한다.
- **공통 로딩:** `BrandLoading`은 앱 진입, PDF 열기·복귀·페이지 작업, 차트, 뜨개보고서에 사용한다. 48×48 SVG의 바늘과 코 4개가 1.4초 동안 순차적으로 나타나며 심볼과 14px·Medium 문구 사이 간격은 16px다. 첫 400ms에는 시각 요소를 감추고, 이후 뜨개 문구 10개를 동일 확률로 선택해 2초마다 무작위로 바꾼다. 직전 문구는 연속 반복하지 않는다. 시간대별 문구 제한과 5초 이후 사실 안내는 제거했다. 탭이 숨겨지면 시간과 애니메이션을 멈추고 복귀 시 이어간다. 오류는 기다리지 않고 실제 문구를 알림으로 보여 준다. `prefers-reduced-motion`은 정적 심볼로 표시하며 화면 낭독기는 애니메이션을 읽지 않는다.
- **뷰어 배치:** 상단에는 파일명·이름 변경·페이지 정보를 두고 도구 버튼을 `두 영역 보기 → 북마크` 순으로 배치한다. 단일 보기는 작업 영역 전체를 사용한다. 두 영역 보기는 가로 화면에서 좌우, 세로 화면에서 상하로 나뉘며 처음 50:50으로 열리고 분할 핸들로 비율을 조절한다. 각 영역의 페이지·확대율·위치를 독립 관리한다. Footer의 페이지 조작 그룹은 활성 영역을 대상으로 하며, 분할 보기에서는 영역 위치와 페이지 번호를 표시한다. 영역을 누르면 조작 대상이 바뀐다.
- **카운터:** Footer 버튼은 PDF 레이아웃을 밀지 않는 우측 팝오버를 연다. 메인 카운터의 현재 단·RS/WS·`−1`/`+1`, 목표 진행, 다음 할 일과 보조 카운터를 한눈에 보여 주며 헤더 드래그로 옮기고 모바일에서는 접거나 펼치는 하단 시트로 쓴다. `+1`은 현재 단을 완료하고 다음 단으로 이동한다. 목표 단을 완료하면 목표 단 표시를 유지하고 완료 알림을 보인다. 목표 마지막 면과 첫 단 면은 홀짝에 따라 연결해 RS/WS를 계산한다. 보조 카운터는 한 추가 버튼에서 자유·무늬·줄임/늘림을 선택하며 이름·색·고정·연동·시작 단은 설정 화면에서 관리한다. 무늬 반복과 작업 일정은 현재/다음 할 일로 안내하고 소리·진동·1단 전 알림을 설정한다. `−1`과 단 되돌리기는 저장 이력이 있는 대상만 허용하며 메인 그룹의 카운터와 연결 진행선만 복원한다. PDF별 선택 메인·목표·알림·이력을 `ViewerSnapshot`에 저장하고 카운터 및 연결 진행선은 기존 IndexedDB 단일 트랜잭션으로 기록한다. `.doanbogo` v14는 이전 v1~v13 가져오기를 유지한다.
- 회전은 활성 영역의 현재 페이지만 시계 방향 90도 돌리고 영역별·페이지별로 저장한다. PDF 내용, 필기, 컬러워크, 링크는 각 영역의 페이지 회전에 맞춰 표시한다. 텍스트 객체는 페이지 원본 좌표에 고정하되 회전 각도를 상쇄해 화면에서 읽는 방향을 유지하며, 입력 미리보기와 서식 도구막대도 똑바로 표시한다. 새 주 진행선은 회전과 관계없이 화면 기준 수평을 유지한다. 확대율은 유지하고 해당 영역의 페이지 중심만 다시 맞춘다.
- **하단 탐색과 숨김:** Footer 가로 목록에는 표시 페이지의 썸네일을 원래 순서로 보여 준다. 일반 클릭은 페이지로 이동하고 단일 선택한다. 컴퓨터에서 Ctrl+좌클릭은 다중 선택을 추가·해제하고, 태블릿에서 450ms 길게 누르면 선택 모드가 시작된다. 길게 누른 상태의 좌우 드래그는 시작점부터 끝점까지 연속된 표시 페이지를 선택하며 끝점으로 되돌리면 범위가 줄어든다. 누르기 시작 후 8px를 넘게 움직이면 길게 누르기를 취소하고 가로 목록을 스크롤한다.
- 선택된 카드에 체크를 표시하고 가장 마지막으로 선택한 카드 상단에 숨김 버튼 하나만 표시한다. 선택한 페이지는 한 번의 저장 작업으로 숨기며 선택에 따른 숨김으로 마지막 표시 페이지가 사라지는 경우 버튼을 비활성화하고 안내한다. 저장 중에는 선택 변경을 막고 성공 시 선택을 초기화하며 실패 시 선택을 유지하고 오류를 표시한다. 연속된 숨김 페이지 구간은 원래 순서를 유지하며 썸네일 카드 없이 기존 크기의 절반인 `•••` 버튼 하나로 압축한다. 버튼을 누르면 해당 연속 구간 전체를 복구한다. 숨김 페이지는 썸네일을 렌더하거나 공유 캐시에 넣지 않는다. 현재 페이지 빠른 숨김은 Footer 페이지 조작 그룹에서 제공한다.
- 썸네일 영역 우측 상단 경계에 작은 화살표 아이콘만 있는 버튼을 레일 위로 살짝 겹쳐 둔다. 화살표는 둥근 표시 영역의 정중앙에 맞추고 버튼은 44px 터치 영역을 확보하지만 펼친 상태에서 별도 헤더 줄이나 높이를 추가하지 않는다. coarse pointer와 다중 터치를 지원하는 기기는 기본 접힘, PC는 기본 펼침으로 시작한다. 접으면 썸네일 컴포넌트·뜨개보고서 카드·선택 안내를 제거해 렌더·관찰 작업과 공유 캔버스 캐시를 해제한다. Footer 편집 도구와 페이지 이동은 유지하고 22px 버튼 공간만 남긴다. 재펼칠 때 선택·가로 스크롤 위치를 유지한다. 키보드 기본 버튼 조작과 `aria-expanded`·`aria-controls`를 제공한다.
- **확대·이동:** Footer에서 활성 영역을 100~500%로 조절하고, 두 번 탭 확대/맞춤과 터치 확대·이동도 제공한다.
- **진행선·마커:** Footer에서 시작하면 별도 설정 없이 활성 페이지의 보이는 영역 중앙에 수평 주선을 만들며, 새 페이지에는 시작 전까지 선을 만들지 않는다. 본체는 언제나 직접 드래그할 수 있고 8px 이동 후 가로·세로 축을 고정한다. 선택한 선에는 길이 핸들이 나타나며 핸들과 마커는 가로로만 움직인다. 페이지 경계 안에서 위치를 제한하고 pointer up에서 한 번 저장·실행 취소를 만든다. 마커는 단 안의 진행 위치를 표시하며 연결 카운터가 다음 단으로 이동할 때 초기화한다. 카운터 연결은 선택 사항이며, 같은 선을 현재 단·다음 단 위치로 직접 옮긴 뒤 +1/+2/+3 미리보기를 확인해 확정한다. 연결된 주선을 직접 보정해도 카운터 값은 바뀌지 않고 다음 단 간격은 보정 위치부터 이어진다. 숫자 직접 보정은 선과 마커를 유지하며 새 숫자를 간격 기준으로 삼는다. 카운터 완료는 동작 시작 시 고정한 활성 페이지의 연결 주선만 이동하고, 되돌리기는 저장된 정확한 이력으로 선·마커를 복원한다. 기존 선은 첫 사용 때 호환 가능한 후보를 주선으로 전환하며 미선택 원본을 복구용으로 보존한다. 참고선은 최대 2개이며 카운터·마커와 연결하지 않는다. 색상 6종·투명도 30~100%를 제공하고 집중 보기는 본문 재렌더나 Blur 없이 Dim Overlay로 표시한다. 회전별 화면 수평 위치와 페이지 상대 좌표는 PageWork·`.doanbogo` v14에 저장한다.
- **필기:** 이동·펜·직선·형광펜·지우개·텍스트 도구와 페이지별 실행 취소/다시 실행을 제공한다.

### 텍스트 입력·편집

- 텍스트 도구 선택 후 PDF 위에 마우스를 올리면 점선 영역과 “텍스트 입력” 미리보기를 표시한다. 기본 영역은 페이지 너비 30%, 높이 12%이며 가장자리에서 페이지 안으로 보정한다.
- PDF를 클릭하면 같은 위치에 입력 객체를 생성하고 입력 포커스를 적용한다. 회색 바깥 영역에는 생성하지 않는다. 터치는 탭 위치에 생성한다.
- 생성은 한 번만 수행하고 이동 도구로 돌아간다. 다음 텍스트를 생성하려면 도구를 다시 선택한다.
- 선택되지 않은 객체는 텍스트만 표시한다. 선택하면 테두리·삭제 버튼과 폰트 크기·색상·투명도 툴바를 표시한다. 폰트 크기는 10~48 범위다.
- 기존 객체 선택·편집·이동·크기 조절·삭제를 제공한다. Delete 키는 입력 중 글자 편집과 객체 삭제를 구분한다. 빈 입력은 제거하고 Escape는 현재 편집을 취소한다.
- 회전된 페이지에서도 텍스트 객체의 방향은 화면 기준으로 유지한다. 한글 IME 조합 중에는 텍스트 입력 초안을 객체별 로컬 상태에 즉시 반영해 지연된 페이지 작업 갱신이 입력 중간값을 덮지 않게 한다.
- 텍스트와 스타일·위치는 저장하며 미리보기·선택·편집 상태는 저장하지 않는다.

### 컬러워크

- 도구 이름은 “컬러워크”이며 텍스트 우측에 위치한다. 초기 자유 사각형 기능은 모눈 차팅 방식으로 대체됐다.
- 차트 가로·세로 cm와 10×10cm 기준 게이지 코·단 수를 입력한다. 10×10cm, 18코·24단이면 18열×24행으로 계산한다.
- 모눈 칸 단위 색칠·지우기와 색상·투명도 설정을 제공하며 격자 설정과 칸 데이터를 페이지별로 저장한다. 지우개 모드에서도 컬러피커는 열 수 있고, 컬러피커를 클릭하면 지우개가 꺼지면서 색상 선택창이 열린다.
- 워크스페이스 차트 편집기는 별도 화면이며 대바늘 격자와 코바늘 기호 이동·회전·크기·레이어 및 PNG/PDF 내보내기를 제공한다.

### QR·뜨개보고서
- **QR·웹링크:** QR 링크 버튼 없이 보이는 PDF 페이지의 QR을 자동 인식한다. 도구나 활성 영역에 관계없이 QR 링크 영역을 클릭하면 새 탭으로 연다. PDF 링크 주석과 본문 http(s) URL도 이동 도구에서 클릭하면 새 탭으로 열며, 겹치는 영역은 PDF가 지정한 링크를 우선한다.
- **뜨개보고서:** PDF별 여러 독립 보고서를 만들고 자동 저장한다. 표지 제목 오른쪽 연필 버튼으로 제목을 인라인 편집한다. 첫 화면은 공유 추천 정보를 카드로 요약하고, 게이지·실측·핏·개인 메모는 접힌 내 기록에서 필요한 항목만 연다. 항목별 상세 화면에서 사진, 사용량, 치수 단위와 세부 메모를 편집한다. 페이지 텍스트 메모·보고서 메모에서 명시적 수치 변경과 완성 프로젝트의 미완료 카운터 기록을 로컬에서 후보로 분석하고, 확인·편집·선택한 후보만 수정사항으로 저장한다. Instagram 문구는 포함 정보를 선택하고 미리보기에서 직접 편집해 복사한다. 개인 메모는 선택한 때만 공유 문구에 포함하며 2,200자를 초과해도 자르지 않고 경고한다. 보고서 PDF와 1080×1350 이미지 내보내기는 유지한다.

### 현재 구현 상태

위 뷰어 조작·회전·구분 전환 보존·PDF 웹링크·대용량 PDF 렌더 보호·Footer 썸네일 숨김·복구·확대 썸네일·도구 배치 변경은 `doanbogo-web/src`에 반영되어 있다. PDF 본문 렌더는 전역 한 건만 실행한다. PC에서는 분할 보기 영역당 3MP·표시/staging 캔버스 합계 44MiB, 단일 보기 5MP, 컬러워크 영역당 1MP, 썸네일 캐시 128개/8MiB 상한을 유지한다. coarse pointer와 다중 터치를 지원하는 기기는 각각 1.5MP·24MiB, 단일 보기 2.5MP, 컬러워크 0.5MP로 제한하고 썸네일 캐시는 8개/512KiB다. 터치 기기는 썸네일을 기본 접으며, 펼치면 화면에 보이는 페이지를 하나씩 생성한다. 스크롤 중 렌더를 멈추고 200ms 정지 뒤 재개하며, 접을 때 컴포넌트와 캐시를 해제하고 렌더 취소 완료 뒤 캔버스를 비운다. 확대 중에는 현재 래스터를 CSS로 미리 확대하고 입력 정지 200ms 후 새로 렌더한다. 작업·실행 취소 캐시는 PC 최근 8페이지, 터치 기기 최근 4페이지로 제한하고 현재 표시 페이지를 보호한다. 컬러워크는 스트로크 시작 때 모눈을 복사하지 않고 변경 칸만 수집하며, 완료 때 한 번 반영하고 실행 취소에 바뀐 칸만 저장한다. 실행 취소 기록은 최근 30개와 기기별 8/32MiB 예산으로 제한한다. 카운터 +/− 연속 입력은 350ms 지연 저장으로 묶는다. PDF 업로드 뒤 숨기지 않은 페이지의 링크·QR을 낮은 우선순위로 한 장씩 분석하고 완료 결과를 IndexedDB v7 캐시에 저장한다. 숨긴 페이지는 건너뛰며 복구하면 다시 큐에 넣는다. 보고서 화면이 열리면 링크·QR 백그라운드 분석을 중지하고, 보고서를 닫을 때 기존 캐시에서 재개한다. QR 캔버스는 1400px·2MP·공유 메모리 예산으로 제한하고 Worker는 필요할 때 한 개만 만든다. 뷰어 렌더가 대기하면 QR 래스터를 취소하고 우선권을 넘기며 탭이 숨겨지면 백그라운드 PDF·Worker를 해제하고 복귀 때 캐시 기준으로 이어간다. 메모리에는 최근 4페이지 결과만 둔다. 다른 앱으로 전환해 탭이 숨겨지면 저장·작업 취소 후 Viewer Worker와 PDF를 해제하며 복귀 시 페이지·배율·위치·회전·분할 상태를 복원한다. 기법 CROP UI·렌더링·저장 필드는 웹에서 제거했으며 기존 IndexedDB 데이터와 가져온 백업의 CROP 좌표는 버린다. 보고서 선택 후보·추가 실 메모·사용 길이·치수 단위는 보고서 레코드에 저장하고 작업 파일 v11에 포함한다. `portable/index.html`은 소스 수정 뒤 재생성한다. 빌드 통과만으로 실제 브라우저 클릭·드래그 검증이나 Android 태블릿 확인을 완료했다고 기록하지 않는다.

홈은 `Home`, `AppNavigation`, `ProjectDetail`, `ReportsPage`, `NewProject`로 구성한다. 루트(`/`)는 요약 홈이고 기존 문서 모음은 `/projects`에 둔다. 홈 조회는 경량 `homeProjects`·`homeReports`와 `ViewerSnapshot`만 사용하며 PDF 원본 Blob을 읽지 않는다. 보관·휴지통·작업 상태는 프로젝트 요약에, 작성 중/완료와 완료 시각은 보고서 레코드와 홈 보고서 요약에 저장한다. 휴지통은 원본 작업과 보고서를 보존하며 복구 때 보관 상태도 유지한다. 반응형 내비게이션은 768px 아래에서 하단 탭을, 그 이상에서 사이드바를 제공한다.

### 검증 상태

2026-10-05 확인: 기법 CROP 제거 후 타입 검사·린트·14개 테스트 파일(56개 테스트)·일반 빌드·portable 빌드가 통과했다. portable HTML은 직전 7,405.52 kB에서 7,388.32 kB로 줄었다. portable 파일 직접 실행으로 Viewer 헤더와 두 영역 보기 전환을 확인했다. 실제 50페이지 PDF 성능 전후와 Android 태블릿 조작은 별도 검증 전이며 이번 변경은 GitHub에 배포하지 않았다. 웹 기능의 Expo 앱 이관·APK 배포는 완료로 취급하지 않는다.

2026-10-08 반응형 홈 화면: 모바일 하단 탭, 태블릿·데스크톱 사이드바, 최근 작업·프로젝트·보고서 홈, 프로젝트 상세·상태·보관·휴지통, 보고서 목록과 단일 보고서 경로를 추가했다. IndexedDB v10은 기존 문서·차트·보고서에서 가벼운 요약 저장소를 만든다. `.doanbogo` v14에서 프로젝트·보고서 상태를 보존하며 v1~v13 가져오기를 유지한다. 타입 검사·린트·테스트·빌드·브라우저 결과는 다음 최신 검증 기록과 공유 트리 제한을 따른다.

2026-10-08 통합 검증: 진행선·마커와 반응형 홈을 포함해 타입 검사·린트·일반 빌드·portable 빌드가 통과했고 테스트는 27개 파일·134개 모두 통과했다. portable HTML은 7,702.86 kB다. 생성된 portable 홈 화면을 390·1024·1440px에서 확인해 반응형 내비게이션, 검색·목록, 프로젝트 상세·휴지통 복원, 보고서 화면, 가로 넘침 없음과 브라우저 오류 없음을 확인했다. 진행선 PDF 실제 조작과 Android 실기 동작은 미검증이다. 일반 빌드에는 PDF.js 대용량 청크 경고가 남아 있고 GitHub 반영 전이다.

2026-10-08 진행선 직접 조작 개선: 별도 조정 모드를 제거하고 본체 직접 드래그·선택 핸들·가로 마커 이동·포인터 종료 단일 저장을 적용했다. 사용자가 두 단 위치를 드래그해 연결 간격을 맞추며, 연결 카운터 완료는 활성 페이지 주선만 이동한다. 직접 숫자 수정은 선·마커 위치를 유지하고 기준 단만 조정한다. Blur 집중 보기를 Dim Overlay로 교체했다. 타입 검사·전체 테스트(27개 파일·139개)·일반/portable 빌드가 통과했고 portable HTML은 7,691.42 kB다. Lint는 오류 없이 끝났으며 기존 `PdfPage.tsx`의 ref 읽기·effect 경고가 있다. 로컬 브라우저에서 새 페이지 초기 상태·선 시작·마커 저장/복원·90° 회전 후 수평 유지를 확인했다. 실제 드래그와 Android 실기 검증은 미실시다.

2026-10-05 성능 개선 확인: 취소 완료를 기다리는 단일 PDF 렌더 큐, 보기 모드별 래스터 상한, 캔버스 메모리 예산, 200ms 확대 미리보기와 8페이지 작업 캐시를 반영했다. 타입 검사·린트·15개 테스트 파일(60개 테스트)·일반 빌드·portable 빌드는 통과했고 portable HTML은 7,392.91 kB다. 브라우저 UI 검증은 실행 브라우저가 `file://` 접근을 차단해 미실시했다. Android 태블릿에서 종료 증상 재현 여부와 실측 성능은 아직 확인하지 않았다.

2026-10-05 뜨개보고서 확인: PDF별 여러 보고서, 날짜·업로드 시각을 보존하는 작업 사진, 편집 가능한 Instagram 문구와 1080×1350 JPEG 합성을 추가했다. 타입 검사·일반 빌드·portable 빌드·16개 테스트 파일(61개 테스트)이 통과했고 portable HTML은 7,432.70 kB다. 자동 브라우저 초기화 오류로 인터랙션은 미검증이며 GitHub 배포는 하지 않았다.

2026-10-05 썸네일 숨김 확인: 페이지 관리 팝업을 제거하고 Footer에서 페이지 이동·Ctrl 선택·태블릿 길게 누르기/범위 드래그·숨김·인라인 복구를 제공한다. 타입 검사·린트(경고 없음)·16개 테스트 파일(61개 테스트)·일반/portable 빌드가 통과했고 portable HTML은 7,433.00 kB다. 브라우저 자동화 런타임 오류로 실제 마우스·태블릿 조작은 미검증이며 GitHub 배포는 하지 않았다.

2026-10-05 썸네일 접기 확인: Footer 우측 상단 경계에 화살표 아이콘 전용 버튼을 레일 위로 겹쳐 배치해 별도 헤더 줄과 펼친 레일 높이 증가를 제거했다. 문서별 Viewer 세션에서 펼침으로 시작하며 접으면 목록·보고서 카드·선택 안내를 숨기고 도구·페이지 이동은 유지한다. 접힌 상태는 컨트롤바와 겹치지 않는 22px 버튼 공간만 남긴다. 검증 결과와 portable HTML 크기는 Architecture.md의 최신 기록을 따른다.

2026-10-05 숨김 썸네일 압축 확인: 연속 숨김 페이지마다 썸네일 카드 없이 절반 크기의 `•••` 버튼 하나를 표시하고 클릭 시 해당 구간 전체를 복구한다. 타입 검사·린트·16개 테스트 파일(62개 테스트)·portable 빌드가 통과했고 portable HTML은 7,436.10 kB다. 브라우저 자동화 런타임 초기화 오류로 실제 상호작용은 미검증이며 GitHub 배포는 하지 않았다.

2026-10-05 컬러워크 도구 확인: 지우개 모드에서 컬러피커를 클릭하면 지우개를 끄고 색상 선택창을 연다.

2026-10-05 말줄임표 크기 조정 확인: 숨김 구간은 테두리 있는 썸네일 카드 없이, 이전 표시의 50% 크기인 말줄임표 버튼만 표시한다. 타입 검사·portable 빌드는 통과했고 린트에는 `PdfPage.tsx` Fast Refresh 경고 1건이 있다. 전체 테스트는 16개 파일 중 15개 통과, QR 스케줄러 테스트 2건이 실패했다. portable HTML은 7,437.99 kB다. 실제 화면 조작은 브라우저 자동화 초기화 오류로 미검증이며 GitHub 배포는 하지 않았다.

2026-10-05 컬러피커 동작 확인: 지우개 모드에서 컬러피커를 누르면 지우개를 끄고 색상 선택창을 연다. `npx vite build --mode portable`은 성공해 portable HTML 7,442.97 kB를 생성했다. 표준 타입 검사·portable 빌드는 Viewer의 미사용 선언과 `Map.add` 타입 오류 13건으로 실패했다. 린트에는 Fast Refresh 경고 1건, 전체 테스트에는 QR 스케줄러 실패 2건이 있으며 실제 클릭은 미검증이다.

2026-10-05 뜨개보고서 제목 편집 확인: 표지의 큰 제목 바로 오른쪽에 연필 버튼을 표시한다. 누르면 제목을 입력할 수 있고 Enter·체크 버튼은 저장, Escape·취소 버튼은 편집 취소다. 제목은 기존 프로젝트명과 보고서 목록에 반영된다. Portable Vite 빌드는 성공해 HTML 7,444.43 kB를 생성했다. 타입 검사에는 기존 `Viewer.tsx` 미사용 선언 2건이 남았고, 린트는 오류 없이 경고 3건, QR 스케줄러 테스트 2건은 실패했다(17개 파일 중 16개·67개 테스트 중 65개 통과). 실제 브라우저 조작은 미검증이다.

2026-10-05 태블릿 성능·안정성 개선: Android + coarse pointer에만 24MiB/2.5MP/분할 영역당 1.5MP, 0.5MP 컬러워크, 썸네일 32개/2MiB, 최근 4페이지 작업 캐시를 적용했다. QR 대기열은 픽셀 캡처 전 페이지 요청만 1건 대기시키고, 페이지 인식 결과를 IndexedDB v7에 저장해 재사용한다. 숨김 탭에서 저장·렌더 큐 정리 뒤 PDF·Worker를 해제하고 복귀 때 Viewer 상태를 다시 연다. 타입 검사·경고 없는 린트·17개 테스트 파일(69개 테스트)·일반 빌드·portable 빌드가 통과했으며 portable HTML은 7,446.88 kB다. GitHub Actions 배포가 성공했고 공개 홈과 현재 Viewer JS 청크는 HTTP 200이다. CUA 환경 초기화 시간 초과로 실제 UI 조작은 미검증이며 Android 실기 전후 측정은 아직 미실시다.

2026-10-05 썸네일 화살표 조정: 버튼 글자와 별도 헤더 줄을 제거하고 작은 화살표 아이콘만 레일 우측 상단 경계에 겹쳤다. 펼친 썸네일 높이는 바뀌지 않으며 접힌 상태는 버튼을 위한 얇은 22px 공간만 남긴다. 최신 타입 검사·린트·테스트·빌드 결과는 Architecture.md에 기록했다.

2026-10-05 태블릿 동시보기 썸네일 개선: coarse pointer와 2개 이상 터치를 지원하는 기기는 새 PDF를 열 때 썸네일을 접어 시작하고 PC는 펼쳐 시작한다. 접으면 썸네일 컴포넌트와 공유 캐시를 해제하고 진행 중 렌더를 종료한 뒤 캔버스를 비운다. 화면 밖 썸네일 사전 렌더를 중지하고 스크롤 200ms 뒤에 하나씩 재개하며, 터치 기기 캐시는 8개/512KiB다. 타입 검사·린트·전체 테스트 17개 파일(70개 테스트)·일반 빌드·portable 빌드가 통과했고 portable HTML은 7,447.85 kB다. GitHub Actions 37275404695가 성공했고 공개 홈·앱 스크립트·Viewer 청크가 HTTP 200이다. 실제 브라우저 조작과 Android 실기기 동시보기·메모리 측정은 미검증이다.

2026-10-05 화살표 중앙 정렬: 화살표 아이콘을 둥근 버튼 표시 영역 한가운데로 이동했다. portable HTML을 다시 생성했으며 현재 `npm run build:portable` 타입 검사 단계에 QR 스케줄러 테스트 타입 오류가 있어 Vite 빌드로 산출물을 갱신했다. 세부 결과는 Architecture.md 최신 확인 항목에 기록했다.

2026-10-05 Footer 페이지 조작 이동: PDF 위의 숨김·회전·확대/축소 버튼을 Footer로 옮기고 활성 영역 위치와 페이지 번호를 표시한다. 숨김은 마지막 표시 페이지를 보호하며 회전은 활성 영역의 현재 페이지만 적용한다. 확대율은 100~500%·25% 단위이고 터치 버튼은 44px다. 타입 검사·린트·17개 테스트 파일(70개 테스트)·일반/portable 빌드가 통과했고 portable HTML은 7,447.34 kB다. GitHub Actions [배포 37296939754](https://github.com/blg-mike/doanbogo-web/actions/runs/37296939754)가 성공했고 공개 홈·앱·Viewer·CSS가 HTTP 200이며 새 컨트롤이 포함되고 기존 오버레이는 없다. CUA 커널 자산 경로 오류로 실제 화면·태블릿 조작은 미검증이다.

2026-10-05 스마트 반복 카운터: 다섯 카운터 각각을 단순/반복 모드로 설정하고, 기본 화면은 선택한 하나만 표시한다. 반복 설정은 이름·시작 단·반복 길이·계속/지정 횟수와 줄임·늘림 간격·총 횟수를 받으며 전체 단수를 기준으로 반복 위치와 알림을 계산한다. 예정 작업 완료 체크와 알림 닫기는 별도이며, 미완료 상태로 다음 단에 이동할 때 선택 확인하고 미완료 내역은 나중에 완료 처리한다. 단순 카운터는 0~99, 반복 카운터는 1~9999단이다. 값·설정·이력은 PDF별 저장과 `.doanbogo` 백업에 포함한다.

2026-10-06 태블릿 PDF 성능 안정화: 뷰어 렌더는 활성 패널 변경만으로 재시작하지 않고, 큐 대기 포함 20초 뒤에는 로딩 오류를 표시한다. 업로드 시 숨기지 않은 PDF 페이지의 URL·QR을 저우선순위로 순차 분석하고, 뷰어 렌더가 요청되면 QR 래스터 작업을 취소해 양보한다. 숨긴 페이지를 건너뛰며 복구 시 캐시 기준으로 재개한다. QR 인식 Worker는 지연 로드하고 1400px·2MP와 캔버스+ImageData 메모리 예산을 적용한다. Viewer 종료·탭 전환은 진행 중 PDF 분석이 끝난 뒤 PDF 세션을 해제한다. 컬러워크 스트로크는 변경 칸만 수집하고 실행 취소에 delta를 저장하며, 카운터 +/− 저장은 350ms로 묶는다. 타입 검사·린트·전체 테스트(21개 파일·84개 테스트)·일반 빌드·portable 빌드가 통과했고 portable HTML은 7,480.08 kB다. GitHub main 커밋 `4cd8bcd`와 [Pages 배포 37391392414](https://github.com/blg-mike/doanbogo-web/actions/runs/37391392414)가 성공했고 사이트가 HTTP 200을 반환한다. CUA가 `file://` 방문을 보안 정책으로 거부해 실제 UI 확인은 미실시했고 Android 태블릿 실측은 미검증이다.

검증: 타입 검사·린트·19개 테스트 파일(80개 테스트)·일반 빌드·portable 빌드 통과. portable 파일은 7,475.07 kB다. 직접 실행 파일을 여는 브라우저 보안 정책이 `file://` 접근을 막아 화면 동작과 Android 태블릿 실기는 미검증이며 GitHub 배포는 하지 않았다.

---

## 초기 네이티브 설계 참고 자료

**문서 버전:** v0.2
**기준 PRD:** 도안보고 PRD v0.1
**문서 목적:** 디자인 및 프론트엔드 개발 착수용 화면·인터랙션 명세
**지원 디바이스:** Mobile / Tablet
**MVP 저장 구조:** Local-first

---

# 1. 문서 범위

본 문서는 아래 화면과 기능의 UI/UX를 정의한다.

| ID | 화면 / 기능 |
|---|---|
| WS-01 | Workspace / Cover View |
| WS-02 | Workspace / List View |
| WS-03 | PDF Import |
| VW-01 | PDF Viewer |
| VW-02 | Thumbnail Multi Selection |
| VW-03 | Hidden Page Manager |
| VW-04 | Progress Line Settings |
| VW-05 | Annotation Mode |
| VW-06 | Text Annotation |
| SYS-01 | Resume / State Restore |
| SYS-02 | Error / Loading / Empty State |

---

# 2. 구현 기본 원칙

다음 항목은 원 기획에 명시되지 않은 부분을 실제 구현을 위해 정의한 **MVP 기본안**이다.

## 2.1 Navigation

앱의 최상위 구조는 단순하게 유지한다.

```text
Workspace
   ↓
Viewer
```

MVP에서는 Bottom Navigation을 사용하지 않는다.

---

## 2.2 입력 방식

지원 입력:

- 손가락 Tap
- Long Press
- Drag
- Pinch
- Stylus
- Apple Pencil 등 OS가 제공하는 Pen Input

Tablet에서는 Stylus 입력을 우선 고려한다.

---

## 2.3 최소 터치 영역

모든 터치 가능한 아이콘의 실제 Touch Target은 최소 다음 크기를 권장한다.

```text
44 × 44 pt 이상
```

아이콘 자체가 작더라도 Touch Area는 확보한다.

---

# 3. Global Layout

## 3.1 Safe Area

다음 OS 영역을 침범하지 않는다.

- Status Bar
- Dynamic Island / Notch
- Home Indicator
- Android Navigation Bar

화면의 모든 고정 Header는 Safe Area 내부에 위치한다.

---

# 4. Design Token 기본안

MVP 개발을 위한 기본 Token이다.

디자인 단계에서 변경 가능하되 컴포넌트에서는 Token으로 관리한다.

## 4.1 Spacing

```text
4
8
12
16
20
24
32
```

기본 화면 좌우 Padding:

```text
Mobile: 16
Tablet: 24
```

---

## 4.2 Radius

```text
Small: 6
Medium: 10
Large: 16
```

---

## 4.3 Typography

### Title

```text
20 / Semibold
```

### Body

```text
16 / Regular
```

### Secondary

```text
14 / Regular
```

### Caption

```text
12 / Regular
```

---

# 5. Workspace 전체 구조

Screen ID:

```text
WS-01
```

목적:

사용자가 PDF를 업로드하고 기존 도안을 다시 실행한다.

---

# 6. Workspace Header

화면 최상단에 고정한다.

구조:

```text
┌────────────────────────────────────┐
│ [+ PDF 업로드]       정렬 ▼   ▦/☰ │
└────────────────────────────────────┘
```

## 6.1 PDF 업로드 버튼

위치:

```text
Header Left
```

Label:

```text
+ PDF 업로드
```

상태:

```text
Default
Pressed
Disabled
Loading
```

### Tap

OS File Picker를 실행한다.

지원 파일:

```text
.pdf
```

PDF 이외 파일 선택 시 Import하지 않는다.

---

# 7. PDF Import Flow

Screen / Flow ID:

```text
WS-03
```

Flow:

```text
PDF 업로드 Tap
↓
OS File Picker
↓
PDF 선택
↓
파일 검증
↓
Thumbnail 생성
↓
Document 저장
↓
Workspace 반영
```

---

# 8. PDF Import Loading

PDF 처리 시간이 필요한 경우 해당 파일 위치에 Skeleton Card 또는 Loading Card를 표시한다.

예:

```text
┌───────────────┐
│               │
│    Loading    │
│      62%      │
│               │
└───────────────┘
```

가능하면 사용자에게 다음 정보를 표시한다.

```text
파일 불러오는 중
```

퍼센트 제공이 어려운 경우 Spinner를 사용한다.

---

# 9. PDF Import 완료 순서

업로드 완료 시 새 PDF는 Workspace 목록의 가장 앞에 추가한다.

예:

사용자가 다음 순서로 업로드한다.

```text
A.pdf
B.pdf
C.pdf
```

업로드 기준 정렬 화면에서는:

```text
[PDF 업로드] [C.pdf] [B.pdf] [A.pdf]
```

가 된다.

단, Workspace 정렬 기준이 `최근 실행순` 또는 `이름순`으로 설정된 경우 현재 정렬 기준에 따라 즉시 재정렬한다.

---

# 10. Workspace 정렬

정렬 버튼을 Tap하면 Bottom Sheet 또는 Popover를 연다.

Label:

```text
정렬
```

Option:

```text
최근 실행순
이름순
업로드순
```

### MVP 기본값

```text
최근 실행순
```

선택된 값에는 Check 표시한다.

예:

```text
정렬

✓ 최근 실행순
  이름순
  업로드순
```

---

# 11. 이름순 규칙

오름차순을 기본값으로 한다.

예:

```text
A.pdf
B.pdf
Mio.pdf
Pumpkin.pdf
```

MVP에서는 별도의 내림차순 옵션을 제공하지 않는다.

---

# 12. 최근 실행순 규칙

`lastOpenedAt` 기준 Descending.

가장 최근에 Viewer를 실행한 PDF가 가장 먼저 표시된다.

---

# 13. 업로드순 규칙

`createdAt` 기준 Descending.

가장 마지막에 추가된 PDF가 가장 먼저 표시된다.

---

# 14. Workspace View Toggle

Header 우측에서 다음 두 가지 Mode를 전환한다.

```text
Cover View
List View
```

Icon:

```text
▦ Cover
☰ List
```

현재 활성 Mode를 Filled / Selected 상태로 표현한다.

View 전환 시 현재 Scroll Position을 유지할 필요는 없다.

정렬 기준은 유지한다.

---

# 15. WS-01 Cover View

Tablet:

```text
3~5 Column Adaptive Grid
```

Mobile:

```text
2 Column
```

PDF Card 구조:

```text
┌──────────────┐
│              │
│  PDF Cover   │
│              │
│              │
└──────────────┘

Mio Cardigan
2시간 전
```

---

# 16. PDF Cover Card

Component:

```text
DocumentCardCover
```

표시 데이터:

```text
coverThumbnail
originalFileName
lastOpenedAt
```

파일명이 길 경우 최대 2줄까지만 표시하고 이후 Ellipsis 처리한다.

예:

```text
Mio Cardigan
English Ver...
```

---

# 17. PDF Card Tap

Card를 Tap하면:

```text
1. lastOpenedAt 업데이트
2. ViewerState 조회
3. Viewer 실행
4. 마지막 상태 복원
```

ViewerState가 없으면 기본 상태로 실행한다.

---

# 18. WS-02 List View

구조:

```text
┌──────┬────────────────────────────┐
│Thumb │ Mio Cardigan.pdf           │
│      │ 마지막 실행: 오늘 12:34   │
│      │ 업로드: 2026.10.03         │
└──────┴────────────────────────────┘
```

Row Height:

```text
72~88
```

표시 데이터:

```text
Thumbnail
파일명
최근 실행
업로드 날짜
```

---

# 19. Workspace Empty State

PDF가 하나도 없는 경우:

```text
도안이 아직 없습니다.

PDF 뜨개 도안을 추가하면
여기에서 바로 확인할 수 있어요.

[PDF 업로드]
```

별도의 Illustration은 선택사항이다.

Primary CTA는 항상:

```text
PDF 업로드
```

---

# 20. Viewer 화면 구조

Screen ID:

```text
VW-01
```

전체 구조:

```text
┌────────────────────────────────────┐
│ Header                             │
├────────────────────────────────────┤
│ Thumbnail Strip                    │
├────────────────────────────────────┤
│                                    │
│                                    │
│            PDF Canvas              │
│                                    │
│                                    │
└────────────────────────────────────┘
```

---

# 21. Viewer Header

Tablet 권장 Height:

```text
56
```

구조:

```text
┌────────────────────────────────────┐
│ ×    Mio Cardigan.pdf   ✎ ⚙ ◉ ◎ │
└────────────────────────────────────┘
```

구성:

### Left

```text
Close
```

### Center

```text
File Name
```

### Right

```text
Edit
Settings
Hide
Show
```

---

# 22. Viewer Close

Icon:

```text
×
```

Tap 시 즉시 Workspace로 이동한다.

이동 직전에 현재 상태를 저장한다.

Save 대상:

```text
currentPage
zoomLevel
offsetX
offsetY
progressLine
hiddenPages
annotation
```

저장은 사용자에게 별도로 노출하지 않는 Auto-save 방식이다.

---

# 23. Viewer File Name

원본 업로드 파일명을 그대로 표시한다.

파일명이 Header 공간을 초과하면:

```text
Mio Cardigan Eng...
```

처럼 Ellipsis 처리한다.

중앙 정렬보다 Header 전체 균형을 깨뜨리지 않는 Layout을 우선한다.

---

# 24. Edit Button

Icon 예:

```text
✎
```

Tap:

```text
Annotation Mode 진입
```

Annotation Mode 진입 시 변경 금지:

```text
currentPage
zoomLevel
offsetX
offsetY
progressLinePosition
```

현재 사용자가 보고 있던 화면에 Tool Layer만 추가한다.

---

# 25. Settings Button

Icon:

```text
⚙
```

Tap:

```text
Progress Line Settings Bottom Sheet
```

를 표시한다.

PDF Canvas 상태는 유지한다.

---

# 26. Hide Button

초기 상태:

```text
Disabled
```

Thumbnail Multi Selection이 1개 이상 존재하면:

```text
Enabled
```

Tap 시 선택한 Page들을 Hidden 상태로 변경한다.

---

# 27. Show Button

Hidden Page가 0개이면:

```text
Disabled
```

Hidden Page가 1개 이상 존재하면:

```text
Enabled
```

Tap:

```text
Hidden Page Manager
```

를 실행한다.

---

# 28. Thumbnail Strip

Viewer Header 바로 아래에 고정한다.

Component:

```text
PageThumbnailStrip
```

Behavior:

```text
Horizontal Scroll
```

순서:

```text
PDF Page Order
```

왼쪽 → 오른쪽.

---

# 29. Thumbnail 기본 UI

각 Thumbnail:

```text
Width: Responsive
Aspect Ratio: PDF Page Ratio
```

Page Number Badge:

```text
Background: White
Text: Blue
Position: Center
```

원 기획을 유지한다.

예:

```text
┌─────────┐
│         │
│   [5]   │
│         │
└─────────┘
```

---

# 30. Current Page 상태

현재 PDF Canvas에 표시 중인 페이지 Thumbnail은 Selected State로 표시한다.

표현 방식 권장:

```text
2px Border
또는
Background Highlight
```

Multi Selection과 Current Page는 시각적으로 구분되어야 한다.

---

# 31. Thumbnail Tap

Normal Mode에서 Thumbnail Tap:

```text
해당 PDF Page로 이동
```

Transition Animation은 최소화한다.

목표는 페이지를 빠르게 전환하는 것이다.

---

# 32. Thumbnail Long Press

Screen State:

```text
Normal
↓
Long Press
↓
Multi Selection Mode
```

Threshold 기본안:

```text
약 400~500ms
```

정확한 값은 플랫폼 Gesture API 기준으로 조정 가능하다.

---

# 33. Multi Selection Mode

Screen ID:

```text
VW-02
```

진입 Trigger:

```text
Thumbnail Long Press
```

Long Press한 첫 Page를 자동 Selected 처리한다.

예:

```text
Page 1 Long Press
→
Selected = [1]
```

---

# 34. Multi Selection 상태 표시

선택된 Thumbnail에는 명확한 Selection Overlay를 표시한다.

예:

```text
✓
```

또는

```text
Blue Overlay + Check
```

단순 Border만으로 Multi Select를 표시하지 않는다.

---

# 35. Multi Selection 추가

Multi Selection Mode에서 다른 Thumbnail Tap:

```text
Unselected → Selected
Selected → Unselected
```

Toggle 방식으로 동작한다.

---

# 36. Long Press + Drag Selection

예:

사용자가 Page 10을 Long Press한다.

그 상태에서 좌측으로 이동한다.

```text
10
9
8
7
6
```

각 Thumbnail Hit Area를 통과할 때 Page를 Selection에 추가한다.

최종:

```text
Selected = [6,7,8,9,10]
```

---

# 37. Drag Selection 규칙

Drag 중 이미 선택된 Thumbnail을 다시 지나가더라도 자동으로 Deselect 하지 않는다.

한 번 지나간 Page는 해당 Gesture가 끝날 때까지 Selected를 유지한다.

이 방식이 사용자의 범위 선택 실수를 줄인다.

---

# 38. Multi Selection 종료

다음 조건 중 하나에서 종료한다.

```text
Hide 실행 완료
Viewer Back
Selection Cancel
Selected Count = 0
```

MVP에서는 Header 또는 Selection UI에 `취소` 액션을 제공하는 것을 권장한다.

예:

```text
취소       4개 선택       숨김
```

---

# 39. Hide Page

Selected Pages:

```text
3
4
```

Hide 실행 후:

```text
1
2
5
```

만 Thumbnail Strip에 표시한다.

중요:

PDF 원본 Page Index는 변경하지 않는다.

내부적으로:

```text
hidden = true
```

만 적용한다.

---

# 40. 현재 Page를 숨긴 경우

예:

현재 Canvas:

```text
Page 3
```

사용자가 Page 3을 숨긴다.

다음 행동:

1순위:

```text
다음 Visible Page
```

예:

```text
Page 5
```

다음 Visible Page가 없으면:

```text
이전 Visible Page
```

로 이동한다.

---

# 41. 모든 Page 숨김 방지

마지막 1개 Visible Page는 숨길 수 없도록 한다.

예:

현재 Visible Page:

```text
Page 5
```

하나뿐이면 Hide Button을 Disabled 처리한다.

목적:

Viewer Canvas가 Page 없는 상태에 빠지는 것을 방지한다.

---

# 42. Hidden Page Manager

Screen ID:

```text
VW-03
```

UI 형식:

```text
Bottom Sheet
```

예:

```text
숨긴 페이지

☐ 3페이지
☐ 4페이지
☐ 8페이지

[선택한 페이지 표시]
```

각 Row에는 작은 Thumbnail을 같이 표시하는 것을 권장한다.

---

# 43. Hidden Page Restore

Page 3, 4 선택 후:

```text
선택한 페이지 표시
```

Tap.

결과:

```text
Page 3.hidden = false
Page 4.hidden = false
```

Thumbnail Strip 원래 PDF 순서 위치에 다시 삽입한다.

---

# 44. PDF Canvas

Component:

```text
PDFCanvas
```

지원 Gesture:

```text
Pinch Zoom
Pan
Page Render
Progress Line Drag
Annotation Input
```

---

# 45. PDF Zoom

기본:

```text
Fit Width
```

또는 화면에 Page 전체가 자연스럽게 보이는 초기 Scale을 사용한다.

사용자 Pinch에 따라 Zoom한다.

권장 범위:

```text
Min: Fit Scale
Max: 5x 전후
```

실제 값은 PDF Rendering 성능에 따라 조정한다.

---

# 46. PDF Pan

Zoom 상태에서 한 손가락 Drag:

```text
Canvas Pan
```

단, Gesture가 Progress Line Handle 또는 Annotation Tool에서 시작되었다면 해당 기능이 우선한다.

---

# 47. PDF 페이지 이동

MVP에서는 Thumbnail Tap을 기본 페이지 이동 수단으로 정의한다.

PDF Canvas 자체의 Vertical/Horizontal Page Swipe 지원 여부는 구현 방식에 따라 추가할 수 있지만 필수 요구사항으로 두지 않는다.

---

# 48. Progress Tracker 구조

PDF Canvas 위에 별도의 Overlay Layer를 둔다.

Layer:

```text
PDF Layer
↓
Annotation Layer
↓
Progress Line Layer
↓
Interaction UI
```

---

# 49. Horizontal Progress Line

Component:

```text
HorizontalTracker
```

Default:

```text
Color: Yellow
Thickness: 4px
Opacity: Semi-transparent
Visible: true
```

역할:

```text
현재 Row 위치 표시
```

---

# 50. Horizontal Line Interaction

Line 또는 Hit Area Drag:

```text
Up / Down
```

만 허용한다.

X축 이동은 하지 않는다.

Touch Hit Area는 실제 4px보다 크게 잡는다.

예:

```text
Visual: 4px
Touch Area: 24px+
```

---

# 51. Vertical Progress Line

Component:

```text
VerticalTracker
```

Default:

```text
Color: Blue
Thickness: 1px
Opacity: 100%
Visible: true
```

역할:

```text
현재 Stitch 위치 표시
```

---

# 52. Vertical Line Interaction

Drag Direction:

```text
Left / Right
```

Y축 이동은 하지 않는다.

Touch Hit Area 역시 실제 Line보다 크게 설정한다.

---

# 53. Line 좌표 저장

Line 위치는 Screen Pixel로 저장하지 않는다.

PDF Page Coordinate 또는 Normalize된 값으로 저장한다.

예:

```text
horizontalPosition = 0.438
verticalPosition = 0.672
```

범위:

```text
0.0 ~ 1.0
```

의 Normalize Position 방식도 가능하다.

---

# 54. Zoom 이후 Progress Line

사용자가 Zoom을 변경해도 Line은 동일한 PDF 콘텐츠 위치에 남아야 한다.

잘못된 예:

```text
화면 300px 위치 고정
```

정상:

```text
PDF Coordinate 기준 재계산
```

---

# 55. Page별 Progress Line

MVP 권장 구조:

```text
Page별 독립 Progress Position
```

즉:

```text
Page 3 horizontalPosition
Page 4 horizontalPosition
```

을 각각 저장한다.

이렇게 해야 여러 차트 페이지를 오갈 때 이전 위치를 유지할 수 있다.

---

# 56. Progress Line Settings

Screen ID:

```text
VW-04
```

Settings Button Tap 시 Bottom Sheet로 표시한다.

구조:

```text
진행선 설정

가로선
[ON]
색상
두께
투명도

세로선
[ON]
색상
두께
투명도
```

---

# 57. Line Visibility Toggle

각 Line별:

```text
ON / OFF
```

OFF 시 Canvas에서 숨긴다.

Position 데이터는 삭제하지 않는다.

다시 ON하면 마지막 Position에서 복원한다.

---

# 58. Line Color

Preset Color를 먼저 제공한다.

예:

```text
Yellow
Blue
Red
Green
Black
White
```

MVP 이후 Custom Color Picker 추가 가능.

---

# 59. Line Thickness

Slider 사용.

예:

```text
1px ───────── 12px
```

현재 값을 실시간 Preview 한다.

---

# 60. Line Opacity

Slider:

```text
10% ───────── 100%
```

Horizontal 기본값은 반투명.

Vertical 기본값은 불투명.

---

# 61. Settings 실시간 반영

Settings 변경 시 별도 Save Button 없이 즉시 Canvas에 반영한다.

Bottom Sheet를 닫아도 값이 유지된다.

---

# 62. Annotation Mode

Screen ID:

```text
VW-05
```

진입:

```text
Viewer Header > Edit
```

진입 시 Viewer 상태를 그대로 유지한다.

---

# 63. Annotation Toolbar

Viewer Header 아래 또는 화면 하단 Floating Toolbar 형태.

Tablet 권장:

```text
Floating Toolbar
```

Mobile 권장:

```text
Bottom Toolbar
```

기능:

```text
Pen
Highlight
Eraser
Text
Undo
Redo
Done
```

원 기획의 필수 도구:

```text
Pen
Highlight
Eraser
Text
```

---

# 64. Pen Tool

Tap:

```text
Pen 활성화
```

설정:

```text
Color
Thickness
```

Canvas Drag 시 Freehand Stroke 생성.

---

# 65. Highlighter

설정:

```text
Color
Thickness
Opacity
```

기본적으로 Pen보다 낮은 Opacity를 사용한다.

PDF 콘텐츠가 읽히는 상태를 유지한다.

---

# 66. Eraser

Annotation Layer의 객체 또는 Stroke만 삭제한다.

다음 대상은 삭제할 수 없다.

```text
PDF Original
Progress Line
```

---

# 67. Text Tool

Screen ID:

```text
VW-06
```

Text 선택 후 PDF Canvas 특정 위치 Tap:

```text
Text Box 생성
Keyboard Open
```

사용자가 내용을 입력한다.

예:

```text
3번 반복
```

완료 후 Text Box를 Canvas에 배치한다.

---

# 68. Text Annotation 편집

기존 Text Tap:

```text
Selected
```

이후:

```text
Move
Edit
Delete
```

기능을 제공한다.

MVP에서 Resize 기능은 제외 가능하다.

---

# 69. Annotation 좌표

Annotation 역시 PDF Coordinate 기준으로 저장한다.

예:

```text
pageNumber
x
y
pathData
```

Zoom을 변경하더라도 Annotation 위치가 PDF 콘텐츠와 함께 움직여야 한다.

---

# 70. Annotation Mode Gesture Conflict

Annotation Mode에서:

### Pen / Highlight 선택

```text
Single Finger / Stylus Drag → Drawing
```

### Canvas 이동

두 손가락 Pan을 허용하거나 별도의 Hand Tool 제공을 고려한다.

Tablet에서 Stylus를 사용할 경우:

```text
Stylus → Draw
Finger → Pan
```

방식이 가장 자연스럽다.

MVP에서는 플랫폼 지원 여부에 따라 구현한다.

---

# 71. Annotation 종료

Done Tap:

```text
Annotation Mode 종료
```

Annotation은 즉시 저장한다.

Viewer:

```text
currentPage
zoom
offset
```

는 변경되지 않는다.

---

# 72. Undo / Redo

MVP 권장 기능.

현재 Annotation Session의 Action Stack을 대상으로 한다.

예:

```text
Stroke
Text Add
Erase
```

PDF 자체 상태에는 영향을 주지 않는다.

---

# 73. Auto Save

다음 시점마다 상태를 저장한다.

```text
Viewer Close
Page Change
Progress Line Drag End
Annotation Edit End
Page Hide / Restore
App Background
```

매 Frame 저장하지 않는다.

Drag 중에는 Memory 상태를 사용하고 Gesture End에서 Persistence 한다.

---

# 74. Viewer Resume

Screen / System ID:

```text
SYS-01
```

Workspace에서 PDF Card Tap.

저장된 ViewerState가 있다면:

```text
1. lastPage 로드
2. 해당 Page 렌더
3. zoom 복원
4. offset 복원
5. Progress Line 복원
6. Annotation 로드
7. Thumbnail 위치 보정
```

---

# 75. Resume 우선순위

Viewer 진입 UX를 빠르게 하기 위해 다음 순서를 권장한다.

```text
PDF Page 먼저 표시
↓
Progress Line
↓
Annotation
↓
고해상도 Rendering
```

사용자는 최대한 빨리 작업 위치를 확인할 수 있어야 한다.

---

# 76. Thumbnail Auto Scroll

Viewer Resume 시 현재 Page Thumbnail이 화면 밖에 있는 경우 Thumbnail Strip을 자동 Scroll하여 Current Page를 보이게 한다.

예:

```text
현재 Page = 37
```

이면 Page 37 Thumbnail이 Strip 안에서 보이는 위치까지 자동 이동한다.

---

# 77. Loading State

PDF Viewer 초기 로딩:

```text
도안을 불러오는 중
```

Spinner 또는 Skeleton.

Progress Line이나 Annotation이 PDF보다 먼저 노출되지 않도록 한다.

---

# 78. PDF Render Error

PDF 렌더링 실패:

```text
PDF를 열 수 없습니다.

파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.

[워크스페이스로 돌아가기]
```

사용자의 원본 파일은 삭제하지 않는다.

---

# 79. Upload Error

Import 실패:

```text
PDF를 추가하지 못했습니다.

[다시 시도]
```

기존 Workspace 데이터에는 영향을 주지 않는다.

---

# 80. Corrupted State 처리

ViewerState가 손상되어 복원할 수 없는 경우 PDF 자체는 기본 상태로 연다.

Fallback:

```text
Page 1
Default Zoom
Default Progress Lines
```

Annotation/State 오류로 PDF 자체를 열 수 없게 만들면 안 된다.

---

# 81. 앱 Background 처리

앱이 Background로 이동하면:

```text
ViewerState Save
Progress State Save
Annotation Pending Save
```

를 실행한다.

---

# 82. Orientation

Tablet 사용성을 고려하여 Portrait와 Landscape 모두 지원하는 것을 권장한다.

회전 시:

```text
PDF Coordinate
Progress Position
Annotation Coordinate
```

는 유지한다. 진행선은 회전 후에도 화면 기준 가로·세로 방향을 유지한다.

Viewport만 재계산한다.

---

# 83. Tablet Layout

Tablet에서는 PDF Viewer가 제품 핵심이므로 Canvas 면적을 최대화한다.

Header 및 Thumbnail Strip은 고정 높이.

나머지는 전부 PDF Canvas에 할당한다.

---

# 84. Mobile Layout

화면이 좁은 경우 Header Action이 많아질 수 있으므로 다음 구조를 허용한다.

```text
× File Name          ✎ ⚙ ⋯
```

`⋯` 안에:

```text
페이지 숨김
숨긴 페이지 표시
```

를 넣을 수 있다.

Tablet에서는 원 기획대로 4개 버튼을 모두 노출하는 것을 우선한다.

---

# 85. Accessibility

모든 Icon Button에는 Accessible Label을 제공한다.

예:

```text
편집
진행선 설정
선택한 페이지 숨기기
숨긴 페이지 표시
뷰어 닫기
```

색상만으로 Selected State를 표현하지 않는다.

Check, Border, Shape 등 추가 표시를 사용한다.

---

# 86. Haptic Feedback

권장 적용:

```text
Thumbnail Long Press 성공
Drag Multi Selection에서 새 Page 진입
Progress Line Drag 시작
```

짧은 Haptic Feedback을 사용할 수 있다.

필수 요구사항은 아니다.

---

# 87. 화면 상태 정의

Workspace:

```text
EMPTY
LOADING
READY
IMPORTING
ERROR
```

Viewer:

```text
LOADING
NORMAL
MULTI_SELECT
ANNOTATION
SETTINGS_OPEN
HIDDEN_PAGE_MANAGER
ERROR
```

동시에 충돌하는 Mode는 제한한다.

---

# 88. Mode 충돌 규칙

`MULTI_SELECT` 상태에서는 Annotation Mode를 실행하지 않는다.

`ANNOTATION` 상태에서는 Thumbnail Multi Select를 비활성화한다.

`SETTINGS_OPEN` 중에도 PDF는 보이지만 Canvas Interaction을 제한할 수 있다.

즉 주요 작업 Mode는 하나만 활성화한다.

---

# 89. Back 동작

Android System Back 또는 iOS Navigation Back 성격의 동작:

### Bottom Sheet Open

```text
Bottom Sheet Close
```

### Annotation Mode

```text
Annotation Mode Exit
```

### Multi Select

```text
Selection Cancel
```

### Viewer Normal

```text
Workspace
```

순서로 처리한다.

---

# 90. 파일 중복 업로드

동일 이름의 PDF가 이미 있어도 새 파일로 추가한다.

예:

```text
pattern.pdf
pattern.pdf
```

내부 ID는 서로 다르게 생성한다.

MVP에서는 자동 중복 제거하지 않는다.

---

# 91. 파일명 변경

원 기획에 정의되어 있지 않으므로 MVP 제외.

항상 원본 파일명을 표시한다.

---

# 92. PDF 삭제

원 기획에 정의되어 있지 않으므로 MVP 필수 기능에서 제외한다.

추후 Workspace Context Menu로 추가 가능.

---

# 93. Component 구조 권장안

```text
WorkspaceScreen

WorkspaceHeader
 ├─ PdfUploadButton
 ├─ SortButton
 └─ ViewToggle

DocumentGrid
DocumentList
DocumentCard
```

Viewer:

```text
ViewerScreen

ViewerHeader
 ├─ CloseButton
 ├─ FileName
 ├─ EditButton
 ├─ SettingsButton
 ├─ HideButton
 └─ ShowButton

PageThumbnailStrip
 └─ PageThumbnail

PDFViewport
 ├─ PDFCanvas
 ├─ AnnotationLayer
 ├─ HorizontalTracker
 └─ VerticalTracker
```

---

# 94. State Model 권장안

```text
WorkspaceState
sortType
viewType
documents
importStatus
```

Viewer:

```text
ViewerState
documentId
currentPage
zoom
offsetX
offsetY
selectedPages
hiddenPages
mode
```

Tracker:

```text
TrackerState
horizontal
vertical
```

Annotation:

```text
AnnotationState
activeTool
toolOptions
annotations
undoStack
redoStack
```

---

# 95. 핵심 Interaction 우선순위

PDF Canvas에서 Gesture 충돌 시 Priority:

```text
1. Annotation Stroke
2. Progress Line Drag
3. PDF Pinch Zoom
4. PDF Pan
```

Annotation Mode가 아닌 경우:

```text
1. Progress Line Drag
2. Pinch Zoom
3. Pan
```

---

# 96. 성능 요구사항

PDF 전체를 동시에 Full Resolution으로 렌더링하지 않는다.

우선 렌더:

```text
Current Page
Previous Page
Next Page
```

Thumbnail은 별도의 Low Resolution Cache 사용.

---

# 97. Workspace Acceptance Criteria

### WS-AC-01

PDF Upload 버튼은 Workspace 좌측 상단에서 항상 접근 가능해야 한다.

### WS-AC-02

PDF Import 성공 시 Workspace에 새로운 Document가 생성되어야 한다.

### WS-AC-03

A → B → C 순으로 업로드했을 때 업로드순 기준 C → B → A로 보여야 한다.

### WS-AC-04

사용자는 Cover View와 List View를 전환할 수 있어야 한다.

### WS-AC-05

사용자는 최근 실행순 / 이름순 / 업로드순 정렬을 사용할 수 있어야 한다.

---

# 98. Viewer Acceptance Criteria

### VW-AC-01

PDF를 Pinch하여 확대/축소할 수 있어야 한다.

### VW-AC-02

확대된 PDF를 Pan할 수 있어야 한다.

### VW-AC-03

Thumbnail Tap 시 해당 Page로 이동해야 한다.

### VW-AC-04

Viewer 종료 후 다시 열었을 때 마지막 Page가 복원되어야 한다.

### VW-AC-05

마지막 Zoom 및 View Position이 복원되어야 한다.

---

# 99. Multi Select Acceptance Criteria

### MS-AC-01

Thumbnail Long Press 시 Multi Selection Mode에 진입해야 한다.

### MS-AC-02

Long Press한 Thumbnail은 자동 선택되어야 한다.

### MS-AC-03

Multi Selection Mode에서 다른 Thumbnail Tap 시 추가 선택되어야 한다.

### MS-AC-04

Long Press + Drag로 지나간 Thumbnail은 모두 선택되어야 한다.

### MS-AC-05

선택한 Page를 Hide하면 Thumbnail Strip에서 제거되어야 한다.

### MS-AC-06

Hidden Page는 원본 PDF에서 삭제되어서는 안 된다.

---

# 100. Hidden Page Acceptance Criteria

### HP-AC-01

Hidden Page가 있을 경우 Show 기능을 사용할 수 있어야 한다.

### HP-AC-02

사용자는 숨긴 Page를 선택하여 다시 표시할 수 있어야 한다.

### HP-AC-03

복구된 Page는 PDF 원래 순서 위치에 돌아가야 한다.

---

# 101. Tracker Acceptance Criteria

### TR-AC-01

Horizontal Tracker는 위/아래로 이동할 수 있어야 한다.

### TR-AC-02

Vertical Tracker는 좌/우로 이동할 수 있어야 한다.

### TR-AC-03

Zoom 후에도 Tracker가 같은 PDF Content 위치를 유지해야 한다.

### TR-AC-04

사용자는 Color / Thickness / Opacity를 변경할 수 있어야 한다.

### TR-AC-05

앱 재실행 후 Tracker 위치가 복원되어야 한다.

---

# 102. Annotation Acceptance Criteria

### AN-AC-01

Edit 버튼을 눌러도 현재 Zoom이 변경되어서는 안 된다.

### AN-AC-02

현재 X/Y View Position이 변경되어서는 안 된다.

### AN-AC-03

Pen으로 자유 Drawing이 가능해야 한다.

### AN-AC-04

Highlighter를 사용할 수 있어야 한다.

### AN-AC-05

Eraser는 Annotation만 삭제해야 한다.

### AN-AC-06

Text Annotation을 PDF 위에 배치할 수 있어야 한다.

### AN-AC-07

Annotation은 PDF 원본 파일을 직접 변경하지 않아야 한다.

---

# 103. Analytics Event 권장안

제품 초기 검증을 위해 다음 이벤트를 기록한다.

```text
pdf_upload_started
pdf_upload_completed
pdf_opened

workspace_sort_changed
workspace_view_changed

thumbnail_selected
multi_select_started
page_hidden
page_restored

horizontal_tracker_moved
vertical_tracker_moved
tracker_setting_changed

annotation_started
annotation_pen_used
annotation_highlight_used
annotation_text_added

viewer_resumed
```

---

# 104. MVP 화면 Flow

```text
App Launch
    │
    ▼
Workspace
    │
    ├──── PDF Upload ──── OS File Picker
    │                         │
    │                         ▼
    │                    PDF Imported
    │                         │
    └─────────────────────────┘
    │
    ▼
PDF Card Tap
    │
    ▼
Viewer
    │
    ├── Thumbnail Tap
    │
    ├── Long Press
    │      │
    │      ▼
    │   Multi Select
    │      │
    │      ▼
    │     Hide
    │
    ├── Settings
    │      │
    │      ▼
    │   Progress Settings
    │
    ├── Edit
    │      │
    │      ▼
    │   Annotation Mode
    │
    └── Close
           │
           ▼
       Auto Save
           │
           ▼
       Workspace
```

---

# 105. 개발 우선순위

## P0 — 반드시 필요한 기능

```text
Workspace
PDF Import
PDF Render
Thumbnail
Zoom / Pan
Horizontal Tracker
Vertical Tracker
Viewer State Persistence
```

이 단계에서 핵심 가설을 검증할 수 있다.

## P1

```text
Multi Selection
Hide
Show
Progress Settings
```

## P2

```text
Pen
Highlighter
Eraser
Text
Undo / Redo
```

---

# 106. MVP Done Definition

다음 시나리오가 End-to-End로 정상 동작하면 MVP 핵심 플로우가 완성된 것으로 본다.

사용자가:

```text
PDF를 업로드한다.
↓
도안을 연다.
↓
필요 없는 페이지를 숨긴다.
↓
차트를 확대한다.
↓
가로 진행선을 현재 뜨는 단에 놓는다.
↓
세로 진행선을 현재 뜨는 코에 놓는다.
↓
PDF 위에 메모한다.
↓
앱을 종료한다.
↓
나중에 동일 PDF를 다시 연다.
```

이때:

```text
같은 페이지
같은 확대 상태
같은 위치
같은 진행선
같은 Annotation
```

이 복원되어야 한다.

---

# 107. 핵심 UX 판단 기준

기능 구현 과정에서 여러 선택지가 충돌할 경우 다음 우선순위를 적용한다.

```text
1. 현재 뜨고 있는 위치를 잃지 않는다.
2. PDF 콘텐츠를 최대한 크게 보여준다.
3. 손가락 조작 횟수를 줄인다.
4. PDF 원본을 훼손하지 않는다.
5. 복잡한 기능보다 즉시 이해되는 동작을 선택한다.
```

도안보고의 Viewer는 일반적인 문서 뷰어가 아니라 **뜨개 작업을 계속 이어가기 위한 작업 공간**으로 설계한다.

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
- 2026-10-06 카운터·진행선 개선: 종류별 5개 카운터, 선택 그룹 단수 완료, 작업 안내·중간 시작·되돌리기, 카운터 연결 진행선과 원본 좌표 집중 보기를 추가했다. PC는 도안 옆 패널, 모바일은 접을 수 있는 하단 패널이다. IndexedDB v7→v8 및 `.doanbogo` v9→v10 이전을 포함한다. `npm run typecheck`, `npm run lint`, 전체 테스트(22개 파일·98개 테스트), 일반 빌드·portable 빌드 통과. portable HTML 7,535.65 kB. 실제 PDF 화면 조작 및 Android YouTube 동시보기 실기는 미검증이다.
- 배포 확인: 커밋 `e2e5c0a`, [GitHub Pages 배포 37413903267](https://github.com/blg-mike/doanbogo-web/actions/runs/37413903267) 성공. 공개 홈·앱·Viewer 청크 HTTP 200, 새 카운터·집중 보기 리소스 문자열 확인.
- 2026-10-06 집중 보기 회전 수정: 90°·270° 회전에서도 페이지 좌표를 화면 좌표로 변환해 집중 보기를 유지하고, 연결 진행선의 현재 단 이동과 소수 줄 간격 입력을 지원한다. 타입 검사·린트·전체 테스트(24개 파일·111개 테스트)·일반/portable 빌드 통과. portable HTML 7,571.57 kB. 실제 PDF에서 회전·카운터·줄간격을 조작하는 검증은 구현 완료 후 사용자가 직접 진행할 예정이다.
- 2026-10-06 뜨개보고서 화면·IG 문구 개편: 공유 추천 카드를 먼저 보여 주고 개인 기록은 접어 두며, 항목별 상세 입력·사진·치수 단위·실 메모를 지원한다. 페이지 텍스트·보고서 메모와 완료 카운터에서 명시적인 수정사항 후보를 로컬 분석해 사용자가 확인한 항목만 반영한다. IG 문구 선택·편집·복사를 추가하고 `.doanbogo` v11에 보고서 필드를 보존한다. 타입 검사·린트·전체 테스트(24개 파일·111개 테스트)·일반 빌드·portable 빌드가 통과했고 portable HTML은 7,571.57 kB다. portable HTML을 로컬 HTTP로 열어 보고서 화면과 IG 항목 선택·문구 미리보기를 확인했다. `file://` 직접 실행, Android 태블릿 조작, GitHub 배포는 미검증·미실시다.
- 배포 확인: 커밋 `4a2de9d`, [GitHub Actions 37423294878](https://github.com/blg-mike/doanbogo-web/actions/runs/37423294878) 성공. 공개 홈·앱 스크립트·Viewer 청크 HTTP 200, Viewer 번들에서 회전 좌표 처리를 확인했다. 실제 PDF 조작은 사용자가 직접 검증할 예정이다.
- GitHub 반영: 뜨개보고서 업데이트와 집중 보기 회전을 함께 포함한 커밋 `b836acd`, [배포 작업 37423708961](https://github.com/blg-mike/doanbogo-web/actions/runs/37423708961) 성공. 공개 홈·앱 스크립트·Viewer 청크 HTTP 200이며 공개 Viewer 번들에서 Instagram 문구·수정사항 후보와 회전 좌표 코드를 확인했다. Android 실기 및 실제 PDF 조작은 사용자가 직접 검증한다.

- 2026-10-06 텍스트 입력·회전 개선: 텍스트 객체·미리보기·서식 도구막대를 페이지 회전의 역방향으로 보정해 화면에서 읽는 방향을 유지한다. IME 조합 입력은 객체별 로컬 초안을 즉시 갱신해 페이지 작업의 지연 렌더가 조합 중간값을 되돌리지 않게 한다. 회전 각도별 단위 테스트와 로컬 브라우저의 90° 화면 확인, 소스·portable에서 한글 조합 중간값을 검사하는 브라우저 시뮬레이션을 통과했다. `npm run typecheck`, `npm run lint`, 전체 테스트(24개 파일·115개 테스트), 일반 빌드·portable 빌드가 통과했고 portable HTML은 7,572.08 kB다. 실제 한글 키보드 입력과 PC·태블릿 회전 조작은 사용자가 직접 확인할 예정이다. 커밋·GitHub 배포는 하지 않았다.
- 2026-10-07 태블릿 필기 유실·Footer 줄바꿈 개선: 펜·직선·형광펜은 입력 좌표·도구·스타일·문서·페이지를 ref에 즉시 누적하고, 렌더 프레임보다 먼저 손을 떼도 마지막 좌표까지 한 번만 저장한다. 완성 획은 페이지 작업 상태에 반영될 때까지 임시 SVG로 유지한다. `pointercancel`과 포인터 캡처 해제는 취소 좌표를 더하지 않고 이미 입력된 획을 보존하며, 캡처 실패 시 window 종료 리스너로 이어간다. 등록 실패는 임시 획을 유지하고 재시도 안내를 표시한다. Footer 도구명·설정은 줄바꿈을 금지하고 그룹 축소 대신 내부 가로 스크롤을 사용하며 coarse pointer의 도구 버튼 높이는 44px 이상이다. Chromium 소스·portable 화면에서 빠른 연속 입력, 중복 종료, 취소, undo/redo, 새로고침 복원, 폭 600·800·1000·1280px을 확인했다. 포인터 캡처를 사용하는 실제 마우스 입력도 소스·portable에서 확인했고, 획 중 페이지 이동 후 늦은 이벤트가 새 페이지로 가지 않는 것을 검증했다. 개발 서버에서는 SVG 밖 포인터 종료와 coarse pointer 44px 높이를 별도로 확인했다. `npm run typecheck`, `npm run lint`, 전체 테스트(25개 파일·121개 테스트), 일반 빌드·portable 빌드가 통과했고 portable HTML은 7,577.59 kB다. 아이뮤즈와 정상 태블릿의 실제 펜 입력, GitHub HTTPS 실기 QA는 사용자가 직접 확인할 예정이며 모델별 원인은 미확정이다. 커밋·GitHub 배포는 하지 않았다.

- 2026-10-07 카운터 팝오버 개편: 메인 단·RS/WS·목표·다음 작업과 알림을 빠른 화면에 배치하고, 설정에서 메인 카운터·목표 면·무늬/작업 규칙·소리·진동·미리 알림을 관리한다. 메인 `+1`은 현재 단 완료 후 다음 단으로 이동하며 목표 단 완료 후에는 완료 상태를 유지한다. 되돌리기는 정확한 저장 이력만 허용하고 선택한 그룹의 카운터·연결 진행선만 복원한다. 저장 스키마는 기존 Viewer/PageWork 트랜잭션을 유지하고 작업 파일은 v12로 올려 v1~v11 가져오기를 보존한다. 타입 검사·린트·전체 테스트(25개 파일·124개 테스트)·일반 빌드·portable 빌드가 통과했고 portable HTML은 7,601.88 kB다. 일반 빌드에는 PDF.js 대용량 청크 경고가 있다. portable 홈은 로컬 HTTP에서 열었으나 브라우저 파일 선택창 제한으로 실제 PDF의 카운터 조작은 미검증이다. GitHub 커밋·배포는 하지 않았다.

### 보고서의 기기별 UX

- 모바일은 한 열의 요약 화면과 하단 편집 시트를 사용한다. 작업·완성 사진은 탭해 크게 보고 사진 순서는 앞/뒤 버튼으로 바꾼다.
- 태블릿은 요약·개인 기록을 두 열로 배치하고 오른쪽 편집 패널을 연다. PC는 왼쪽 보고서 목록, 중앙 본문, 오른쪽 Inspector를 함께 보여 준다.
- 모든 크기에서 같은 IndexedDB 보고서 레코드와 저장 경로를 사용한다. 한 줄 필드는 포커스 해제 또는 Enter, 여러 줄 필드는 포커스 해제 또는 Ctrl/Cmd+Enter에서 초안을 반영한다. 사진 재정렬은 기존 workPhotos 배열 순서를 저장하며, 삭제 직후 4초 동안 실행 취소를 허용한다.

2026-10-08 보고서 반응형 UX 초기 검증 기록: 모바일 하단 편집 시트, 태블릿 우측 편집 패널, PC 보고서 목록·본문·Inspector 3영역과 사진 확대·순서 변경·삭제 취소를 확인했다. 당시 테스트는 27개 파일·133개였으며 타입 검사와 lint에는 Viewer 미사용 선언 3건이 남아 있었다. 이후 홈 통합 검증에서 관련 체크를 다시 실행했으며 최신 결과는 위 검증 기록을 따른다. Android 실기와 GitHub 반영은 별도 미실시다.
