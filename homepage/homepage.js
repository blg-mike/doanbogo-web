const appUrl = document.querySelector('meta[name="knitpeek-app-url"]').content || './index.html'
if (window.location.hash.startsWith('#/')) window.location.replace(appUrl + window.location.hash)

const messages = {
  ko: {
    pageTitle: '니트피크 | 뜨개 도안을 보며 이어서 뜨기',
    brandName: '니트피크',
    description: '니트피크에서 PDF 뜨개도안을 열고, 진행선과 단수 카운터로 지금 뜨는 위치를 기록하세요. 작업 내용은 내 브라우저에 저장됩니다.',
    skip: '본문으로 건너뛰기', navFeatures: '기능', navFaq: '자주 묻는 질문', languageLabel: '언어 선택', languageAuto: '기기 언어', menuOpen: '메뉴 열기', menuClose: '메뉴 닫기', start: '지금 시작하기',
    heroKicker: 'PDF 뜨개도안 작업 도구', heroTitleLine1: '도안은 편하게,', heroTitleLine2: '뜨개는 더 즐겁게.', heroBody: 'PDF 도안을 보며 지금 뜨는 단을 표시하세요. 진행선과 단수 카운터, 메모까지 한곳에 모아두고 다음에도 이어서 뜰 수 있어요.', startNow: '니트피크 시작하기', seeFeatures: '기능 살펴보기', trialNote: '계정 없이 브라우저에서 바로 시작할 수 있어요.', viewerAlt: '니트피크 PDF 뷰어에서 실제 뜨개 차트와 진행선, 페이지 도구를 확인하는 화면', figureNote: '니트피크 PDF 뷰어 · 직접 만든 뜨개 차트로 촬영',

    featureKicker: '작업에 필요한 것만, 도안 곁에', featureTitle: '종이 도안 보듯 자연스럽게,\n작업 기록은 빠짐없이.', featureLead: '익숙한 PDF 도안에 작업 위치와 기록을 더해, 실과 바늘에 집중할 수 있도록 돕습니다.', featureImageLabel: 'PDF 도안 · 1 / 3 페이지', progressLabel: '현재 작업 위치', featurePdfTitle: '원본 도안을 그대로 보고', featurePdfBody: '가지고 있는 PDF를 열어 페이지를 살펴보고 확대해요. 도안 파일 자체는 그대로 둡니다.', featureCounterTitle: '진행선과 단수를 기록하고', featureCounterBody: '차트에서 현재 뜨는 위치를 표시하고 단수를 세세요. 연결한 진행선은 카운터에 맞춰 움직입니다.', featureNotesTitle: '메모와 프로젝트를 남겨두세요', featureNotesBody: '중요한 페이지를 북마크하고 도안에 메모하세요. 작업 시간과 상태는 프로젝트 기록에서 볼 수 있습니다.', allProjects: '프로젝트 화면 열기',
    recordKicker: '다시 도안을 펼치는 날에도', recordTitle: '마지막으로 뜬 곳부터\n차분히 이어가세요.', recordBody: '페이지 위 작업 표시와 프로젝트 기록을 남기면, 다음 뜨개 시간에 필요한 내용을 다시 확인할 수 있어요.', recordLocalNote: '작업 데이터는 이 브라우저에 저장됩니다.',
    faqKicker: '시작 전에 확인해 보세요', faqTitle: '자주 묻는 질문', faqOneQ: '어떤 뜨개도안을 사용할 수 있나요?', faqOneA: 'PDF 도안을 열 수 있고, 종이 도안은 사진 도안 폴더로 만들 수 있어요.', faqTwoQ: '도안과 작업 내용은 어디에 저장되나요?', faqTwoA: '도안과 작업 데이터는 브라우저 로컬 저장소에 저장됩니다. 자동 기기 간 동기화는 제공하지 않으므로, 기기를 옮길 때는 작업 파일을 내보내어 백업하고 가져오세요.', faqThreeQ: '회원가입이나 로그인이 필요한가요?', faqThreeA: '현재 앱에는 가입·로그인 절차가 없습니다. 브라우저에서 앱을 열어 도안을 추가하면 바로 시작할 수 있어요.', faqFourQ: '태블릿과 휴대폰에서도 쓸 수 있나요?', faqFourA: '모바일·태블릿 화면에 맞춰 배치되는 웹 앱입니다. 브라우저에서 열어 현재 기기에 맞는 화면으로 사용할 수 있습니다.',
    closingKicker: '도안은 가까이에, 뜨개는 느긋하게', closingTitle: '이제 뜨개에만\n집중해 보세요.', closingBody: '니트피크에서 다음 뜨개 시간을 시작합니다.', footerCopy: '좋아하는 도안 곁에서, 뜨개를 이어가세요.', footerService: '서비스', footerStorage: '도안과 작업 데이터는 브라우저에 저장됩니다.',
  },
  en: {
    pageTitle: 'KnitPeek | Pick up your knitting where you left off',
    brandName: 'KnitPeek',
    description: 'Open a knitting pattern PDF, mark your place with a progress line and row counter, and keep project notes in your browser.',
    skip: 'Skip to content', navFeatures: 'Features', navFaq: 'FAQ', languageLabel: 'Choose language', languageAuto: 'Device language', menuOpen: 'Open menu', menuClose: 'Close menu', start: 'Open KnitPeek',
    heroKicker: 'A workspace for knitting patterns', heroTitleLine1: 'Stay with your pattern.', heroTitleLine2: 'Pick up your knitting.', heroBody: 'Open a pattern PDF and mark the row you are working on. Keep your progress line, row counter, and notes nearby so it is easy to continue next time.', startNow: 'Open KnitPeek', seeFeatures: 'See how it works', trialNote: 'Start in your browser. No account needed.', viewerAlt: 'Actual KnitPeek PDF viewer showing a knitting chart, progress line, and page tools', figureNote: 'KnitPeek PDF viewer · photographed with an original sample chart',

    featureKicker: 'A few useful tools, right beside your pattern', featureTitle: 'Read the pattern as it is.\nKeep the work in view.', featureLead: 'Add a place to pick up and a record of your work to the PDF you already use.', featureImageLabel: 'Pattern PDF · page 1 of 3', progressLabel: 'Current place', featurePdfTitle: 'Read the original pattern', featurePdfBody: 'Open the PDF you already have, browse its pages, and zoom in. Your pattern file stays as it is.', featureCounterTitle: 'Mark a row and count along', featureCounterBody: 'Set your place on the chart and count rows as you knit. A linked progress line moves with its counter.', featureNotesTitle: 'Leave a note for later', featureNotesBody: 'Bookmark a page or add a note to the pattern. Find your work time and project status in its record.', allProjects: 'Open projects',
    recordKicker: 'The next time you open your pattern', recordTitle: 'Start again where\nyou left off.', recordBody: 'Keep a marker on the page and a record with your project, so you can see what you need for the next knitting session.', recordLocalNote: 'Your work is stored in this browser.',
    faqKicker: 'Before you begin', faqTitle: 'Frequently asked questions', faqOneQ: 'What kinds of knitting patterns can I use?', faqOneA: 'Open a pattern PDF, or turn paper patterns into a photo folder.', faqTwoQ: 'Where are my patterns and work details stored?', faqTwoA: 'Patterns and work data are stored locally in your browser. There is no automatic sync between devices. Export a KnitPeek work file as a backup before moving to another device.', faqThreeQ: 'Do I need to create an account or sign in?', faqThreeA: 'The current app has no sign-up or sign-in step. Open it in your browser, add a pattern, and get started.', faqFourQ: 'Can I use KnitPeek on a phone or tablet?', faqFourA: 'The web app rearranges its layout for mobile and tablet screens. Open it in your browser to use the layout for your device.',
    closingKicker: 'Keep the pattern close. Enjoy the pace.', closingTitle: 'Make room for\nthe knitting.', closingBody: 'Open KnitPeek for your next knitting session.', footerCopy: 'Stay close to the pattern you love.', footerService: 'KnitPeek', footerStorage: 'Patterns and work data stay in your browser.',
  },
  ja: {
    pageTitle: 'KnitPeek | 編み図を見ながら続きを編む',
    brandName: 'KnitPeek',
    description: '編み図PDFを開き、進行線と段数カウンターで今編んでいる位置を記録。作業メモはブラウザーに保存できます。',
    skip: '本文へ移動', navFeatures: '機能', navFaq: 'よくある質問', languageLabel: '言語を選択', languageAuto: '端末の言語', menuOpen: 'メニューを開く', menuClose: 'メニューを閉じる', start: 'KnitPeekを開く',
    heroKicker: '編み図を見ながら作業するツール', heroTitleLine1: '編み図は見やすく、', heroTitleLine2: '編み物はもっと楽しく。', heroBody: 'PDFの編み図に、今編んでいる段を表示できます。進行線や段数カウンター、メモをまとめておけば、次回も続きを編みやすくなります。', startNow: 'KnitPeekを開く', seeFeatures: '機能を見る', trialNote: 'アカウント登録なしでブラウザーから始められます。', viewerAlt: '編み図と進行線、ページ操作を表示したKnitPeekのPDFビューア画面', figureNote: 'KnitPeek PDFビューア · オリジナルのサンプル編み図を使用',

    featureKicker: '編み図のそばに、作業に必要な道具を', featureTitle: '編み図はいつものまま。\n作業記録はひとまとめに。', featureLead: 'いつものPDF編み図に作業位置や記録を添えて、糸と針に集中できます。', featureImageLabel: '編み図PDF · 全3ページの1ページ目', progressLabel: '現在の作業位置', featurePdfTitle: '元の編み図をそのまま見る', featurePdfBody: '手元のPDFを開いてページをめくり、拡大して確認できます。編み図ファイル自体は変更しません。', featureCounterTitle: '進行線と段数を記録', featureCounterBody: '編み図に現在地を表示して段数を数えます。連動させた進行線はカウンターに合わせて動きます。', featureNotesTitle: 'メモを残してプロジェクトを管理', featureNotesBody: '大切なページをブックマークして編み図にメモを追加。作業時間や状況もプロジェクトで確認できます。', allProjects: 'プロジェクトを開く',
    recordKicker: '編み図を開き直すときも', recordTitle: '最後に編んだところから\n落ち着いて再開。', recordBody: 'ページに位置を表示してプロジェクトに記録を残せば、次の編み物に必要なことを見返せます。', recordLocalNote: '作業データはこのブラウザーに保存されます。',
    faqKicker: '始める前にご確認ください', faqTitle: 'よくある質問', faqOneQ: 'どんな編み図を使えますか？', faqOneA: 'PDF編み図を開けます。紙の編み図は写真フォルダーにまとめられます。', faqTwoQ: '編み図や作業内容はどこに保存されますか？', faqTwoA: '編み図と作業データはブラウザーのローカルストレージに保存されます。端末間の自動同期はありません。端末を移す際は、作業ファイルを書き出してバックアップしてください。', faqThreeQ: 'アカウント登録やログインは必要ですか？', faqThreeA: '現在のアプリには登録やログインの手順はありません。ブラウザーでアプリを開き、編み図を追加して始められます。', faqFourQ: 'タブレットやスマートフォンでも使えますか？', faqFourA: 'モバイルやタブレットの画面に合わせて表示が切り替わるウェブアプリです。ブラウザーから利用できます。',
    closingKicker: '編み図をそばに、ゆったり編み物を', closingTitle: '編み物の時間を\n楽しみましょう。', closingBody: '次の編み物はKnitPeekから。', footerCopy: '好きな編み図と、続きを編む時間を。', footerService: 'サービス', footerStorage: '編み図と作業データはブラウザーに保存されます。',
  },
  de: {
    pageTitle: 'KnitPeek | Strickmuster öffnen und später weiterstricken',
    brandName: 'KnitPeek',
    description: 'Öffne dein Strickmuster als PDF, markiere die aktuelle Reihe und notiere deinen Fortschritt im Browser.',
    skip: 'Zum Inhalt springen', navFeatures: 'Funktionen', navFaq: 'Häufige Fragen', languageLabel: 'Sprache wählen', languageAuto: 'Gerätesprache', menuOpen: 'Menü öffnen', menuClose: 'Menü schließen', start: 'KnitPeek öffnen',
    heroKicker: 'Ein Arbeitsbereich für Strickmuster', heroTitleLine1: 'Das Muster im Blick.', heroTitleLine2: 'Reihe für Reihe weiter.', heroBody: 'Öffne ein PDF und markiere die Reihe, an der du gerade arbeitest. Fortschrittslinie, Reihenzähler und Notizen bleiben zusammen, damit du später leichter weiterstrickst.', startNow: 'KnitPeek öffnen', seeFeatures: 'Funktionen ansehen', trialNote: 'Direkt im Browser starten. Kein Konto nötig.', viewerAlt: 'Echte KnitPeek-PDF-Ansicht mit Strickdiagramm, Fortschrittslinie und Seitenwerkzeugen', figureNote: 'KnitPeek PDF-Ansicht · mit einem eigenen Strickdiagramm fotografiert',

    featureKicker: 'Nützliche Werkzeuge direkt beim Muster', featureTitle: 'Das Muster bleibt vertraut.\nDeine Arbeit bleibt im Blick.', featureLead: 'Ergänze das PDF, das du schon nutzt, um deinen Arbeitsstand und deine Notizen.', featureImageLabel: 'Strickmuster-PDF · Seite 1 von 3', progressLabel: 'Aktuelle Stelle', featurePdfTitle: 'Das ursprüngliche Muster ansehen', featurePdfBody: 'Öffne dein PDF, blättere durch die Seiten und vergrößere die Ansicht. Die Musterdatei bleibt unverändert.', featureCounterTitle: 'Reihe markieren und mitzählen', featureCounterBody: 'Markiere deine Stelle im Diagramm und zähle die Reihen. Eine verknüpfte Fortschrittslinie bewegt sich mit dem Zähler.', featureNotesTitle: 'Notizen und Projekte festhalten', featureNotesBody: 'Setze Lesezeichen und notiere etwas direkt im Muster. Arbeitszeit und Status findest du in deinem Projekt.', allProjects: 'Projekte öffnen',
    recordKicker: 'Auch wenn du das Muster später wieder öffnest', recordTitle: 'Mach dort weiter,\nwo du aufgehört hast.', recordBody: 'Setze eine Markierung auf die Seite und speichere den Arbeitsstand im Projekt, damit du beim nächsten Mal gleich loslegen kannst.', recordLocalNote: 'Deine Arbeit wird in diesem Browser gespeichert.',
    faqKicker: 'Vor dem Start', faqTitle: 'Häufige Fragen', faqOneQ: 'Welche Strickmuster kann ich verwenden?', faqOneA: 'Öffne ein PDF oder sammle Papiermuster in einem Fotoordner.', faqTwoQ: 'Wo werden Muster und Arbeitsstand gespeichert?', faqTwoA: 'Muster und Arbeitsdaten liegen lokal in deinem Browser. Es gibt keine automatische Synchronisierung zwischen Geräten. Exportiere vor einem Gerätewechsel eine KnitPeek-Datei als Sicherung.', faqThreeQ: 'Muss ich ein Konto erstellen oder mich anmelden?', faqThreeA: 'Die aktuelle App hat keine Registrierung und keine Anmeldung. Öffne sie im Browser, füge ein Muster hinzu und leg los.', faqFourQ: 'Kann ich KnitPeek auf Tablet oder Smartphone verwenden?', faqFourA: 'Die Web-App passt ihre Anordnung an Mobil- und Tabletbildschirme an. Öffne sie im Browser deines Geräts.',
    closingKicker: 'Das Muster nah bei dir. Zeit zum Stricken.', closingTitle: 'Mach Platz für\ndas Stricken.', closingBody: 'Starte deine nächste Strickrunde mit KnitPeek.', footerCopy: 'Bleib bei dem Muster, das du liebst.', footerService: 'KnitPeek', footerStorage: 'Muster und Arbeitsdaten werden im Browser gespeichert.',
  },
  da: {
    pageTitle: 'KnitPeek | Find tilbage til dit strikketøj',
    brandName: 'KnitPeek',
    description: 'Åbn en strikkeopskrift som PDF, markér rækken, du er nået til, og gem dine arbejdsnoter i browseren.',
    skip: 'Gå til indhold', navFeatures: 'Funktioner', navFaq: 'Ofte stillede spørgsmål', languageLabel: 'Vælg sprog', languageAuto: 'Enhedens sprog', menuOpen: 'Åbn menu', menuClose: 'Luk menu', start: 'Åbn KnitPeek',
    heroKicker: 'Et arbejdsrum til strikkeopskrifter', heroTitleLine1: 'Hold styr på opskriften.', heroTitleLine2: 'Strik videre i dit tempo.', heroBody: 'Åbn en PDF-opskrift, og markér den række, du er i gang med. Saml fremgangslinje, rækketæller og noter, så det er nemmere at fortsætte næste gang.', startNow: 'Åbn KnitPeek', seeFeatures: 'Se funktionerne', trialNote: 'Start i browseren. Du behøver ingen konto.', viewerAlt: 'KnitPeeks faktiske PDF-visning med strikkediagram, fremgangslinje og sideværktøjer', figureNote: 'KnitPeek PDF-visning · fotograferet med et originalt strikkediagram',

    featureKicker: 'Nyttige værktøjer lige ved opskriften', featureTitle: 'Læs opskriften, som den er.\nBehold styr på arbejdet.', featureLead: 'Føj din placering og dine noter til den PDF, du allerede bruger.', featureImageLabel: 'PDF-opskrift · side 1 af 3', progressLabel: 'Nuværende placering', featurePdfTitle: 'Se den oprindelige opskrift', featurePdfBody: 'Åbn din PDF, gå mellem siderne, og zoom ind. Selve opskriftsfilen forbliver uændret.', featureCounterTitle: 'Markér rækken, og tæl med', featureCounterBody: 'Markér din placering i diagrammet, og tæl rækkerne. En tilknyttet fremgangslinje følger tælleren.', featureNotesTitle: 'Gem noter og projekter', featureNotesBody: 'Bogmærk en side, eller skriv en note på opskriften. Se arbejdstid og status i projektoversigten.', allProjects: 'Åbn projekter',
    recordKicker: 'Næste gang du åbner opskriften', recordTitle: 'Begynd dér, hvor\ndu slap.', recordBody: 'Efterlad en markering på siden og en status i projektet, så du ved, hvor du skal begynde næste gang.', recordLocalNote: 'Arbejdsdata gemmes i denne browser.',
    faqKicker: 'Før du går i gang', faqTitle: 'Ofte stillede spørgsmål', faqOneQ: 'Hvilke strikkeopskrifter kan jeg bruge?', faqOneA: 'Åbn en PDF-opskrift, eller saml papirark i en fotomappe.', faqTwoQ: 'Hvor gemmes mine opskrifter og arbejdsnoter?', faqTwoA: 'Opskrifter og arbejdsdata gemmes lokalt i browseren. Der synkroniseres ikke automatisk mellem enheder. Eksportér en KnitPeek-fil som sikkerhedskopi, før du skifter enhed.', faqThreeQ: 'Skal jeg oprette en konto eller logge ind?', faqThreeA: 'Den nuværende app har ingen oprettelse af konto eller login. Åbn den i browseren, tilføj en opskrift, og gå i gang.', faqFourQ: 'Kan jeg bruge KnitPeek på tablet eller mobil?', faqFourA: 'Webappen tilpasser visningen til mobil- og tabletskærme. Åbn den i browseren på din enhed.',
    closingKicker: 'Opskriften tæt på. Tid til at strikke.', closingTitle: 'Giv plads til\nstrikketøjet.', closingBody: 'Åbn KnitPeek til din næste strikkestund.', footerCopy: 'Følg den opskrift, du holder af.', footerService: 'KnitPeek', footerStorage: 'Opskrifter og arbejdsdata gemmes i browseren.',
  },
  nb: {
    pageTitle: 'KnitPeek | Finn tilbake til strikketøyet',
    brandName: 'KnitPeek',
    description: 'Åpne en strikkeoppskrift som PDF, marker raden du holder på med, og lagre arbeidsnotatene i nettleseren.',
    skip: 'Gå til innhold', navFeatures: 'Funksjoner', navFaq: 'Vanlige spørsmål', languageLabel: 'Velg språk', languageAuto: 'Enhetens språk', menuOpen: 'Åpne meny', menuClose: 'Lukk meny', start: 'Åpne KnitPeek',
    heroKicker: 'Et arbeidsrom for strikkeoppskrifter', heroTitleLine1: 'Ha oppskriften nær.', heroTitleLine2: 'Strikk videre i ditt tempo.', heroBody: 'Åpne en PDF-oppskrift og marker raden du holder på med. Samle fremdriftslinje, radteller og notater, så er det enkelt å fortsette neste gang.', startNow: 'Åpne KnitPeek', seeFeatures: 'Se funksjonene', trialNote: 'Start i nettleseren. Du trenger ingen konto.', viewerAlt: 'KnitPeeks faktiske PDF-visning med strikkediagram, fremdriftslinje og sideverktøy', figureNote: 'KnitPeek PDF-visning · fotografert med et eget strikkediagram',

    featureKicker: 'Nyttige verktøy rett ved oppskriften', featureTitle: 'Les oppskriften som før.\nHold oversikt over arbeidet.', featureLead: 'Legg til arbeidssted og notater i PDF-en du allerede bruker.', featureImageLabel: 'PDF-oppskrift · side 1 av 3', progressLabel: 'Nåværende plassering', featurePdfTitle: 'Se originaloppskriften', featurePdfBody: 'Åpne PDF-en, bla mellom sidene og zoom inn. Selve oppskriftsfilen forblir uendret.', featureCounterTitle: 'Marker raden og tell videre', featureCounterBody: 'Marker plasseringen i diagrammet og tell radene. En tilkoblet fremdriftslinje følger telleren.', featureNotesTitle: 'Ta vare på notater og prosjekter', featureNotesBody: 'Bokmerk en side eller skriv et notat på oppskriften. Finn arbeidstid og status i prosjektoversikten.', allProjects: 'Åpne prosjekter',
    recordKicker: 'Neste gang du åpner oppskriften', recordTitle: 'Begynn der du\nslapp sist.', recordBody: 'Legg igjen et merke på siden og en status i prosjektet, så vet du hvor du skal begynne neste gang.', recordLocalNote: 'Arbeidsdata lagres i denne nettleseren.',
    faqKicker: 'Før du begynner', faqTitle: 'Vanlige spørsmål', faqOneQ: 'Hvilke strikkeoppskrifter kan jeg bruke?', faqOneA: 'Åpne en PDF-oppskrift, eller samle papirark i en fotomappe.', faqTwoQ: 'Hvor lagres oppskriftene og arbeidsnotatene?', faqTwoA: 'Oppskrifter og arbeidsdata lagres lokalt i nettleseren. Det skjer ingen automatisk synkronisering mellom enheter. Eksporter en KnitPeek-fil som sikkerhetskopi før du bytter enhet.', faqThreeQ: 'Må jeg opprette en konto eller logge inn?', faqThreeA: 'Den nåværende appen har ingen registrering eller innlogging. Åpne den i nettleseren, legg til en oppskrift og kom i gang.', faqFourQ: 'Kan jeg bruke KnitPeek på nettbrett og mobil?', faqFourA: 'Nettappen tilpasser oppsettet til mobil- og nettbrettskjermer. Åpne den i nettleseren på enheten din.',
    closingKicker: 'Oppskriften nær. Tid til å strikke.', closingTitle: 'Gi plass til\nstrikkingen.', closingBody: 'Åpne KnitPeek til neste strikkestund.', footerCopy: 'Følg oppskriften du er glad i.', footerService: 'KnitPeek', footerStorage: 'Oppskrifter og arbeidsdata lagres i nettleseren.',
  },
  fi: {
    pageTitle: 'KnitPeek | Jatka neulomista siitä, mihin jäit',
    brandName: 'KnitPeek',
    description: 'Avaa neuleohje PDF-tiedostona, merkitse nykyinen kerros ja tallenna työmuistiinpanot selaimeen.',
    skip: 'Siirry sisältöön', navFeatures: 'Ominaisuudet', navFaq: 'Usein kysyttyä', languageLabel: 'Valitse kieli', languageAuto: 'Laitteen kieli', menuOpen: 'Avaa valikko', menuClose: 'Sulje valikko', start: 'Avaa KnitPeek',
    heroKicker: 'Työtila neuleohjeille', heroTitleLine1: 'Pidä ohje käden ulottuvilla.', heroTitleLine2: 'Jatka neulomista.', heroBody: 'Avaa PDF-neuleohje ja merkitse, millä kerroksella olet. Kun edistymisviiva, kerroslaskuri ja muistiinpanot ovat yhdessä paikassa, työ jatkuu helpommin seuraavalla kerralla.', startNow: 'Avaa KnitPeek', seeFeatures: 'Katso ominaisuudet', trialNote: 'Aloita selaimessa ilman käyttäjätiliä.', viewerAlt: 'KnitPeekn PDF-näkymä, jossa näkyvät neulekaavio, edistymisviiva ja sivun työkalut', figureNote: 'KnitPeek PDF-näkymä · kuvattu omalla neulekaaviolla',

    featureKicker: 'Tarpeelliset työkalut aivan ohjeen vieressä', featureTitle: 'Lue tuttu ohje.\nPidä työsi tallessa.', featureLead: 'Lisää työkohtasi ja muistiinpanosi PDF-ohjeeseen, jota jo käytät.', featureImageLabel: 'PDF-neuleohje · sivu 1/3', progressLabel: 'Nykyinen työkohta', featurePdfTitle: 'Katso alkuperäistä ohjetta', featurePdfBody: 'Avaa PDF, selaa sivuja ja suurenna näkymää. Ohjetiedostoa ei muuteta.', featureCounterTitle: 'Merkitse kerros ja laske eteenpäin', featureCounterBody: 'Merkitse työkohtasi kaavioon ja laske kerrokset. Laskuriin yhdistetty edistymisviiva liikkuu laskurin mukana.', featureNotesTitle: 'Tallenna muistiinpanot ja projektit', featureNotesBody: 'Merkitse sivu kirjanmerkiksi tai lisää ohjeeseen muistiinpano. Projektista näet työajan ja tilan.', allProjects: 'Avaa projektit',
    recordKicker: 'Kun avaat neuleohjeen uudelleen', recordTitle: 'Jatka siitä,\nmihin viimeksi jäit.', recordBody: 'Jätä sivulle merkintä ja tallenna projektin tila, niin löydät seuraavalla kerralla oikean kohdan.', recordLocalNote: 'Työtiedot tallennetaan tähän selaimeen.',
    faqKicker: 'Ennen aloitusta', faqTitle: 'Usein kysyttyä', faqOneQ: 'Millaisia neuleohjeita voin käyttää?', faqOneA: 'Avaa PDF-neuleohje tai kokoa paperiset sivut kuvakansioon.', faqTwoQ: 'Mihin ohjeet ja työtiedot tallennetaan?', faqTwoA: 'Ohjeet ja työtiedot tallennetaan paikallisesti selaimeen. Laitteiden välillä ei ole automaattista synkronointia. Vie KnitPeek-työtiedosto varmuuskopioksi ennen laitteen vaihtamista.', faqThreeQ: 'Pitääkö minun luoda käyttäjätili tai kirjautua sisään?', faqThreeA: 'Nykyisessä sovelluksessa ei ole rekisteröitymistä tai kirjautumista. Avaa sovellus selaimessa, lisää neuleohje ja aloita.', faqFourQ: 'Voinko käyttää KnitPeeka tabletilla tai puhelimella?', faqFourA: 'Verkkosovellus mukauttaa asettelun tabletin ja puhelimen näytölle. Avaa se laitteesi selaimessa.',
    closingKicker: 'Ohje lähellä. Aikaa neulomiselle.', closingTitle: 'Anna tilaa\nneulomiselle.', closingBody: 'Avaa KnitPeek seuraavaa neulontahetkeä varten.', footerCopy: 'Jatka työtäsi tutun ohjeen parissa.', footerService: 'KnitPeek', footerStorage: 'Ohjeet ja työtiedot tallennetaan selaimeen.',
  },
}

