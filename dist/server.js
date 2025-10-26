"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const db = __importStar(require("./db"));
async function startServer() {
    const fastify = (0, fastify_1.default)();
    // Плагины Fastify
    await fastify.register(Promise.resolve().then(() => __importStar(require('@fastify/static'))), {
        root: path_1.default.join(process.cwd(), 'build'),
        prefix: '/'
    });
    await fastify.register(Promise.resolve().then(() => __importStar(require('@fastify/cors'))), {
        origin: '*',
        methods: ['GET', 'POST'],
    });
    // Главная страница
    fastify.get('/', async (request, reply) => reply.sendFile('index.html'));
    // Fallback для React Router
    fastify.get('*', async (request, reply) => reply.sendFile('index.html'));
    // HTTP API пользователей
    fastify.post('/api/users', async (request, reply) => {
        try {
            const { username, avatar = '👤' } = request.body;
            if (!username)
                return reply.code(400).send({ error: 'Username is required' });
            const existingUser = db.userQueries.getUserByUsername.get(username);
            if (existingUser)
                return reply.code(409).send({ error: 'User already exists' });
            const userId = `user-${Date.now()}`;
            db.userQueries.createUser.run(userId, username, avatar);
            return { success: true, user: { id: userId, username, avatar } };
        }
        catch (error) {
            return reply.code(500).send({ error: 'Failed to create user' });
        }
    });
    fastify.get('/api/users', async (request, reply) => {
        try {
            const users = db.userQueries.getAllUsers.all();
            return { users };
        }
        catch (error) {
            return reply.code(500).send({ error: 'Failed to get users' });
        }
    });
    // API для сообщений
    fastify.post('/api/messages', async (request, reply) => {
        try {
            const { senderId, receiverId, content } = request.body;
            if (!senderId || !content)
                return reply.code(400).send({ error: 'Missing required fields' });
            db.messageQueries.insertMessage.run(senderId, receiverId, content);
            // Отправляем сообщение всем подключенным пользователям
            io.emit('new_message', {
                senderId,
                receiverId,
                content,
                timestamp: new Date().toISOString()
            });
            return { success: true };
        }
        catch (error) {
            return reply.code(500).send({ error: 'Failed to send message' });
        }
    });
    fastify.get('/api/messages/:userId/:receiverId', async (request, reply) => {
        try {
            const { userId, receiverId } = request.params;
            const messages = db.messageQueries.getMessages.all(userId, receiverId, receiverId, userId);
            return { messages };
        }
        catch (error) {
            return reply.code(500).send({ error: 'Failed to get messages' });
        }
    });
    // API для блокировки пользователей
    fastify.post('/api/block', async (request, reply) => {
        try {
            const { blockerId, blockedId } = request.body;
            if (!blockerId || !blockedId)
                return reply.code(400).send({ error: 'Missing required fields' });
            db.blockQueries.insertBlock.run(blockerId, blockedId);
            return { success: true };
        }
        catch (error) {
            return reply.code(500).send({ error: 'Failed to block user' });
        }
    });
    fastify.delete('/api/block', async (request, reply) => {
        try {
            const { blockerId, blockedId } = request.body;
            if (!blockerId || !blockedId)
                return reply.code(400).send({ error: 'Missing required fields' });
            db.blockQueries.deleteBlock.run(blockerId, blockedId);
            return { success: true };
        }
        catch (error) {
            return reply.code(500).send({ error: 'Failed to unblock user' });
        }
    });
    // API для приглашений в игру
    fastify.post('/api/game-invite', async (request, reply) => {
        try {
            const { inviterId, inviteeId, gameType = 'pong' } = request.body;
            if (!inviterId || !inviteeId)
                return reply.code(400).send({ error: 'Missing required fields' });
            db.gameQueries.insertGameInvite.run(inviterId, inviteeId, gameType);
            // Отправляем уведомление получателю
            const inviter = db.userQueries.getUserById.get(inviterId);
            if (inviter) {
                io.emit('game_invite', {
                    inviterId,
                    inviteeId,
                    inviterName: inviter.username,
                    gameType
                });
            }
            return { success: true };
        }
        catch (error) {
            return reply.code(500).send({ error: 'Failed to send game invite' });
        }
    });
    // =================== Socket.IO ===================
    const server = http_1.default.createServer();
    const io = new socket_io_1.Server(server, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
    });
    // Подключаем Fastify к HTTP серверу
    fastify.ready().then(() => {
        server.on('request', (req, res) => {
            fastify.server.emit('request', req, res);
        });
    });
    const connectedUsers = new Map();
    io.on('connection', (socket) => {
        socket.on('user_join', (data) => {
            if (!data?.userId || !data?.username)
                return socket.emit('error', { message: 'Invalid user data' });
            const { userId, username, avatar } = data;
            const user = db.userQueries.getUserById.get(userId);
            if (!user)
                return socket.emit('error', { message: 'User not found' });
            connectedUsers.set(socket.id, { userId, username, avatar });
            db.userQueries.updateUserOnline.run(true, new Date().toISOString(), userId);
            io.emit('online_users', Array.from(connectedUsers.values()));
        });
        socket.on('disconnect', () => {
            const user = connectedUsers.get(socket.id);
            if (user) {
                db.userQueries.updateUserOnline.run(false, new Date().toISOString(), user.userId);
                connectedUsers.delete(socket.id);
                io.emit('online_users', Array.from(connectedUsers.values()));
            }
        });
        // Обработка приглашений в игру
        socket.on('game_invite', (data) => {
            const { inviterId, inviteeId, gameType } = data;
            // Находим сокет получателя
            const inviteeSocket = Array.from(io.sockets.sockets.entries())
                .find(([_, socket]) => {
                const user = connectedUsers.get(socket.id);
                return user && user.userId === inviteeId;
            })?.[1];
            if (inviteeSocket) {
                const inviter = connectedUsers.get(socket.id);
                if (inviter) {
                    inviteeSocket.emit('game_invite', {
                        inviterId,
                        inviteeId,
                        inviterName: inviter.username,
                        gameType
                    });
                }
            }
        });
        // Обработка уведомлений о турнирах
        socket.on('tournament_notification', (data) => {
            io.emit('tournament_notification', data);
        });
    });
    // =================== Server Start ===================
    const PORT = Number(process.env.PORT) || 3000;
    server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}
// Запускаем сервер
startServer().catch(console.error);
