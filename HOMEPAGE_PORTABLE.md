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

## 2026-10-13 홈페이지 UI·UX 개선

홍보 홈페이지만 개선했다. 실행 앱의 프로젝트 홈·뷰어·보고서 소스는 변경하지 않았다. 기존 올리브·웜화이트·차콜 토큰과 생성 PNG 아이콘을 유지하고 라이브러리는 추가하지 않았다.

| Before | After | Why |
| --- | --- | --- |
| 첫 화면 최소 높이 644px·705px, 기기 받침·카메라·정적 화면 번호 | 콘텐츠에 맞는 높이, 단순한 제품 이미지 프레임 | 실제 작업 화면에 시선 집중 |
| 모바일 제목 최대 57px, 본문 12~14px | 모바일 제목 36px, 데스크톱 최대 56px, 본문 16px 이상 | 읽기와 자연스러운 다국어 줄바꿈 |
| 기능 요약·문제 상황·기능 설명 반복 | 기능 → 사용 방법 → 기록·로컬 저장 → FAQ → CTA | 중복 설명과 페이지 길이 감소 |
| 모든 입력 기기에 적용되는 hover | 마우스 조건으로 제한한 hover, 눌림·포커스 상태 | 터치의 잔류 hover 방지 |
| 메뉴 즉시 표시·숨김 | 포인터 180ms 전환, 키보드·동작 감소 설정에서는 즉시 전환 | 조작 방식에 맞는 상태 변화 |

`emil-design-eng`, `mobile-native`, `animate`의 기준을 적용하고 `break-ui`, `review-animations`, `animation-performance`로 데이터·접근성·움직임을 검토했다. 이미지에 카운터 패널이 없고 확대 컷의 선명도를 보장할 수 없어 승인된 대안인 큰 전체 화면을 사용했다. 이미지 내용은 변경하지 않았다.

### 보존한 기능

- 한국어·영어·일본어·독일어·덴마크어·노르웨이어 보크몰·핀란드어, 기기 언어 감지, 선택 저장·복원, 상단·하단 선택기 동기화.
- 기존 모든 CTA와 앵커 경로, 네이티브 FAQ 4개, SEO 메타데이터와 구조화 데이터, 홈페이지 Screen Wake Lock 동작.
- 숨김 메뉴의 `hidden`·`inert`·`aria-hidden`, Escape 포커스 복귀. 닫힘 타이머는 재열기 때 취소한다. 메뉴를 연 채 언어를 바꿔도 닫기 레이블을 번역한다.
- 단일 HTML 생성과 앱 빌드 뒤 홈페이지 재생성. 공개 API·저장 키·백업 형식 변경 없음.

### 움직임 검토

| Before | After | Why |
| --- | --- | --- |
| 버튼 색·배경 전환, 눌림 움직임 없음 | transform만 전환: 눌림 140ms, 복귀 100ms | 짧고 비대칭인 피드백, 페인트 속성 애니메이션 제거 |
| 메뉴 전환 없음 | transform·opacity만 180ms, `cubic-bezier(0.23, 1, 0.32, 1)` | 상태 변화를 보여 주며 재조작 중에도 전환 가능 |
| 모바일 hover, 키보드 전환 정책 없음 | hover 조건화, 키보드 메뉴 전환·reduced-motion 움직임 제거 | 접근성과 입력 방식 반영 |

코드 기준 판정: **Approve**. 높이·여백·blur 애니메이션, 반복 스크롤 효과, 상시 움직임, `transition: all`, `will-change`를 추가하지 않았다. 실제 기기 프레임 성능은 측정하지 않았다.

### 검증 결과와 남은 확인

- `npm run typecheck`, `npm run check:design-system`, `npm test`(33개 파일·203개), `npm run build:portable` 통과.
- `npm run lint` 오류 없음. 기존 `PdfPage.tsx`의 ref·effect 경고는 남아 있다.
- 홈페이지 동작 검사 14개: 7개 언어의 표시 필드·이미지 대체 텍스트·메타데이터, 기기 언어 및 미지원 언어, 수동·auto 설정 복원, 저장소 미사용, 메뉴 닫힘 중 재열기, Escape·레이블·포커스, 동작 감소, 데스크톱 전환, 링크 선택 후 숨김 확인. 최소 DOM 경계 모형으로 실행했으며 브라우저 클릭·렌더링 검증을 대신하지 않는다.
- 생성 HTML의 이미지 6개 참조를 base64·PNG CRC·압축 데이터로 검사했다. 미치환 토큰, 외부 JS·CSS·manifest 의존 없음. 기존 CTA·앵커 경로와 Wake Lock 코드 보존을 원본과 비교했고 CSS 파싱도 통과했다.
- **화면 검증 미실시:** 인앱 브라우저가 해당 `file://` 주소 접근을 보안 정책으로 차단했다. 360·390·768·1024·1440px 렌더링, 7개 언어의 390·1440px 가로 넘침, 실제 Tab·Enter·Space·Escape·FAQ 클릭, 200% 확대는 아직 확인하지 않았다.
- **실기기 미검증:** PC·태블릿의 실제 화면 유지, 모바일 터치·안전 영역·글자 확대·애니메이션 프레임. GitHub 배포와 별도 앱 이관은 하지 않았다.
