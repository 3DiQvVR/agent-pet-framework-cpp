FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY app ./app
COPY tsconfig.json next.config.mjs ./
ENV NEXT_TELEMETRY_DISABLED=1 API_ORIGIN=http://api:8000
RUN npm run build
USER node
CMD ["npm","start"]
