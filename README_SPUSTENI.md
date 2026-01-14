# PDF Překladač - Kompletní průvodce

## 🚀 Rychlé spuštění (doporučené)

```bash
cd "/Users/marekmikel/Desktop/PROJEKTY/Překladač"
./start.sh
```

## 📋 Co aplikace umí

- **PDF prohlížení** - Načte PDF a zobrazí stránky vlevo
- **Inteligentní překlad** - Přeloží aktuální stránku do různých jazyků
- **Streaming překlad** - Vidíte překlad postupně jak se tvoří
- **Smart cache** - Neplatí dvakrát za stejný překlad
- **Scrollování** - Dlouhé překlady se scrollují
- **PDF export** - Uloží překlad jako krásně naformátovaný PDF
- **10 jazyků** - Čeština, angličtina, němčina, francouzština, španělština...

## ⚡ Ruční spuštění (pokud skript nefunguje)

### Terminal 1 - Backend:
```bash
cd "/Users/marekmikel/Desktop/PROJEKTY/Překladač/server"
npm run dev
```

### Terminal 2 - Frontend:
```bash
cd "/Users/marekmikel/Desktop/PROJEKTY/Překladač/client"  
npm run dev
```

## 🌐 Přístup k aplikaci

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001

## 🛠 Jak používat

1. Otevřete http://localhost:3000
2. Klikněte "Vybrat PDF" a načtěte soubor
3. Procházejte stránky pomocí ← →
4. Vyberte jazyk z rozbalovacího menu
5. Klikněte "Přeložit" (nezapomeňte - neplatíte za automatické překlady!)
6. Scrollujte dlouhými překlady
7. Klikněte "💾 Uložit" pro export do PDF

## 💰 Náklady

- **Automatické překládání je vypnuto** - šetří peníze
- **Cache systém** - jeden překlad = jedna platba
- **Force překlad** - tlačítko "Přeložit" vždy přeloží znovu
- **Model GPT-4o-mini** - levnější než GPT-4

## 🔧 Zastavení aplikace

- Stiskněte `Ctrl+C` v terminálu se skriptem
- Nebo zavřete oba terminály při ručním spuštění

## 🚨 Troubleshooting

Pokud máte problém s obsazenými porty:
```bash
# Zabijte procesy na portech
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
```

## 🏗 Technické detaily

- **Frontend**: React + TypeScript + Vite + PDF.js
- **Backend**: Node.js + Express + TypeScript + OpenAI API
- **Komunikace**: Server-Sent Events (SSE) pro streaming
- **Cache**: In-memory Map s hash klíči
- **Export**: HTML → PDF print dialog