FROM node:18-bullseye

# Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    sqlite3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Копируем весь проект
COPY . .

# Собираем TypeScript (сервер + фронт)
RUN npm run build

# Пересобираем native-модуль better-sqlite3 под Linux
RUN npm rebuild better-sqlite3 --build-from-source

# Создаём директорию для БД
RUN mkdir -p data

EXPOSE 443

# Стартуем сервер
CMD ["node", "dist/server.js"]

