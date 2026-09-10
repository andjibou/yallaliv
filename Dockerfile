# ===== YallaLiv : image Docker (Back4app Containers, Render, etc.) =====
# Étape 1 : construction du site (Vite)
FROM node:20-alpine AS webbuild
WORKDIR /build
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Étape 2 : image finale = API Express + site construit (un seul service)
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY --from=webbuild /build/dist ./web/dist
# Le port est fourni par la plateforme (variable PORT) — index.js la lit déjà.
EXPOSE 8080
CMD ["node", "server/index.js"]
