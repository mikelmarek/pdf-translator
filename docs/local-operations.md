# Lokální režim v Markově systému

Původní server src/index.ts a Vercel konfigurace zůstávají zdrojem starého API prototypu. Nový režim spouštějte pouze přes server/dist/local.js, po sestavení serveru a klienta. Původní npm start serveru nepoužívá nový agentní režim.

Integraci vlastní marek-agent-runtime, scripts/pdf-translator/start.sh. Konfigurace PDF_PROXY_SECRET_FILE a PDF_STATE_DIR se předává prostředím, tajemství a state nejsou součástí repozitáře. Server naslouchá pouze na loopbacku a vyžaduje proxy tajemství i pro statické soubory. Samostatný Vite dev server nemá soukromou gateway integraci.

Instalace zachovává npm package-lock.json. Build: npm run build. Lokální start po konfiguraci: npm run start:local. Kompletní aktuální dokumentace a milníky jsou na soukromém dashboardu /pdf-translator/.

Ověřeno sestavení a jeden skutečný Codex překlad syntetické věty. Izolovaný test v Runtime tests/pdf-translator/http-smoke.py používá falešný model. Celý PDF export, mobilní UX, OCR a veřejné víceuživatelské nasazení nejsou tímto ověřené.
