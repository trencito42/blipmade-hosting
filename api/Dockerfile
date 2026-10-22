FROM node:22-alpine AS build

WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npx tsc -p tsconfig.json

FROM node:22-alpine AS runtime

WORKDIR /app
RUN apk add --no-cache openssl wget \
  && addgroup -S blip && adduser -S blip -G blip \
  && mkdir -p /var/backups/blipmade && chown -R blip:blip /var/backups/blipmade

ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh \
  && chmod -R a+rX /app/dist /app/prisma \
  && chmod -R a+rX /app/node_modules/.prisma /app/node_modules/@prisma

USER blip
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3100/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
