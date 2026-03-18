FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install --production
# Cache bust: 1773844375
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
