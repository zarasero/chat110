import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'https';
import fs from 'fs';
import path from 'path';
import * as db from './db';

async function startServer() {
  const fastify = Fastify();

  // ===== Подключаем плагины Fastify =====
  await fastify.register(import('@fastify/static'), {
    root: path.join(process.cwd(), 'build'),
    prefix: '/',
  });

  await fastify.register(import('@fastify/cors'), {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
  });

  // ===== Хранилище подключённых пользователей =====
  const connectedUsers = new Map<string, { userId: string; username: string; avatar: string }>();

  // ===== React Router fallback =====
  fastify.setNotFoundHandler((request: any, reply: any) => {
    if (!request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    reply.code(404).send({ error: 'Not Found' });
  });

  // ======================================================
  // ===================   REST API   =====================
  // ======================================================

  fastify.post('/api/users', async (request: any, reply: any) => {
    try {
      console.log('🔵 [REST API] 📥 POST /api/users - Request received');
      const { username, avatar = '👤' } = request.body as any;
      console.log('🔵 [REST API] 📝 Request body:', { username, avatar });
      
      if (!username) {
        console.log('🔵 [REST API] ❌ Username is missing');
        return reply.code(400).send({ error: 'Username is required' });
      }

      const existingUser = db.userQueries.getUserByUsername.get(username);
      if (existingUser) {
        console.log('🔵 [REST API] ⚠️ User already exists:', username);
        return reply.code(409).send({ error: 'User already exists' });
      }

      const userId = `user-${Date.now()}`;
      console.log('🔵 [REST API] 🆕 Creating new user:', { userId, username, avatar });
      db.userQueries.createUser.run(userId, username, avatar);
      console.log('🔵 [REST API] ✅ User created successfully');

      return { success: true, user: { id: userId, username, avatar } };
    } catch (error) {
      console.error('🔵 [REST API] ❌ Create user error:', error);
      return reply.code(500).send({ error: 'Failed to create user' });
    }
  });

  fastify.get('/api/users', async (_request: any, reply: any) => {
    try {
      console.log('🔵 [REST API] 📥 GET /api/users - Fetching all users');
      const users = db.userQueries.getAllUsers.all();
      console.log(`🔵 [REST API] ✅ Retrieved ${users.length} users`);
      return { users };
    } catch (error) {
      console.error('🔵 [REST API] ❌ Get users error:', error);
      return reply.code(500).send({ error: 'Failed to get users' });
    }
  });

  fastify.get('/api/messages/:userId/:receiverId', async (request: any, reply: any) => {
    try {
      const { userId, receiverId } = request.params as any;
      console.log('🔵 [REST API] 📥 GET /api/messages - Fetching messages between:', { userId, receiverId });

      const isBlocked = db.blockQueries.checkBlock.get(userId, receiverId, receiverId, userId);
      if (isBlocked) {
        console.log('🔵 [REST API] 🚫 Users are blocked from each other, returning empty messages');
        return { messages: [] };
      }

      const messages = db.messageQueries.getMessages.all(userId, receiverId, receiverId, userId);
      console.log('🔵 [REST API] 📜 Raw messages from DB:', messages);
      
      // Маппим поля из БД в формат клиента
      const mappedMessages = messages.map((msg: any) => ({
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        content: msg.content,
        timestamp: msg.timestamp,
      }));
      
      console.log('🔵 [REST API] 📜 Mapped messages:', mappedMessages);
      console.log(`🔵 [REST API] ✅ Returning ${mappedMessages.length} messages`);
      return { messages: mappedMessages };
    } catch (error) {
      console.error('🔵 [REST API] ❌ Get messages error:', error);
      return reply.code(500).send({ error: 'Failed to get messages' });
    }
  });

  fastify.post('/api/messages', async (request: any, reply: any) => {
    try {
      console.log('🔵 [REST API] 📥 POST /api/messages - New message received via REST API');
      const { senderId, receiverId, content } = request.body as any;
      console.log('🔵 [REST API] 📝 Message data:', { senderId, receiverId, content });
      
      if (!senderId || !receiverId || !content) {
        console.log('🔵 [REST API] ❌ Missing required fields');
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      const isBlocked = db.blockQueries.checkBlock.get(senderId, receiverId, receiverId, senderId);
      if (isBlocked) {
        console.log('🔵 [REST API] 🚫 User is blocked, message not sent');
        return reply.code(403).send({ error: 'User is blocked' });
      }

      console.log('🔵 [REST API] 💾 Saving message to database');
      db.messageQueries.insertMessage.run(senderId, receiverId, content);
      console.log('🔵 [REST API] ✅ Message saved successfully via REST API');
      return { success: true };
    } catch (error) {
      console.error('🔵 [REST API] ❌ Send message error:', error);
      return reply.code(500).send({ error: 'Failed to send message' });
    }
  });

  fastify.post('/api/block', async (request: any, reply: any) => {
    try {
      console.log('🔵 [REST API] 📥 POST /api/block - Block user request');
      const { blockerId, blockedId } = request.body as any;
      console.log('🔵 [REST API] 📝 Block data:', { blockerId, blockedId });
      
      if (!blockerId || !blockedId) {
        console.log('🔵 [REST API] ❌ Missing required fields');
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      console.log(`🔵 [REST API] 🚫 Blocking user ${blockedId} by ${blockerId}`);
      db.blockQueries.insertBlock.run(blockerId, blockedId);
      console.log('🔵 [REST API] ✅ User blocked successfully');
      return { success: true };
    } catch (error) {
      console.error('🔵 [REST API] ❌ Block user error:', error);
      return reply.code(500).send({ error: 'Failed to block user' });
    }
  });

  fastify.delete('/api/block', async (request: any, reply: any) => {
    try {
      console.log('🔵 [REST API] 📥 DELETE /api/block - Unblock user request');
      const { blockerId, blockedId } = request.body as any;
      console.log('🔵 [REST API] 📝 Unblock data:', { blockerId, blockedId });
      
      if (!blockerId || !blockedId) {
        console.log('🔵 [REST API] ❌ Missing required fields');
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      console.log(`🔵 [REST API] 🔓 Unblocking user ${blockedId} by ${blockerId}`);
      db.blockQueries.deleteBlock.run(blockerId, blockedId);
      console.log('🔵 [REST API] ✅ User unblocked successfully');
      return { success: true };
    } catch (error) {
      console.error('🔵 [REST API] ❌ Unblock user error:', error);
      return reply.code(500).send({ error: 'Failed to unblock user' });
    }
  });

  fastify.get('/api/blocks/:userId', async (request: any, reply: any) => {
    try {
      const { userId } = request.params as any;
      console.log('🔵 [REST API] 📥 GET /api/blocks - Fetching blocked users for:', userId);
      const blocks = db.blockQueries.getBlocksByUser.all(userId);
      console.log(`🔵 [REST API] ✅ Found ${blocks.length} blocked users for ${userId}`);
      return { blocks };
    } catch (error) {
      console.error('🔵 [REST API] ❌ Get blocks error:', error);
      return reply.code(500).send({ error: 'Failed to get blocked users' });
    }
  });

  fastify.get('/api/profile/:userId', async (request: any, reply: any) => {
    try {
      const { userId } = request.params as any;
      console.log('🔵 [REST API] 📥 GET /api/profile - Fetching profile for:', userId);
      const user = db.userQueries.getUserById.get(userId);
      if (!user) {
        console.log('🔵 [REST API] ❌ User not found:', userId);
        return reply.code(404).send({ error: 'User not found' });
      }

      const matches = db.gameQueries.getMatchHistory.all(userId, userId);
      const friends = db.friendQueries.getFriends.all(userId);
      console.log(`🔵 [REST API] ✅ Profile fetched: ${matches.length} matches, ${friends.length} friends`);
      return {
        user,
        matches,
        friends,
        stats: { totalMatches: matches.length, totalFriends: friends.length },
      };
    } catch (error) {
      console.error('🔵 [REST API] ❌ Get profile error:', error);
      return reply.code(500).send({ error: 'Failed to get user profile' });
    }
  });


  /*{
  "user": { "id": "user-1", "username": "Alice", "avatar": "👩" },
  "matches": [
    { "id": 1, "winner_id": "user-1", "loser_id": "user-2", "date": "2025-10-20" },
    { "id": 2, "winner_id": "user-3", "loser_id": "user-1", "date": "2025-10-22" }
  ],
  "friends": [
    { "friend_id": "user-2", "friend_name": "Bob", "avatar": "👨" },
    { "friend_id": "user-3", "friend_name": "Charlie", "avatar": "🧑" }
  ],
  "stats": { "totalMatches": 2, "totalFriends": 2 }
}
 */

  // ===== Предварительное объявление io, чтобы использовать его в API =====
  let io: SocketIOServer;

  fastify.post('/api/tournament', async (request: any, reply: any) => {
    try {
      console.log('🔵 [REST API] 📥 POST /api/tournament - Tournament notification request');
      const { title, message } = request.body as any;
      console.log('🔵 [REST API] 📝 Tournament data:', { title, message });
      
      if (!title || !message) {
        console.log('🔵 [REST API] ❌ Missing required fields');
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      console.log('🔵 [REST API] 💾 Saving tournament notification to database');
      const stmt = db.database.prepare(
        'INSERT INTO tournament_notifications (title, message) VALUES (?, ?)'
      );
      stmt.run(title, message);
      console.log('🔵 [REST API] ✅ Tournament notification saved');

      // io будет инициализирован ниже, после ready()
      console.log('🔵 [REST API] 📡 Broadcasting tournament notification to all clients');
      io?.emit('tournament_notification', {
        title,
        message,
        created_at: new Date().toISOString(),
      });
      console.log('🔵 [REST API] ✅ Tournament notification sent');

      return { success: true };
    } catch (error) {
      console.error('🔵 [REST API] ❌ Tournament notify error:', error);
      return reply.code(500).send({ error: 'Failed to create tournament notification' });
    }
  });

  fastify.post('/api/log', async (request: any, reply: any) => {
    try {
      const { level = 'info', message } = request.body as any;
      const prefix = level.toUpperCase();
      console.log(`🧠 [CLIENT LOG][${prefix}] ${message}`);
      reply.send({ ok: true });
    } catch (error) {
      console.error('🔵 [REST API] ❌ Log error:', error);
      reply.code(500).send({ error: 'Failed to log' });
    }
  });

  // ======================================================
  // =========== Инициализация HTTPS + Socket.IO ==========
  // ======================================================

  const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
  };

  const server = createServer(options, (req, res) => {
    fastify.server.emit('request', req, res);
  });

  await fastify.ready(); // после этого нельзя добавлять маршруты!

  io = new SocketIOServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'DELETE'] },
  });

  // ======================================================
  // ================= SOCKET.IO ЛОГИКА ==================
  // ======================================================

  io.on('connection', (socket) => {
    console.log('🟢 [SOCKET] Client connected:', socket.id);
    console.log('🟢 [SOCKET] Total connected users:', io.engine.clientsCount);

    socket.on('user_join', (data: any) => {
      console.log('🟢 [SOCKET] user_join event received from:', socket.id);
      console.log('🟢 [SOCKET] Join data:', data);
      
      if (!data?.userId || !data?.username) {
        console.log('🟢 [SOCKET] ❌ Invalid user data received');
        return socket.emit('error', { message: 'Invalid user data' });
      }

      const { userId, username, avatar } = data;
      console.log(`🟢 [SOCKET] 👤 Adding user to connected users: ${username} (${userId})`);
      connectedUsers.set(socket.id, { userId, username, avatar });

      console.log('🟢 [SOCKET] 💾 Updating user online status in database');
      db.userQueries.updateUserOnline.run(1, new Date().toISOString(), userId);
      console.log('🟢 [SOCKET] 📡 Broadcasting updated online users list');
      io.emit('online_users', Array.from(connectedUsers.values()));
      console.log('🟢 [SOCKET] ✅ User joined successfully');
    });

     socket.on('private_message', (data: any) => {
       console.log('🟢 [SOCKET] 📨 private_message event received from socket:', socket.id);
       console.log('🟢 [SOCKET] 📨 Received private message:', data);
       
       const { senderId, receiverId, content } = data;
       
       // Проверяем наличие всех обязательных полей
       if (!senderId || !receiverId || !content) {
         console.error('🟢 [SOCKET] ❌ Missing required fields:', { senderId, receiverId, content });
         return;
       }
       
       console.log('🟢 [SOCKET] 🔍 Checking if users are blocked');
       const timestamp = new Date().toISOString();

       try {
         const isBlocked = db.blockQueries.checkBlock?.get?.(
           senderId,
           receiverId,
           receiverId,
           senderId
         );
         if (isBlocked) {
           console.warn(`🟢 [SOCKET] 🚫 Message blocked between ${senderId} and ${receiverId}`);
           return;
         }
         console.log('🟢 [SOCKET] ✅ Users are not blocked, proceeding with message');

         console.log('🟢 [SOCKET] 💾 Saving message to database');
         db.messageQueries.insertMessage.run(senderId, receiverId, content);
         console.log('🟢 [SOCKET] ✅ Message saved to database');

         const messageData = { senderId, receiverId, content, timestamp };
         console.log('🟢 [SOCKET] 📤 Preparing to send message to connected users');

         // Отправляем сообщение всем участникам диалога
         let sentCount = 0;
         for (const [sockId, user] of connectedUsers.entries()) {
           if (user.userId === senderId || user.userId === receiverId) {
             console.log(`🟢 [SOCKET] 📤 Sending message to socket ${sockId} (user: ${user.username})`);
             io.to(sockId).emit('private_message', messageData);
             sentCount++;
           }
         }

         console.log(`🟢 [SOCKET] ✅ Message sent from ${senderId} → ${receiverId} to ${sentCount} recipient(s)`);
       } catch (err) {
         console.error('🟢 [SOCKET] ❌ private_message error:', err);
       }
     });

     socket.on('user_leave', (data: any) => {
       console.log('🟢 [SOCKET] 👋 user_leave event received');
       const { userId } = data;
       console.log('🟢 [SOCKET] 📝 Leave data:', { userId, socketId: socket.id });
       
       if (!userId) {
         console.log('🟢 [SOCKET] ❌ Missing userId in leave event');
         return;
       }

       console.log('🟢 [SOCKET] 🔍 Searching for user in connected users');
       // Находим сокет пользователя
       for (const [sockId, userInfo] of connectedUsers.entries()) {
         if (userInfo.userId === userId) {
           console.log(`🟢 [SOCKET] 🗑️ Removing user ${userInfo.username} (${userId}) from connected users`);
           connectedUsers.delete(sockId);
           console.log('🟢 [SOCKET] 💾 Updating user offline status in database');
           db.userQueries.updateUserOnline.run(0, new Date().toISOString(), userId);
           break;
         }
       }

       console.log('🟢 [SOCKET] 📡 Broadcasting updated online users list');
       io.emit('online_users', Array.from(connectedUsers.values()));
       console.log('🟢 [SOCKET] ✅ User left successfully');
     });

     socket.on('disconnect', () => {
       console.log('🟢 [SOCKET] ❌ Client disconnecting:', socket.id);
       const user = connectedUsers.get(socket.id);
       
       if (user) {
         console.log(`🟢 [SOCKET] 👋 User ${user.username} (${user.userId}) is disconnecting`);
         console.log('🟢 [SOCKET] 💾 Updating user offline status in database');
         db.userQueries.updateUserOnline.run(0, new Date().toISOString(), user.userId);
         console.log('🟢 [SOCKET] 🗑️ Removing user from connected users');
         connectedUsers.delete(socket.id);
         console.log('🟢 [SOCKET] 📡 Broadcasting updated online users list');
         io.emit('online_users', Array.from(connectedUsers.values()));
         console.log('🟢 [SOCKET] ✅ User disconnected and cleaned up');
       } else {
         console.log('🟢 [SOCKET] ⚠️ Disconnected socket not found in connected users');
       }
       console.log('🟢 [SOCKET] 📊 Remaining connected users:', connectedUsers.size);
     });
  });

  // ======================================================
  // =================== ЗАПУСК СЕРВЕРА ===================
  // ======================================================

  const PORT = 443;
  server.listen(PORT, '0.0.0.0', () => {
    console.log('✅ База данных инициализирована. Ожидание подключений...');
    console.log(`🚀 HTTPS сервер запущен: https://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
