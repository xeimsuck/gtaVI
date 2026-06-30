# Vice Online — single-container build. Serves the browser client AND
# the multiplayer WebSocket server on one port ($PORT).
FROM node:20-alpine

WORKDIR /app

# install deps first for better layer caching
COPY package*.json ./
RUN npm install --omit=dev

# app source
COPY . .

ENV NODE_ENV=production
# Render/Railway/Fly inject PORT; default to 3000 locally.
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]
