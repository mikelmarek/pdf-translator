import React, { useState } from 'react';

interface LoginProps {
  onLogin: (token: string, username: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const OPENAI_KEY_STORAGE_KEY = 'pdf-translator-openai-api-key';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState(() => {
    try {
      return localStorage.getItem(OPENAI_KEY_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError('');
    setIsLoading(true);

    try {
      const cleanUsername = username.trim().toLowerCase();
      if (!cleanUsername) {
        setError('Zadej uživatelské jméno');
        return;
      }
      if (password.length < 6) {
        setError('Heslo musí mít alespoň 6 znaků');
        return;
      }

      if (!openaiApiKey.trim().startsWith('sk-')) {
        setError('OpenAI API klíč musí začínat na sk-');
        return;
      }

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername, password, openaiApiKey: openaiApiKey.trim() }),
      });

      const loginData = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok) {
        throw new Error(loginData.error || 'Přihlášení selhalo');
      }

      if (!loginData.token) throw new Error('Chybí token ze serveru');
      // clear sensitive inputs ASAP
      setPassword('');
      onLogin(loginData.token, loginData.username || cleanUsername);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nastala chyba');
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <div className="login-header">
          <h1>🔒 PDF Překladač</h1>
          <p>Přihlášení</p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Uživatelské jméno"
              className="password-input"
              autoComplete="username"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Heslo"
              className="password-input"
              autoComplete="current-password"
            />
          </div>

          <div className="form-group">
            <input
              type="password"
              value={openaiApiKey}
              onChange={(e) => {
                const v = e.target.value;
                setOpenaiApiKey(v);
                try {
                  if (v.trim()) localStorage.setItem(OPENAI_KEY_STORAGE_KEY, v);
                  else localStorage.removeItem(OPENAI_KEY_STORAGE_KEY);
                } catch {
                  // ignore
                }
              }}
              placeholder="OpenAI API klíč (sk-...)"
              className="password-input"
              autoComplete="off"
              name="openaiApiKey"
              id="openaiApiKey"
            />
          </div>
          
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}
          
          <button type="submit" className="login-button">
            {isLoading ? 'Pracuji…' : 'Přihlásit se'}
          </button>
        </form>
        
      </div>
    </div>
  );
};