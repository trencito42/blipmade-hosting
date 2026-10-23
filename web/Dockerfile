FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV SERVER_PORT=3000

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY index.html server.mjs fontkit.mjs ./
COPY public ./public
# The source files may carry restrictive permissions from the build machine, so
# the runtime user is given read access to everything it serves.
RUN chmod -R a+rX /app/dist /app/public \
  && chmod 644 /app/index.html /app/server.mjs /app/fontkit.mjs \
  && chmod -R a+rX /app/node_modules

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1

CMD ["node", "server.mjs"]
