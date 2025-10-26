import Database from 'better-sqlite3';
import fs from 'fs';

// === Создаём директорию, если её нет ===
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

// === Инициализация базы данных ===
const db = new Database('data/chat.db');

// === Создание таблиц ===
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    avatar TEXT DEFAULT '👤',
    online BOOLEAN DEFAULT 0,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users (id),
    FOREIGN KEY (receiver_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users (id),
    FOREIGN KEY (blocked_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS friends (
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, friend_id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (friend_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS game_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    game_type TEXT DEFAULT 'pong',
    invite_type TEXT DEFAULT 'game',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inviter_id) REFERENCES users (id),
    FOREIGN KEY (invitee_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS match_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1_id TEXT NOT NULL,
    player2_id TEXT NOT NULL,
    winner_id TEXT,
    score1 INTEGER DEFAULT 0,
    score2 INTEGER DEFAULT 0,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player1_id) REFERENCES users (id),
    FOREIGN KEY (player2_id) REFERENCES users (id),
    FOREIGN KEY (winner_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS tournament_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// === Создание тестовых пользователей ===
const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, username, avatar) VALUES (?, ?, ?)');
const defaultUsers = [
  ['user-1', 'Alice', '👩'],
  ['user-2', 'Bob', '👨'],
  ['user-3', 'Alice2', '👩'],
  ['user-4', 'Bob2', '👨'],
  ['user-5', 'Alice3', '👩'],
  ['user-6', 'Bob3', '👨'],
  ['user-7', 'Alice4', '👩'],
  ['user-8', 'Bob4', '👨'],
];
for (const [id, name, avatar] of defaultUsers) insertUser.run(id, name, avatar);

// === Подготовленные SQL-запросы ===
const createUser = db.prepare('INSERT INTO users (id, username, avatar) VALUES (?, ?, ?)');
const getAllUsers = db.prepare('SELECT * FROM users ORDER BY username');
const getUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const getUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const updateUserOnline = db.prepare('UPDATE users SET online = ?, last_seen = ? WHERE id = ?');

const getMessages = db.prepare(`
  SELECT * FROM messages 
  WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) 
  ORDER BY timestamp ASC
`);
const insertMessage = db.prepare('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)');

const checkBlock = db.prepare(`
  SELECT 1 FROM blocks 
  WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
`);
const insertBlock = db.prepare('INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)');
const deleteBlock = db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?');
const getBlocksByUser = db.prepare('SELECT * FROM blocks WHERE blocker_id = ?');

const insertFriend = db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)');
const getFriends = db.prepare('SELECT f.*, u.username FROM friends f JOIN users u ON f.friend_id = u.id WHERE f.user_id = ?');

const insertGameInvite = db.prepare('INSERT INTO game_invites (inviter_id, invitee_id, game_type) VALUES (?, ?, ?)');
const updateGameInviteStatus = db.prepare('UPDATE game_invites SET status = ? WHERE inviter_id = ? AND invitee_id = ?');

const insertMatch = db.prepare('INSERT INTO match_history (player1_id, player2_id, winner_id, score1, score2) VALUES (?, ?, ?, ?, ?)');
const getMatchHistory = db.prepare('SELECT * FROM match_history WHERE player1_id = ? OR player2_id = ? ORDER BY played_at DESC LIMIT 10');

// === Экспортируем интерфейсы ===
export const database = db;

export const userQueries = {
  createUser,
  getAllUsers,
  getUserById,
  getUserByUsername,
  updateUserOnline,
};

export const messageQueries = {
  getMessages,
  insertMessage,
};

export const blockQueries = {
  checkBlock,
  insertBlock,
  deleteBlock,
  getBlocksByUser,
};

export const friendQueries = {
  insertFriend,
  getFriends,
};

export const gameQueries = {
  insertGameInvite,
  insertMatch,
  getMatchHistory,
  updateGameInviteStatus,
};

console.log('✅ База данных инициализирована и готова к работе.');
