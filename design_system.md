# 니트피크 디자인시스템 요약

기준일: 2026-10-17. 기준 소스: `src/designTokens.ts`, `src/index.css`. UI는 시맨틱 토큰을 사용하고 루트와 웹 기준서는 동일하게 유지한다.

## 원칙

Green Modern Retro / Soft Craft Minimalism. 브랜드 그린과 Pretendard로 위계를 세우고 밝은 표면과 낮은 장식 밀도를 유지한다. 기본 앱·사이트 배경, 카드, 팝오버, 입력 표면은 모두 `#FFFFFF`로 통일한다. 보고서 편집 작업 영역만 `--color-report-editor-background` (`#F5F6F5`)를 사용하고, 카드 표면은 흰색으로 유지한다. 의미가 있는 상태 색과 도안 작업 영역은 구분해 유지하며 PDF·사진 원본과 저장된 객체 색상은 그대로 표시한다.

## UI 색상 토큰

| 역할 | 색상 |
|---|---|
| Primary / Hover / Pressed | `#21A366` / `#107C41` / `#0B5A30` |
| Primary text / soft | `#111111` / `#E7F5EC` |
| Secondary / Hover / Soft | `#111111` / `#303030` / `#FFFFFF` |
| Tertiary / Soft | `#107C41` / `#E7F5EC` |
| App background / Surface | `#FFFFFF` / `#FFFFFF` |
| Subtle / Viewer | `#FFFFFF` / `#E9E6DF` |
| Text / Secondary / Muted | `#111111` / `#525650` / `#777C76` |
| Border / Divider | `#CFCFC8` / `#E4E2DC` |
| Danger / Soft | `#B9473F` / `#F7E9E6` |
| Warning / Soft | `#B88732` / `#F6EEDC` |
| Progress | `#21A366` |

Functional colors remain distinct: `#2C2B27`, `#C85E4B`, `#557A95`, `#5C8167`, `#7A6A94`, `#7D7A76`. Counter colors are `#557A95`, `#5C8167`, `#D46A4C`, and `#7A6A94` for repeat counters.
The app uses locally bundled Pretendard 400·500·600 from `src/assets/fonts/PretendardVariable.woff2`; its license is `src/assets/fonts/LICENSE.txt`. The portable homepage embeds the same font.

## 필기·진행선 팔레트

2행 × 5열, 조작 영역 44px 이상. 기존에 저장된 색은 읽을 때 보존한다.

| 핑크 | 빨강 | 주황 | 노랑 | 초록 |
|---|---|---|---|---|
| `#EC4899` | `#EF4444` | `#F97316` | `#FACC15` | `#22C55E` |

| 청록 | 하늘 | 파랑 | 보라 | 진회색 |
|---|---|---|---|---|
| `#14B8A6` | `#38BDF8` | `#3B82F6` | `#A855F7` | `#374151` |

기본색은 진행선 핑크, 펜·텍스트 진회색, 형광펜·구간 강조 노랑이다.

## 컴포넌트·접근성

- 간격은 4·8·12·16·24·32px, 버튼 Radius 10px, 툴바 14px, 팝오버 16px이다.
- 기본 아이콘은 20px이며 버튼·핸들은 최소 44×44px로 한다.
- Hover·Pressed·Selected·Disabled 상태와 키보드 `focus-visible`을 일관되게 표현하고 접근성 이름을 제공한다.
- 팝오버는 연결 요소 옆에 화면 안으로 배치하고 바깥 클릭·Escape로 닫는다. Escape 후 연결 요소에 포커스를 돌린다.
- 입력창·메모의 키보드 편집과 선택은 보존한다. Viewer의 비편집 영역은 앱 제스처를 우선한다.
- 필기 도구는 선택과 설정을 함께 활성화하며 첫 Canvas 조작에서 설정 팝업을 닫는다.
- 진행선 탭·롱프레스는 스타일 설정을 열고 8px 초과 이동은 직접 드래그로 처리한다.

## 브랜드·컨트롤

- 로고·파비콘·PWA는 같은 그린 니트·돋보기 표식을 사용한다. 자산 파일명은 기존 참조 경로를 유지한다. 한국어 브랜드 표기는 니트피크, 그 외에는 KnitPeek다.
- 진행선 시작 버튼·선택 상태·일반 알림 액션은 그린 토큰을 사용한다. 작업 객체 팔레트와 저장된 색상은 그대로 보존한다.
- 슬라이더의 thumb·완료 구간은 Primary, 남은 트랙은 Border 회색이다. 팔레트 5열 폭에 맞춰 이름 아래 가로 슬라이더를 배치한다.
- PDF 추가 버튼은 흰 배경·검은 텍스트다.
- 비차단 토스트는 Primary soft 배경·흰 버튼을 사용하고 입력을 받는다. 진행선 알림은 5초 뒤 닫히며 확인 대화상자와 구분한다.

## 확인

토큰·원본 표면·44px 조작 영역·키보드 사용·390/1024/1440px 화면 넘침을 확인한다. `npm run check:design-system`으로 코드 토큰과 루트·웹 기준서의 일치를 검사한다.
