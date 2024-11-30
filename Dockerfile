FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000
ENV PORT 3000
ENV NODE_ENV production

CMD ["npm", "run", "start"]
