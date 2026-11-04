# KnitPeek Tietosuojakäytäntö

- Palvelu: **KnitPeek** (koreaksi **니트피크**)
- Verkkosivusto: **https://knitpeek.pages.dev**
- Voimaantulopäivä: **4. marraskuuta 2026**
- Rekisterinpitäjä / ylläpitäjä: **KnitPeek**
- Tietosuoja-asioiden yhteydenotot: **knitpeek.cs@gmail.com**

## 1. Yleiskatsaus

**KnitPeek** (”Ylläpitäjä”) kunnioittaa yksityisyyttäsi ja pyrkii noudattamaan sovellettavia tietosuojalakeja. KnitPeek on **local-first**-verkkosovellus neuleohjeiden katseluun ja henkilökohtaisten projektitietojen tallentamiseen.

Perustoiminnot eivät edellytä käyttäjätiliä. Tuodut PDF- ja valokuvaohjeet, projektit ja työtiedot tallennetaan selaimeesi. Niitä ei ladata KnitPeekin ylläpitämälle palvelimelle eikä synkronoida KnitPeek-tiliin. Tästä erillään Cloudflare voi käsitellä verkkosivuston pyyntötietoja KnitPeekin hosting-palvelun yhteydessä.

## 2. Tietoryhmät ja käyttötarkoitukset

