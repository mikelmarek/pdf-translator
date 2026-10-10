# Jak začít

1. Otevři aplikaci z projektové stránky na soukromém dashboardu.
2. Počkej na ověření stávajícího přihlášení Codexu a klikni **Otevřít můj Translator**.
3. Vyber PDF a počkej na načtení textu stránky. Zvol cílový jazyk a stiskni modré tlačítko **Přeložit stránku 1** (číslo odpovídá otevřené stránce). Záložka **Výsledek překladu** pouze zobrazuje výsledek; sama překlad nespouští.
4. Vyčkej na dokončení agenta. Uvidíš zprávu o probíhajícím překladu; dokončení může trvat několik minut. Originál je na počítači vlevo, výsledek vpravo. Na telefonu jsou panely pod sebou. Výsledek přijde po dokončení celé stránky. Během práce je změna PDF, stránky i cílového jazyka zablokovaná; nejprve práci dokonči nebo zastav.
5. Pro poznámky a shrnutí použij stávající ovládání panelu. Delší rozsah rozděl, pokud překročí limit vstupu.

## Přihlášení není API klíč

Vstup do aplikace navazuje na soukromý Velín. Relace čtečky má omezenou platnost a odhlášením ji server zruší. Modelové přihlášení je zvlášť: oficiální Codex přihlášení přes ChatGPT na Macu. Pokud aplikace hlásí nepřipojený účet, dokonči přihlášení v Codexu a obnov stránku; tokeny nikdy nevkládej do formuláře ani chatu.

## Limity a chyby

Najednou běží jeden modelový požadavek. Další dostane zprávu, že agent pracuje. Limit je 60 pokusů za pražský kalendářní den, vstup nejvýše 24 000 znaků a jeden běh nejvýše čtyři minuty. Také neúspěšný pokus se počítá. Limit osobního Codex účtu může dojít dříve.

Stejný požadavek v jedné relaci může použít krátkodobou cache. Po odhlášení, restartu služby nebo vypršení relace se cache nezachovává. Originální PDF si uchovej; prohlížeč není záloha dokumentu. Ztracené spojení se nemá tvářit jako dokončený překlad a automaticky se neopakuje.

Chyba načtení PDF, vypršení relace i přerušený překlad mají viditelnou zprávu. Pokud stránka neobsahuje čitelný text, překlad se nespustí: tato verze nedělá OCR obrázkových skenů. Po aktualizaci aplikace obnov stránku a PDF vyber znovu; výběr dokumentu žije pouze v prohlížeči.


## Struktura překladu a uložení

Od 7. 10. 2026 se stránka čte podle polohy textu v PDF. Odrážkové značky, jejich vnoření, odsazení, rozestupy a velikost písma zůstávají v prohlížeči. Agent dostává očíslované textové bloky a vrací pouze jejich překlady. Aplikace kontroluje, že žádný blok nechybí, nepřebývá ani není duplicitní. Při nesouladu ukáže chybu místo neúplného dokumentu.

**Uložit** otevře tiskový náhled se stejnými bloky jako na obrazovce. V systémovém tisku vyber **Uložit jako PDF**. Překlad rozsahu je pod ozubeným kolečkem a používá stejné formátování. Originální PDF se nepřepisuje. Tlačítka jsou kompaktnější, na dotykovém zařízení si zachovávají větší zásahovou plochu.

Jde o zachování textové struktury s přirozeným zalamováním delšího českého textu, nikoli o přepsání původní PDF sazby. Obrázky, grafické rámečky, složité tabulky a sloupce se v pravém panelu zatím nereprodukují přesně; originál zůstává dostupný v levém panelu. U neobvyklé sazby vždy porovnej pořadí a členění s originálem.
