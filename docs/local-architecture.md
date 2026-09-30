# Architektura lokálního režimu

## Tok dokumentu

**Prohlížeč s PDF → extrakce textu stránky → soukromý vstup Velínu → lokální PDF server → Codex agent → překlad nebo shrnutí → panel čtečky.** Dokumentové podklady nejdou do SecondBrainu automaticky. Do paměti projektu ukládáme architekturu a rozhodnutí, nikoli obsah každé čtené knihy.

React čtečka a její původní funkce zůstávají v repozitáři. PDF.js worker se bundluje lokálně, ne z cizí CDN. Nová cesta server/src/local.ts běží jen na loopback adrese. Vstup zajišťuje přesně směrovaná proxy dashboardu; server vyžaduje vlastní instalační tajemství, které neodchází do prohlížeče.

## Dvě různé identity

Oprávnění vstoupit do aplikace vychází z přístupu do soukromého Velínu. To je hranice tohoto interního pilotu, nikoli obecné víceuživatelské přihlášení. Browser dostává náhodnou relaci v sessionStorage na osm hodin; server ověřuje relaci a umí ji odvolat. Identita není převzatá z textu či ID v požadavku. Relace nesmí nahradit ochranu proti XSS; pro externí provoz je třeba navrhnout vlastní účty a vhodnou cookie politiku.

Modelové oprávnění je již existující osobní ChatGPT/Codex přihlášení vlastníka na hostiteli. Nepoužíváme OpenAI login jako univerzální SSO pro naši aplikaci. Budoucí režim s účtem každého uživatele vyžaduje oddělené hostované Codex relace a úložiště přihlašování; nyní není implementovaný. Princip oddělení jsme převzali z technické varianty L1, nikoli zákaznické whitelisty nebo data.

## Agent na vyžádání

server/src/localAgent.ts spouští skutečný Codex exec pro zadanou stránku či shrnutí. Má pevné zadání, oddělený dočasný adresář, strukturovaný výstup a vypnuté nástroje/MCP/pluginy i uživatelskou konfiguraci. Text knihy je nedůvěryhodný obsah k překladu, nikoli instrukce ke spouštění příkazů. Přihlašovací tokeny nečteme do aplikace a nekopírujeme do kontextu modelu. Prostředí procesu neobsahuje API klíče; žádný placený API fallback se nespouští.

Běh má časový limit, omezenou velikost vstupu a výstupu, jeden současný proces a denní kvótu. Při zrušení spojení se ukončí procesová skupina. Paměťová cache je oddělená podle browserové relace a nejvýše 40 výsledků. Nejde o trvalý konverzační agent ani nepřetržitě běžící model.

## Data a provoz

PDF zůstává v prohlížeči; vybraný text a zadání odchází do modelové služby podle podmínek účtu. Dočasný lokální vstup/výstup se odstraňuje po běhu. Perzistentní provozní evidence drží den, počty pokusů, dokončení, chyb a cache hitů, bez textu dokumentu. Restart zneplatní browserové relace a ztratí cache. Není automaticky obnoven rozpracovaný překlad.

Toto je soukromá jednouživatelská integrace. Izolace OS identity, veřejný ingress, více tenantů, retence provideru a nezávislé bezpečnostní ověření patří před jakékoli zpřístupnění dalším lidem.

## Oficiální podklady

- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)

Dokumentace potvrzuje modelové přihlášení a integrační rozhraní; sama nepotvrzuje nárok provozovat veřejnou překladovou službu přes osobní účet.
