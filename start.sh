#!/bin/bash

echo "🚀 Spouštím PDF Překladač..."
echo ""

# Zkontroluj, zda existují potřebné adresáře
if [ ! -d "server" ] || [ ! -d "client" ]; then
    echo "❌ Chyba: Nejste v root adresáři projektu!"
    echo "   Přejděte do adresáře s 'server' a 'client' složkami"
    exit 1
fi

# Zabij všechny staré procesy na portech 3000 a 3001
echo "🧹 Uklízím staré procesy..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
pkill -f "nodemon" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

sleep 2

echo ""
echo "🔧 Spouštím Backend (port 3001)..."
cd server
npm run dev &
SERVER_PID=$!

echo "🎨 Spouštím Frontend (port 3000)..."
cd ../client  
npm run dev &
CLIENT_PID=$!

echo ""
echo "✅ Aplikace se spouští..."
echo "   📊 Backend:  http://localhost:3001"
echo "   🎯 Frontend: http://localhost:3000"
echo ""
echo "⚡ Pro zastavení aplikace stiskněte Ctrl+C"

# Čekej na Ctrl+C a pak zabij oba procesy
trap "echo ''; echo '🛑 Zastavuji aplikaci...'; kill $SERVER_PID $CLIENT_PID 2>/dev/null; exit 0" SIGINT

# Čekej
wait