const motionDemoMessages = {
  ko: { motionDemoKicker: '실제 작업 흐름', motionDemoEyebrow: '짧게 눌러 직접 확인해 보세요', motionDemoTitle: '작은 변화가 다음 동작을 알려줘요.', motionDemoLead: '카운터, 필기 이동, 보고서 저장 흐름을 체험할 수 있습니다. 실제 작업 데이터에는 영향을 주지 않습니다.', motionDemoTabsLabel: '데모 선택', motionDemoTabCounter: '카운터·타이머', motionDemoTabSelect: '필기 구간 선택', motionDemoTabReport: '보고서·공유', motionDemoCounterTitle: '단수를 올리면 진행선도 함께 이동해요', motionDemoCounterBody: '카운터 값과 연결된 도안 위치가 한 번의 동작으로 맞춰집니다.', motionDemoCounterAlt: '카운터가 24단에서 25단으로 진행하는 예시', motionDemoPatternFile: '가을 스웨터 도안.pdf', motionDemoCurrentRow: '현재 작업 위치', motionDemoMainCounter: '메인 카운터', motionDemoRowUnit: '단', motionDemoSelectTitle: '필기를 묶어 위치만 옮겨요', motionDemoSelectBody: '선택 영역 안의 펜·형광펜·텍스트가 상대 위치를 유지하며 함께 움직입니다.', motionDemoSelectAlt: '차트 위 필기를 선택하고 이동하는 예시', motionDemoSelectHint: '구간 선택 · 함께 이동', motionDemoReportTitle: '기록을 저장하고 공유 문구를 확인해요', motionDemoReportBody: '입력 내용은 저장 상태로 이어지고, 완성된 기록을 공유 미리보기에서 확인합니다.', motionDemoReportAlt: '보고서 메모를 저장하고 공유하는 예시', motionDemoReportSection: '뜨개보고서 · 메모', motionDemoEditing: '작성 중', motionDemoSaved: '저장됨', motionDemoNote: '몸판을 3단 더 뜨고 소매에서 3단 줄임', motionDemoSharePreview: '공유 미리보기', motionDemoShareTitle: '가을 스웨터', motionDemoShareBody: '차분히 한 단씩 완성했어요.', motionDemoPlay: '데모 재생', motionDemoPause: '데모 일시정지', motionDemoReplay: '데모 다시 보기', motionDemoReady: '준비됨', motionDemoStepOne: '작업 위치 표시', motionDemoStepTwo: '다음 단으로 이동', motionDemoSelectStepOne: '필기 구간 선택', motionDemoSelectStepTwo: '선택한 필기 이동', motionDemoReportStepOne: '메모 작성', motionDemoReportStepTwo: '저장 후 공유 미리보기' },
  en: { motionDemoKicker: 'A closer look', motionDemoEyebrow: 'Try a short guided preview', motionDemoTitle: 'Small changes make the next step clear.', motionDemoLead: 'Explore the counter, annotation selection, and report sharing. These previews never touch your work data.', motionDemoTabsLabel: 'Choose a demo', motionDemoTabCounter: 'Counter and timer', motionDemoTabSelect: 'Select annotations', motionDemoTabReport: 'Report and share', motionDemoCounterTitle: 'Move the counter and the progress line follows', motionDemoCounterBody: 'The row count and its linked place on the pattern stay in sync.', motionDemoCounterAlt: 'A counter moving from row 24 to row 25', motionDemoPatternFile: 'Autumn sweater pattern.pdf', motionDemoCurrentRow: 'Current place', motionDemoMainCounter: 'Main counter', motionDemoRowUnit: 'rows', motionDemoSelectTitle: 'Move a group of annotations together', motionDemoSelectBody: 'Pen, highlight, and text inside the selection keep their spacing as they move.', motionDemoSelectAlt: 'Selecting and moving annotations on a chart', motionDemoSelectHint: 'Select area · move together', motionDemoReportTitle: 'Save a note and preview what you share', motionDemoReportBody: 'See the edit become saved, then review the finished note in a share preview.', motionDemoReportAlt: 'Saving a report note and opening its share preview', motionDemoReportSection: 'Knitting report · Note', motionDemoEditing: 'Editing', motionDemoSaved: 'Saved', motionDemoNote: 'Worked three more rows on the body and decreased three at the sleeve', motionDemoSharePreview: 'Share preview', motionDemoShareTitle: 'Autumn sweater', motionDemoShareBody: 'Finished one row at a time.', motionDemoPlay: 'Play demo', motionDemoPause: 'Pause demo', motionDemoReplay: 'Replay demo', motionDemoReady: 'Ready', motionDemoStepOne: 'Mark your place', motionDemoStepTwo: 'Move to the next row', motionDemoSelectStepOne: 'Select annotations', motionDemoSelectStepTwo: 'Move the selected notes', motionDemoReportStepOne: 'Write a note', motionDemoReportStepTwo: 'Save and preview sharing' },
  ja: { motionDemoKicker: '実際の作業の流れ', motionDemoEyebrow: '短いプレビューをお試しください', motionDemoTitle: '小さな変化が次の操作を伝えます。', motionDemoLead: 'カウンター、書き込みの選択、レポート共有を体験できます。実際の作業データには影響しません。', motionDemoTabsLabel: 'デモを選択', motionDemoTabCounter: 'カウンター・タイマー', motionDemoTabSelect: '書き込みを選択', motionDemoTabReport: 'レポート・共有', motionDemoCounterTitle: '段数を進めると進行線も動きます', motionDemoCounterBody: 'カウンターと連動した編み図上の位置が一緒に更新されます。', motionDemoCounterAlt: 'カウンターが24段から25段へ進む例', motionDemoPatternFile: '秋のセーター 編み図.pdf', motionDemoCurrentRow: '現在の作業位置', motionDemoMainCounter: 'メインカウンター', motionDemoRowUnit: '段', motionDemoSelectTitle: '書き込みをまとめて移動します', motionDemoSelectBody: '選択範囲内のペン、蛍光ペン、テキストが間隔を保って一緒に動きます。', motionDemoSelectAlt: '編み図の書き込みを選択して移動する例', motionDemoSelectHint: '範囲選択 · まとめて移動', motionDemoReportTitle: 'メモを保存して共有内容を確認', motionDemoReportBody: '入力内容が保存され、完成した記録を共有プレビューで確認できます。', motionDemoReportAlt: 'レポートのメモを保存して共有する例', motionDemoReportSection: '編み物レポート · メモ', motionDemoEditing: '編集中', motionDemoSaved: '保存済み', motionDemoNote: '身頃を3段編み進め、袖で3段減らしました', motionDemoSharePreview: '共有プレビュー', motionDemoShareTitle: '秋のセーター', motionDemoShareBody: '一段ずつ、ゆっくり完成。', motionDemoPlay: 'デモを再生', motionDemoPause: 'デモを一時停止', motionDemoReplay: 'デモをもう一度見る', motionDemoReady: '準備完了', motionDemoStepOne: '作業位置を表示', motionDemoStepTwo: '次の段へ進む', motionDemoSelectStepOne: '書き込みを選択', motionDemoSelectStepTwo: '選択した書き込みを移動', motionDemoReportStepOne: 'メモを入力', motionDemoReportStepTwo: '保存して共有プレビュー' },
  de: { motionDemoKicker: 'So läuft die Arbeit ab', motionDemoEyebrow: 'Kurze Vorschau ausprobieren', motionDemoTitle: 'Kleine Änderungen zeigen den nächsten Schritt.', motionDemoLead: 'Sieh dir Zähler, Anmerkungsauswahl und das Teilen eines Berichts an. Die Vorschau greift nicht auf deine Arbeitsdaten zu.', motionDemoTabsLabel: 'Demo auswählen', motionDemoTabCounter: 'Zähler und Timer', motionDemoTabSelect: 'Anmerkungen auswählen', motionDemoTabReport: 'Bericht und Teilen', motionDemoCounterTitle: 'Mit dem Zähler bewegt sich die Fortschrittslinie', motionDemoCounterBody: 'Reihenzahl und verknüpfte Stelle im Muster bleiben synchron.', motionDemoCounterAlt: 'Der Zähler wechselt von Reihe 24 zu Reihe 25', motionDemoPatternFile: 'Herbstpullover Muster.pdf', motionDemoCurrentRow: 'Aktuelle Stelle', motionDemoMainCounter: 'Hauptzähler', motionDemoRowUnit: 'Reihen', motionDemoSelectTitle: 'Anmerkungen gemeinsam verschieben', motionDemoSelectBody: 'Stift, Textmarker und Text behalten beim Verschieben ihren Abstand.', motionDemoSelectAlt: 'Anmerkungen im Diagramm auswählen und verschieben', motionDemoSelectHint: 'Bereich wählen · gemeinsam verschieben', motionDemoReportTitle: 'Notiz speichern und Teilen-Vorschau ansehen', motionDemoReportBody: 'Die Eingabe wird gespeichert und erscheint anschließend in der Teilen-Vorschau.', motionDemoReportAlt: 'Eine Berichtsnotiz speichern und teilen', motionDemoReportSection: 'Strickbericht · Notiz', motionDemoEditing: 'Wird bearbeitet', motionDemoSaved: 'Gespeichert', motionDemoNote: 'Am Rumpf drei Reihen weitergestrickt und am Ärmel drei abgenommen', motionDemoSharePreview: 'Teilen-Vorschau', motionDemoShareTitle: 'Herbstpullover', motionDemoShareBody: 'Reihe für Reihe fertiggestellt.', motionDemoPlay: 'Demo abspielen', motionDemoPause: 'Demo pausieren', motionDemoReplay: 'Demo erneut ansehen', motionDemoReady: 'Bereit', motionDemoStepOne: 'Arbeitsstelle markieren', motionDemoStepTwo: 'Zur nächsten Reihe wechseln', motionDemoSelectStepOne: 'Anmerkungen auswählen', motionDemoSelectStepTwo: 'Ausgewählte Notizen verschieben', motionDemoReportStepOne: 'Notiz schreiben', motionDemoReportStepTwo: 'Speichern und Vorschau öffnen' },
  da: { motionDemoKicker: 'Sådan foregår arbejdet', motionDemoEyebrow: 'Prøv en kort forhåndsvisning', motionDemoTitle: 'Små ændringer viser næste trin.', motionDemoLead: 'Se tæller, valg af noter og deling af rapporter. Forhåndsvisningen bruger ikke dine arbejdsdata.', motionDemoTabsLabel: 'Vælg demo', motionDemoTabCounter: 'Tæller og timer', motionDemoTabSelect: 'Vælg noter', motionDemoTabReport: 'Rapport og deling', motionDemoCounterTitle: 'Fremdriftslinjen følger tælleren', motionDemoCounterBody: 'Rækketallet og den tilknyttede placering i opskriften holdes synkroniseret.', motionDemoCounterAlt: 'En tæller går fra række 24 til række 25', motionDemoPatternFile: 'Efterårstrøje opskrift.pdf', motionDemoCurrentRow: 'Nuværende placering', motionDemoMainCounter: 'Hovedtæller', motionDemoRowUnit: 'rækker', motionDemoSelectTitle: 'Flyt noter samlet', motionDemoSelectBody: 'Pen, overstregning og tekst bevarer afstanden, når de flyttes sammen.', motionDemoSelectAlt: 'Vælg og flyt noter på et diagram', motionDemoSelectHint: 'Vælg område · flyt samlet', motionDemoReportTitle: 'Gem en note og se forhåndsvisningen', motionDemoReportBody: 'Se, hvordan noten gemmes og vises i en forhåndsvisning til deling.', motionDemoReportAlt: 'Gem og del en rapportnote', motionDemoReportSection: 'Strikkerapport · Note', motionDemoEditing: 'Redigerer', motionDemoSaved: 'Gemt', motionDemoNote: 'Strikkede tre rækker mere på kroppen og tog tre ind på ærmet', motionDemoSharePreview: 'Forhåndsvisning', motionDemoShareTitle: 'Efterårstrøje', motionDemoShareBody: 'Færdiggjort række for række.', motionDemoPlay: 'Afspil demo', motionDemoPause: 'Sæt demo på pause', motionDemoReplay: 'Afspil demo igen', motionDemoReady: 'Klar', motionDemoStepOne: 'Markér din placering', motionDemoStepTwo: 'Gå til næste række', motionDemoSelectStepOne: 'Vælg noter', motionDemoSelectStepTwo: 'Flyt de valgte noter', motionDemoReportStepOne: 'Skriv en note', motionDemoReportStepTwo: 'Gem og se forhåndsvisning' },
  nb: { motionDemoKicker: 'Slik foregår arbeidet', motionDemoEyebrow: 'Prøv en kort forhåndsvisning', motionDemoTitle: 'Små endringer viser neste trinn.', motionDemoLead: 'Se teller, valg av merknader og deling av rapporter. Forhåndsvisningen bruker ikke arbeidsdataene dine.', motionDemoTabsLabel: 'Velg demo', motionDemoTabCounter: 'Teller og tidtaker', motionDemoTabSelect: 'Velg merknader', motionDemoTabReport: 'Rapport og deling', motionDemoCounterTitle: 'Fremdriftslinjen følger telleren', motionDemoCounterBody: 'Radnummeret og den tilknyttede plasseringen i mønsteret holdes synkronisert.', motionDemoCounterAlt: 'En teller går fra rad 24 til rad 25', motionDemoPatternFile: 'Høstgenser mønster.pdf', motionDemoCurrentRow: 'Nåværende plassering', motionDemoMainCounter: 'Hovedteller', motionDemoRowUnit: 'rader', motionDemoSelectTitle: 'Flytt merknader samlet', motionDemoSelectBody: 'Penn, markering og tekst beholder avstanden når de flyttes sammen.', motionDemoSelectAlt: 'Velg og flytt merknader på et diagram', motionDemoSelectHint: 'Velg område · flytt samlet', motionDemoReportTitle: 'Lagre en merknad og se forhåndsvisningen', motionDemoReportBody: 'Se hvordan merknaden lagres og vises i en forhåndsvisning for deling.', motionDemoReportAlt: 'Lagre og del en rapportmerknad', motionDemoReportSection: 'Strikkerapport · Merknad', motionDemoEditing: 'Redigerer', motionDemoSaved: 'Lagret', motionDemoNote: 'Strikket tre rader til på bolen og felte tre masker på ermet', motionDemoSharePreview: 'Forhåndsvisning', motionDemoShareTitle: 'Høstgenser', motionDemoShareBody: 'Ferdig rad for rad.', motionDemoPlay: 'Spill av demo', motionDemoPause: 'Sett demo på pause', motionDemoReplay: 'Spill av demo på nytt', motionDemoReady: 'Klar', motionDemoStepOne: 'Marker plasseringen', motionDemoStepTwo: 'Gå til neste rad', motionDemoSelectStepOne: 'Velg merknader', motionDemoSelectStepTwo: 'Flytt de valgte merknadene', motionDemoReportStepOne: 'Skriv en merknad', motionDemoReportStepTwo: 'Lagre og forhåndsvis deling' },
  fi: { motionDemoKicker: 'Näin työ etenee', motionDemoEyebrow: 'Kokeile lyhyttä esittelyä', motionDemoTitle: 'Pienet muutokset näyttävät seuraavan vaiheen.', motionDemoLead: 'Tutustu laskuriin, merkintöjen valintaan ja raportin jakamiseen. Esittely ei käytä työtietojasi.', motionDemoTabsLabel: 'Valitse esittely', motionDemoTabCounter: 'Laskuri ja ajastin', motionDemoTabSelect: 'Valitse merkinnät', motionDemoTabReport: 'Raportti ja jakaminen', motionDemoCounterTitle: 'Edistymisviiva seuraa laskuria', motionDemoCounterBody: 'Kerrosluku ja neuleohjeeseen yhdistetty kohta pysyvät synkronissa.', motionDemoCounterAlt: 'Laskuri siirtyy kerroksesta 24 kerrokseen 25', motionDemoPatternFile: 'Syksyinen neuleohje.pdf', motionDemoCurrentRow: 'Nykyinen työkohta', motionDemoMainCounter: 'Päälaskuri', motionDemoRowUnit: 'kerrosta', motionDemoSelectTitle: 'Siirrä merkintöjä yhdessä', motionDemoSelectBody: 'Kynä, korostus ja teksti säilyttävät välinsä siirron aikana.', motionDemoSelectAlt: 'Valitse ja siirrä kaavion merkintöjä', motionDemoSelectHint: 'Valitse alue · siirrä yhdessä', motionDemoReportTitle: 'Tallenna muistiinpano ja esikatsele jakoa', motionDemoReportBody: 'Katso, kuinka muistiinpano tallentuu ja näkyy jakamisen esikatselussa.', motionDemoReportAlt: 'Raportin muistiinpanon tallennus ja jakaminen', motionDemoReportSection: 'Neuleraportti · Muistiinpano', motionDemoEditing: 'Muokataan', motionDemoSaved: 'Tallennettu', motionDemoNote: 'Neuloin miehustaan kolme kerrosta lisää ja kavensin hihasta kolme', motionDemoSharePreview: 'Jakamisen esikatselu', motionDemoShareTitle: 'Syksyinen neule', motionDemoShareBody: 'Valmis kerros kerrallaan.', motionDemoPlay: 'Toista esittely', motionDemoPause: 'Keskeytä esittely', motionDemoReplay: 'Toista esittely uudelleen', motionDemoReady: 'Valmis', motionDemoStepOne: 'Merkitse työkohta', motionDemoStepTwo: 'Siirry seuraavaan kerrokseen', motionDemoSelectStepOne: 'Valitse merkinnät', motionDemoSelectStepTwo: 'Siirrä valitut merkinnät', motionDemoReportStepOne: 'Kirjoita muistiinpano', motionDemoReportStepTwo: 'Tallenna ja esikatsele jakoa' },
}

