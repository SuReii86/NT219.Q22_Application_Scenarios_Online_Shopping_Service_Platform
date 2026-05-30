FROM node:24-alpine

ARG SERVICE_DIR
WORKDIR /app

COPY ${SERVICE_DIR}/package.json ./package.json
RUN npm install --omit=dev

COPY services/shared ./shared
COPY ${SERVICE_DIR}/ ./

CMD ["npm", "start"]