#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "📦 Installation des dépendances Node.js…"
npm install --silent

echo "🚀 Démarrage du serveur SR10…"
node server.js
