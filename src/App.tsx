import React, { useState, useEffect } from 'react';
import io, { Socket } from 'socket.io-client';
import './index.css';

interface User {
  id?: string;
  userId: string;
  username: string;
  avatar: string;
  online?: boolean;
}

interface Message {
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
}

// Функция для отправки логов на сервер
function logToServer(level: string, message: string) {
  fetch('https://localhost/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, message }),
  }).catch(err => console.error('Failed to send log to server:', err));
}

//const [count, setCount] = useState(0);

const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [messagesByUser, setMessagesByUser] = useState<Record<string, Message[]>>({});
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [showLogin, setShowLogin] = useState(true);

  // === Подключение к серверу только после логина ===
  useEffect(() => {
    if (!currentUser) return;

    console.log('🔴 [APP] 🔗 Connecting to chat server...');
    logToServer('info', '🔴 [APP] 🔗 Connecting to chat server...');
    const newSocket = io('https://localhost', {
      secure: true,
      transports: ['websocket'],
      rejectUnauthorized: false, // если у тебя самоподписанный сертификат
    });

    newSocket.on('connect', () => {
      console.log('🔴 [APP] ✅ Connected to server:', newSocket.id);
      logToServer('info', `🔴 [APP] ✅ Connected to server: ${newSocket.id}`);
      console.log('🔴 [APP] 📤 Emitting user_join with data:', currentUser);
      logToServer('info', `🔴 [APP] 📤 Emitting user_join with data: ${JSON.stringify(currentUser)}`);
      newSocket.emit('user_join', currentUser);
    });

    newSocket.on('disconnect', () => {
      console.log('🔴 [APP] ❌ Disconnected');
      logToServer('warn', '🔴 [APP] ❌ Disconnected');
    });
    newSocket.on('connect_error', (err) => {
      console.error('🔴 [APP] ⚠️ Socket error:', err.message);
      logToServer('error', `🔴 [APP] ⚠️ Socket error: ${err.message}`);
    });

    newSocket.on('online_users', (users: User[]) => {
      console.log('🔴 [APP] 👥 Received online_users update:', users);
      logToServer('info', `🔴 [APP] 👥 Received online_users update: ${users.length} users`);
      setOnlineUsers(users);
    });

    newSocket.on('private_message', (message: Message) => {
      console.log('🔴 [APP] 📩 Received private_message event:', message);
      logToServer('info', `🔴 [APP] 📩 Received private_message: ${message.senderId} → ${message.receiverId}`);

      // проверяем, что сообщение связано с текущим пользователем
      if (
        !currentUser ||
        (message.senderId !== currentUser.userId && message.receiverId !== currentUser.userId)
      ) {
        console.log('🔴 [APP] ⚠️ Message not for current user, ignoring');
        logToServer('warn', '🔴 [APP] ⚠️ Message not for current user, ignoring');
        return;
      }

      // Если это сообщение от текущего пользователя, игнорируем (уже добавлено локально)
      if (message.senderId === currentUser.userId) {
        console.log('🔴 [APP] 📤 Ignoring own message (already added locally)');
        logToServer('info', '🔴 [APP] 📤 Ignoring own message (already added locally)');
        return;
      }

      const otherId =
        message.senderId === currentUser.userId
          ? message.receiverId
          : message.senderId;

      console.log('🔴 [APP] 💾 Adding message to state for user:', otherId);
      logToServer('info', `🔴 [APP] 💾 Adding message to state for user: ${otherId}`);
      setMessagesByUser((prev) => ({
        ...prev,
        [otherId]: [...(prev[otherId] || []), message],
      }));
    });

    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, [currentUser]);

  // === Загрузка пользователей ===
  useEffect(() => {
    if (!currentUser) return;

    console.log('🔴 [APP] 📡 Fetching users from API...');
    fetch('https://localhost/api/users')
      .then((res) => res.json())
      .then((data) => {
        console.log('🔴 [APP] 👥 Loaded users from API:', data.users);
        // Маппим id -> userId для совместимости
        const mappedUsers = (data.users || []).map((user: any) => ({
          ...user,
          userId: user.id || user.userId,
        }));
        console.log('🔴 [APP] 👥 Mapped users:', mappedUsers);
        setAllUsers(mappedUsers);
      })
      .catch((err) => console.error('🔴 [APP] ❌ Fetch users error:', err));
  }, [currentUser]);

  // === Загрузка истории сообщений при выборе собеседника ===
  useEffect(() => {
    if (!selectedUser || !currentUser) return;

    console.log(`🔴 [APP] 📜 Loading chat history between ${currentUser.userId} and ${selectedUser.userId}`);
    fetch(`https://localhost/api/messages/${currentUser.userId}/${selectedUser.userId}`)
      .then((res) => res.json())
      .then((data) => {
        console.log('🔴 [APP] 📜 Loaded messages from API:', data.messages);
        console.log('🔴 [APP] 💾 Storing messages in state for user:', selectedUser.userId);
        setMessagesByUser((prev) => ({
          ...prev,
          [selectedUser.userId]: data.messages || [],
        }));
      })
      .catch((err) => console.error('🔴 [APP] ❌ Fetch messages error:', err));
  }, [selectedUser, currentUser]);

  // === Логин (тестовый, для Alice и Bob) ===
  const handleLogin = (username: string) => {
    console.log('🔴 [APP] 🔐 Login attempt for user:', username);
    logToServer('info', `🔴 [APP] 🔐 Login attempt for user: ${username}`);
    const userMap: Record<string, User> = {
      Alice: { userId: 'user-1', username: 'Alice', avatar: '👩' },
      Bob: { userId: 'user-2', username: 'Bob', avatar: '👨' },
    };
    const user = userMap[username];
    if (!user) {
      console.log('🔴 [APP] ❌ User not found in userMap');
      logToServer('error', '🔴 [APP] ❌ User not found in userMap');
      return;
    }

    console.log('🔴 [APP] 👤 Logged in as:', username, 'with user data:', user);
    logToServer('info', `🔴 [APP] 👤 Logged in as: ${username}`);
    setCurrentUser(user);
    setShowLogin(false);
  };

  // === Отправка сообщения ===
  const sendMessage = () => {
    if (!messageInput.trim() || !selectedUser || !currentUser || !socket) {
      console.log('🔴 [APP] ❌ Cannot send message:', { 
        hasInput: !!messageInput.trim(), 
        hasSelectedUser: !!selectedUser, 
        hasCurrentUser: !!currentUser, 
        hasSocket: !!socket 
      });
      logToServer('error', '🔴 [APP] ❌ Cannot send message - missing requirements');
      return;
    }

    // Дополнительная проверка selectedUser
    if (!selectedUser.userId) {
      console.error('🔴 [APP] ❌ selectedUser.userId is undefined:', selectedUser);
      logToServer('error', '🔴 [APP] ❌ selectedUser.userId is undefined');
      return;
    }

    const messageData: Message = {
      senderId: currentUser.userId,
      receiverId: selectedUser.userId, // ✅ обязательно!
      content: messageInput.trim(),
      timestamp: new Date().toISOString(),
    };

    console.log('🔴 [APP] 📤 Sending message via socket.emit:', messageData);
    logToServer('info', `🔴 [APP] 📤 Sending message: ${currentUser.userId} → ${selectedUser.userId}: ${messageInput.trim()}`);
    
    // Добавляем сообщение локально для отправителя
    console.log('🔴 [APP] 💾 Adding message to local state immediately');
    setMessagesByUser((prev) => ({
      ...prev,
      [selectedUser.userId]: [...(prev[selectedUser.userId] || []), messageData],
    }));
    
    socket.emit('private_message', messageData);
    console.log('🔴 [APP] ✅ Message sent, clearing input');
    logToServer('info', '🔴 [APP] ✅ Message sent, clearing input');
    setMessageInput('');
  };

  // === Отправляем уведомление о выходе ===
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socket && currentUser) {
        console.log('🔴 [APP] 👋 User leaving, emitting user_leave event');
        socket.emit('user_leave', currentUser);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [socket, currentUser]);

  // === Экран логина ===
  if (showLogin) {
    return (
      <div className="login-container">
        <h2>💬 Вход в чат</h2>
        <div className="login-buttons">
          <button onClick={() => handleLogin('Alice')}>👩 Alice</button>
          <button onClick={() => handleLogin('Bob')}>👨 Bob</button>
        </div>
      </div>
    );
  }

  // === Отображение пользователей ===
  const allWithStatus = allUsers.map((u) => ({
    ...u,
    online: onlineUsers.some((on) => on.userId === u.userId),
  }));

  const activeMessages = selectedUser ? messagesByUser[selectedUser.userId] || [] : [];

  return (
    <div className="app-container">
      <aside className="sidebar">
        <h3>👥 Все пользователи</h3>
        {allWithStatus
          .filter((u) => u.userId !== currentUser?.userId)
          .map((user) => (
            <div
              key={user.userId}
              className={`user-item ${selectedUser?.userId === user.userId ? 'selected' : ''}`}
              onClick={() => {
                console.log('🔴 [APP] 👆 User clicked, selecting:', user);
                setSelectedUser(user);
              }}
            >
              <span>{user.avatar}</span>
              <strong>{user.username}</strong>
              <span
                style={{
                  color: user.online ? 'green' : 'gray',
                  fontSize: 12,
                  marginLeft: '4px',
                }}
              >
                {user.online ? '● в сети' : '○ оффлайн'}
              </span>
            </div>
          ))}
      </aside>

      <main className="chat-container">
        <header className="chat-header">
          {selectedUser ? `💬 Чат с ${selectedUser.username}` : 'Выберите пользователя'}
        </header>

        <div className="chat-messages">
          {activeMessages.map((msg, i) => (
            <div
              key={i}
              className={`message ${msg.senderId === currentUser?.userId ? 'own' : ''}`}
            >
              <div>{msg.content}</div>
              <small>{new Date(msg.timestamp).toLocaleTimeString()}</small>
            </div>
          ))}
        </div>

        {selectedUser && (
          <footer className="chat-input">
            <input
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Введите сообщение..."
            />
            <button onClick={sendMessage}>➤</button>
          </footer>
        )}
      </main>
    </div>
  );
};

export default App;
