import React, { useState, useEffect, useRef } from 'react';
import type { PDFReadState } from './PDFViewer';
import { documentHtml, documentCss } from '../documentLayout';
import { TranslationService, TranslationEvent } from '../services/translationService';

interface TranslationPanelProps {
  pdfStatus: PDFReadState;
  onBusyChange: (busy: boolean) => void;
  pageText: string;
  currentPage: number;
  totalPages: number;
  targetLanguage: string;
  onLanguageChange: (language: string) => void;
  extractPagesText: (fromPage: number, toPage: number) => Promise<Array<{ pageNumber: number; pageText: string }>>;
}

export const TranslationPanel: React.FC<TranslationPanelProps> = ({
  pageText, pdfStatus, onBusyChange,
  currentPage,
  totalPages,
  targetLanguage,
  onLanguageChange,
  extractPagesText,
}) => {
  const [translatedText, setTranslatedText] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [activeRightTab, setActiveRightTab] = useState<'translation' | 'summary'>('translation');
  const [error, setError] = useState<string>('');
  const [summaryError, setSummaryError] = useState<string>('');
  const [summaryText, setSummaryText] = useState<string>('');
  const [summaryStatus, setSummaryStatus] = useState<string>('');
  const [summaryProgress, setSummaryProgress] = useState<{ current: number; total: number } | null>(null);
  const [summaryInstructions, setSummaryInstructions] = useState<string>('');
  const [lastTranslatedPage, setLastTranslatedPage] = useState<number>(0);
  const [rangeFrom, setRangeFrom] = useState<number>(1);
  const [rangeTo, setRangeTo] = useState<number>(1);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [rangeExportUrl, setRangeExportUrl] = useState<string | null>(null);
  const rangePrintWindowRef = useRef<Window | null>(null);
  const stopRequestedRef = useRef<boolean>(false);
  const translationService = TranslationService.getInstance();

  // Během požadavku držíme zvolený dokument a stránku; lze nejdřív použít Zastavit.
  useEffect(() => { onBusyChange(isTranslating || isSummarizing); }, [isTranslating, isSummarizing, onBusyChange]);
  // Výsledek předchozí stránky nesmí vypadat jako překlad nově otevřené stránky.
  useEffect(() => {
    setTranslatedText(''); setSummaryText(''); setError(''); setSummaryError('');
    setLastTranslatedPage(0);
  }, [currentPage, pageText]);

  // Cleanup any previous blob URL when replaced/unmounted
  useEffect(() => {
    return () => {
      if (rangeExportUrl) URL.revokeObjectURL(rangeExportUrl);
    };
  }, [rangeExportUrl]);

  const setRangePopupProgress = (args: { title: string; detail?: string; current?: number; total?: number }) => {
    const w = rangePrintWindowRef.current;
    if (!w || w.closed) return;
    try {
      const titleEl = w.document.getElementById('export-title');
      const detailEl = w.document.getElementById('export-detail');
      const meterEl = w.document.getElementById('export-meter') as HTMLDivElement | null;
      const metaEl = w.document.getElementById('export-meta');

      if (titleEl) titleEl.textContent = args.title;
      if (detailEl) detailEl.textContent = args.detail ?? '';

      if (typeof args.current === 'number' && typeof args.total === 'number' && args.total > 0) {
        const pct = Math.max(0, Math.min(100, Math.round((args.current / args.total) * 100)));
        if (meterEl) meterEl.style.width = `${pct}%`;
        if (metaEl) metaEl.textContent = `${args.current}/${args.total} (${pct}%)`;
      } else {
        if (meterEl) meterEl.style.width = '0%';
        if (metaEl) metaEl.textContent = '';
      }
    } catch {
      // ignore
    }
  };

  // Available languages for translation
  const languages = [
    { code: 'czech', label: 'Čeština' },
    { code: 'english', label: 'English' },
    { code: 'german', label: 'Deutsch' },
    { code: 'french', label: 'Français' },
    { code: 'spanish', label: 'Español' },
    { code: 'italian', label: 'Italiano' },
    { code: 'portuguese', label: 'Português' },
    { code: 'russian', label: 'Русский' },
    { code: 'japanese', label: '日本語' },
  ];

  // Start translation with streaming
  const startTranslation = async (force: boolean = false) => {
    if (pdfStatus !== 'ready' || !pageText.trim() || isTranslating || isSummarizing) return;

    console.log('🔄 Starting translation for page', currentPage, 'with', pageText.length, 'characters', force ? '(FORCED)' : '');

    setActiveRightTab('translation');
    setIsTranslating(true);
    setError('');
    setTranslatedText('');
    setLastTranslatedPage(currentPage);
    stopRequestedRef.current = false;

    // Handle streaming translation events
    const handleTranslationData = (event: TranslationEvent) => {
      // Obsah dokumentu ani překladu nepatří do konzolových logů.
      
      if (event.error) {
        setError(event.error);
        return;
      }

      if (event.content) {
        if (event.isDone) {
          // For cached content, set the entire text at once
          console.log('✅ Setting complete cached translation');
          setTranslatedText(event.content);
        } else {
          // For streaming content, append new chunks
          console.log('🔄 Appending streaming chunk');
          setTranslatedText((prev) => prev + event.content);
        }
      }

      if (event.isDone) {
        console.log('🏁 Translation completed');
        setIsTranslating(false);
      }
    };

    const handleTranslationError = (error: Error) => {
      console.error('❌ Translation error:', error);
      if (!stopRequestedRef.current) {
        setError(`Chyba při překladu: ${error.message}`);
      }
      setIsTranslating(false);
    };

    const handleTranslationComplete = () => {
      console.log('✨ Translation stream completed');
      setIsTranslating(false);
    };

    try {
      await translationService.translateWithStream(
        pageText,
        targetLanguage,
        handleTranslationData,
        handleTranslationError,
        handleTranslationComplete,
        force
      );
    } catch (error) {
      handleTranslationError(error instanceof Error ? error : new Error('Unknown error'));
    }
  };

  const summarizeCurrentPage = async () => {
    if (pdfStatus !== 'ready' || !pageText.trim() || isTranslating || isSummarizing) return;

    const outputLanguage = targetLanguage;

    setActiveRightTab('summary');
    setIsSummarizing(true);
    setSummaryError('');
    setSummaryText('');
    setSummaryStatus(`Sumarizuji stránku ${currentPage}…`);
    setSummaryProgress(null);
    stopRequestedRef.current = false;

    const handleData = (event: TranslationEvent) => {
      if (event.error) {
        setSummaryError(event.error);
        return;
      }
      if (event.content) {
        if (event.isDone) setSummaryText(event.content);
        else setSummaryText((prev) => prev + event.content);
      }
      if (event.isDone) {
        setSummaryStatus('');
        setIsSummarizing(false);
      }
    };

    const handleError = (e: Error) => {
      if (!stopRequestedRef.current) {
        setSummaryError(`Chyba při sumarizaci: ${e.message}`);
      }
      setSummaryStatus('');
      setIsSummarizing(false);
    };

    const handleComplete = () => {
      setSummaryStatus('');
      setIsSummarizing(false);
    };

    try {
      await translationService.summarizeWithStream(
        pageText,
        outputLanguage,
        'final',
        handleData,
        handleError,
        handleComplete,
        currentPage,
        summaryInstructions
      );
    } catch (e) {
      handleError(e instanceof Error ? e : new Error('Unknown error'));
    }
  };

  const summarizeRange = async () => {
    if (isTranslating || isSummarizing || !totalPages) return;

    const outputLanguage = targetLanguage;

    const from = Math.max(1, Math.min(totalPages, Math.min(rangeFrom, rangeTo)));
    const to = Math.max(1, Math.min(totalPages, Math.max(rangeFrom, rangeTo)));

    setActiveRightTab('summary');
    setIsSummarizing(true);
    setSummaryError('');
    setSummaryText('');
    setSummaryStatus('Načítám stránky…');
    setSummaryProgress(null);
    stopRequestedRef.current = false;

    try {
      const pages = await extractPagesText(from, to);
      if (!pages.length) throw new Error('Rozsah neobsahuje žádné stránky.');

      let aggregatedNotes = '';
      for (let i = 0; i < pages.length; i++) {
        if (stopRequestedRef.current) throw new Error('__STOP__');
        const p = pages[i];
        setSummaryStatus(`Analyzuji stránku ${p.pageNumber}…`);
        setSummaryProgress({ current: i + 1, total: pages.length });

        const notes = await translationService.summarizeToString(
          p.pageText,
          outputLanguage,
          'notes',
          p.pageNumber,
          summaryInstructions
        );
        aggregatedNotes += `Stránka ${p.pageNumber}:\n${notes}\n\n`;
      }

      setSummaryStatus('Sestavuji finální sumarizaci…');
      setSummaryProgress({ current: pages.length, total: pages.length });

      await translationService.summarizeWithStream(
        aggregatedNotes,
        outputLanguage,
        'final',
        (event) => {
          if (event.error) {
            setSummaryError(event.error);
            return;
          }
          if (event.content) {
            if (event.isDone) setSummaryText(event.content);
            else setSummaryText((prev) => prev + event.content);
          }
          if (event.isDone) {
            setSummaryStatus('');
            setSummaryProgress(null);
            setIsSummarizing(false);
          }
        },
        (e) => {
          if (!stopRequestedRef.current) {
            setSummaryError(`Chyba při sumarizaci: ${e.message}`);
          }
          setSummaryStatus('');
          setSummaryProgress(null);
          setIsSummarizing(false);
        },
        () => {
          setSummaryStatus('');
          setSummaryProgress(null);
          setIsSummarizing(false);
        },
        undefined,
        summaryInstructions
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chyba při sumarizaci rozsahu';
      if (!stopRequestedRef.current && msg !== '__STOP__') {
        setSummaryError(msg);
      }
      setSummaryStatus('');
      setSummaryProgress(null);
      setIsSummarizing(false);
    }
  };

  const stopCurrentWork = () => {
    stopRequestedRef.current = true;
    translationService.cancelCurrentStream();
    setIsTranslating(false);
    setBulkStatus('');
    setBulkProgress(null);
    setIsSummarizing(false);
    setSummaryStatus('');
    setSummaryProgress(null);
  };

  const clearSummary = () => {
    setSummaryText('');
    setSummaryError('');
    setSummaryStatus('');
    setSummaryProgress(null);
  };

  // Effect to trigger translation when page or language changes
  useEffect(() => {
    // Remove automatic translation - user must click "Translate" button
    // This saves money by not auto-translating unwanted pages
    console.log('📄 Page changed to:', currentPage, 'but NOT auto-translating');
  }, [pageText, currentPage]);

  // Keep default range aligned with loaded PDF / current page
  useEffect(() => {
    if (totalPages > 0) {
      setRangeFrom((prev) => (prev >= 1 && prev <= totalPages ? prev : 1));
      setRangeTo((prev) => (prev >= 1 && prev <= totalPages ? prev : Math.min(totalPages, Math.max(1, currentPage))));
    }
  }, [totalPages]);

  useEffect(() => {
    if (totalPages > 0) {
      setRangeTo((prev) => (prev >= 1 && prev <= totalPages ? prev : currentPage));
    }
  }, [currentPage, totalPages]);

  // Effect to retranslate when language changes  
  useEffect(() => {
    // Only retranslate if we already have a translation for current page
    if (pageText && currentPage === lastTranslatedPage && translatedText) {
      console.log('🌐 Language changed - retranslating existing page');
      startTranslation(true);
    }
  }, [targetLanguage]);

  // Save translated text to PDF file with proper formatting
  const saveTranslation = () => {
    if (!translatedText) return;

    const formattedContent = documentHtml(translatedText);

    // Create HTML for better formatting and print to PDF
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Překlad stránky ${currentPage}</title>
    <style>
${documentCss}
        @media print {
            body { margin: 0; }
            .no-print { display: none; }
        }
        body {
            font-family: 'Times New Roman', 'DejaVu Serif', serif;
            font-size: 12pt;
            line-height: 1.75;
            margin: 2cm;
            color: #000;
            max-width: 900px;
            margin-left: auto;
            margin-right: auto;
        }
        .header {
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 15pt;
            margin-bottom: 25pt;
        }
        .title {
            font-size: 18pt;
            font-weight: bold;
            margin-bottom: 8pt;
            color: #1e40af;
        }
        .date {
            font-size: 11pt;
            color: #64748b;
        }
        .content {
            /* Use same styling as our app */
        }
        
        /* Match our CSS classes for consistent formatting */
        .text-line {
            margin-bottom: 6pt;
        }
        
        .bullet-line {
            padding-left: 1.5em;
            text-indent: -1em;
            margin-bottom: 6pt;
        }
        
        .heading-line {
            font-weight: 700;
            font-size: 14pt;
            color: #1e40af;
            margin: 20pt 0 12pt 0;
            border-bottom: 1px solid #e1e9f0;
            padding-bottom: 4pt;
        }
        
        .sub-heading-line {
            font-weight: 600;
            font-size: 13pt;
            color: #2563eb;
            margin: 15pt 0 8pt 0;
        }
        
        .empty-line {
            margin: 8pt 0;
        }
        
        .bold { font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">Překlad stránky ${currentPage}</div>
        <div class="date">Datum: ${new Date().toLocaleDateString('cs-CZ')}</div>
    </div>
    <div class="content">
        ${formattedContent}
    </div>
    <button class="no-print" onclick="window.print()" style="position: fixed; top: 10px; right: 10px; padding: 15px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">📄 Tisknout do PDF</button>
</body>
</html>`;

    // Create blob and open in new window for printing
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 250);
      };
    }
    
    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const handleLanguageSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onLanguageChange(event.target.value);
  };

  // Jednotný renderer zaručuje stejné bloky a odsazení na obrazovce i při tisku.
  const buildRangeExportHtml = (pages: Array<{ pageNumber: number; translatedText: string }>) => {
    const pagesHtml = pages
      .map((p, idx) => {
        const content = documentHtml(p.translatedText);
        const pageBreakClass = idx === 0 ? 'page' : 'page page-break';
        return `
<div class="${pageBreakClass}">
  <div class="header">
    <div class="title">Překlad stránky ${p.pageNumber}</div>
    <div class="date">Datum: ${new Date().toLocaleDateString('cs-CZ')}</div>
  </div>
  <div class="content">
    ${content}
  </div>
</div>`;
      })
      .join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Překlad PDF (strany ${pages[0]?.pageNumber ?? ''}–${pages[pages.length - 1]?.pageNumber ?? ''})</title>
  <style>
${documentCss}
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
      .page-break { page-break-before: always; break-before: page; }
    }
    body {
      font-family: 'Times New Roman', 'DejaVu Serif', serif;
      font-size: 12pt;
      line-height: 1.75;
      margin: 2cm;
      color: #000;
      max-width: 900px;
      margin-left: auto;
      margin-right: auto;
    }
    .header {
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 15pt;
      margin-bottom: 25pt;
    }
    .title {
      font-size: 18pt;
      font-weight: bold;
      margin-bottom: 8pt;
      color: #1e40af;
    }
    .date {
      font-size: 11pt;
      color: #64748b;
    }
    .text-line { margin-bottom: 6pt; }
    .bullet-line {
      padding-left: 1.5em;
      text-indent: -1em;
      margin-bottom: 6pt;
    }
    .heading-line {
      font-weight: 700;
      font-size: 14pt;
      color: #1e40af;
      margin: 20pt 0 12pt 0;
      border-bottom: 1px solid #e1e9f0;
      padding-bottom: 4pt;
    }
    .sub-heading-line {
      font-weight: 600;
      font-size: 13pt;
      color: #2563eb;
      margin: 15pt 0 8pt 0;
    }
    .empty-line { margin: 8pt 0; }
  </style>
</head>
<body>
  ${pagesHtml}
  <button class="no-print" onclick="window.print()" style="position: fixed; top: 10px; right: 10px; padding: 15px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">📄 Tisknout do PDF</button>
</body>
</html>`;
  };

  const openRangeExportUrl = (url: string) => {
    const w = window.open(url, '_blank');
    if (w) {
      w.onload = () => {
        setTimeout(() => {
          try {
            w.print();
          } catch {
            // ignore
          }
        }, 250);
      };
    }
  };

  const translateRangeAndSave = async () => {
    if (isTranslating) return;
    if (!totalPages || totalPages <= 0) {
      setError('Nejdřív nahraj PDF (aby šel zvolit rozsah).');
      return;
    }

    stopRequestedRef.current = false;

    const from = Math.max(1, Math.min(rangeFrom, rangeTo));
    const to = Math.min(totalPages, Math.max(rangeFrom, rangeTo));
    const count = to - from + 1;

    const ok = window.confirm(
      `Přeložit strany ${from}–${to} (${count} stran) a uložit do PDF?\n\nMůže to trvat několik minut podle délky textu a rychlosti API.`
    );
    if (!ok) return;

    // Reset previous export link and pre-open a window immediately (important for iOS/Safari popup rules).
    setRangeExportUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const w = window.open('', '_blank');
      if (w) {
        rangePrintWindowRef.current = w;
        w.document.open();
        w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Export do PDF</title></head><body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; padding: 24px; line-height: 1.5;">
<h2 id="export-title" style="margin: 0 0 8px 0;">Připravuje se export…</h2>
<div id="export-detail" style="color: #555; margin-bottom: 12px;">Nechte toto okno otevřené. Až bude překlad hotový, zobrazí se zde tisk do PDF.</div>
<div style="height: 10px; background: #e5e7eb; border-radius: 999px; overflow: hidden; margin: 12px 0;">
  <div id="export-meter" style="height: 100%; width: 0%; background: #3b82f6;"></div>
</div>
<div id="export-meta" style="color: #555; font-size: 14px;"></div>
</body></html>`);
        w.document.close();
        setRangePopupProgress({ title: 'Připravuje se export…', detail: 'Načítám texty stránek…', current: 0, total: count });
      }
    } catch {
      rangePrintWindowRef.current = null;
    }

    setError('');
    setIsTranslating(true);
    setBulkStatus('Načítám texty stránek…');
    setBulkProgress({ current: 0, total: count });
    setRangePopupProgress({ title: 'Připravuje se export…', detail: 'Načítám texty stránek…', current: 0, total: count });

    try {
      const pages = await extractPagesText(from, to);
      const translations: Array<{ pageNumber: number; translatedText: string }> = [];

      for (let i = 0; i < pages.length; i += 1) {
        if (stopRequestedRef.current) throw new Error('__STOP__');
        const p = pages[i];
        setBulkStatus(`Překládám stránku ${p.pageNumber} (${i + 1}/${pages.length})…`);
        setBulkProgress({ current: i + 1, total: pages.length });
        setRangePopupProgress({
          title: 'Připravuje se export…',
          detail: `Překládám stránku ${p.pageNumber}…`,
          current: i + 1,
          total: pages.length,
        });

        const translated = await translationService.translateToString(p.pageText, targetLanguage, false);
        if (stopRequestedRef.current) throw new Error('__STOP__');
        translations.push({ pageNumber: p.pageNumber, translatedText: translated });

        // malé zpomalení kvůli limitům / stabilitě
        await new Promise((r) => setTimeout(r, 250));
      }

      const html = buildRangeExportHtml(translations);

      setRangePopupProgress({ title: 'Hotovo', detail: 'Otevírám tisk do PDF…', current: pages.length, total: pages.length });

      // Try to render into the pre-opened window (best UX, avoids popup blockers).
      const w = rangePrintWindowRef.current;
      rangePrintWindowRef.current = null;
      let usedPreopened = false;
      if (w && !w.closed) {
        try {
          w.document.open();
          w.document.write(html);
          w.document.close();
          usedPreopened = true;
          setTimeout(() => {
            try {
              w.focus();
              w.print();
            } catch {
              // ignore
            }
          }, 400);
        } catch {
          usedPreopened = false;
        }
      }

      if (!usedPreopened) {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        setRangeExportUrl(url);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chyba při překladu rozsahu';
      if (!stopRequestedRef.current && msg !== '__STOP__') {
        setError(msg);
      } else {
        setRangePopupProgress({ title: 'Zastaveno', detail: 'Překlad byl zastaven.', current: 0, total: count });
      }
    } finally {
      setBulkStatus('');
      setBulkProgress(null);
      setIsTranslating(false);
    }
  };

  return (
    <>
      <div className="panel-header">
        <h3>Překlad stránky {currentPage}</h3>
        <select 
          className="language-select" 
          value={targetLanguage} 
          onChange={handleLanguageSelect}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        <button 
          className="translate-primary"
          onClick={() => startTranslation(true)}
          disabled={pdfStatus !== 'ready' || !pageText.trim() || isTranslating || isSummarizing}
        >
          {isTranslating ? 'Překládá se…' : `Přeložit stránku ${currentPage}`}

        </button>

        {(isTranslating || isSummarizing || bulkStatus) && (
          <button onClick={stopCurrentWork} className="save-button" title="Zastaví běžící překlad / sumarizaci">
            Zastavit
          </button>
        )}
        
        <button 
          onClick={saveTranslation}
          disabled={!translatedText || isTranslating || isSummarizing}
          className="save-button"
        >
          💾 Uložit
        </button>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          disabled={isTranslating || isSummarizing}
          className="advanced-toggle-button"
          title="Rozsah stránek → PDF"
          aria-label="Pokročilé: rozsah stránek do PDF"
        >
          ⚙️
        </button>
      </div>

      <div className="panel-content">
        {showAdvanced && (
          <div
            style={{
              marginBottom: '12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              padding: '10px',
              background: '#fafafa',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#666', fontSize: '0.9rem' }}>Přeložit rozsah stránek → PDF</span>
              <span style={{ color: '#666', fontSize: '0.9rem' }}>Od–do</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, totalPages || 1)}
                value={rangeFrom}
                onChange={(e) => setRangeFrom(Number(e.target.value || 1))}
                style={{ width: '70px', padding: '6px' }}
                disabled={!totalPages || isTranslating}
              />
              <input
                type="number"
                min={1}
                max={Math.max(1, totalPages || 1)}
                value={rangeTo}
                onChange={(e) => setRangeTo(Number(e.target.value || 1))}
                style={{ width: '70px', padding: '6px' }}
                disabled={!totalPages || isTranslating}
              />
              <button
                onClick={translateRangeAndSave}
                disabled={!totalPages || isTranslating || isSummarizing}
                title="Přeloží vybraný rozsah stránek postupně a otevře tisk do PDF"
                className="range-pdf-button"
              >
                Přeložit → PDF
              </button>
              <span style={{ color: '#666', fontSize: '0.9rem' }}>Může to trvat několik minut.</span>
            </div>

            {rangeExportUrl && (
              <div style={{ marginTop: '10px' }}>
                <button
                  onClick={() => openRangeExportUrl(rangeExportUrl)}
                  className="range-pdf-button"
                  title="Otevře export v novém okně (pokud se automaticky neotevřel)"
                >
                  Otevřít tisk do PDF
                </button>
              </div>
            )}

            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e5e5e5' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#666', fontSize: '0.9rem' }}>AI sumarizace (shrnutí / povinnosti / rizika / TODO)</span>
                <button
                  onClick={summarizeCurrentPage}
                  disabled={pdfStatus !== 'ready' || !pageText.trim() || isTranslating || isSummarizing}
                  className="range-pdf-button"
                  title="Vytvoří AI sumarizaci aktuální stránky"
                >
                  Sumarizovat stránku
                </button>
                <button
                  onClick={summarizeRange}
                  disabled={!totalPages || isTranslating || isSummarizing}
                  className="range-pdf-button"
                  title="Vytvoří AI sumarizaci vybraného rozsahu stránek"
                >
                  Sumarizovat rozsah
                </button>
                <span style={{ color: '#666', fontSize: '0.9rem' }}>Výstup je v jazyce zvoleném nahoře.</span>
              </div>

              <div style={{ marginTop: '8px' }}>
                <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '6px' }}>
                  Instrukce k sumarizaci (volitelné)
                </div>
                <textarea
                  value={summaryInstructions}
                  onChange={(e) => setSummaryInstructions(e.target.value)}
                  placeholder="Např.: Zaměř se na termíny a částky. Vyjmenuj všechny povinnosti a deadliny. Uveď nejistoty a chybějící informace."
                  disabled={isSummarizing || isTranslating}
                  rows={3}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', resize: 'vertical' }}
                />
                <div style={{ color: '#666', fontSize: '0.85rem', marginTop: '4px' }}>
                  Neukládá se. Platí pro „stránku“ i „rozsah“.
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="right-tabs" role="tablist" aria-label="Zobrazení">
          <button
            type="button"
            className={`right-tab-button ${activeRightTab === 'translation' ? 'active' : ''}`}
            onClick={() => setActiveRightTab('translation')}
            role="tab"
            aria-selected={activeRightTab === 'translation'}
          >
            Výsledek překladu
          </button>
          <button
            type="button"
            className={`right-tab-button ${activeRightTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveRightTab('summary')}
            role="tab"
            aria-selected={activeRightTab === 'summary'}
          >
            Výsledek shrnutí
          </button>
        </div>

        {activeRightTab === 'translation' ? (
          <>
            {bulkStatus && (
              <div className="translation-loading">
                {bulkStatus}
                {bulkProgress ? ` (${bulkProgress.current}/${bulkProgress.total})` : ''}
              </div>
            )}

            {error && (
              <div className="translation-error" role="alert">
                {error}
              </div>
            )}

            {isTranslating && !translatedText && (
              <div className="translation-loading">
                Překládám stránku {currentPage} přes Codex. Výsledek se zobrazí po dokončení, může to trvat několik minut.
              </div>
            )}

            {translatedText && (
              <div className="translation-content" dangerouslySetInnerHTML={{__html: documentHtml(translatedText)}} />
            )}

            {!isTranslating && !translatedText && !error && (
              <div className="translation-loading" role="status">
                {pdfStatus === 'loading' ? 'Načítám text vybrané stránky…' :
                 pdfStatus === 'error' ? 'PDF se nepodařilo načíst. Podrobnosti najdeš u dokumentu vlevo nebo nad tímto panelem.' :
                 pdfStatus === 'empty' ? 'Vyber PDF a poté klikni na Přeložit stránku.' :
                 !pageText.trim() ? 'Tato stránka neobsahuje čitelný text. Zkus jinou stránku; pro naskenované PDF je nejprve potřeba OCR.' :
                 `Stránka ${currentPage} je připravená. Překlad spustíš tlačítkem Přeložit stránku ${currentPage} nahoře.`}
              </div>
            )}
          </>
        ) : (
          <>
            {(summaryStatus || (isSummarizing && summaryProgress)) && (
              <div style={{ marginBottom: '8px', color: '#666', fontSize: '0.9rem' }}>
                {summaryStatus}
                {summaryProgress ? ` (${summaryProgress.current}/${summaryProgress.total})` : ''}
              </div>
            )}

            {summaryError && (
              <div style={{ marginBottom: '8px', color: '#b00020' }}>
                {summaryError}
              </div>
            )}

            {summaryText ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={clearSummary}
                    disabled={isSummarizing || isTranslating}
                    className="range-pdf-button"
                    title="Vymaže zobrazenou sumarizaci"
                  >
                    Vymazat sumarizaci
                  </button>
                </div>

                <div
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    padding: '10px',
                    background: '#fff',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.55,
                  }}
                >
                  {summaryText}
                  {isSummarizing && <span style={{ animation: 'blink 1s infinite' }}>▋</span>}
                </div>
              </>
            ) : (
              <div className="translation-loading">Zatím žádná sumarizace.</div>
            )}
          </>
        )}
      </div>
    </>
  );
};