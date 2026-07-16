// Инициализация Supabase
const SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Состояние приложения
const state = {
    user: null,
    currentView: 'feed',
    currentTab: 'feed-all',
    activeChirpId: null,
    isSending: false
};

// Утилиты
const $ = (id) => document.getElementById(id);

// Хеширование пароля (SHA-256)
const hashPassword = async (password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'только что';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч`;
    return date.toLocaleDateString('ru-RU');
};

const highlightHashtags = (text) => {
    if (!text) return '';
    return text.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
};

// ==================== АВТОРИЗАЦИЯ (ИСПРАВЛЕНА) ====================

const checkAuth = async () => {
    const savedUser = localStorage.getItem('nobuchirp_user');
    if (savedUser) {
        try {
            state.user = JSON.parse(savedUser);
            // Проверяем актуальность статуса бана при загрузке
            await checkUserStatus();
            if (!state.user.is_banned) {
                showScreen('main-screen');
                updateUserUI();
                initRealtime();
                loadFeed();
            }
        } catch (e) {
            localStorage.removeItem('nobuchirp_user');
            showScreen('auth-screen');
        }
    } else {
        showScreen('auth-screen');
    }
};

const handleAuth = async (isRegister) => {
    const usernameInput = $('auth-username');
    const passwordInput = $('auth-password');
    const errorEl = $('auth-error');
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    // Сброс ошибки
    errorEl.textContent = '';
    usernameInput.style.borderColor = 'var(--border)';
    passwordInput.style.borderColor = 'var(--border)';

    if (!username || !password) {
        errorEl.textContent = 'Заполните все поля';
        return;
    }

    if (username.length < 3) {
        errorEl.textContent = 'Никнейм должен быть не менее 3 символов';
        return;
    }

    const hashedPass = await hashPassword(password);

    if (isRegister) {
        // 1. Проверка занятости
        const { data: existing } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
        
        if (existing) {
            errorEl.textContent = 'Этот никнейм уже занят';
            usernameInput.style.borderColor = 'var(--danger)';
            return;
        }

        // 2. Регистрация
        const { error: insertError } = await supabase.from('users').insert([{
            username: username,
            password: hashedPass,
            avatar_emoji: '👤',
            bio: 'Новый пользователь NobuChirp'
        }]);

        if (insertError) {
            console.error('Insert Error:', insertError);
            errorEl.textContent = 'Ошибка при создании аккаунта. Попробуйте позже.';
            return;
        }

        // 3. Получение данных созданного пользователя (важный шаг!)
        const { data: newUser, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (fetchError || !newUser) {
            errorEl.textContent = 'Аккаунт создан, но не удалось войти. Попробуйте войти вручную.';
            return;
        }

        // Успешная регистрация и вход
        state.user = newUser;
        localStorage.setItem('nobuchirp_user', JSON.stringify(newUser));
        showScreen('main-screen');
        updateUserUI();
        initRealtime();
        loadFeed();

    } else {
        // Вход
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', hashedPass)
            .maybeSingle();

        if (error || !user) {
            errorEl.textContent = 'Неверный никнейм или пароль';
            passwordInput.style.borderColor = 'var(--danger)';
            return;
        }

        state.user = user;
        localStorage.setItem('nobuchirp_user', JSON.stringify(user));
        
        await checkUserStatus();
        if (!state.user.is_banned) {
            showScreen('main-screen');
            updateUserUI();
            initRealtime();
            loadFeed();
        }
    }
};

// ==================== СТАТУС ПОЛЬЗОВАТЕЛЯ (БАН/ПРЕДУПРЕЖДЕНИЕ) ====================
const checkUserStatus = async () => {
    if (!state.user) return;
    
    // Обновляем данные пользователя из базы, чтобы получить актуальный статус
    const { data, error } = await supabase.from('users').select('*').eq('id', state.user.id).single();
    if (error || !data) return;

    state.user = data;
    localStorage.setItem('nobuchirp_user', JSON.stringify(data));

    if (data.is_banned) {
        const now = new Date();
        const banEnd = data.ban_expires ? new Date(data.ban_expires) : null;
        
        // Если бан вечный или срок еще не истек
        if (!banEnd || banEnd > now) {
            showScreen('ban-screen');
            $('ban-reason').textContent = `Причина: ${data.ban_reason || 'Нарушение правил'}`;
            
            if (banEnd) {
                startBanTimer(banEnd);
            } else {
                $('ban-timer').textContent = 'Срок: Навсегда';
            }
            return true;
        } else {
            // Бан истёк, автоматически снимаем
            await supabase.from('users').update({ 
                is_banned: false, 
                ban_reason: null, 
                ban_expires: null 
            }).eq('id', state.user.id);
            
            state.user.is_banned = false;
            state.user.ban_reason = null;
            localStorage.setItem('nobuchirp_user', JSON.stringify(state.user));
        }
    }

    // Проверка предупреждений
    const { data: warnings } = await supabase
        .from('warnings')
        .select('*')
        .eq('user_id', state.user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1);
    
    if (warnings && warnings.length > 0) {
        const warning = warnings[0];
        showScreen('warning-screen');
        $('warning-reason').textContent = `Причина: ${warning.reason}`;
        
        const warnTime = new Date(warning.created_at);
        const allowTime = new Date(warnTime.getTime() + 3 * 60 * 1000); // 3 минуты
        startWarningTimer(allowTime, warning.id);
        return true;
    }

    return false;
};

const startBanTimer = (endDate) => {
    const timerEl = $('ban-timer');
    const interval = setInterval(() => {
        const now = new Date();
        const diff = endDate - now;
        if (diff <= 0) {
            clearInterval(interval);
            checkUserStatus(); // Перепроверка статуса
        } else {
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            timerEl.textContent = `Осталось времени: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
    }, 1000);
};

