FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src/

RUN npm ci
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/
COPY prisma.config.js ./

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push && node dist/src/main.js"]
