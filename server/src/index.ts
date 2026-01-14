import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { queueLoginEmail, trySendLoginEmail } from './email';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Optional fallback OpenAI client (used only for DEMO mode / fallback)
// IMPORTANT: Don't instantiate OpenAI without an API key (it throws at import time on Vercel).
const serverOpenai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '10mb' }));

// -----------------------------
// Auth + storage
// -----------------------------

type SessionRecord = {
  username: string;
  apiKeyEnc: string;
  expiresAt: number;
};

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const MAX_ACTIVE_SESSIONS = 2;

// Only these two users are allowed; no public signup.
const AUTH_MARA_PASSWORD = process.env.AUTH_MARA_PASSWORD || '';
const AUTH_BARU_PASSWORD = process.env.AUTH_BARU_PASSWORD || '';

const APP_SECRET = process.env.APP_SECRET || '';

function isBcryptHash(v: string): boolean {
  return typeof v === 'string' && v.startsWith('$2');
}

async function verifyPassword(plain: string, configured: string): Promise<boolean> {
  if (!configured) return false;
  if (isBcryptHash(configured)) return bcrypt.compare(plain, configured);
  return plain === configured;
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim();
  return req.ip || 'unknown';
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [type, token] = header.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function deriveKey(secret: string): Buffer {
  // 32 bytes key for AES-256
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encryptApiKey(plain: string): string {
  if (!APP_SECRET) {
    throw new Error('Missing APP_SECRET. Set APP_SECRET in server environment variables.');
  }
  const key = deriveKey(APP_SECRET);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${ciphertext.toString('base64')}.${tag.toString('base64')}`;
}

function decryptApiKey(enc: string): string {
  if (!APP_SECRET) {
    throw new Error('Missing APP_SECRET. Set APP_SECRET in server environment variables.');
  }
  const [ivB64, ctB64, tagB64] = enc.split('.');
  if (!ivB64 || !ctB64 || !tagB64) throw new Error('Invalid encrypted API key format');
  const key = deriveKey(APP_SECRET);
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return plain;
}

interface Storage {
  setSession(token: string, username: string, apiKeyEnc: string, ttlSeconds: number): Promise<void>;
  getSession(token: string): Promise<{ username: string; apiKeyEnc: string } | null>;
  deleteSession(token: string): Promise<void>;
  pruneSessions(): Promise<void>;
  countActiveSessions(): Promise<number>;
}

function b64urlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlDecodeToString(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64').toString('utf8');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function signStateless(payloadB64: string): string {
  if (!APP_SECRET) throw new Error('Missing APP_SECRET. Set APP_SECRET in server environment variables.');
  const sig = crypto.createHmac('sha256', deriveKey(APP_SECRET)).update(payloadB64, 'utf8').digest();
  return b64urlEncode(sig);
}

function createStatelessToken(args: { username: string; apiKeyEnc: string; ttlSeconds: number }): string {
  const exp = Math.floor(Date.now() / 1000) + args.ttlSeconds;
  const payload = JSON.stringify({ u: args.username, k: args.apiKeyEnc, exp });
  const payloadB64 = b64urlEncode(payload);
  const sig = signStateless(payloadB64);
  return `${payloadB64}.${sig}`;
}

function parseStatelessToken(token: string): { username: string; apiKeyEnc: string } | null {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  let expected: string;
  try {
    expected = signStateless(payloadB64);
  } catch {
    return null;
  }
  if (!timingSafeEqualStr(expected, sig)) return null;
  try {
    const raw = b64urlDecodeToString(payloadB64);
    const parsed = JSON.parse(raw) as { u?: unknown; k?: unknown; exp?: unknown };
    if (typeof parsed.u !== 'string' || typeof parsed.k !== 'string' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    return { username: parsed.u, apiKeyEnc: parsed.k };
  } catch {
    return null;
  }
}

class StatelessStorage implements Storage {
  async setSession(_token: string, _username: string, _apiKeyEnc: string, _ttlSeconds: number): Promise<void> {
    // No-op (stateless token carries the session)
  }

  async getSession(token: string): Promise<{ username: string; apiKeyEnc: string } | null> {
    return parseStatelessToken(token);
  }

  async deleteSession(_token: string): Promise<void> {
    // No-op (can't revoke without server-side store)
  }

  async pruneSessions(): Promise<void> {
    // No-op
  }

  async countActiveSessions(): Promise<number> {
    // Can't know without store; return 0 so login isn't blocked.
    return 0;
  }
}

class RedisStorage implements Storage {
  constructor(private redis: Redis) {}

  async setSession(token: string, username: string, apiKeyEnc: string, ttlSeconds: number): Promise<void> {
    const sessionKey = `session:${token}`;
    await this.redis.set(sessionKey, JSON.stringify({ username, apiKeyEnc }), { ex: ttlSeconds });
    await this.redis.sadd('sessions', token);
  }

  async getSession(token: string): Promise<{ username: string; apiKeyEnc: string } | null> {
    const sessionKey = `session:${token}`;
    const raw = await this.redis.get<string>(sessionKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { username?: unknown; apiKeyEnc?: unknown };
      if (typeof parsed.username !== 'string' || typeof parsed.apiKeyEnc !== 'string') return null;
      return { username: parsed.username, apiKeyEnc: parsed.apiKeyEnc };
    } catch {
      return null;
    }
  }

  async deleteSession(token: string): Promise<void> {
    await this.redis.del(`session:${token}`);
    await this.redis.srem('sessions', token);
  }

  async pruneSessions(): Promise<void> {
    const tokens = await this.redis.smembers<string[]>('sessions');
    if (!tokens?.length) return;
    // small scale => safe to prune linearly
    for (const token of tokens) {
      const exists = await this.redis.exists(`session:${token}`);
      if (!exists) {
        await this.redis.srem('sessions', token);
      }
    }
  }

  async countActiveSessions(): Promise<number> {
    await this.pruneSessions();
    return (await this.redis.scard('sessions')) ?? 0;
  }
}

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = upstashUrl && upstashToken ? new Redis({ url: upstashUrl, token: upstashToken }) : null;
const storage: Storage = redis ? new RedisStorage(redis) : new StatelessStorage();

const rateLimiters = new Map<string, Ratelimit>();
const memRate = new Map<string, { resetAt: number; count: number }>();

function parseWindowToMs(window: string): number {
  const m = window.trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!m) return 60_000;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60_000;
  if (unit === 'h') return n * 3_600_000;
  if (unit === 'd') return n * 86_400_000;
  return 60_000;
}

function getLimiter(name: string, limit: number, window: string): Ratelimit | null {
  if (!redis) return null;
  const key = `${name}:${limit}:${window}`;
  const existing = rateLimiters.get(key);
  if (existing) return existing;
  const created = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window as any),
    analytics: true,
    prefix: `pdf-translator:${name}`,
  });
  rateLimiters.set(key, created);
  return created;
}

function rateLimitOrNext(opts: { name: string; limit?: number; window?: string }) {
  // If Upstash ratelimit is configured, we use it. Otherwise we do nothing here.
  const limit = opts.limit ?? 30;
  const window = opts.window ?? '1 m';
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limiter = getLimiter(opts.name, limit, window);
      if (!limiter) {
        // In-memory fallback (best-effort; suitable for dev / single instance)
        const ip = getClientIp(req);
        const key = `${opts.name}:${ip}`;
        const windowMs = parseWindowToMs(window);
        const now = Date.now();
        const rec = memRate.get(key);
        if (!rec || rec.resetAt <= now) {
          memRate.set(key, { resetAt: now + windowMs, count: 1 });
          return next();
        }
        if (rec.count >= limit) {
          res.setHeader('X-RateLimit-Remaining', '0');
          res.setHeader('X-RateLimit-Reset', String(Math.floor(rec.resetAt / 1000)));
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }
        rec.count += 1;
        memRate.set(key, rec);
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - rec.count)));
        res.setHeader('X-RateLimit-Reset', String(Math.floor(rec.resetAt / 1000)));
        return next();
      }
      const ip = getClientIp(req);
      const key = `${opts.name}:${ip}`;
      const { success, reset, remaining } = await limiter.limit(key);
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(reset));
      if (!success) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      return next();
    } catch {
      // Fail open
      return next();
    }
  };
}

type AuthedRequest = Request & { auth?: { username: string; token: string; apiKeyEnc: string } };

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  const session = await storage.getSession(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired session' });
  req.auth = { username: session.username, apiKeyEnc: session.apiKeyEnc, token };
  return next();
}

app.post('/api/auth/login', rateLimitOrNext({ name: 'auth-login', limit: 10, window: '10 m' }), async (req: Request, res: Response) => {
  try {
    const { username, password, openaiApiKey } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || typeof openaiApiKey !== 'string') {
      return res.status(400).json({ error: 'Missing username, password, or openaiApiKey' });
    }
    if (!APP_SECRET) {
      return res.status(500).json({ error: 'Server misconfigured: missing APP_SECRET' });
    }
    if (!openaiApiKey.trim().startsWith('sk-')) {
      return res.status(400).json({ error: 'OpenAI API key must start with sk-' });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername !== 'mara' && cleanUsername !== 'baru') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const configured = cleanUsername === 'mara' ? AUTH_MARA_PASSWORD : AUTH_BARU_PASSWORD;
    const ok = await verifyPassword(password, configured);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const apiKeyEnc = encryptApiKey(openaiApiKey.trim());
    // If Redis is available, keep server-side sessions and enforce MAX_ACTIVE_SESSIONS.
    // Otherwise (serverless without Redis), use a stateless signed token to avoid flaky in-memory sessions.
    let token: string;
    if (redis) {
      const active = await storage.countActiveSessions();
      if (active >= MAX_ACTIVE_SESSIONS) {
        return res.status(429).json({ error: `Maximum ${MAX_ACTIVE_SESSIONS} active users already logged in` });
      }
      token = crypto.randomBytes(32).toString('hex');
      await storage.setSession(token, cleanUsername, apiKeyEnc, SESSION_TTL_SECONDS);
    } else {
      token = createStatelessToken({ username: cleanUsername, apiKeyEnc, ttlSeconds: SESSION_TTL_SECONDS });
    }

    const wantsEmailDebugSync = (process.env.EMAIL_DEBUG_SYNC || '').trim() === '1';
    if (wantsEmailDebugSync) {
      const result = await trySendLoginEmail({ username: cleanUsername, req });
      let emailQueued = true;
      if (!result.ok) {
        emailQueued = result.error.message !== 'SMTP not configured';
      }
      return res.json({
        token,
        username: cleanUsername,
        expiresIn: SESSION_TTL_SECONDS,
        emailQueued,
        emailOk: result.ok,
        emailSource: result.source,
        emailError: result.ok ? undefined : result.error,
      });
    }

    const emailQueued = queueLoginEmail({ username: cleanUsername, req });
    return res.json({ token, username: cleanUsername, expiresIn: SESSION_TTL_SECONDS, emailQueued });
  } catch (e) {
    console.error('Login error', e);
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    await storage.deleteSession(req.auth!.token);
    return res.json({ ok: true });
  } catch (e) {
    console.error('Logout error', e);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  return res.json({ username: req.auth!.username });
});

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
app.post('/api/translate-stream', rateLimitOrNext({ name: 'translate', limit: 30, window: '1 m' }), requireAuth, async (req: AuthedRequest, res: Response) => {
  const { pageText, targetLanguage, force = false } = req.body;
  const username = req.auth!.username;

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

  // Cache per-user to avoid cross-user data leakage
  const cacheKey = `${username}:${getCacheKey(pageText, targetLanguage)}`;
  
  // Check cache first (unless force is true)
  if (!force && translationCache.has(cacheKey)) {
    console.log('💾 Cache HIT - returning cached translation');
    
    // Send cached result as a single SSE event
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });

  // Load OpenAI API key from current session
  let userApiKey: string | null = null;
  try {
    userApiKey = decryptApiKey(req.auth!.apiKeyEnc);
  } catch (e) {
    console.error('Failed to decrypt session API key', e);
  }

  const hasValidUserApiKey = typeof userApiKey === 'string' && userApiKey.startsWith('sk-');

  if (!hasValidUserApiKey) {
    console.log('🚫 No valid OpenAI API key in session - using DEMO mode');
    
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
    const openai = new OpenAI({ apiKey: userApiKey! });
    
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

// When deployed as a Vercel Serverless Function, Vercel handles the HTTP server.
// Only listen on a port when running this file directly (local/dev or node dist).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`OpenAI API key configured: ${!!process.env.OPENAI_API_KEY}`);
  });
}

export default app;