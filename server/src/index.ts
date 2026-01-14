import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Simple cache for translations (page + language → translation)
interface CacheKey {
  pageText: string;
  targetLanguage: string;
}

const translationCache = new Map<string, string>();

// Generate cache key from page text and target language
function getCacheKey(pageText: string, targetLanguage: string): string {
  // Use hash of text content for more efficient cache keys
  const textHash = Buffer.from(pageText).toString('base64').slice(0, 32);
  return `${textHash}_${targetLanguage}`;
}

// SSE Translation endpoint with streaming
app.post('/api/translate-stream', async (req: Request, res: Response) => {
  const { pageText, targetLanguage, force = false } = req.body;

  console.log('🔄 Translation request received:', {
    targetLanguage,
    textLength: pageText?.length,
    hasText: !!pageText,
    force
  });

  if (!pageText || !targetLanguage) {
    console.error('❌ Missing required fields:', { pageText: !!pageText, targetLanguage: !!targetLanguage });
    return res.status(400).json({ error: 'Missing pageText or targetLanguage' });
  }

  const cacheKey = getCacheKey(pageText, targetLanguage);
  
  // Check cache first (unless force is true)
  if (!force && translationCache.has(cacheKey)) {
    console.log('💾 Cache HIT - returning cached translation');
    
    // Send cached result as a single SSE event
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    
    const cachedTranslation = translationCache.get(cacheKey);
    res.write(`data: ${JSON.stringify({ content: cachedTranslation, isDone: true })}\n\n`);
    res.end();
    return;
  }

  if (force && translationCache.has(cacheKey)) {
    console.log('🔄 FORCE translation - ignoring cache');
  } else {
    console.log('📦 Cache MISS - generating new translation');
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  // Check if we have a valid OpenAI API key
  const hasValidApiKey = process.env.OPENAI_API_KEY && 
                        process.env.OPENAI_API_KEY !== 'sk-your-openai-api-key-here' &&
                        process.env.OPENAI_API_KEY.startsWith('sk-');

  if (!hasValidApiKey) {
    console.log('🚫 No valid OpenAI API key found - using DEMO mode');
    
    // Demo mode - simulate streaming translation
    const demoTranslation = `
**DEMO PŘEKLAD** (${targetLanguage.toUpperCase()})

📄 **Simulovaný překlad stránky**

Toto je ukázkový překlad textu ze stránky PDF dokumentu. 

**Původní text byl:**
"${pageText.slice(0, 100)}..."

**V produkčním režimu by zde byl skutečný překlad pomocí OpenAI GPT-4.**

🔧 **Pro aktivaci skutečných překladů:**
1. Získejte OpenAI API klíč na: https://platform.openai.com/api-keys
2. Upravte soubor server/.env 
3. Nastavte: OPENAI_API_KEY=sk-váš-skutečný-klíč
4. Restartujte server

**Funkce, které můžete testovat i v DEMO módu:**
✅ PDF načítání a renderování  
✅ Extrakce textu ze stránek
✅ SSE streaming komunikace
✅ Cache mechanismus
✅ Navigace mezi stránkami
✅ Změna jazyků

*Aplikace je plně připravená - stačí pouze doplnit OpenAI API klíč!*
    `;

    console.log('🎬 Starting DEMO translation streaming...');

    // Simulate streaming by sending chunks with delays
    const chunks = demoTranslation.split(' ');
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i] + ' ';
      res.write(`data: ${JSON.stringify({ content: chunk, isDone: false })}\n\n`);
      
      // Small delay to simulate real streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Send final event
    res.write(`data: ${JSON.stringify({ content: '', isDone: true })}\n\n`);
    
    console.log('✅ DEMO translation completed');
    
    // Cache the demo translation
    translationCache.set(cacheKey, demoTranslation);
    res.end();
    return;
  }

  try {
    console.log('🤖 Using real OpenAI API for translation');
    
    // Create OpenAI streaming completion
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cost-effective GPT-4 variant - excellent quality/price ratio
      messages: [
        {
          role: "system",
          content: `You are a professional translator specializing in technical and certification documents. Translate the following text to ${targetLanguage}. 

CRITICAL REQUIREMENTS:

1. PRESERVE LINE BREAKS AND PARAGRAPHS:
   - Keep ALL newlines (\\n) from the original text
   - Maintain paragraph separation and spacing
   - Do NOT merge separate lines into continuous text
   - Each line should remain as a separate line after translation

2. PRESERVE EXACT DOCUMENT STRUCTURE:
   - Keep all headings and subheadings hierarchy exactly
   - Maintain all bullet points and numbering systems (•, 1., 2., etc.)
   - Preserve chapter numbers, section numbers, and subsection organization
   - Keep page numbers, figure numbers, and reference numbers unchanged
   - Maintain indentation and list formatting

3. FORMATTING PRESERVATION:
   - Use **text** for bold formatting when needed
   - Use *text* for italics when needed
   - Keep all line breaks and paragraph structures EXACTLY as in input
   - Preserve special characters and symbols
   - Maintain table structures if present

4. TECHNICAL TRANSLATION STANDARDS:
   - Use professional, technical language appropriate for certification documents
   - Maintain consistency with ISTQB and technical terminology
   - Keep acronyms in original language when standard (e.g., ISTQB, AI, IT)
   - Translate technical terms accurately but keep industry-standard English terms when appropriate

5. OUTPUT FORMAT RULES:
   - CRITICAL: Preserve ALL newlines and line structure from input
   - Only provide the translated content
   - Do not add explanations, comments, or notes
   - Maintain original document flow and readability
   - Each input line should correspond to exactly one output line

Remember: If the input has line breaks, the output MUST have the same line breaks in the same places.`
        },
        {
          role: "user",
          content: pageText
        }
      ],
      stream: true,
      temperature: 0.3, // Lower temperature for more consistent translations
      max_tokens: 4000
    });

    let fullTranslation = '';

    // Stream the response
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullTranslation += content;
        
        // Send SSE event with the chunk
        res.write(`data: ${JSON.stringify({ content, isDone: false })}\n\n`);
      }
    }

    // Send final event indicating completion
    res.write(`data: ${JSON.stringify({ content: '', isDone: true })}\n\n`);
    
    console.log('✅ Real OpenAI translation completed');
    
    // Cache the complete translation
    if (fullTranslation) {
      translationCache.set(cacheKey, fullTranslation);
    }

  } catch (error) {
    console.error('❌ Translation error:', error);
    res.write(`data: ${JSON.stringify({ 
      error: 'Translation failed. Please try again.', 
      isDone: true 
    })}\n\n`);
  }

  res.end();
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Cache status endpoint
app.get('/api/cache-status', (req: Request, res: Response) => {
  res.json({ 
    cacheSize: translationCache.size,
    timestamp: new Date().toISOString()
  });
});

// Clear cache endpoint
app.delete('/api/cache', (req: Request, res: Response) => {
  translationCache.clear();
  res.json({ message: 'Cache cleared successfully' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`OpenAI API key configured: ${!!process.env.OPENAI_API_KEY}`);
});