# Provoz a limity

Aplikaci spouští scripts/pdf-translator/start.sh v Runtime, tmux session pdf-translator-local. Běží na 127.0.0.1:4190, přes dashboard pouze pod /pdf-translator/app/. Původní Vercel deployment nebyl změněný ani přepublikovaný.

Instalační tajemství proxy je v Runtime state/pdf-translator/proxy.secret s právy 0600, mimo Git. Serverové souhrnné počty jsou v projektu state/local/usage.json. Dokumenty, modelové odpovědi a relace se do Git ani běžných logů neukládají.

## Spotřeba

Lokální režim nevolá placené GPT API. Čerpá limit osobního Codex účtu, takže nejde o neomezený nebo beznákladový provoz. Má dodatečný limit 60 modelových pokusů za den. Počty nejsou odhad ceny předplatného ani vyúčtování tokenů.

## Při chybě

Regresní browser kontrola: `tests/pdf-translator/browser-smoke.cjs` v Runtime. Standardní režim používá skutečný PDF.js a lokální přihlášení, ale nahrazuje modelové streamy; `--live` výslovně spotřebuje jeden modelový překlad titulní stránky sylabu. Ověření 7. 10. 2026: oba režimy PASS, desktop i simulovaný mobil bez přetečení a chyby souběžného renderu. Po sestavení frontendových souborů stačí obnovit stránku čtečky; restart backendu pro změnu klienta není nutný.

Pokud není účet připojený, přihlásit Codex oficiální cestou na Macu. Při limitu počkat na jeho obnovení. Při nepřítomnosti služby ověřit pouze její tmux session a konkrétní loopback port; nerestartovat ostatní agenty. Restart ztratí cache i relace, proto nepřerušovat běžící překlad bez důvodu. Po restartu znovu otevřít čtečku.

## Rozsah ochrany

Vnitřní dostupnost Velínu je oprávnění vlastníka, ne ověřená identita veřejného zákazníka. Nikomu neposílat jeho přístup ani adresu jako zákaznickou pozvánku. Instalační tajemství odděluje proxy od backendu, ale samo nezajišťuje izolaci celého Macu. Pro více uživatelů je nutná další etapa podle Architektury.


## Ověření struktury · 7. 10. 2026

`tests/pdf-translator/layout-contract.cjs` kontroluje vnoření, pokračování odrážek, zachování spojovníků, párování identifikátorů, odmítnutí neúplného výsledku a bezpečnost HTML/CSS exportu. `structure-smoke.cjs` ověřuje skutečnou stránku 14 sylabu CT-AI v1.0: 31 bloků, 7 hlavních a 13 vnořených odrážek, shodu tiskového náhledu, chybu při chybějícím bloku a desktop/mobil bez přetečení. Volba `--live` spotřebuje jeden skutečný překlad této stránky; 7. 10. prošla i tato kontrola. Screenshoty byly prohlédnuty. Původní browser smoke (neplatné PDF, prázdná stránka, přerušený stream, relace a sumarizace) také prošel.

PDF CTAL-TAE/65 stran z Markova screenshotu nebylo mezi místními podklady; ověření použilo dostupný 99stránkový CT-AI s obdobnými seznamy. Přesná sazba obrázků/tabulek/sloupců ani fyzický iPhone nejsou ověřenou funkcí. Backend byl jednou cíleně obnoven až po `busy=false`, stejným příkazem v tmux `pdf-translator-local`; health následně OK, lease odstraněna. Vercel verze překladače zůstala beze změny.
