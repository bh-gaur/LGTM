FROM node:20-slim

WORKDIR /app

COPY auth-service/package.json ./auth-service/

COPY common ./common
COPY auth-service/ ./auth-service/

WORKDIR /app/auth-service

RUN npm install --legacy-peer-deps && ln -s /app/auth-service/node_modules /app/node_modules

EXPOSE 8082

CMD ["npm", "start"]