| Ryhmä | Tiedot | Tarkoitus ja käsittelytapa |
| --- | --- | --- |
| Paikallisesti tallennetut projektitiedot | Tuodut PDF-tiedostot ja valokuvat, projektien nimet ja tunnisteet, kansikuvat, merkinnät, etenemisviivat, kaaviot, laskuri- ja ajastintiedot, raportit ja muistiinpanot | Katselu, muokkaus, palautus ja vienti selaintallennuksessa. Tuotuja tiedostoja ja työtietoja ei ladata KnitPeekin ylläpitämälle palvelimelle |
| Paikalliset asetukset | Kielivalinta, katselimen asetukset, projektin tila ja vastaavat | Asetusten muistaminen laitteellasi. Selaimen kieliasetusta voidaan käyttää käyttöliittymän aloituskielen valintaan |
| Verkkosivuston käyttötiedot (hosting-palvelu) | Kävijän IP-osoite, pyydetty URL ja aika, selain-/laite- sekä liikenteen reititystiedot | Cloudflare Pages voi käsitellä näitä tietoja sivuston toimittamiseksi ja suojaamiseksi. Lisätietoja on [Cloudflaren tietosuojakäytännössä](https://www.cloudflare.com/privacypolicy/). |
| Tukipyynnöt | Sähköpostiosoite, viesti ja lähettämäsi tiedot | Vastata yhteydenottoihin, käsitellä pyyntöjä ja niihin liittyviä valituksia |

**Tärkeää:** Vain laitteellesi tallennettu ohje tai muistiinpano voi sisältää henkilötietoja, mutta se ei tarkoita, että Ylläpitäjä vastaanottaa tai voi nähdä niiden sisällön. Itse viemäsi tai jakamasi tietoja voi käsitellä valitsemasi vastaanottaja.

## 3. Säilytysaika

1. **Paikalliset projektitiedot:** Tiedot voivat säilyä kyseisen laitteen ja selaimen tallennustilassa, kunnes poistat ne tai selain/laite lopettaa niiden säilyttämisen. Ylläpitäjällä ei ole erillistä käyttäjätiedostojen tietokantaa.
2. **Paikalliset asetukset:** Tiedot voivat säilyä selaimen tallennustilassa, kunnes ne poistetaan tai nollataan.
3. **Cloudflare Pagesin pyyntötiedot:** Cloudflare voi käsitellä IP-osoitteita, liikenteen reititystietoja, järjestelmäkokoonpanoa ja niihin liittyviä pyyntötietoja. Käsittely ja säilytys kuvataan [Cloudflaren tietosuojakäytännössä](https://www.cloudflare.com/privacypolicy/); KnitPeek ei määritä hosting-palvelun lokien säilytysaikaa.
4. **Tukipyynnöt:** Vapaaehtoisesti lähettämäsi sähköpostiosoite ja viesti säilytetään vain niin kauan kuin vastaaminen ja asian käsittely edellyttävät, minkä jälkeen ne poistetaan, ellei laki edellytä säilyttämistä.

## 3A. Oikeusperusteet Euroopan tietosuojalainsäädännön soveltuessa

Kun eurooppalaista tietosuojalainsäädäntöä sovelletaan, sähköpostikyselyyn vastaaminen perustuu tilanteeseen sopivaan oikeusperusteeseen, kuten käyttäjän pyyntöön vastaamiseen. Lain nojalla säilytettävät tiedot säilytetään vaaditun ajan.

## 4. Luovutukset, palveluntarjoajat ja kansainvälinen käsittely

1. KnitPeek ei lähetä tuotuja PDF- tai valokuvaohjeita eikä paikallisesti tallennettuja työtietoja KnitPeekin palvelimelle tai myy niitä mainostajille tai muille kolmansille osapuolille.
2. **Verkkosivuston hosting:** Sivusto toimitetaan Cloudflare Pagesin kautta. Pyyntöjen reitittämiseksi ja suojaamiseksi Cloudflare voi käsitellä IP-osoitteita, liikenteen reititystietoja, järjestelmäkokoonpanoa ja niihin liittyviä pyyntötietoja. Katso [Cloudflaren tietosuojakäytäntö](https://www.cloudflare.com/privacypolicy/).
3. Vain selaimeesi tallennettuja ohjeita ja työtietoja ei lähetetä KnitPeekille. Hosting-palvelun pyyntöjen käsittely on eri asia kuin paikallisten tiedostojesi sisältö.

4. Jos Ylläpitäjä ottaa käyttöön uusia henkilötietojen vastaanottajia, käsittelijöitä tai kansainvälisiä siirtoja, se antaa sovellettavan lain edellyttämät tiedot ja pyytää tarvittavat suostumukset.

## 5. Evästeet, selaintallennus ja vastaavat tekniikat

1. KnitPeek käyttää **selaintallennusta, kuten IndexedDB:tä**, projektien ja asetusten muistamiseen laitteellasi. Selaintallennus ei itsessään siirrä sisältöjä palvelimelle.
2. KnitPeek ei tällä hetkellä käytä kolmannen osapuolen seurantaevästeitä tai seurantaskriptejä mainontaan tai analytiikkaan. Kielivalinta ja palvelun asetukset tallennetaan selaimeen.
3. Voit poistaa tai rajoittaa evästeitä ja sivustotietoja selaimen asetuksissa. Tämä voi myös poistaa tallennetut ohjeet ja työtiedot. Varmista ensin, että tarvittavat alkuperäistiedostot ja viedyt raportit on säilytetty erikseen.
4. Paikalliset tiedot liittyvät verkkosivuston osoitteeseen ja selainprofiiliin, johon ne tallennettiin. Niitä ei jaeta tai siirretä automaattisesti toiseen osoitteeseen, selaimeen tai profiiliin. Tallenna tarvittavat tiedostot erikseen ennen sivustotietojen poistamista.

## 6. Vienti, jakaminen ja ulkoiset sivustot

1. Kun viet tai jaat asiakirjoja, raportteja tai projektitietoja, valitsemasi tiedot voivat siirtyä valitsemaasi tallennuspaikkaan tai jakopalveluun.
2. Kun avaat ulkoisen linkin, kuten sivuston Buy Me a Coffee -linkin tai ohjeen URL-osoitteen/QR-koodin, siirryt kolmannen osapuolen palveluun. Palvelu käsittelee käyttötietoja oman tietosuojakäytäntönsä mukaisesti.
3. Nämä ovat itse käynnistämiäsi toimia eivätkä tarkoita, että KnitPeek julkaisisi tai lähettäisi alkuperäiset ohjeesi automaattisesti.

## 7. Poistaminen

1. Voit poistaa paikallisia projektitietoja käytettävissä olevilla poistotoiminnoilla tai tyhjentämällä selaimen sivustotiedot. Erilliset varmuuskopiot on hallittava ja poistettava itse.
2. Jos Ylläpitäjä tosiasiassa säilyttää tukiviestejä tai muita henkilötietoja, tiedot poistetaan käyttötarkoituksen päätyttyä, jos lakisääteistä säilytysvelvollisuutta ei ole. Sähköiset tiedostot poistetaan menetelmällä, joka tekee palauttamisesta kohtuudella vaikeaa.
3. Cloudflare käsittelee ja poistaa hostingiin liittyvät pyyntötiedot omien käytäntöjensä ja menettelyjensä mukaisesti.

## 8. Oikeutesi ja niiden käyttäminen

1. Sovellettavan lain mukaan voit pyytää pääsyä Ylläpitäjän tosiasiallisesti käsittelemiin henkilötietoihin sekä niiden oikaisua, poistamista tai käsittelyn rajoittamista.
2. Lähetä henkilötietojen tarkastamista, korjaamista, poistamista tai käsittelyn rajoittamista koskevat pyynnöt ja niihin liittyvät valitukset KnitPeek-tiimille osoitteeseen knitpeek.cs@gmail.com. KnitPeek vastaa sovellettavan lain mukaisesti.
3. Jos projektitiedot ovat vain laitteellasi, Ylläpitäjä ei voi etänä nähdä, korjata, palauttaa tai poistaa niitä. Hallitse tietoja laitteellasi ja Palvelun paikallisilla toiminnoilla.
4. Jos EU/ETA-alueen GDPR:ää tai muuta tietosuojalakia sovelletaan, lisäoikeuksiin voivat kuulua tietojen siirrettävyys, vastustaminen, suostumuksen peruuttaminen ja valitus toimivaltaiselle tietosuojaviranomaiselle lain ehtojen mukaisesti.

## 9. Turvatoimet

1. Palvelu on suunniteltu käsittelemään tuodut ohjeet ja projektitiedot pääasiassa selaimessa, mikä vähentää tarpeetonta tiedonsiirtoa Ylläpitäjän hallitsemalle palvelimelle.
2. Sivuston toimittamiseen käytetään HTTPS-yhteyttä, jos se on tuettu ja määritetty.
3. Suojaa laitteesi, pidä selain ajan tasalla ja säilytä viedyt varmuuskopiot turvallisesti.
4. Paikallinen tallennus ei tarkoita automaattista salausta tai täyttä suojaa tietojen menetykseltä tai luvattomalta käytöltä.

## 10. Lasten yksityisyys

KnitPeek ei ole tarkoitettu yksinomaan tietylle ikäryhmälle. Dokumentoitu peruspalvelu ei luo käyttäjätilejä eikä kerää syntymäaikoja. Jos käyttöön otetaan lasten henkilötietoja käsitteleviä toimintoja, Ylläpitäjä toteuttaa sovellettavan lain edellyttämät huoltajan suostumukset ja muut suojatoimet.

## 11. Käytännön muutokset

Ylläpitäjä voi päivittää tätä käytäntöä, jos Palvelu tai tietojen käsittely muuttuu. Olennaisista muutoksista ja voimaantulopäivästä ilmoitetaan Palvelussa. Jos laki edellyttää lisäilmoitusta tai suostumusta, noudatetaan vaadittua menettelyä.

## 12. Voimaantulo

Tämä tietosuojakäytäntö on voimassa **4. marraskuuta 2026** alkaen.

---
