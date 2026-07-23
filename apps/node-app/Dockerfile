FROM node:20-slim

WORKDIR /app

COPY common ./common
COPY node-app ./node-app

WORKDIR /app/node-app

RUN npm install --legacy-peer-deps && ln -s /app/node-app/node_modules /app/node_modules

ENV NODE_PATH=/app/node-app/node_modules

EXPOSE 8081

CMD ["npm", "start"]
