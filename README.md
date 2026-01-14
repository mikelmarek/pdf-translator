# PDF Překladač 🤖

AI-powered PDF translator with real-time streaming translation using OpenAI GPT-4o-mini.

## ✨ Features

- **PDF Viewer** - Load and view PDF documents with page navigation
- **Real-time Translation** - Stream AI translations as they're generated
- **Smart Caching** - Never pay twice for the same translation
- **Scrollable Results** - Long translations are scrollable
- **PDF Export** - Save translations as beautifully formatted PDFs
- **10 Languages** - Czech, English, German, French, Spanish, and more
- **Cost-Efficient** - Only translates on button click, not automatically
- **Password Protection** - Simple authentication for controlled access

## 🚀 Live Demo

[Visit the live application](https://pdf-translator-mikelmarek.vercel.app)

**Default password:** `prekladac2026`

## 🛠 Tech Stack

- **Frontend:** React + TypeScript + Vite + PDF.js
- **Backend:** Node.js + Express + TypeScript
- **AI:** OpenAI GPT-4o-mini API
- **Communication:** Server-Sent Events (SSE)
- **Deployment:** Vercel
- **Authentication:** Simple password protection

```
/
├── client/          # React + TypeScript frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── PDFViewer.tsx       # PDF prohlížení + navigace
│   │   │   └── TranslationPanel.tsx # Překladový panel + export
│   │   ├── services/
│   │   │   └── translationService.ts # SSE komunikace
│   │   ├── App.tsx                 # Hlavní layout
│   │   └── App.css                 # Styling
│   └── package.json
├── server/          # Node.js + Express backend
│   ├── src/
│   │   └── index.ts                # API server + OpenAI
│   ├── .env                        # OpenAI API klíč
│   └── package.json
├── start.sh         # Startup skript
└── README_SPUSTENI.md # Detailní návod
```

## 🔧 Technologie

### Frontend
- **React + TypeScript** - Moderní UI framework
- **PDF.js** - PDF renderování a text extrakce
- **SSE** - Server-Sent Events pro streaming
- **Vite** - Rychlý build tool s hot reload
- **Page-based triggers**: Překlad se spouští při změně stránky

### Backend
- **OpenAI GPT-4o-mini** - Levnější model pro překlady
- **Express + TypeScript** - RESTful API server
- **SSE streaming** - Postupné doručování překladu
- **Smart cache** - In-memory cache s hash klíči
- **CORS** - Správné nastavení pro frontend komunikaci

## 💰 Náklady a nastavení

⚠️ **DŮLEŽITÉ: OpenAI API je placené!** ⚠️

**Před použitím:**
1. **Vytvořit OpenAI účet**: https://platform.openai.com
2. **Přidat platební kartu**: https://platform.openai.com/settings/organization/billing
3. **Nabít kredit** (doporučeno $10-15 pro start)
4. **Získat API klíč**: https://platform.openai.com/api-keys

```bash
# Zkopíruj a uprav environment variables
cp server/.env.example server/.env

# Edituj server/.env a nastav SKUTEČNÝ API klíč:
OPENAI_API_KEY=sk-your-real-openai-api-key-here
PORT=3001
NODE_ENV=development
```

**💰 Orientační ceny (za 1 stránku PDF):**
- **GPT-4o-mini**: ~$0.002 (doporučeno - nejlepší poměr cena/výkon)
- **GPT-3.5-turbo**: ~$0.003 (levné, ale horší kvalita)
- **GPT-4**: ~$0.10 (nejkvalitnější, ale velmi drahé)

**Pro 90-stránkový dokument:** ~$0.20-1.00 (GPT-4o-mini/3.5) nebo ~$9 (GPT-4)

### 3. Spuštění aplikace
```bash
# Spustí současně backend (port 3001) a frontend (port 3000)
npm run dev
```

Aplikace bude dostupná na `http://localhost:3000`

## Použití

1. **Nahrání PDF**: Klikni na "Vybrat PDF" a vyber dokument
2. **Automatický překlad**: První stránka se automaticky přeloží
3. **Navigace**: Použij tlačítka "Předchozí/Další" pro změnu stránky
4. **Změna jazyka**: Vyber cílový jazyk v dropdown menu
5. **Streaming**: Sleduj průběžné zobrazování překladu v reálném čase

## Technické detaily

### PDF.js extrakce textu
```typescript
// Získání textu z PDF stránky
const textContent = await page.getTextContent();
const pageText = textContent.items
  .map(item => 'str' in item ? item.str : '')
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim();
```

### SSE Streaming komunikace
```typescript
// Frontend - přijímání stream dat
const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value, { stream: true });
  // Parsování SSE formátu: "data: {...}"
}
```

### Backend OpenAI streaming
```typescript
// Server-Sent Events response
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
});

// OpenAI stream processing
for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  res.write(`data: ${JSON.stringify({ content, isDone: false })}\n\n`);
}
```

### Cache mechanismus
```typescript
// Cache key: hash(pageText) + targetLanguage
const cacheKey = getCacheKey(pageText, targetLanguage);
const translationCache = new Map<string, string>();

// Rychlé vrácení cached výsledku přes SSE
if (translationCache.has(cacheKey)) {
  res.write(`data: ${JSON.stringify({ 
    content: cachedTranslation, 
    isDone: true 
  })}\n\n`);
}
```

## API Endpoints

- `POST /api/translate-stream`: SSE streaming překladů
- `GET /api/health`: Health check
- `GET /api/cache-status`: Stav cache
- `DELETE /api/cache`: Vymazání cache

## Podporované jazyky

- Čeština, English, Deutsch, Français, Español
- Italiano, Português, Русский, 中文, 日本語

## Produkční poznámky

- Nastav `NODE_ENV=production` pro produkci
- Používej HTTPS pro bezpečné API klíče
- Zvyš limit OpenAI API pro vyšší throughput
- Pro velké dokumenty zvač implementovat paginated cache