const startWarningTimer = (allowDate, warningId) => {
    const timerEl = $('warning-timer');
    const btn = $('btn-warning-ack');
    
    const updateTimer = () => {
        const now = new Date();
        const diff = allowDate - now;
        if (diff <= 0) {
            timerEl.textContent = 'Время вышло';
            btn.disabled = false;
        } else {
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            timerEl.textContent = `Осталось времени: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
    };

    const interval = setInterval(updateTimer, 1000);
    updateTimer(); // Запуск сразу

    btn.onclick = async () => {
        await supabase.from('warnings').update({ is_read: true }).eq('id', warningId);
        showScreen('main-screen');
        loadFeed();
        clearInterval(interval);
    };
};

// Проверка каждые 10 секунд
setInterval(() => {
    if (state.user && state.currentView !== 'auth') {
        checkUserStatus();
    }
}, 10000);

// ==================== НАВИГАЦИЯ И UI ====================
const showScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = $(screenId);
    if (screen) screen.classList.add('active');
};

const updateUserUI = () => {
    if (!state.user) return;
    $('current-user-avatar').textContent = state.user.avatar_emoji;
    $('current-user-name').textContent = state.user.username;
};

// Глобальный обработчик кликов (Делегирование)
document.addEventListener('click', async (e) => {
    const target = e.target.closest('button, .nav-btn, .tab-btn, .action-btn, .chirp-id, .hashtag, .back-btn, .close-modal');
    if (!target) return;

    // Авторизация
    if (target.id === 'btn-login') handleAuth(false);
    if (target.id === 'btn-register') handleAuth(true);

    // Навигация
    if (target.classList.contains('nav-btn')) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        const view = target.dataset.view;
        state.currentView = view;
        
        if (view === 'feed') {
            showScreen('main-screen');
            loadFeed();
        } else if (view === 'profile') {
            showScreen('profile-screen');
            loadProfile(state.user.username);
        } else if (view === 'rules') {
            showScreen('rules-screen');
        } else if (view === 'admin') {
            showScreen('admin-screen');
        }
    }

    if (target.classList.contains('tab-btn')) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        state.currentTab = target.dataset.tab;
        if (state.currentTab === 'trends') {
            $('feed-container').classList.add('hidden');
            $('create-chirp-area').classList.add('hidden');
            $('trends-container').classList.remove('hidden');
            loadTrends();
        } else {
            $('feed-container').classList.remove('hidden');
            $('create-chirp-area').classList.remove('hidden');
            $('trends-container').classList.add('hidden');
            loadFeed();
        }
    }

    if (target.classList.contains('back-btn')) {
        showScreen('main-screen');
        state.currentView = 'feed';
        document.querySelector('.nav-btn[data-view="feed"]').classList.add('active');
        document.querySelector('.nav-btn[data-view="profile"]').classList.remove('active');
    }

    if (target.classList.contains('close-modal')) {
        $(target.dataset.close).classList.add('hidden');
        state.activeChirpId = null;
    }

    // Действия с постами
    if (target.classList.contains('action-btn')) {
        const chirpId = target.dataset.chirpId;
        const action = target.dataset.action;
        if (chirpId) handleChirpAction(chirpId, action);
    }

    // Копирование ID поста
    if (target.classList.contains('chirp-id')) {
        navigator.clipboard.writeText(target.dataset.id);
        const originalText = target.textContent;
        target.textContent = 'ID скопирован!';
        setTimeout(() => target.textContent = originalText, 1500);
    }

    // Жалоба
    if (target.dataset.action === 'report') {
        const chirpId = target.dataset.chirpId;
        const reason = prompt('Укажите причину жалобы:');
        if (reason && chirpId) {
            await supabase.from('reports').insert([{
                from_user: state.user.id,
                from_username: state.user.username,
                chirp_id: chirpId,
                reason: reason
            }]);
            alert('Жалоба отправлена модераторам');
        }
    }

    // Админка
    if (target.id === 'btn-admin-login') {
        if ($('admin-password').value === 'NobuWaveAdmin2024') {
            $('admin-login-area').classList.add('hidden');
            $('admin-dashboard').classList.remove('hidden');
            loadAdminData();
        } else {
            alert('Неверный пароль администратора');
        }
    }

    if (target.id === 'btn-admin-action') {
        handleAdminAction();
    }

    if (target.id === 'btn-admin-delete-chirp') {
        const chirpId = $('admin-delete-chirp-id').value.trim();
        if (chirpId) {
            await supabase.from('chirps').delete().eq('id', chirpId);
            alert('Пост удалён');
            loadAdminData();
        }
    }
});

// ==================== ЛЕНТА И ПОСТЫ ====================
const loadFeed = async () => {
    const container = $('feed-container');
    if (!container) return;
    
    container.innerHTML = '<p style="text-align:center; color:var(--text-secondary); padding:20px;">Загрузка ленты...</p>';

    let query = supabase.from('chirps').select('*').order('created_at', { ascending: false });

    if (state.currentTab === 'feed-subs') {
        const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', state.user.id);
        const followingIds = follows ? follows.map(f => f.following_id) : [];
        // Добавляем себя в список, чтобы видеть свои посты
        followingIds.push(state.user.id);
        query = query.in('user_id', followingIds);
    }

    const { data, error } = await query.limit(50);
    
    if (error) {
        container.innerHTML = '<p style="color:var(--danger)">Ошибка загрузки ленты</p>';
        return;
    }

    container.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(chirp => {
            container.appendChild(createChirpElement(chirp));
        });
    } else {
        container.innerHTML = '<p style="text-align:center; color:var(--text-secondary); padding:20px;">Пока ничего нет. Будьте первым!</p>';
    }
};

const createChirpElement = (chirp) => {
    const div = document.createElement('div');
    div.className = 'card chirp-card';
    
    const isFire = chirp.is_fire;
    const verifiedBadge = chirp.is_verified ? '<i class="fa-solid fa-circle-check verified-badge"></i>' : '';
    const fireBadge = isFire ? '<i class="fa-solid fa-fire fire-badge"></i>' : '';
    
    // Примечание: в простой реализации мы не подгружаем лайки конкретного юзера для каждого поста отдельно запросом,
    // чтобы не делать 50 запросов. В продакшене это делается через RPC или join.
    // Здесь мы просто отображаем счетчики.
    
    div.innerHTML = `
        <div class="chirp-id" data-id="${chirp.id}">ID: ${chirp.id.slice(0,8)}</div>
        <div class="chirp-header">
            <span class="avatar">${chirp.avatar_emoji}</span>
            <div>
                <div class="username">${chirp.username} ${verifiedBadge} ${fireBadge}</div>
                <div style="font-size:12px; color:var(--text-secondary)">${formatTimeAgo(chirp.created_at)}</div>
            </div>
        </div>
        <div class="chirp-content">${highlightHashtags(chirp.content)}</div>
        ${chirp.image_url ? `<img src="${chirp.image_url}" class="chirp-image" alt="Post image">` : ''}
        <div class="chirp-actions">
            <button class="action-btn" data-action="like" data-chirp-id="${chirp.id}">
                <i class="fa-solid fa-heart"></i> ${chirp.likes || 0}
            </button>
            <button class="action-btn" data-action="dislike" data-chirp-id="${chirp.id}">
                <i class="fa-solid fa-thumbs-down"></i> ${chirp.dislikes || 0}
            </button>
            <button class="action-btn" data-action="rechirp" data-chirp-id="${chirp.id}">
                <i class="fa-solid fa-retweet"></i> ${chirp.rechirps || 0}
            </button>
            <button class="action-btn" data-action="comment" data-chirp-id="${chirp.id}">
                <i class="fa-solid fa-comment"></i> Коммент
            </button>
            <button class="action-btn" data-action="report" data-chirp-id="${chirp.id}" style="margin-left:auto;">
                <i class="fa-solid fa-flag"></i>
            </button>
        </div>
    `;
    return div;
};

const handleChirpAction = async (chirpId, action) => {
    if (!state.user) return;

    if (action === 'comment') {
        state.activeChirpId = chirpId;
        $('comments-modal').classList.remove('hidden');
        loadComments(chirpId);
        return;
    }

    if (action === 'like') {
        // Проверяем, лайкнул ли уже
        const { data: existing } = await supabase.from('likes').select('id').eq('user_id', state.user.id).eq('chirp_id', chirpId).maybeSingle();
        
        if (existing) {
            // Удалить лайк
            await supabase.from('likes').delete().eq('id', existing.id);
            // Декремент счетчика (через RPC или ручной пересчет, здесь упрощенно обновляем сам пост)
            // Для надежности лучше использовать RPC, но пока сделаем update
             await supabase.rpc('decrement_likes', { chirp_id: chirpId });
        } else {
            // Добавить лайк
            await supabase.from('likes').insert({ user_id: state.user.id, chirp_id: chirpId });
            // Удалить дизлайк если был
            await supabase.from('dislikes').delete().eq('user_id', state.user.id).eq('chirp_id', chirpId);
            await supabase.rpc('increment_likes', { chirp_id: chirpId });
        }
    } else if (action === 'dislike') {
        const { data: existing } = await supabase.from('dislikes').select('id').eq('user_id', state.user.id).eq('chirp_id', chirpId).maybeSingle();
        
        if (existing) {
            await supabase.from('dislikes').delete().eq('id', existing.id);
            await supabase.rpc('decrement_dislikes', { chirp_id: chirpId });
        } else {
            await supabase.from('dislikes').insert({ user_id: state.user.id, chirp_id: chirpId });
            await supabase.from('likes').delete().eq('user_id', state.user.id).eq('chirp_id', chirpId);
            await supabase.rpc('increment_dislikes', { chirp_id: chirpId });
        }
    } else if (action === 'rechirp') {
        const { data: existing } = await supabase.from('rechirps').select('id').eq('user_id', state.user.id).eq('chirp_id', chirpId).maybeSingle();
        if (!existing) {
            await supabase.from('rechirps').insert({ user_id: state.user.id, chirp_id: chirpId });
            await supabase.rpc('increment_rechirps', { chirp_id: chirpId });
        }
    }
    
    // Обновляем ленту для отображения новых счетчиков
    loadFeed(); 
};

// ==================== СОЗДАНИЕ ПОСТА ====================
$('chirp-content').addEventListener('input', (e) => {
    $('char-count').textContent = 280 - e.target.value.length;
});

$('chirp-image').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            $('image-preview').src = ev.target.result;
            $('image-preview-area').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
});

$('btn-remove-image').addEventListener('click', () => {
    $('chirp-image').value = '';
    $('image-preview-area').classList.add('hidden');
});

$('btn-send-chirp').addEventListener('click', async () => {
    if (state.isSending) return;
    
    const content = $('chirp-content').value.trim();
    const fileInput = $('chirp-image');
    const hasImage = fileInput.files.length > 0;

    if (!content && !hasImage) return;
    if (content.length > 280) return;

    state.isSending = true;
    const btn = $('btn-send-chirp');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    let imageUrl = null;
    if (hasImage) {
        const file = fileInput.files[0];
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file);
        
        if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName);
            imageUrl = publicUrl;
        } else {
            console.error('Upload error:', uploadError);
            alert('Ошибка загрузки изображения');
            state.isSending = false;
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-feather"></i> Чирикнуть';
            return;
        }
    }

    const hashtags = content.match(/#\w+/g) || [];
    
    // Логика огненных постов
    const today = new Date().toDateString();
    const lastPost = state.user.last_post_date ? new Date(state.user.last_post_date).toDateString() : null;
    let isFire = false;
    let newStreak = state.user.streak_count || 0;

    if (lastPost) {
        const diffDays = Math.floor((new Date(today) - new Date(lastPost)) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            newStreak += 1;
            if (newStreak >= 2) isFire = true;
        } else if (diffDays > 1) {
            newStreak = 1;
        }
    } else {
        newStreak = 1;
    }

    const { error } = await supabase.from('chirps').insert([{
        user_id: state.user.id,
        username: state.user.username,
        avatar_emoji: state.user.avatar_emoji,
        content: content,
        image_url: imageUrl,
        hashtags: hashtags,
        is_verified: state.user.is_verified,
        is_fire: isFire
    }]);

    if (!error) {
        // Обновляем статистику пользователя
        await supabase.from('users').update({ 
            streak_count: newStreak, 
            last_post_date: today 
        }).eq('id', state.user.id);
        
        state.user.streak_count = newStreak;
        state.user.last_post_date = today;
        localStorage.setItem('nobuchirp_user', JSON.stringify(state.user));

        // Обновление трендов
        for (const tag of hashtags) {
            const { data: existingTag } = await supabase.from('trends').select('count').eq('hashtag', tag).maybeSingle();
            if (existingTag) {
                await supabase.from('trends').update({ count: existingTag.count + 1, updated_at: new Date() }).eq('hashtag', tag);
            } else {
                await supabase.from('trends').insert({ hashtag: tag, count: 1 });
            }
        }

        // Очистка формы
        $('chirp-content').value = '';
        $('char-count').textContent = '280';
        fileInput.value = '';
        $('image-preview-area').classList.add('hidden');
        
        loadFeed();
    } else {
        alert('Ошибка публикации: ' + error.message);
    }

    state.isSending = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-feather"></i> Чирикнуть';
});

// ==================== КОММЕНТАРИИ ====================
const loadComments = async (chirpId) => {
    const list = $('comments-list');
    list.innerHTML = '<p style="text-align:center">Загрузка...</p>';
    
    const { data } = await supabase
        .from('comments')
        .select('*')
        .eq('chirp_id', chirpId)
        .order('created_at', { ascending: true });
    
    list.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(c => {
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.innerHTML = `<strong>${c.username}</strong>: ${c.content} <span style="color:var(--text-secondary); font-size:12px; float:right">${formatTimeAgo(c.created_at)}</span>`;
            list.appendChild(div);
        });
    } else {
        list.innerHTML = '<p style="color:var(--text-secondary); text-align:center">Нет комментариев</p>';
    }
};

$('btn-send-comment').addEventListener('click', async () => {
    const text = $('new-comment-text').value.trim();
    if (!text || !state.activeChirpId) return;

    await supabase.from('comments').insert([{
        chirp_id: state.activeChirpId,
        user_id: state.user.id,
        username: state.user.username,
        content: text
    }]);

    $('new-comment-text').value = '';
    loadComments(state.activeChirpId);
});

// ==================== ПРОФИЛЬ ====================
const loadProfile = async (username) => {
    const { data: user } = await supabase.from('users').select('*').eq('username', username).single();
    if (!user) return;

    // Статистика
    const { count: postsCount } = await supabase.from('chirps').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    const { count: followersCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id);
    const { count: followingCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id);

    const isMe = state.user.id === user.id;
    let followBtn = '';
    if (!isMe) {
        const { data: isFollowing } = await supabase.from('follows').select('id').eq('follower_id', state.user.id).eq('following_id', user.id).maybeSingle();
        followBtn = `<button class="btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}" id="btn-toggle-follow" data-target="${user.id}" data-following="${!!isFollowing}">
            ${isFollowing ? 'Отписаться' : 'Подписаться'}
        </button>`;
    }

    const verifiedBadge = user.is_verified ? '<i class="fa-solid fa-circle-check verified-badge"></i>' : '';

    $('profile-content').innerHTML = `
        <div class="profile-avatar">${user.avatar_emoji}</div>
        <h2>${user.username} ${verifiedBadge}</h2>
        <p style="color:var(--text-secondary); margin-top:8px;">${user.bio || 'Нет биографии'}</p>
        <div class="profile-stats">
            <div class="stat-item"><span class="stat-value">${postsCount || 0}</span><span class="stat-label">Посты</span></div>
            <div class="stat-item"><span class="stat-value">${followersCount || 0}</span><span class="stat-label">Подписчики</span></div>
            <div class="stat-item"><span class="stat-value">${followingCount || 0}</span><span class="stat-label">Подписки</span></div>
        </div>
        ${followBtn}
        ${isMe ? `<button class="btn btn-secondary" style="margin-top:8px;" onclick="editProfile()">Редактировать профиль</button>` : ''}
    `;

    // Загрузка постов профиля
    const { data: chirps } = await supabase.from('chirps').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    const container = $('profile-chirps');
    container.innerHTML = '';
    if (chirps) {
        chirps.forEach(c => container.appendChild(createChirpElement(c)));
    }
};

window.editProfile = async () => {
    const newBio = prompt('Новая биография:', state.user.bio);
    const newEmoji = prompt('Новый эмодзи-аватар (один символ):', state.user.avatar_emoji);
    
    if (newBio !== null) {
        const finalEmoji = newEmoji ? newEmoji.charAt(0) : '👤';
        
        await supabase.from('users').update({ 
            bio: newBio, 
            avatar_emoji: finalEmoji 
        }).eq('id', state.user.id);
        
        state.user.bio = newBio;
        state.user.avatar_emoji = finalEmoji;
        localStorage.setItem('nobuchirp_user', JSON.stringify(state.user));
        
        loadProfile(state.user.username);
        updateUserUI();
    }
};

document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-toggle-follow') {
        const targetId = e.target.dataset.target;
        const isFollowing = e.target.dataset.following === 'true';
        
        if (isFollowing) {
            supabase.from('follows').delete().eq('follower_id', state.user.id).eq('following_id', targetId);
            e.target.textContent = 'Подписаться';
            e.target.className = 'btn btn-primary';
            e.target.dataset.following = 'false';
        } else {
            supabase.from('follows').insert({ follower_id: state.user.id, following_id: targetId });
            e.target.textContent = 'Отписаться';
            e.target.className = 'btn btn-secondary';
            e.target.dataset.following = 'true';
        }
    }
});

// ==================== ТРЕНДЫ ====================
const loadTrends = async () => {
    const { data } = await supabase.from('trends').select('*').order('count', { ascending: false }).limit(20);
    const list = $('trends-list');
    list.innerHTML = '';
    if (data) {
        data.forEach(t => {
            const li = document.createElement('li');
            li.style.cssText = 'padding:12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;';
            li.innerHTML = `<span class="hashtag">${t.hashtag}</span> <span style="color:var(--text-secondary); font-size:14px;">${t.count} постов</span>`;
            list.appendChild(li);
        });
    } else {
        list.innerHTML = '<li style="padding:12px; color:var(--text-secondary)">Трендов пока нет</li>';
    }
};

// ==================== АДМИНКА ====================
const loadAdminData = async () => {
    const { data: reports } = await supabase.from('reports').select('*, chirps(content)').order('created_at', { ascending: false });
    const rList = $('admin-reports-list');
    rList.innerHTML = '';
    if (reports) {
        reports.forEach(r => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${r.from_username}</strong> жалуется на пост<br>Текст: "${r.chirps?.content?.slice(0,50)}..."<br>Причина: ${r.reason}<br><small>ID поста: ${r.chirp_id}</small>`;
            rList.appendChild(li);
        });
    }

    const { data: bans } = await supabase.from('users').select('username, ban_reason, ban_expires').eq('is_banned', true);
    const bList = $('admin-bans-list');
    bList.innerHTML = '';
    if (bans) {
        bans.forEach(b => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${b.username}</strong><br>Причина: ${b.ban_reason}<br>До: ${b.ban_expires ? new Date(b.ban_expires).toLocaleString() : 'Навсегда'}`;
            bList.appendChild(li);
        });
    }
};

const handleAdminAction = async () => {
    const username = $('admin-target-username').value.trim();
    const reason = $('admin-reason').value.trim();
    const action = $('admin-ban-duration').value;

    if (!username) return alert('Введите никнейм пользователя');

    const { data: user } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
    if (!user) return alert('Пользователь не найден');

    if (action === 'verify') {
        await supabase.from('users').update({ is_verified: true }).eq('id', user.id);
        alert(`Пользователь ${username} верифицирован!`);
    } else if (action === 'unban') {
        await supabase.from('users').update({ is_banned: false, ban_reason: null, ban_expires: null }).eq('id', user.id);
        alert(`Пользователь ${username} разбанен`);
    } else if (action === 'warn') {
        if (!reason) return alert('Укажите причину предупреждения');
        await supabase.from('warnings').insert({ user_id: user.id, username: username, reason: reason });
        alert(`Предупреждение отправлено пользователю ${username}`);
    } else {
        if (!reason) return alert('Укажите причину бана');
        let expires = null;
        const now = new Date();
        if (action === '1d') expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        if (action === '7d') expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        await supabase.from('users').update({ 
            is_banned: true, 
            ban_reason: reason, 
            ban_expires: expires 
        }).eq('id', user.id);
        alert(`Пользователь ${username} забанен`);
    }
    
    $('admin-target-username').value = '';
    $('admin-reason').value = '';
    loadAdminData();
};

// ==================== REALTIME ====================
const initRealtime = () => {
    // Подписка на новые посты
    supabase.channel('public:chirps')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chirps' }, (payload) => {
            // Если мы в ленте и не в трендах, обновляем
            if (state.currentView === 'feed' && state.currentTab !== 'trends') {
                loadFeed();
            }
        })
        .subscribe();
};

// Запуск приложения
window.addEventListener('DOMContentLoaded', checkAuth);