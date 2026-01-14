import React, { useState } from 'react';

interface LoginProps {
  onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Jednoduchá kontrola hesla
    const correctPassword = import.meta.env.VITE_APP_PASSWORD || 'prekladac2026';
    
    if (password === correctPassword) {
      localStorage.setItem('pdf-translator-auth', 'true');
      onLogin();
    } else {
      setError('Nesprávné heslo');
      setPassword('');
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <div className="login-header">
          <h1>🔒 PDF Překladač</h1>
          <p>Zadejte heslo pro přístup k aplikaci</p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Zadejte heslo..."
              className="password-input"
              autoFocus
            />
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <button type="submit" className="login-button">
            Přihlásit se
          </button>
        </form>
        
        <div className="login-footer">
          <p>🤖 AI-powered PDF Translation</p>
        </div>
      </div>
    </div>
  );
};