const motionDemoStepLabels = {
  ko: '다음 단계', en: 'Next step', ja: '次のステップ', de: 'Nächster Schritt',
  da: 'Næste trin', nb: 'Neste trinn', fi: 'Seuraava vaihe',
}

const homepageCopyOverrides = {
  ko: { coffeeLink: '커피 한 잔 후원하기', contactEmailLabel: '문의' },
  en: { coffeeLink: 'Buy me a coffee', contactEmailLabel: 'Contact' },
  ja: { coffeeLink: 'コーヒーで応援する', contactEmailLabel: 'お問い合わせ' },
  de: { coffeeLink: 'Spendier mir einen Kaffee', contactEmailLabel: 'Kontakt' },
  da: { coffeeLink: 'Giv en kop kaffe', contactEmailLabel: 'Kontakt' },
  nb: { coffeeLink: 'Kjøp meg en kaffe', contactEmailLabel: 'Kontakt' },
  fi: { coffeeLink: 'Tarjoa minulle kahvi', contactEmailLabel: 'Yhteystiedot' },
}
for (const [locale, dictionary] of Object.entries(messages)) {
  Object.assign(dictionary, window.pageMessages[locale], motionDemoMessages[locale], homepageCopyOverrides[locale])
}
const supported = new Set(Object.keys(messages))
const preferenceKey = 'doanbogo.homepage.language.v1'
const routeKeys = {
  about: ['navAbout', 'aboutLead', 'about-title'],
  guide: ['navGuide', 'guideLead', 'guide-title'],
  features: ['navFeatureGuide', 'featuresLead', 'features-page-title'],
  faq: ['navFaqPage', 'faqPageLead', 'faq-page-title'],
  terms: ['navTerms', 'legalDraftNote', 'terms-title'],
  privacy: ['navPrivacy', 'legalDraftNote', 'privacy-title'],
}
let activeRoute = null

