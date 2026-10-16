FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json ./
COPY src ./src
COPY tools/generate-validators.mjs ./tools/generate-validators.mjs
COPY contracts ./contracts
RUN npm run build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production BIND_HOST=0.0.0.0 PORT=18180
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node contracts ./contracts
USER node
EXPOSE 18180
CMD ["node","server/index.mjs"]
