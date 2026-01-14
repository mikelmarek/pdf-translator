import React, { useRef, useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFViewerProps {
  onPageChange: (pageNumber: number, pageText: string) => void;
  currentPage: number;
  onPageCountChange?: (totalPages: number) => void;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ 
  onPageChange, 
  currentPage,
  onPageCountChange 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load PDF file
  const loadPDF = async (file: File) => {
    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      setPdfDocument(pdf);
      setTotalPages(pdf.numPages);
      onPageCountChange?.(pdf.numPages);
      
      // Load first page by default
      await renderPage(pdf, 1);
    } catch (error) {
      console.error('Error loading PDF:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Clean page text (fallback textual filters for edge cases)
  const cleanPageText = (rawText: string): string => {
    const lines = rawText.split('\n');

    const cleaned = lines.filter(line => {
      const l = line.trim();

      // prázdné řádky nech
      if (!l) return true;

      // FALLBACK textové filtry pro extrémní případy
      // (většinu už vyřeší geometrické filtrování)
      
      // Copyright - všude může být problematické
      if (/©/.test(l)) return false;
      
      // Stránkování + verze + datum (backup filtry)
      if (/Strana\s+\d+\s+z\s+\d+/i.test(l)) return false;
      if (/v\d+\.\d+\s+Strana/i.test(l)) return false;
      if (/\d{4}-\d{2}-\d{2}/.test(l)) return false;

      return true;
    });

    return cleaned.join('\n');
  };

  // Normalize text by removing trademark symbols and extra spaces
  const normalizeText = (text: string): string =>
    text
      .replace(/[®©]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

  // Render specific page
  const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number) => {
    try {
      const page = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      // Calculate scale to fit canvas
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        (canvas.parentElement?.clientWidth || 800) / viewport.width,
        (canvas.parentElement?.clientHeight || 600) / viewport.height
      ) * 0.9; // 90% to leave some margin

      const scaledViewport = page.getViewport({ scale });

      // Set canvas dimensions
      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;

      // Render page
      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
      }).promise;

      // Extract text content from the page (preserve layout/line breaks)
      const textContent = await page.getTextContent();
      
      // Get page dimensions for geometric header/footer detection
      const baseViewport = page.getViewport({ scale: 1 });
      const pageHeight = baseViewport.height;

      // Define header/footer zones (percentages of page height)
      const headerZone = pageHeight * 0.10; // 10% nahoře
      const footerZone = pageHeight * 0.08; // 8% dole
      const skipHeaderFooter = pageNumber > 1; // Skip only from 2nd page onwards

      type AnyItem = any;
      const items = textContent.items as AnyItem[];

      const lines: string[] = [];
      let currentLine = '';
      let lastY: number | null = null;

      // tolerance for "same line" (pdf.js coords can be floaty)
      const sameLineTolerance = 2;

      for (const it of items) {
        if (!it || typeof it.str !== 'string') continue;

        const y = Array.isArray(it.transform) ? it.transform[5] : null;

        // Geometric header/footer detection
        if (typeof y === 'number' && skipHeaderFooter) {
          // y=0 bývá dole, y=height nahoře (PDF coords)
          const isHeader = y > (pageHeight - headerZone);
          const isFooter = y < footerZone;
          
          // Optional: only skip small text in header/footer zones
          const fontSizeApprox = Math.abs(it.transform?.[0] ?? 0);
          const isSmallText = fontSizeApprox < 14;

          if ((isHeader || isFooter) && isSmallText) continue; // 🔥 vyhodit hlavičku/patičku
        }

        // If y changes enough => new line
        if (lastY !== null && typeof y === 'number' && Math.abs(y - lastY) > sameLineTolerance) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
        }

        // Append token
        currentLine += it.str;

        // Add a space if token doesn't end with punctuation/hyphen (optional)
        currentLine += ' ';

        // Some pdf.js versions provide hasEOL -> enforce line break
        if (it.hasEOL) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
          lastY = null;
          continue;
        }

        if (typeof y === 'number') lastY = y;
      }

      if (currentLine.trim()) lines.push(currentLine.trim());

      // Final: keep newlines (do NOT normalize to one line)
      const pageText = lines
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');

      // Clean text from headers, footers, copyright, metadata
      const cleanedText = normalizeText(cleanPageText(pageText));

      // Notify parent component about page change
      onPageChange(pageNumber, cleanedText);
    } catch (error) {
      console.error('Error rendering page:', error);
    }
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      loadPDF(file);
    }
  };

  // Handle page navigation
  const goToPage = async (pageNumber: number) => {
    if (pdfDocument && pageNumber >= 1 && pageNumber <= totalPages) {
      await renderPage(pdfDocument, pageNumber);
    }
  };

  // Effect to handle current page changes from parent
  useEffect(() => {
    if (pdfDocument && currentPage !== 0) {
      goToPage(currentPage);
    }
  }, [currentPage, pdfDocument]);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  };

  return (
    <div className="pdf-viewer">
      <div className="panel-header">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          {isLoading ? 'Načítání...' : 'Vybrat PDF'}
        </button>
        
        {pdfDocument && (
          <>
            <button 
              onClick={handlePreviousPage} 
              disabled={currentPage <= 1}
            >
              ← Předchozí
            </button>
            <span className="page-info">
              Stránka {currentPage} z {totalPages}
            </span>
            <button 
              onClick={handleNextPage} 
              disabled={currentPage >= totalPages}
            >
              Další →
            </button>
          </>
        )}
      </div>
      
      <div className="panel-content">
        <canvas 
          ref={canvasRef}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%',
            border: '1px solid #ddd'
          }}
        />
      </div>
    </div>
  );
};