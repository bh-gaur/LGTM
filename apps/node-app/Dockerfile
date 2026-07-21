FROM node:20-slim

WORKDIR /app

COPY node-app/package.json ./node-app/

RUN cd node-app && npm install

COPY common ./common
COPY node-app/ ./node-app/

WORKDIR /app/node-app

EXPOSE 8081

CMD ["npm", "start"]
