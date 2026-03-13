#!/bin/sh
set -e

echo "🔄 Running database migrations..."
cd /app/apps/api
npx drizzle-kit push
echo "✅ Migrations applied!"

echo "🚀 Starting API..."
cd /app
node apps/api/dist/main.js
