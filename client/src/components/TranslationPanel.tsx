import React, { useState, useEffect } from 'react';
import { TranslationService, TranslationEvent } from '../services/translationService';

interface TranslationPanelProps {
  pageText: string;
  currentPage: number;
  targetLanguage: string;
  onLanguageChange: (language: string) => void;
}

export const TranslationPanel: React.FC<TranslationPanelProps> = ({
  pageText,
  currentPage,
  targetLanguage,
  onLanguageChange,
}) => {
  const [translatedText, setTranslatedText] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [lastTranslatedPage, setLastTranslatedPage] = useState<number>(0);
  const translationService = TranslationService.getInstance();

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
    { code: 'chinese', label: '中文' },
    { code: 'japanese', label: '日本語' },
  ];

  // Start translation with streaming
  const startTranslation = async (force: boolean = false) => {
    if (!pageText.trim() || isTranslating) return;

    console.log('🔄 Starting translation for page', currentPage, 'with', pageText.length, 'characters', force ? '(FORCED)' : '');

    setIsTranslating(true);
    setError('');
    setTranslatedText('');
    setLastTranslatedPage(currentPage);

    // Handle streaming translation events
    const handleTranslationData = (event: TranslationEvent) => {
      console.log('📦 Received translation event:', event);
      
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
      setError(`Chyba při překladu: ${error.message}`);
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

  // Effect to trigger translation when page or language changes
  useEffect(() => {
    // Remove automatic translation - user must click "Translate" button
    // This saves money by not auto-translating unwanted pages
    console.log('📄 Page changed to:', currentPage, 'but NOT auto-translating');
  }, [pageText, currentPage]);

  // Effect to retranslate when language changes  
  useEffect(() => {
    // Only retranslate if we already have a translation for current page
    if (pageText && currentPage === lastTranslatedPage && translatedText) {
      console.log('🌐 Language changed - retranslating existing page');
      startTranslation(true);
    }
  }, [targetLanguage]);

  // Save translated text to PDF file with proper UTF-8 encoding
  const saveTranslation = () => {
    if (!translatedText) return;

    // Create HTML for better formatting and print to PDF
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Překlad stránky ${currentPage}</title>
    <style>
        @media print {
            body { margin: 0; }
            .no-print { display: none; }
        }
        body {
            font-family: 'Times New Roman', 'DejaVu Serif', serif;
            font-size: 12pt;
            line-height: 1.5;
            margin: 2cm;
            color: #000;
        }
        .header {
            border-bottom: 2px solid #007bff;
            padding-bottom: 10pt;
            margin-bottom: 20pt;
        }
        .title {
            font-size: 16pt;
            font-weight: bold;
            margin-bottom: 5pt;
        }
        .date {
            font-size: 10pt;
            color: #666;
        }
        .content {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .bold { font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">Překlad stránky ${currentPage}</div>
        <div class="date">Datum: ${new Date().toLocaleDateString('cs-CZ')}</div>
    </div>
    <div class="content">${translatedText.replace(/\*\*(.*?)\*\*/g, '<span class="bold">$1</span>').replace(/\n/g, '<br>')}</div>
    <button class="no-print" onclick="window.print()" style="position: fixed; top: 10px; right: 10px; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">Tisknout do PDF</button>
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

  const reflowTranslatedText = (text: string) => {
    const rawLines = text
      .replace(/\r/g, '')
      .split('\n')
      .map(l => l.trimEnd()); // necháme leading spaces řešit přes CSS třídami

    const out: string[] = [];
    let buffer = '';

    const flush = () => {
      if (buffer.trim()) out.push(buffer.trim());
      buffer = '';
    };

    const isMainHeading = (l: string) => /^\d+\s+\S/.test(l) && !/^\d+\.\s/.test(l);      // "0 Úvod"
    const isSubHeading  = (l: string) => /^\d+\.\d+(\.\d+)?\s+\S/.test(l);               // "0.1 ..."
    const isBulletDot   = (l: string) => l.trim().startsWith('•');
    const isBulletNum   = (l: string) => /^\d+\.\s+\S/.test(l);                          // "1. ..."
    const isPageMeta    = (l: string) => /Strana\s+\d+\s+z\s+\d+/i.test(l) || /\d{4}-\d{2}-\d{2}/.test(l);

    // řádky, které musí zůstat samostatně
    const mustStayAlone = (l: string) =>
      !l.trim() ||
      isMainHeading(l) ||
      isSubHeading(l) ||
      isBulletDot(l) ||
      isBulletNum(l) ||
      isPageMeta(l);

    for (const line of rawLines) {
      const l = line.trim();

      if (mustStayAlone(l)) {
        flush();
        // prázdný řádek zachovej jako separator
        out.push(l);
        continue;
      }

      // jinak: je to normální text => připoj do bufferu
      if (!buffer) buffer = l;
      else buffer += ' ' + l;
    }

    flush();

    // zredukuj vícenásobné prázdné řádky
    return out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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
          onClick={() => startTranslation(true)}
          disabled={!pageText || isTranslating}
        >
          {isTranslating ? 'Překládá se...' : 'Přeložit'}
        </button>
        
        <button 
          onClick={saveTranslation}
          disabled={!translatedText}
          className="save-button"
        >
          💾 Uložit
        </button>
      </div>

      <div className="panel-content">
        {error && (
          <div className="translation-error">
            {error}
          </div>
        )}
        
        {isTranslating && !translatedText && (
          <div className="translation-loading">
            Spouští se překlad...
          </div>
        )}

        {translatedText && (
          <div className="translation-content">
            {(() => {
              const prettyText = reflowTranslatedText(translatedText);
              return prettyText.split('\n').map((line, i, allLines) => {
                const trimmedLine = line.trim();
                
                // Identify line type
                const isBullet = trimmedLine.startsWith('•');
                const isNumberedBullet = /^\d+\.\s/.test(trimmedLine); // 1. 2. 3. jsou také odrážky
                const isMainHeading = /^\d+\s/.test(trimmedLine) && !/^\d+\.\s/.test(trimmedLine); // 0 Úvod (bez tečky)
                const isSubHeading = /^\d+\.\d+(\.\d+)?\s/.test(trimmedLine); // 0.1, 0.2.1 apod.
                
                // Check if previous line was a bullet and this continues it (simplified)
                const isPreviousBullet = i > 0 && (
                  /^\d+\.\s/.test(allLines[i-1].trim()) || 
                  allLines[i-1].trim().startsWith('•')
                );
                
                const isContinuation =
                  isPreviousBullet &&
                  trimmedLine.length > 0 &&
                  !isBullet &&
                  !isNumberedBullet &&
                  !isMainHeading &&
                  !isSubHeading;
                
                // Determine CSS class
                let className = 'text-line';
                if (isBullet || isNumberedBullet) className = 'bullet-line';
                else if (isContinuation) className = 'bullet-continuation';
                else if (isSubHeading) className = 'sub-heading-line';
                else if (isMainHeading) className = 'heading-line';
                
                return (
                  <div key={i} className={className}>
                    {line || '\u00A0'} {/* Non-breaking space for empty lines */}
                  </div>
                );
              });
            })()}
            {isTranslating && (
              <span style={{ animation: 'blink 1s infinite' }}>▋</span>
            )}
          </div>
        )}

        {!pageText && !isTranslating && !error && (
          <div className="translation-loading">
            Vyberte PDF soubor a stránku pro překlad.
          </div>
        )}
      </div>
    </>
  );
};