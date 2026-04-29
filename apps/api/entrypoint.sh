#!/bin/sh

echo "Waiting for database to be ready..."
MAX_RETRIES=30
RETRY=0
until node -e "const{Client}=require('pg');const c=new Client(process.env.DATABASE_URL);c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "ERROR: Database not reachable after ${MAX_RETRIES} attempts"
    exit 1
  fi
  echo "Database not ready yet (attempt ${RETRY}/${MAX_RETRIES})... retrying in 2s"
  sleep 2
done
echo "Database is ready!"

echo "Running database schema push..."
cd /app/apps/api
npx drizzle-kit push || echo "WARNING: drizzle-kit push failed, starting API anyway..."
echo "Schema push complete!"

echo "Starting API..."
cd /app
exec node apps/api/dist/main.js
