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

      // Extract text content from the page
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => {
          if ('str' in item) {
            return item.str;
          }
          return '';
        })
        .join(' ')
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      // Notify parent component about page change
      onPageChange(pageNumber, pageText);
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