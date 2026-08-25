FROM node:20-slim AS builder

WORKDIR /app

COPY auth-service/package*.json ./auth-service/

WORKDIR /app/auth-service

RUN npm install --legacy-peer-deps && \
    npm prune --omit=dev --legacy-peer-deps

COPY common /app/common
COPY auth-service /app/auth-service

FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_PATH=/app/auth-service/node_modules

COPY --from=builder /app/common ./common
COPY --from=builder /app/auth-service ./auth-service

RUN ln -s /app/auth-service/node_modules /app/node_modules

WORKDIR /app/auth-service

EXPOSE 8082

CMD ["npm", "start"]

