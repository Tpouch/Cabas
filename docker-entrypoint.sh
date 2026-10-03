#!/bin/sh
set -e
cd /opt/migrate
./node_modules/.bin/prisma migrate deploy
cd /app
exec node server.js
