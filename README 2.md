

### С Docker (рекомендуется)

```bash
# Сборка и запуск
docker-compose up --build

# Или с Docker напрямую
docker build -t tranccompr .
docker run -p 3000:3000 tranccompr
```

### Тестирование базы данных

```bash
# Запуск тестового скрипта
chmod +x test-sqlite.sh
./test-sqlite.sh

# Или напрямую через SQLite3
sqlite3 data/chat.db
```

### Без Docker

```bash
# Установка зависимостей
npm install

# Компиляция TypeScript
npm run build

# Запуск сервера
npm start
```

## 🔒 HTTPS

Сервер запускается на HTTPS порту **8443**:
- **URL**: https://localhost:8443
- **SSL**: Самоподписанный сертификат (для разработки)

## 📊 База данных

Используется SQLite с следующими таблицами:
- `users` - пользователи
- `messages` - сообщения чата
- `friends` - список друзей
- `blocks` - заблокированные пользователи
- `game_invites` - приглашения в игру
- `match_history` - история матчей

## 🛠️ API Endpoints

- `GET /` - Главная страница
- `GET /api/users` - Получить всех пользователей
- `POST /api/messages` - Отправить сообщение
- `GET /api/messages/:userId` - Получить сообщения пользователя

## 📁 Структура проекта

```
├── db.ts              # База данных и SQL запросы
├── server.ts          # HTTPS сервер
├── package.json       # Зависимости
├── tsconfig.json      # Конфигурация TypeScript
├── Dockerfile         # Docker образ
├── docker-compose.yml # Docker Compose
└── README.md         # Документация
```

## 🔧 Разработка

```bash
# Режим разработки
npm run dev

# Компиляция
npm run build
```

## 📝 Требования

- Node.js 18+
- Docker (опционально)
- TypeScript 5+
