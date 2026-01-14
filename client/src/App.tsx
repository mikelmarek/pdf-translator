import { useState, useEffect } from 'react';
import { PDFViewer } from './components/PDFViewer';
import { TranslationPanel } from './components/TranslationPanel';
import { Login } from './components/Login';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageText, setPageText] = useState<string>('');
  const [targetLanguage, setTargetLanguage] = useState<string>('czech');
  const [, setTotalPages] = useState<number>(0);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Check authentication on load
  useEffect(() => {
    const authToken = localStorage.getItem('pdf-translator-auth');
    setIsAuthenticated(authToken === 'true');
  }, []);

  // Handle login
  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('pdf-translator-auth');
    setIsAuthenticated(false);
  };

  // Handle page change from PDF viewer
  const handlePageChange = (pageNumber: number, text: string) => {
    setCurrentPage(pageNumber);
    setPageText(text);
  };

  // Handle language change from translation panel
  const handleLanguageChange = (language: string) => {
    setTargetLanguage(language);
  };

  // Handle total page count change
  const handlePageCountChange = (pages: number) => {
    setTotalPages(pages);
  };

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>🤖 PDF Překladač</h1>
        <button onClick={handleLogout} className="logout-button">
          Odhlásit se
        </button>
      </div>
      
      <div className="app-content">
        <div className="pdf-panel">
          <PDFViewer 
            currentPage={currentPage}
            onPageChange={handlePageChange}
            onPageCountChange={handlePageCountChange}
          />
        </div>
        
        <div className="translation-panel">
          <TranslationPanel 
            pageText={pageText}
            currentPage={currentPage}
            targetLanguage={targetLanguage}
            onLanguageChange={handleLanguageChange}
          />
        </div>
      </div>
    </div>
  );
}

export default App;