function deviceLanguage() {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const candidate of candidates) {
    const language = String(candidate || '').toLowerCase().replace('_', '-').split('-')[0]
    if (language === 'no') return 'nb'
    if (supported.has(language)) return language
  }
  return 'ko'
}

function savedPreference() {
  try {
    const value = localStorage.getItem(preferenceKey)
    return value === 'auto' || supported.has(value) ? value : 'auto'
  } catch {
    return 'auto'
  }
}

function applyLanguage(preference, focusHeading = false) {
  const locale = preference === 'auto' ? deviceLanguage() : preference
  const dictionary = messages[locale] || messages.ko
  document.documentElement.lang = locale
  document.title = dictionary.pageTitle
  document.querySelector('meta[name="description"]').content = dictionary.description
  document.querySelector('meta[property="og:title"]').content = dictionary.pageTitle
  document.querySelector('meta[property="og:description"]').content = dictionary.description

  for (const element of document.querySelectorAll('[data-i18n]')) {
    const message = dictionary[element.dataset.i18n]
    if (typeof message === 'string') {
      if (message.includes('\n')) {
        const lines = message.split('\n').map((line) => {
          const span = document.createElement('span')
          span.className = 'homepage-title-line'
          span.textContent = line
          return span
        })
        element.replaceChildren(...lines)
        element.setAttribute('aria-label', message.replace(/\n/g, ' '))
      } else {
        element.textContent = message
      }
    }
  }
  for (const element of document.querySelectorAll('[data-i18n-alt]')) {
    const message = dictionary[element.dataset.i18nAlt]
    if (typeof message === 'string') element.alt = message
  }
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) {
    const message = dictionary[element.dataset.i18nAriaLabel]
    if (typeof message === 'string') element.setAttribute('aria-label', message)
  }
  for (const select of document.querySelectorAll('.language-picker select')) select.value = preference
  const toggle = document.querySelector('.menu-toggle')
  toggle.setAttribute('aria-label', toggle.getAttribute('aria-expanded') === 'true' ? dictionary.menuClose : dictionary.menuOpen)
  const appUrl = document.querySelector('meta[name="knitpeek-app-url"]').content
  for (const link of document.querySelectorAll('[data-app-route]')) {
    const target = new URL(appUrl, window.location.href)
    target.searchParams.set('lang', preference)
    target.hash = link.dataset.appRoute
    link.href = target.href
  }
  renderRoute(focusHeading)
}

