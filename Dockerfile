# Multi-stage Docker build for Render deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY . .

ENV NITRO_PRESET=node-server
ENV NODE_ENV=production

RUN npm run build

# Runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# Copy built production server
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package*.json ./

EXPOSE 10000

CMD ["node", ".output/server/index.mjs"]
