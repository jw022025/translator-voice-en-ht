# Simple, production-friendly Node image
FROM node:20-alpine

WORKDIR /app

# Install deps (none yet, but keeps layer stable when you add some)
COPY package*.json ./
RUN npm install --omit=dev || true

# Copy app code
COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]