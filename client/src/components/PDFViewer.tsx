import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { extractLayout } from '../documentLayout';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).href;

export type PDFReadState = 'empty' | 'loading' | 'ready' | 'error';

interface PDFViewerProps {
  onStatusChange?: (state: PDFReadState) => void;
  busy?: boolean;
  onPageChange: (pageNumber: number, pageText: string) => void;
  currentPage: number;
  onPageCountChange?: (totalPages: number) => void;
}

export interface PDFViewerHandle {
  extractPagesText: (fromPage: number, toPage: number) => Promise<Array<{ pageNumber: number; pageText: string }>>;
}

export const PDFViewer = forwardRef<PDFViewerHandle, PDFViewerProps>(({ 
  onPageChange, 
  currentPage,
  onPageCountChange, onStatusChange, busy = false
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState(false);
  const [loadError, setLoadError] = useState('');
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const renderVersionRef = useRef(0);
  const loadVersionRef = useRef(0);

  // Načte nový dokument. Vykreslení má jediného vlastníka v efektu níže.
  const loadPDF = async (file: File) => {
    const version = ++loadVersionRef.current;
    ++renderVersionRef.current;
    renderTaskRef.current?.cancel();
    setIsLoading(true);
    setLoadError('');
    onStatusChange?.('loading');
    setPdfDocument(null);
    setTotalPages(0);
    onPageCountChange?.(0);
    onPageChange(1, '');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({data: arrayBuffer, isEvalSupported: false}).promise;
      if (version !== loadVersionRef.current) { await pdf.destroy(); return; }
      setPdfDocument(pdf);
      setTotalPages(pdf.numPages);
      onPageCountChange?.(pdf.numPages);
    } catch {
      if (version === loadVersionRef.current) {
        setLoadError('PDF se nepodařilo načíst. Zkontroluj, zda není poškozené nebo chráněné heslem, a vyber soubor znovu.');
        onStatusChange?.('error');
      }
    } finally {
      if (version === loadVersionRef.current) setIsLoading(false);
    }
  };

  // Textové bloky i jejich vzhled odvozujeme ze zdrojového PDF, ne z překladu.
  const extractPageText = async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number): Promise<string> => {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    await page.getOperatorList();
    const styles = {...content.styles};
    for (const item of content.items as any[]) {
      if (!item.fontName) continue;
      try {
        const font = page.commonObjs.get(item.fontName);
        styles[item.fontName] = {...styles[item.fontName], fontFamily: font?.name || styles[item.fontName]?.fontFamily};
      } catch { /* Neznámý font zachováme s obecnou rodinou z PDF.js. */ }
    }
    return extractLayout(content.items, styles, page.getViewport({scale:1}));
  };

  // Zruší starší render a předá text pouze z poslední požadované stránky.
  const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number) => {
    const version = ++renderVersionRef.current;
    const previous = renderTaskRef.current;
    previous?.cancel();
    setIsRendering(true);
    setLoadError('');
    onStatusChange?.('loading');
    try {
      if (previous) await previous.promise.catch(() => undefined);
      const page = await pdf.getPage(pageNumber);
      if (version !== renderVersionRef.current) return;
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) throw new Error('Canvas unavailable');
      const viewport = page.getViewport({scale: 1});
      const scale = Math.min(
        (canvas.parentElement?.clientWidth || 800) / viewport.width,
        (canvas.parentElement?.clientHeight || 600) / viewport.height
      ) * 0.9;
      const scaledViewport = page.getViewport({scale});
      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;
      const task = page.render({canvasContext: context, viewport: scaledViewport});
      renderTaskRef.current = task;
      await task.promise;
      const text = await extractPageText(pdf, pageNumber);
      if (version !== renderVersionRef.current) return;
      onPageChange(pageNumber, text);
      onStatusChange?.('ready');
    } catch {
      if (version === renderVersionRef.current) {
        setLoadError('Stránku se nepodařilo načíst. Zkus jinou stránku nebo vyber PDF znovu.');
        onPageChange(pageNumber, '');
        onStatusChange?.('error');
      }
    } finally {
      if (version === renderVersionRef.current) setIsRendering(false);
    }
  };

  useImperativeHandle(ref, () => ({
    extractPagesText: async (fromPage: number, toPage: number) => {
      if (!pdfDocument) return [];
      const start = Math.max(1, Math.min(fromPage, toPage));
      const end = Math.min(totalPages, Math.max(fromPage, toPage));
      const out: Array<{ pageNumber: number; pageText: string }> = [];
      for (let p = start; p <= end; p += 1) {
        out.push({ pageNumber: p, pageText: await extractPageText(pdfDocument, p) });
      }
      return out;
    },
  }), [pdfDocument, totalPages]);

  // Opakovaný výběr stejného souboru je také nový pokus o načtení.
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void loadPDF(file);
  };

  // Navigace mění požadovanou stránku; render se spustí jen jednou v efektu.
  const goToPage = (pageNumber: number) => {
    if (pdfDocument && pageNumber >= 1 && pageNumber <= totalPages && !busy) {
      onPageChange(pageNumber, '');
    }
  };

  useEffect(() => {
    if (pdfDocument && currentPage >= 1 && currentPage <= pdfDocument.numPages) {
      void renderPage(pdfDocument, currentPage);
    }
    return () => { ++renderVersionRef.current; renderTaskRef.current?.cancel(); };
  }, [currentPage, pdfDocument]);

  useEffect(() => () => { void pdfDocument?.destroy(); }, [pdfDocument]);
  useEffect(() => () => { ++loadVersionRef.current; }, []);

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
          disabled={isLoading || isRendering || busy}
        >
          {isLoading ? 'Načítání...' : 'Vybrat PDF'}
        </button>
        
        {pdfDocument && (
          <>
            <button 
              onClick={handlePreviousPage} 
              disabled={currentPage <= 1 || isLoading || isRendering || busy}
            >
              ← Předchozí
            </button>
            <span className="page-info">
              Stránka {currentPage} z {totalPages}
            </span>
            <button 
              onClick={handleNextPage} 
              disabled={currentPage >= totalPages || isLoading || isRendering || busy}
            >
              Další →
            </button>
          </>
        )}
      </div>
      
      {loadError && <p className="translation-error" role="alert">{loadError}</p>}
      {(isLoading || isRendering) && <p className="pdf-status" role="status">Načítám PDF a text stránky…</p>}
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
});