const NobuWave = (() => {
    const supabase = window.supabase.createClient(
        'https://iljsednetiogjtowlexo.supabase.co',
        'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O'
    );

    let currentUser = null;
    let activeChat = null;
    let realtimeChannel = null;
    let pendingImage = null;
    const app = document.getElementById('app');
    const ADMIN_PASSWORD = 'NobuWaveAdmin2024';

    const esc = (s) => String(s || '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[m]);

    const generateId = () => '#' + Math.random().toString(36).substring(2, 10);

    // ========== ПРОВЕРКА БАНА ==========
    const checkBan = async () => {
        if (!currentUser) return null;
        const { data: ban } = await supabase
            .from('bans')
            .select('*')
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (ban && new Date(ban.expires_at) > new Date()) return ban;
        if (ban) await supabase.from('bans').delete().eq('id', ban.id);
        return null;
    };

    // ========== ЭКРАН БАНА ==========
    const showBanScreen = (ban) => {
        const until = new Date(ban.expires_at);
        const diff = Math.floor((until - new Date()) / 60000);
        const dur = diff < 60 ? `${diff} мин` : diff < 1440 ? `${Math.floor(diff / 60)} ч` : `${Math.floor(diff / 1440)} дн`;

        app.innerHTML = `
            <div class="auth-container">
                <div class="auth-card" style="max-width:480px">
                    <div style="font-size:4rem">🚫</div>
                    <h2 style="color:var(--danger);margin:12px 0">Вы заблокированы</h2>
                    <p style="color:var(--text-secondary)">Причина: <strong>${esc(ban.reason || 'нарушение')}</strong></p>
                    <div style="background:rgba(255,71,87,0.1);border:1px solid rgba(255,71,87,0.2);border-radius:var(--radius-sm);padding:12px;margin:12px 0">
                        <p>⏰ Блокировка на <strong>${dur}</strong></p>
                        <p style="font-size:0.85rem">До: ${until.toLocaleString('ru-RU')}</p>
                    </div>
                    <button class="modal-btn secondary" id="showRulesBtn">📋 Правила</button>
                </div>
            </div>`;

        document.getElementById('showRulesBtn').addEventListener('click', () => showRules('ban'));
    };

    // ========== ПРАВИЛА ==========
    const showRules = (from) => {
        const isLoggedIn = !!currentUser;
        app.innerHTML = `
            <div class="auth-container">
                <div class="auth-card rules-card">
                    <h2 style="text-align:center;margin-bottom:20px">📋 Правила NobuWave</h2>
                    <div class="rules-content">
                        <h3 style="color:var(--danger)">🚫 ЗАПРЕЩЕНО:</h3>
                        <ul>
                            <li><strong style="color:var(--danger)">Хейтинг и травля</strong></li>
                            <li><strong>Спам</strong></li>
                            <li><strong>Угрозы</strong></li>
                            <li><strong>Дискриминация</strong></li>
                            <li><strong>Контент 18+</strong></li>
                            <li><strong>Мошенничество</strong></li>
                            <li><strong>Чужая личность</strong></li>
                            <li><strong>Вредоносные ссылки</strong></li>
                        </ul>
                        <h3 style="color:var(--success)">✅ Рекомендуется:</h3>
                        <ul>
                            <li>Быть вежливым</li>
                            <li>Сообщать о нарушениях</li>
                        </ul>
                        <h3 style="color:var(--accent-light)">⚖️ Наказания:</h3>
                        <ul>
                            <li>Хейтинг — бан от 1 часа</li>
                            <li>Спам — 6 часов</li>
                            <li>Угрозы — навсегда</li>
                        </ul>
                    </div>
                    <button class="modal-btn secondary" id="backFromRulesBtn" style="margin-top:20px">
                        ${from === 'ban' ? '← Назад' : (isLoggedIn ? '← На главную' : '← Назад')}
                    </button>
                </div>
            </div>`;

        document.getElementById('backFromRulesBtn').addEventListener('click', () => {
            if (from === 'ban') {
                checkBan().then((b) => (b ? showBanScreen(b) : renderApp()));
            } else if (isLoggedIn) {
                renderApp();
            } else {
                renderAuth();
            }
        });
    };

    // ========== АВТОРИЗАЦИЯ ==========
    const renderAuth = () => {
        app.innerHTML = `
            <div class="auth-container">
                <div class="auth-card">
                    <div class="auth-logo">
                        <div class="logo-icon"><i class="fa-solid fa-feather"></i></div>
                        <h1>Nobu<span>Wave</span></h1>
                    </div>
                    <div class="auth-tabs">
                        <button class="auth-tab active" data-tab="login">Вход</button>
                        <button class="auth-tab" data-tab="register">Регистрация</button>
                    </div>
                    <form id="loginForm" class="auth-form">
                        <input type="text" id="loginUsername" class="auth-input" placeholder="Никнейм" autocomplete="off">
                        <input type="password" id="loginPassword" class="auth-input" placeholder="Пароль">
                        <div id="loginError" style="color:var(--danger);font-size:0.85rem;display:none"></div>
                        <button type="submit" class="auth-btn">Войти</button>
                    </form>
                    <form id="registerForm" class="auth-form hidden">
                        <input type="text" id="regUsername" class="auth-input" placeholder="Придумайте никнейм" autocomplete="off">
                        <input type="password" id="regPassword" class="auth-input" placeholder="Придумайте пароль">
                        <div id="regError" style="color:var(--danger);font-size:0.85rem;display:none"></div>
                        <button type="submit" class="auth-btn">Зарегистрироваться</button>
                    </form>
                    <button class="modal-btn secondary" id="authRulesBtn" style="margin-top:8px">📋 Правила</button>
                </div>
            </div>`;

        // Табы
        document.querySelectorAll('.auth-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('loginForm').classList.toggle('hidden', tab.dataset.tab !== 'login');
                document.getElementById('registerForm').classList.toggle('hidden', tab.dataset.tab !== 'register');
            });
        });

        // Правила
        document.getElementById('authRulesBtn').addEventListener('click', () => showRules('auth'));

        // Вход
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value.trim();
            const errorEl = document.getElementById('loginError');

            if (!username || !password) {
                errorEl.textContent = 'Заполните все поля';
                errorEl.style.display = 'block';
                return;
            }

            const { data: user, error } = await supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single();

            if (error || !user) {
                errorEl.textContent = 'Неверный никнейм или пароль';
                errorEl.style.display = 'block';
                return;
            }

            currentUser = user;

            const ban = await checkBan();
            if (ban) {
                showBanScreen(ban);
                return;
            }

            localStorage.setItem('nobu_user', JSON.stringify(user));
            await supabase.from('users').update({ is_online: true }).eq('id', user.id);
            renderApp();
        });

        // Регистрация
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername').value.trim();
            const password = document.getElementById('regPassword').value.trim();
            const errorEl = document.getElementById('regError');

            if (!username || !password) {
                errorEl.textContent = 'Заполните все поля';
                errorEl.style.display = 'block';
                return;
            }

            if (password.length < 4) {
                errorEl.textContent = 'Пароль минимум 4 символа';
                errorEl.style.display = 'block';
                return;
            }

            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('username', username)
                .single();

            if (existingUser) {
                errorEl.textContent = 'Этот никнейм уже занят';
                errorEl.style.display = 'block';
                return;
            }

            const uniqueId = generateId();

            const { data: newUser, error } = await supabase
                .from('users')
                .insert({
                    username: username,
                    display_name: username,
                    password: password,
                    unique_id: uniqueId,
                    avatar_emoji: '👤',
                    role: 'user',
                    is_verified: false
                })
                .select()
                .single();

            if (error) {
                errorEl.textContent = 'Ошибка регистрации';
                errorEl.style.display = 'block';
                return;
            }

            currentUser = newUser;
            localStorage.setItem('nobu_user', JSON.stringify(newUser));
            await supabase.from('users').update({ is_online: true }).eq('id', newUser.id);
            renderApp();
        });
    };

    // ========== ГЛАВНЫЙ ЭКРАН ==========
    const renderApp = async () => {
        const ban = await checkBan();
        if (ban) {
            showBanScreen(ban);
            return;
        }

        app.innerHTML = `
            <div class="app-container">
                <div class="header">
                    <div class="header-title">
                        <div class="logo-icon"><i class="fa-solid fa-feather"></i></div>
                        NobuWave
                    </div>
                    <div class="header-actions">
                        <button class="icon-btn" id="rulesBtn"><i class="fa-solid fa-book"></i></button>
                        <button class="icon-btn" id="newChatBtn"><i class="fa-solid fa-plus"></i></button>
                        <button class="icon-btn" id="newGroupBtn"><i class="fa-solid fa-users"></i></button>
                        <button class="icon-btn" id="supportBtn"><i class="fa-solid fa-headset"></i></button>
                        <button class="icon-btn" id="profileBtn"><i class="fa-solid fa-user"></i></button>
                        <button class="icon-btn" id="adminBtn"><i class="fa-solid fa-shield-halved"></i></button>
                    </div>
                </div>
                <div class="chat-list" id="chatList"></div>
            </div>`;

        loadChats();
        document.getElementById('rulesBtn').addEventListener('click', () => showRules('menu'));
        document.getElementById('newChatBtn').addEventListener('click', showNewChatModal);
        document.getElementById('newGroupBtn').addEventListener('click', showNewGroupModal);
        document.getElementById('supportBtn').addEventListener('click', showSupportModal);
        document.getElementById('profileBtn').addEventListener('click', showProfileModal);
        document.getElementById('adminBtn').addEventListener('click', showAdminLogin);
    };

    // ========== ЗАГРУЗКА ЧАТОВ ==========
    const loadChats = async () => {
        const container = document.getElementById('chatList');
        const { data: memberships } = await supabase
            .from('chat_members')
            .select('chat_id')
            .eq('user_id', currentUser.id);

        const chatIds = (memberships || []).map((m) => m.chat_id);

        if (chatIds.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary)">Нет чатов.</div>';
            return;
        }

        const { data: chats } = await supabase
            .from('chats')
            .select('*')
            .in('id', chatIds)
            .order('created_at', { ascending: false });

        container.innerHTML = '';
        chats.forEach((chat) => {
            const other = chat.is_group
                ? chat.name
                : esc(chat.name?.replace(` & ${currentUser.username}`, '').replace(`${currentUser.username} & `, '') || 'Чат');

            const item = document.createElement('div');
            item.className = 'chat-item';
            item.setAttribute('data-chat-id', chat.id);
            item.innerHTML = `
                <div class="chat-avatar">${chat.is_group ? '👥' : '👤'}</div>
                <div class="chat-info">
                    <div class="chat-name">${other}</div>
                </div>`;
            item.addEventListener('click', () => openChat(chat.id));
            container.appendChild(item);
        });
    };

    // ========== ОТКРЫТИЕ ЧАТА ==========
    const openChat = async (chatId) => {
        if (realtimeChannel) supabase.removeChannel(realtimeChannel);

        const { data: chat } = await supabase.from('chats').select('*').eq('id', chatId).single();
        if (!chat) return;
        activeChat = chat;

        const other = chat.is_group
            ? chat.name
            : esc(chat.name?.replace(` & ${currentUser.username}`, '').replace(`${currentUser.username} & `, '') || 'Чат');

        app.innerHTML = `
            <div class="chat-view">
                <div class="chat-header">
                    <button class="back-btn" id="backBtn"><i class="fa-solid fa-arrow-left"></i></button>
                    <div class="chat-avatar" style="width:36px;height:36px;font-size:1.2rem">${chat.is_group ? '👥' : '👤'}</div>
                    <div style="flex:1;font-weight:600">${other}</div>
                    <button class="icon-btn" id="reportBtn" style="color:var(--danger)"><i class="fa-solid fa-flag"></i></button>
                </div>
                <div class="messages-list" id="messagesList"></div>
                <div class="input-area">
                    <div class="pending-media" id="pendingMedia" style="display:none;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:8px;position:relative">
                        <div id="pendingMediaContent" style="display:flex;align-items:center;gap:8px"></div>
                        <button id="clearPendingMedia" style="position:absolute;top:2px;right:6px;background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:1rem">&times;</button>
                    </div>
                    <div class="input-row">
                        <input type="text" id="messageInput" placeholder="Сообщение..." autocomplete="off">
                        <button class="icon-btn" id="attachImageBtn"><i class="fa-solid fa-image"></i></button>
                        <input type="file" id="imageInput" accept="image/*" hidden>
                        <button class="send-btn" id="sendBtn"><i class="fa-solid fa-paper-plane"></i></button>
                    </div>
                </div>
            </div>`;

        document.getElementById('backBtn').addEventListener('click', () => {
            if (realtimeChannel) supabase.removeChannel(realtimeChannel);
            renderApp();
        });

        document.getElementById('sendBtn').addEventListener('click', sendMessage);
        document.getElementById('messageInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        document.getElementById('reportBtn').addEventListener('click', () => showReportModal(chat));

        document.getElementById('attachImageBtn').addEventListener('click', () => {
            document.getElementById('imageInput').click();
        });

        document.getElementById('imageInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            pendingImage = file;
            updatePendingMedia();
        });

        document.getElementById('clearPendingMedia').addEventListener('click', () => {
            pendingImage = null;
            updatePendingMedia();
        });

        await loadMessages(chatId);

        realtimeChannel = supabase
            .channel(`chat-${chatId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
                () => loadMessages(chatId)
            )
            .subscribe();
    };

    // ========== ПРЕВЬЮ МЕДИА ==========
    const updatePendingMedia = () => {
        const container = document.getElementById('pendingMedia');
        const content = document.getElementById('pendingMediaContent');
        if (!container || !content) return;

        if (pendingImage) {
            container.style.display = 'block';
            content.innerHTML = `
                <img src="${URL.createObjectURL(pendingImage)}" style="max-height:60px;border-radius:8px">
                <span style="color:var(--text-secondary);font-size:0.8rem">Фото</span>`;
        } else {
            container.style.display = 'none';
            content.innerHTML = '';
        }
    };

    // ========== ЗАГРУЗКА СООБЩЕНИЙ ==========
    const loadMessages = async (chatId) => {
        const list = document.getElementById('messagesList');
        if (!list) return;

        const { data: messages } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true });

        if (!messages || messages.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px">Нет сообщений</div>';
            return;
        }

        list.innerHTML = '';
        messages.forEach((msg) => {
            const isMine = msg.user_id === currentUser.id;
            const div = document.createElement('div');
            div.className = `message ${isMine ? 'mine' : 'theirs'}`;

            let html = '';
            if (!isMine) {
                html += `<div class="message-sender">
                    ${esc(msg.username || '?')}
                    <span style="color:var(--text-secondary);font-size:0.7rem">${esc(msg.unique_id || '')}</span>
                    ${msg.is_verified ? '<span class="verified-badge"><i class="fa-solid fa-check"></i></span>' : ''}
                </div>`;
            }
            if (msg.content) html += `<div>${esc(msg.content)}</div>`;
            if (msg.image_url) {
                html += `<img src="${esc(msg.image_url)}" style="max-width:200px;border-radius:10px;margin-top:4px;cursor:pointer" onclick="window.open('${esc(msg.image_url)}')">`;
            }
            html += `<div class="message-time">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`;

            div.innerHTML = html;
            list.appendChild(div);
        });

        setTimeout(() => {
            list.scrollTop = list.scrollHeight;
        }, 100);
    };

    // ========== ОТПРАВКА СООБЩЕНИЯ ==========
    const sendMessage = async () => {
        const input = document.getElementById('messageInput');
        const content = input?.value.trim();

        if (!content && !pendingImage) return;

        try {
            let imageUrl = null;

            if (pendingImage) {
                const path = `chats/${currentUser.id}_${Date.now()}.${pendingImage.name.split('.').pop()}`;
                const { error: uploadError } = await supabase.storage.from('images').upload(path, pendingImage);
                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage.from('images').getPublicUrl(path);
                imageUrl = urlData.publicUrl;
            }

            const { error } = await supabase.from('messages').insert({
                chat_id: activeChat.id,
                user_id: currentUser.id,
                username: currentUser.username,
                unique_id: currentUser.unique_id,
                content: content || '',
                image_url: imageUrl,
                is_verified: currentUser.is_verified || false
            });

            if (error) throw error;

            input.value = '';
            pendingImage = null;
            updatePendingMedia();
            input.focus();
        } catch (err) {
            alert('Ошибка отправки: ' + (err.message || 'неизвестная ошибка'));
        }
    };

    // ========== НОВЫЙ ЧАТ ==========
    const showNewChatModal = () => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card">
                <h3>Новый чат</h3>
                <p style="color:var(--text-secondary);text-align:center;margin-bottom:12px">Введите ID собеседника</p>
                <input type="text" id="newChatUserId" class="modal-input" placeholder="#id">
                <button class="modal-btn" id="createChatBtn">Создать</button>
                <button class="modal-btn secondary" id="closeModalBtn">Отмена</button>
                <div id="createChatError" style="color:var(--danger);font-size:0.85rem;text-align:center;margin-top:8px;display:none"></div>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('closeModalBtn').addEventListener('click', () => overlay.remove());

        document.getElementById('createChatBtn').addEventListener('click', async () => {
            const inputId = document.getElementById('newChatUserId').value.trim();
            const errorEl = document.getElementById('createChatError');

            if (!inputId) {
                errorEl.textContent = 'Введите ID';
                errorEl.style.display = 'block';
                return;
            }

            const { data: otherUser } = await supabase
                .from('users')
                .select('*')
                .eq('unique_id', inputId)
                .single();

            if (!otherUser) {
                errorEl.textContent = 'Пользователь не найден';
                errorEl.style.display = 'block';
                return;
            }

            if (otherUser.id === currentUser.id) {
                errorEl.textContent = 'Нельзя создать чат с самим собой';
                errorEl.style.display = 'block';
                return;
            }

            const chatName = [currentUser.username, otherUser.username].sort().join(' & ');

            const { data: existingChat } = await supabase
                .from('chats')
                .select('*')
                .eq('name', chatName)
                .eq('is_group', false)
                .single();

            if (existingChat) {
                overlay.remove();
                openChat(existingChat.id);
                return;
            }

            const { data: newChat } = await supabase
                .from('chats')
                .insert({ name: chatName, is_group: false })
                .select()
                .single();

            await supabase.from('chat_members').insert([
                { chat_id: newChat.id, user_id: currentUser.id },
                { chat_id: newChat.id, user_id: otherUser.id }
            ]);

            overlay.remove();
            openChat(newChat.id);
        });
    };

    // ========== НОВАЯ ГРУППА ==========
    const showNewGroupModal = () => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card">
                <h3>Новая группа</h3>
                <input type="text" id="groupName" class="modal-input" placeholder="Название группы">
                <p style="color:var(--text-secondary);text-align:center;margin-bottom:12px">Добавьте участников через ID</p>
                <div id="groupMembers" style="max-height:150px;overflow-y:auto;margin-bottom:10px"></div>
                <input type="text" id="newMemberId" class="modal-input" placeholder="#id участника">
                <button class="modal-btn secondary" id="addMemberBtn" style="margin-bottom:8px">Добавить участника</button>
                <button class="modal-btn" id="createGroupBtn">Создать группу</button>
                <button class="modal-btn secondary" id="closeGroupBtn">Отмена</button>
                <div id="createGroupError" style="color:var(--danger);font-size:0.85rem;text-align:center;margin-top:8px;display:none"></div>
            </div>`;
        document.body.appendChild(overlay);

        const members = [currentUser];

        const renderMembers = () => {
            const container = document.getElementById('groupMembers');
            container.innerHTML = members
                .map(
                    (m) => `
                <div style="padding:4px 0;display:flex;justify-content:space-between;align-items:center">
                    <span>${esc(m.username)} (${m.unique_id})</span>
                    ${m.id !== currentUser.id ? `<button class="modal-btn secondary" style="padding:2px 8px;font-size:0.7rem;width:auto" data-uid="${m.id}">Удалить</button>` : ''}
                </div>`
                )
                .join('');

            container.querySelectorAll('button').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const uid = btn.dataset.uid;
                    const idx = members.findIndex((m) => m.id === uid);
                    if (idx > -1) members.splice(idx, 1);
                    renderMembers();
                });
            });
        };

        renderMembers();

        document.getElementById('closeGroupBtn').addEventListener('click', () => overlay.remove());

        document.getElementById('addMemberBtn').addEventListener('click', async () => {
            const id = document.getElementById('newMemberId').value.trim();
            if (!id) return;

            const { data: user } = await supabase.from('users').select('*').eq('unique_id', id).single();
            if (!user) {
                alert('Пользователь не найден');
                return;
            }
            if (members.find((m) => m.id === user.id)) {
                alert('Уже добавлен');
                return;
            }
            members.push(user);
            renderMembers();
            document.getElementById('newMemberId').value = '';
        });

        document.getElementById('createGroupBtn').addEventListener('click', async () => {
            const name = document.getElementById('groupName').value.trim();
            if (!name) {
                document.getElementById('createGroupError').textContent = 'Введите название';
                document.getElementById('createGroupError').style.display = 'block';
                return;
            }

            const { data: chat } = await supabase
                .from('chats')
                .insert({ name, is_group: true })
                .select()
                .single();

            const memberRows = members.map((m) => ({ chat_id: chat.id, user_id: m.id }));
            await supabase.from('chat_members').insert(memberRows);

            overlay.remove();
            openChat(chat.id);
        });
    };

    // ========== ЖАЛОБА ==========
    const showReportModal = (chat) => {
        const other = chat.is_group
            ? chat.name
            : esc(chat.name?.replace(` & ${currentUser.username}`, '').replace(`${currentUser.username} & `, '') || 'Чат');

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card">
                <h3>⚠️ Жалоба</h3>
                <p style="color:var(--text-secondary);text-align:center;margin-bottom:12px">Чат: <strong>${other}</strong></p>
                <textarea id="reportReason" class="modal-input" placeholder="Опишите причину жалобы..." style="height:100px;resize:none"></textarea>
                <button class="modal-btn" id="sendReportBtn" style="background:var(--danger)">Отправить жалобу</button>
                <button class="modal-btn secondary" id="closeReportBtn">Отмена</button>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('closeReportBtn').addEventListener('click', () => overlay.remove());

        document.getElementById('sendReportBtn').addEventListener('click', async () => {
            const reason = document.getElementById('reportReason').value.trim();
            if (!reason) return;

            await supabase.from('reports').insert({
                from_user: currentUser.id,
                from_username: currentUser.username,
                chat_id: chat.id,
                chat_name: chat.name,
                reason: reason
            });

            alert('Жалоба отправлена. Администратор рассмотрит её.');
            overlay.remove();
        });
    };

    // ========== ПОДДЕРЖКА ==========
    const showSupportModal = () => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card">
                <h3>🎧 Поддержка</h3>
                <p style="color:var(--text-secondary);text-align:center;margin-bottom:12px">Опишите проблему. Ответим в течение 5 рабочих дней.</p>
                <textarea id="supportQuestion" class="modal-input" placeholder="Опишите проблему..." style="height:120px;resize:none"></textarea>
                <button class="modal-btn" id="sendSupportBtn">Отправить</button>
                <button class="modal-btn secondary" id="closeSupportBtn">Закрыть</button>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('closeSupportBtn').addEventListener('click', () => overlay.remove());

        document.getElementById('sendSupportBtn').addEventListener('click', async () => {
            const question = document.getElementById('supportQuestion').value.trim();
            if (!question) return;

            await supabase.from('support').insert({
                user_id: currentUser.id,
                username: currentUser.username,
                question: question
            });

            alert('✅ Отправлено! Поддержка ответит в течение 5 рабочих дней.');
            overlay.remove();
        });
    };

    // ========== ПРОФИЛЬ ==========
    const showProfileModal = () => {
        const verifiedBadge = currentUser.is_verified
            ? '<span class="verified-badge"><i class="fa-solid fa-check"></i></span>'
            : '';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card">
                <h3>Профиль</h3>
                <p style="font-size:1.2rem;font-weight:600;text-align:center">${esc(currentUser.username)} ${verifiedBadge}</p>
                <p style="color:var(--text-secondary);text-align:center;margin:8px 0">ID: <strong>${esc(currentUser.unique_id)}</strong></p>
                <p style="color:var(--text-secondary);text-align:center">Эмодзи:</p>
                <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:10px 0">
                    ${['👤','😀','😎','🤖','👽','🦊','🐼','🎃','💎','🔥','🌈','⚡','🌟','🍕','🎉']
                        .map((e) => `<span style="font-size:2rem;cursor:pointer" class="emoji-opt">${e}</span>`)
                        .join('')}
                </div>
                <button class="modal-btn secondary" id="changeNameBtn" style="margin-top:12px">✏️ Изменить никнейм</button>
                <button class="modal-btn secondary" id="logoutBtn" style="margin-top:8px;color:var(--danger)">Выйти</button>
                <button class="modal-btn secondary" id="closeProfileBtn">Закрыть</button>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('closeProfileBtn').addEventListener('click', () => overlay.remove());

        document.getElementById('logoutBtn').addEventListener('click', () => {
            supabase.from('users').update({ is_online: false }).eq('id', currentUser.id);
            localStorage.removeItem('nobu_user');
            location.reload();
        });

        document.getElementById('changeNameBtn').addEventListener('click', () => {
            overlay.remove();
            showChangeNameModal();
        });

        overlay.querySelectorAll('.emoji-opt').forEach((el) => {
            el.addEventListener('click', async () => {
                await supabase.from('users').update({ avatar_emoji: el.textContent }).eq('id', currentUser.id);
                currentUser.avatar_emoji = el.textContent;
                localStorage.setItem('nobu_user', JSON.stringify(currentUser));
                overlay.remove();
            });
        });
    };

    // ========== СМЕНА НИКНЕЙМА ==========
    const showChangeNameModal = () => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card">
                <h3>✏️ Изменить никнейм</h3>
                <p style="color:var(--text-secondary);text-align:center;margin-bottom:8px">
                    ID: <strong>${esc(currentUser.unique_id)}</strong> (не меняется)
                </p>
                <input type="text" id="newUsername" class="modal-input" placeholder="Новый никнейм" value="${esc(currentUser.username)}">
                <div id="changeNameError" style="color:var(--danger);font-size:0.85rem;text-align:center;margin-bottom:8px;display:none"></div>
                <button class="modal-btn" id="saveNameBtn">Сохранить</button>
                <button class="modal-btn secondary" id="closeChangeNameBtn">Отмена</button>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('closeChangeNameBtn').addEventListener('click', () => overlay.remove());

        document.getElementById('saveNameBtn').addEventListener('click', async () => {
            const newName = document.getElementById('newUsername').value.trim();
            const errorEl = document.getElementById('changeNameError');

            if (!newName) {
                errorEl.textContent = 'Введите никнейм';
                errorEl.style.display = 'block';
                return;
            }

            if (newName === currentUser.username) {
                overlay.remove();
                return;
            }

            const { data: exists } = await supabase
                .from('users')
                .select('id')
                .eq('username', newName)
                .single();

            if (exists) {
                errorEl.textContent = 'Этот никнейм уже занят';
                errorEl.style.display = 'block';
                return;
            }

            await supabase.from('users').update({
                username: newName,
                display_name: newName
            }).eq('id', currentUser.id);

            currentUser.username = newName;
            currentUser.display_name = newName;
            localStorage.setItem('nobu_user', JSON.stringify(currentUser));

            overlay.remove();
            showProfileModal();
        });
    };

    // ========== АДМИНКА: ВХОД ==========
    const showAdminLogin = () => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card">
                <h3>🛡️ Доступ администратора</h3>
                <input type="password" id="adminPassword" class="modal-input" placeholder="Введите пароль администратора">
                <button class="modal-btn" id="adminLoginBtn">Войти</button>
                <button class="modal-btn secondary" id="closeAdminLoginBtn">Отмена</button>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('closeAdminLoginBtn').addEventListener('click', () => overlay.remove());

        document.getElementById('adminLoginBtn').addEventListener('click', () => {
            if (document.getElementById('adminPassword').value === ADMIN_PASSWORD) {
                overlay.remove();
                showAdminPanel();
            } else {
                alert('Неверный пароль');
            }
        });
    };

    // ========== АДМИН-ПАНЕЛЬ ==========
    const showAdminPanel = () => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card" style="max-height:85vh;overflow-y:auto">
                <h3>🛡️ Админ-панель</h3>
                
                <h4>🔨 Заблокировать пользователя</h4>
                <input type="text" id="banUsername" class="modal-input" placeholder="Никнейм">
                <select id="banDuration" class="modal-input">
                    <option value="10">10 минут</option>
                    <option value="60">1 час</option>
                    <option value="360">6 часов</option>
                    <option value="1440">24 часа</option>
                    <option value="10080">7 дней</option>
                </select>
                <input type="text" id="banReason" class="modal-input" placeholder="Причина бана">
                <button class="modal-btn" id="banUserBtn" style="background:var(--danger)">Заблокировать</button>
                
                <h4>✅ Верификация</h4>
                <input type="text" id="verifyUsername" class="modal-input" placeholder="Никнейм для верификации">
                <button class="modal-btn" id="verifyUserBtn">Выдать галочку ✅</button>
                
                <h4>👤 Просмотр профиля</h4>
                <input type="text" id="lookupUsername" class="modal-input" placeholder="Никнейм">
                <button class="modal-btn" id="lookupUserBtn">Посмотреть профиль</button>
                
                <h4>🔓 Разблокировать</h4>
                <input type="text" id="unbanUsername" class="modal-input" placeholder="Никнейм">
                <button class="modal-btn" id="unbanUserBtn" style="background:var(--success)">Разблокировать</button>
                
                <h4>📋 Активные баны</h4>
                <div id="banList"></div>
                
                <h4>⚠️ Жалобы</h4>
                <div id="reportsList"></div>
                
                <h4>🎧 Поддержка</h4>
                <div id="supportList"></div>
                
                <button class="modal-btn secondary" id="closeAdminBtn" style="margin-top:12px">Закрыть</button>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('closeAdminBtn').addEventListener('click', () => overlay.remove());

        // Загрузка банов
        const loadBans = async () => {
            const { data } = await supabase.from('bans').select('*').order('created_at', { ascending: false });
            const list = document.getElementById('banList');
            if (!data || data.length === 0) {
                list.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem">Нет активных банов</p>';
                return;
            }
            list.innerHTML = data
                .map(
                    (b) => `
                <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
                    <strong>${esc(b.username)}</strong> — до ${new Date(b.expires_at).toLocaleString('ru-RU')}<br>
                    <small>${esc(b.reason || 'Без причины')}</small>
                </div>`
                )
                .join('');
        };

        // Загрузка жалоб
        const loadReports = async () => {
            const { data } = await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(20);
            const list = document.getElementById('reportsList');
            if (!data || data.length === 0) {
                list.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem">Нет жалоб</p>';
                return;
            }
            list.innerHTML = data
                .map(
                    (r) => `
                <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
                    <strong>${esc(r.from_username)}</strong> жалуется на чат «${esc(r.chat_name)}»<br>
                    <small style="color:var(--danger)">${esc(r.reason)}</small><br>
                    <button class="modal-btn" style="margin-top:4px;padding:4px 8px;font-size:0.75rem;width:auto" data-chat-id="${r.chat_id}">🔍 Открыть чат</button>
                </div>`
                )
                .join('');

            // Обработчики для кнопок "Открыть чат"
            setTimeout(() => {
                list.querySelectorAll('button').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const chatId = btn.dataset.chatId;
                        document.querySelector('.modal-overlay')?.remove();
                        openChat(chatId);
                    });
                });
            }, 100);
        };

        // Загрузка поддержки
        const loadSupport = async () => {
            const { data } = await supabase.from('support').select('*').order('created_at', { ascending: false }).limit(20);
            const list = document.getElementById('supportList');
            if (!data || data.length === 0) {
                list.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem">Нет обращений</p>';
                return;
            }
            list.innerHTML = data
                .map(
                    (s) => `
                <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
                    <strong>${esc(s.username)}</strong>: ${esc(s.question)}<br>
                    <small>${new Date(s.created_at).toLocaleString('ru-RU')}</small>
                    ${!s.is_answered
                        ? `<br><button class="modal-btn" style="margin-top:4px;padding:4px 8px;font-size:0.75rem;width:auto" id="answer_${s.id}">✉️ Ответить</button>`
                        : '<br><small style="color:var(--success)">✓ Отвечено</small>'}
                </div>`
                )
                .join('');

            // Обработчики для кнопок "Ответить"
            setTimeout(() => {
                list.querySelectorAll('[id^="answer_"]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const supportId = btn.id.replace('answer_', '');
                        const { data: support } = await supabase.from('support').select('*').eq('id', supportId).single();
                        if (!support) return;

                        const { data: user } = await supabase.from('users').select('*').eq('username', support.username).single();
                        if (!user) return;

                        const chatName = [currentUser.username, user.username].sort().join(' & ');
                        const { data: existChat } = await supabase.from('chats').select('*').eq('name', chatName).eq('is_group', false).single();

                        if (existChat) {
                            await supabase.from('support').update({ is_answered: true, answered_by: currentUser.id }).eq('id', supportId);
                            document.querySelector('.modal-overlay')?.remove();
                            openChat(existChat.id);
                            return;
                        }

                        const { data: chat } = await supabase.from('chats').insert({ name: chatName }).select().single();
                        await supabase.from('chat_members').insert([
                            { chat_id: chat.id, user_id: currentUser.id },
                            { chat_id: chat.id, user_id: user.id }
                        ]);
                        await supabase.from('support').update({ is_answered: true, answered_by: currentUser.id }).eq('id', supportId);
                        document.querySelector('.modal-overlay')?.remove();
                        openChat(chat.id);
                    });
                });
            }, 100);
        };

        loadBans();
        loadReports();
        loadSupport();

        // Бан
        document.getElementById('banUserBtn').addEventListener('click', async () => {
            const username = document.getElementById('banUsername').value.trim();
            const minutes = parseInt(document.getElementById('banDuration').value);
            const reason = document.getElementById('banReason').value.trim() || 'нарушение правил';

            if (!username) return;

            const { data: user } = await supabase.from('users').select('id').eq('username', username).single();
            if (!user) {
                alert('Пользователь не найден');
                return;
            }

            await supabase.from('bans').upsert({
                user_id: user.id,
                username: username,
                reason: reason,
                expires_at: new Date(Date.now() + minutes * 60000).toISOString()
            });

            alert(`${username} заблокирован на ${minutes} минут`);
            loadBans();
        });

        // Верификация (ИСПРАВЛЕНО)
        document.getElementById('verifyUserBtn').addEventListener('click', async () => {
            const username = document.getElementById('verifyUsername').value.trim();
            if (!username) {
                alert('Введите никнейм');
                return;
            }

            const { error } = await supabase
                .from('users')
                .update({ is_verified: true })
                .eq('username', username);

            if (error) {
                alert('Ошибка: ' + error.message);
                return;
            }

            alert(`${username} верифицирован ✅`);
        });

        // Просмотр профиля
        document.getElementById('lookupUserBtn').addEventListener('click', async () => {
            const username = document.getElementById('lookupUsername').value.trim();
            if (!username) return;

            const { data: user } = await supabase.from('users').select('*').eq('username', username).single();
            if (!user) {
                alert('Пользователь не найден');
                return;
            }

            alert(
                `Профиль пользователя:\n\n` +
                `Никнейм: ${user.username}\n` +
                `ID: ${user.unique_id}\n` +
                `Верифицирован: ${user.is_verified ? 'Да ✅' : 'Нет'}\n` +
                `Роль: ${user.role}\n` +
                `Эмодзи: ${user.avatar_emoji}`
            );
        });

        // Разбан
        document.getElementById('unbanUserBtn').addEventListener('click', async () => {
            const username = document.getElementById('unbanUsername').value.trim();
            if (!username) return;

            await supabase.from('bans').delete().eq('username', username);
            alert(`${username} разблокирован`);
            loadBans();
        });
    };

    // ========== ИНИЦИАЛИЗАЦИЯ ==========
    const init = async () => {
        const saved = localStorage.getItem('nobu_user');

        if (saved) {
            try {
                currentUser = JSON.parse(saved);
                const ban = await checkBan();
                if (ban) {
                    showBanScreen(ban);
                    return;
                }
                await supabase.from('users').update({ is_online: true }).eq('id', currentUser.id);
                renderApp();
            } catch (e) {
                localStorage.removeItem('nobu_user');
                renderAuth();
            }
        } else {
            renderAuth();
        }

        window.addEventListener('beforeunload', () => {
            if (currentUser) {
                supabase.from('users').update({ is_online: false }).eq('id', currentUser.id);
            }
        });
    };

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => NobuWave.init());