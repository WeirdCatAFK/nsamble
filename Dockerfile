ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-alpine AS build

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma7.config.ts ./
COPY src/env.js ./src/env.js
RUN npm run prisma:generate

FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build --chown=node:node /usr/src/app/src/generated ./src/generated
COPY --chown=node:node . .

USER node

EXPOSE 3000

CMD ["npm", "start"]
