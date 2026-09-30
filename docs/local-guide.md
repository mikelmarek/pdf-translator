# Jak začít

1. Otevři aplikaci z projektové stránky na soukromém dashboardu.
2. Počkej na ověření stávajícího přihlášení Codexu a klikni **Otevřít můj Translator**.
3. Vyber PDF, stránku a cílový jazyk. Překlad se spustí tvým pokynem, nikoli každým překliknutím stránky.
4. Vyčkej na dokončení agenta. Originál zůstává vlevo a překlad se zobrazí vpravo. Nový lokální režim vrací výsledek po dokončení stránky, neslibuje okamžitý překlad po jednotlivých tokenech.
5. Pro poznámky a shrnutí použij stávající ovládání panelu. Delší rozsah rozděl, pokud překročí limit vstupu.

## Přihlášení není API klíč

Vstup do aplikace navazuje na soukromý Velín. Relace čtečky má omezenou platnost a odhlášením ji server zruší. Modelové přihlášení je zvlášť: oficiální Codex přihlášení přes ChatGPT na Macu. Pokud aplikace hlásí nepřipojený účet, dokonči přihlášení v Codexu a obnov stránku; tokeny nikdy nevkládej do formuláře ani chatu.

## Limity a chyby

Najednou běží jeden modelový požadavek. Další dostane zprávu, že agent pracuje. Limit je 60 pokusů za pražský kalendářní den, vstup nejvýše 24 000 znaků a jeden běh nejvýše čtyři minuty. Také neúspěšný pokus se počítá. Limit osobního Codex účtu může dojít dříve.

Stejný požadavek v jedné relaci může použít krátkodobou cache. Po odhlášení, restartu služby nebo vypršení relace se cache nezachovává. Originální PDF si uchovej; prohlížeč není záloha dokumentu. Ztracené spojení se nemá tvářit jako dokončený překlad a automaticky se neopakuje.
