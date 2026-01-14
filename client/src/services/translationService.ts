// Service for handling SSE translation streaming
export interface TranslationEvent {
  content?: string;
  error?: string;
  isDone: boolean;
}

export class TranslationService {
  private static instance: TranslationService;
  private currentEventSource: EventSource | null = null;

  static getInstance(): TranslationService {
    if (!TranslationService.instance) {
      TranslationService.instance = new TranslationService();
    }
    return TranslationService.instance;
  }

  // Start streaming translation with SSE
  async translateWithStream(
    pageText: string,
    targetLanguage: string,
    onData: (event: TranslationEvent) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void,
    force: boolean = false
  ): Promise<void> {
    // Cancel any existing stream
    this.cancelCurrentStream();

    try {
      console.log('🔄 Starting translation request...', { targetLanguage, textLength: pageText.length });

      // Send the translation request to backend
      const token = localStorage.getItem('pdf-translator-token');
      const response = await fetch('/api/translate-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ pageText, targetLanguage, force }),
      });

      console.log('📡 Response received:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check if response has body
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      
      console.log('🎯 Starting to read SSE stream...');
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('✅ SSE stream completed');
            break;
          }
          
          // Decode chunk and add to buffer
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // Process complete lines (split by \n)
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.trim() === '') continue;
            
            console.log('📦 Processing line:', line);
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data) {
                try {
                  const event: TranslationEvent = JSON.parse(data);
                  console.log('🎉 Parsed event:', event);
                  
                  onData(event);
                  
                  if (event.isDone) {
                    console.log('✨ Translation completed');
                    onComplete?.();
                    return;
                  }
                } catch (parseError) {
                  console.warn('⚠️ Failed to parse SSE data:', data, parseError);
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('❌ Translation stream error:', error);
      onError?.(error instanceof Error ? error : new Error('Translation failed'));
    }
  }

  // Cancel current streaming translation
  cancelCurrentStream(): void {
    if (this.currentEventSource) {
      this.currentEventSource.close();
      this.currentEventSource = null;
    }
  }

  // Convenience helper: returns the full translated text as a single string.
  async translateToString(pageText: string, targetLanguage: string, force: boolean = false): Promise<string> {
    let acc = '';
    return new Promise<string>((resolve, reject) => {
      void this.translateWithStream(
        pageText,
        targetLanguage,
        (event) => {
          if (event.error) {
            reject(new Error(event.error));
            return;
          }
          if (event.content) acc += event.content;
          if (event.isDone) resolve(acc);
        },
        (err) => reject(err),
        undefined,
        force
      );
    });
  }

  // Check backend health
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch('/api/health');
      return response.ok;
    } catch {
      return false;
    }
  }

  // Get cache status from backend
  async getCacheStatus(): Promise<{ cacheSize: number; timestamp: string } | null> {
    try {
      const response = await fetch('/api/cache-status');
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  // Clear backend cache
  async clearCache(): Promise<boolean> {
    try {
      const response = await fetch('/api/cache', { method: 'DELETE' });
      return response.ok;
    } catch {
      return false;
    }
  }
}