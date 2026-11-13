FROM node:22-alpine AS build
WORKDIR /app
COPY FRONTEND/package.json FRONTEND/package-lock.json ./
RUN npm ci
COPY FRONTEND/ ./
RUN npm run build:site

FROM nginx:1.27-alpine
COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist-site /usr/share/nginx/html
EXPOSE 80
