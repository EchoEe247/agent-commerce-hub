FROM node:24-alpine

# Run as a non-root user available in the base image.
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

USER app
EXPOSE 4021

ENV HOST=0.0.0.0
ENV PORT=4021
ENV X402_ENABLED=false
ENV ALLOW_MAINNET=false

CMD ["node", "src/server.mjs"]