function renderRoute(focusHeading) {
  const match = window.location.hash.match(/^#page\/([^/?#]+)$/)
  let route = match?.[1] || null
  if (route && !routeKeys[route]) {
    window.history.replaceState(null, '', '#top')
    route = null
  }
  const routePage = route ? routeKeys[route] : null
  const locale = document.documentElement.lang
  const pageDictionary = window.pageMessages[locale]
  document.getElementById('home-content').hidden = Boolean(route)
  for (const page of document.querySelectorAll('[data-info-page]')) page.hidden = page.dataset.infoPage !== route
  if (route === 'terms' || route === 'privacy') {
    const source = document.getElementById(`legal-${route}-${locale}`)
    const target = document.querySelector(`[data-legal-document="${route}"]`)
    if (source && target) target.innerHTML = source.innerHTML
  }
  if (routePage) {
    const pageTitle = `${pageDictionary[routePage[0]]} | ${locale === 'ko' ? '니트피크' : 'KnitPeek'}`
    document.title = pageTitle
    document.querySelector('meta[name="description"]').content = pageDictionary[routePage[1]]
    document.querySelector('meta[property="og:title"]').content = pageTitle
    document.querySelector('meta[property="og:description"]').content = pageDictionary[routePage[1]]
  } else {
    const dictionary = messages[locale] || messages.ko
    document.title = dictionary.pageTitle
    document.querySelector('meta[name="description"]').content = dictionary.description
    document.querySelector('meta[property="og:title"]').content = dictionary.pageTitle
    document.querySelector('meta[property="og:description"]').content = dictionary.description
  }
  if (focusHeading && route !== activeRoute) {
    const homeSection = !route && ['features', 'faq'].includes(window.location.hash.slice(1))
    const sectionHeading = { features: 'feature-title', faq: 'faq-title' }[window.location.hash.slice(1)]
    document.getElementById(routePage?.[2] || (homeSection ? sectionHeading : 'hero-title')).focus()
    if (homeSection) document.getElementById(window.location.hash.slice(1)).scrollIntoView({ block: 'start' })
    else window.scrollTo(0, 0)
  }
  activeRoute = route
}

let preference = savedPreference()
applyLanguage(preference, /^#page\/(about|guide|features|faq|terms|privacy)$/.test(window.location.hash))
document.querySelectorAll('.language-picker select').forEach((select) => {
  select.addEventListener('change', () => {
    preference = select.value === 'auto' || supported.has(select.value) ? select.value : 'auto'
    try { localStorage.setItem(preferenceKey, preference) } catch { /* Language selection still works for this visit. */ }
    applyLanguage(preference)
  })
})

window.addEventListener('hashchange', () => {
  const routeMatch = window.location.hash.match(/^#page\/([^/?#]+)$/)
  const shouldFocus = Boolean(routeMatch && routeKeys[routeMatch[1]]) || Boolean(activeRoute && (!routeMatch || !routeKeys[routeMatch[1]]))
  setMenu(false, true)
  renderRoute(shouldFocus)
})

const menuButton = document.querySelector('.menu-toggle')
const mobileMenu = document.getElementById('mobile-menu')
let menuCloseTimer
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const mobileLayout = window.matchMedia('(max-width: 960px)')
function setMenu(opening, instant = false, returnFocus = false) {
  clearTimeout(menuCloseTimer)
  mobileMenu.toggleAttribute('data-instant', instant || reducedMotion.matches)
  if (!opening && (returnFocus || mobileMenu.contains(document.activeElement))) {
    if (mobileLayout.matches) menuButton.focus()
    else document.querySelector('.brand').focus()
  }
  menuButton.setAttribute('aria-expanded', String(opening))
  const locale = document.documentElement.lang
  menuButton.setAttribute('aria-label', messages[locale][opening ? 'menuClose' : 'menuOpen'])
  mobileMenu.inert = !opening
  mobileMenu.setAttribute('aria-hidden', String(!opening))
  if (opening) {
    mobileMenu.hidden = false
    // Establish the starting style once; CSS transitions then handle interruption.
    mobileMenu.getBoundingClientRect()
    mobileMenu.classList.add('is-open')
  } else {
    mobileMenu.classList.remove('is-open')
    if (instant || reducedMotion.matches) mobileMenu.hidden = true
    else menuCloseTimer = setTimeout(() => { mobileMenu.hidden = true }, 180)
  }
}
menuButton.addEventListener('click', (event) => {
  setMenu(menuButton.getAttribute('aria-expanded') !== 'true', event.detail === 0)
})
mobileMenu.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenu(false, event.detail === 0)
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') setMenu(false, true, true)
})
mobileLayout.addEventListener('change', () => {
  if (!mobileLayout.matches) setMenu(false, true, true)
})
document.getElementById('year').textContent = String(new Date().getFullYear())

let screenWakeLock = null
let screenWakeLockRequesting = false
let screenWakeLockRequestAgain = false
async function requestScreenWakeLock() {
  if (document.visibilityState !== 'visible' || !('wakeLock' in navigator) || (screenWakeLock && !screenWakeLock.released)) return
  if (screenWakeLockRequesting) {
    screenWakeLockRequestAgain = true
    return
  }
  screenWakeLockRequesting = true
  try {
    const sentinel = await navigator.wakeLock.request('screen')
    screenWakeLock = sentinel
    sentinel.addEventListener('release', () => {
      if (screenWakeLock === sentinel) screenWakeLock = null
    }, { once: true })
  } catch {
    // The browser or operating system may deny a screen wake lock.
  } finally {
    screenWakeLockRequesting = false
    if (screenWakeLockRequestAgain) {
      screenWakeLockRequestAgain = false
      void requestScreenWakeLock()
    }
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void requestScreenWakeLock()
})
void requestScreenWakeLock()

function initializeMotionDemos(motionDemoRoot) {
  if (!motionDemoRoot || typeof motionDemoRoot.querySelectorAll !== 'function' || typeof motionDemoRoot.querySelector !== 'function' || typeof motionDemoRoot.addEventListener !== 'function' || typeof document.addEventListener !== 'function' || typeof window.matchMedia !== 'function') return
  const motionTabs = Array.from(motionDemoRoot.querySelectorAll('[data-motion-tab]') || [])
  const motionPanels = Array.from(motionDemoRoot.querySelectorAll('[data-motion-panel]') || [])
  const playButton = motionDemoRoot.querySelector('[data-motion-action="play"]')
  const pauseButton = motionDemoRoot.querySelector('[data-motion-action="pause"]')
  const replayButton = motionDemoRoot.querySelector('[data-motion-action="replay"]')
  const stepLabel = motionDemoRoot.querySelector('[data-motion-step-label]')
  const announcement = motionDemoRoot.querySelector('[data-motion-announcement]')
  const controls = [playButton, pauseButton, replayButton]
  if (motionTabs.length !== 3 || motionPanels.length !== 3 || motionTabs.some((tab) => !tab || typeof tab.addEventListener !== 'function') || motionPanels.some((panel) => !panel || typeof panel.querySelector !== 'function') || controls.some((control) => !control || typeof control.addEventListener !== 'function') || !stepLabel || !announcement) return
  const counterPanel = motionPanels.find((panel) => panel.dataset.motionPanel === 'counter')
  const reportPanel = motionPanels.find((panel) => panel.dataset.motionPanel === 'report')
  const reportStatus = reportPanel?.querySelector('[data-motion-status]')
  if (!motionPanels.every((panel) => panel.querySelector('[data-scene]')) || !counterPanel?.querySelector('[data-motion-value]') || !counterPanel.querySelector('.motion-scene-clock') || !reportPanel?.querySelector('[data-motion-note]') || !reportStatus?.querySelector('[data-i18n]')) return
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let selectedDemo = 'counter'
  let currentStep = 0
  let playbackTimer = 0
  let running = false
  let visible = false
  let autoStarted = false
  let pausedForVisibility = false
  motionDemoRoot.dataset.motionVisible = 'false'
  motionDemoRoot.dataset.activeDemo = selectedDemo

  function demoText(key) {
    const locale = document.documentElement.lang || 'ko'
    if (key === 'motionDemoNextStep') return motionDemoStepLabels[locale] || motionDemoStepLabels.ko
    return motionDemoMessages[locale]?.[key] || motionDemoMessages.ko[key] || ''
  }

  function renderDemoStep(step) {
    currentStep = Math.max(0, Math.min(2, step))
    const panel = motionPanels.find((item) => item.dataset.motionPanel === selectedDemo)
    const scene = panel?.querySelector('[data-scene]')
    if (!panel || !scene) return
    scene.dataset.step = String(currentStep)
    if (selectedDemo === 'counter') {
      panel.querySelector('[data-motion-value]').textContent = currentStep === 0 ? '24' : '25'
      panel.querySelector('.motion-scene-clock').textContent = currentStep === 2 ? '00:12:09' : '00:12:08'
    } else if (selectedDemo === 'report') {
      panel.querySelector('[data-motion-note]').textContent = currentStep === 0 ? '' : demoText('motionDemoNote')
      const status = panel.querySelector('[data-motion-status]')
      status.dataset.status = currentStep === 2 ? 'saved' : 'editing'
      status.querySelector('[data-i18n]').textContent = demoText(currentStep === 2 ? 'motionDemoSaved' : 'motionDemoEditing')
    }
    const stepKey = currentStep === 0 ? 'motionDemoReady' : selectedDemo === 'counter'
      ? currentStep === 1 ? 'motionDemoStepOne' : 'motionDemoStepTwo'
      : selectedDemo === 'select'
        ? currentStep === 1 ? 'motionDemoSelectStepOne' : 'motionDemoSelectStepTwo'
        : currentStep === 1 ? 'motionDemoReportStepOne' : 'motionDemoReportStepTwo'
    const message = demoText(stepKey)
    stepLabel.textContent = message
    announcement.textContent = message
  }

  function updatePlaybackControls() {
    const canAdvance = !prefersReducedMotion.matches || currentStep < 2
    const playLabel = demoText(prefersReducedMotion.matches ? 'motionDemoNextStep' : 'motionDemoPlay')
    playButton.textContent = playLabel
    playButton.setAttribute('aria-label', playLabel)
    playButton.disabled = running || !canAdvance
    pauseButton.disabled = !running
    replayButton.disabled = false
  }

  function pauseDemo(preserveResume = false) {
    if (playbackTimer) window.clearTimeout(playbackTimer)
    playbackTimer = 0
    if (preserveResume && running) pausedForVisibility = true
    running = false
    updatePlaybackControls()
  }

  function scheduleNextStep() {
    playbackTimer = window.setTimeout(() => {
      playbackTimer = 0
      if (!running || !visible || document.visibilityState !== 'visible') {
        pauseDemo(true)
        return
      }
      if (currentStep >= 2) {
        running = false
        updatePlaybackControls()
        return
      }
      renderDemoStep(currentStep + 1)
      scheduleNextStep()
    }, 1250)
  }

  function playDemo() {
    if (running || !visible || document.visibilityState !== 'visible') return
    if (prefersReducedMotion.matches) {
      if (currentStep >= 2) return
      renderDemoStep(currentStep + 1)
      updatePlaybackControls()
      return
    }
    if (currentStep >= 2) renderDemoStep(0)
    running = true
    pausedForVisibility = false
    renderDemoStep(currentStep + 1)
    updatePlaybackControls()
    scheduleNextStep()
  }

  function resetDemo() {
    pauseDemo()
    renderDemoStep(0)
    updatePlaybackControls()
  }

  function selectDemo(name, focus = false) {
    pauseDemo()
    selectedDemo = name
    motionDemoRoot.dataset.activeDemo = name
    currentStep = 0
    for (const tab of motionTabs) {
      const active = tab.dataset.motionTab === name
      tab.setAttribute('aria-selected', String(active))
      tab.tabIndex = active ? 0 : -1
      if (focus && active) tab.focus()
    }
    for (const panel of motionPanels) {
      const active = panel.dataset.motionPanel === name
      panel.hidden = !active
      panel.setAttribute('aria-hidden', String(!active))
    }
    renderDemoStep(0)
    updatePlaybackControls()
    if (visible && !prefersReducedMotion.matches && autoStarted) playDemo()
  }

  for (const tab of motionTabs) {
    tab.addEventListener('click', () => selectDemo(tab.dataset.motionTab))
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const index = motionTabs.indexOf(tab)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? motionTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : motionTabs.length - 1)) % motionTabs.length
      selectDemo(motionTabs[next].dataset.motionTab, true)
    })
  }
  playButton.addEventListener('click', playDemo)
  pauseButton.addEventListener('click', () => pauseDemo())
  replayButton.addEventListener('click', () => { resetDemo(); if (!prefersReducedMotion.matches && visible) playDemo() })
  motionDemoRoot.addEventListener('keydown', (event) => { if (event.key === 'Escape' && running) pauseDemo() })
  document.querySelectorAll('.language-picker select').forEach((select) => {
    select.addEventListener('change', () => {
      renderDemoStep(currentStep)
      updatePlaybackControls()
    })
  })

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.25)
      motionDemoRoot.dataset.motionVisible = String(visible)
      if (!visible) {
        pauseDemo(true)
        return
      }
      if (!autoStarted && !prefersReducedMotion.matches) {
        autoStarted = true
        playDemo()
      } else if (pausedForVisibility && !prefersReducedMotion.matches) {
        pausedForVisibility = false
        playDemo()
      }
    }, { threshold: [0, 0.25, 0.5] })
    observer.observe(motionDemoRoot)
  } else {
    visible = true
    motionDemoRoot.dataset.motionVisible = 'true'
    autoStarted = true
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') pauseDemo(true)
    else if (visible && pausedForVisibility && !prefersReducedMotion.matches) { pausedForVisibility = false; playDemo() }
  })
  prefersReducedMotion.addEventListener('change', () => {
    if (prefersReducedMotion.matches) pauseDemo()
    else if (visible && !autoStarted) { autoStarted = true; playDemo() }
  })
  renderDemoStep(0)
  updatePlaybackControls()
}
initializeMotionDemos(document.querySelector('[data-motion-demos]'))
