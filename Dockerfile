FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
ENV DB_PATH=/var/data/taiba.db
EXPOSE 3000
CMD ["npm", "start"]
