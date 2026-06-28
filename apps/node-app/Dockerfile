FROM node:20-slim

WORKDIR /app

COPY package.json .

RUN npm install

COPY app.js instrumentation.js ./

EXPOSE 8081

# Command requires loading the instrumentation script first
CMD ["npm", "start"]
