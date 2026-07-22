// КОНФИГУРАЦИЯ
const SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
const ADMIN_EMAIL = 'nobuqrspaceeee@outlook.com';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// EmailJS (ВАШИ КЛЮЧИ)
const EMAILJS = {
    enabled: true,
    publicKey: 'gXxOqmU-XXnrVz8FHro2jA',
    serviceId: 'service_yixc9cg',
    templateVerify: 'template_4mj9a5o',
    templateNotify: 'template_t5dw8ot'
};

if (EMAILJS.enabled) emailjs.init(EMAILJS.publicKey);

let currentUser = null;
let lastPostTime = 0;
let selectedMediaFile = null;
let selectedMediaType = null;
let pendingEmail = null;

// ЗАПУСК
document.addEventListener('DOMContentLoaded', () => {
    const s = localStorage.getItem('nobuqr_session');
    if (s && Date.now() < JSON.parse(s).expiry) {
        currentUser = JSON.parse(s).user;
        showMain();
        loadFeed();
    }
});

// ГЕНЕРАЦИЯ КОДА
function genCode() { 
    return Math.floor(100000 + Math.random() * 900000).toString(); 
}

// ОТПРАВКА EMAIL
async function sendEmail(type, params) {
    if (!EMAILJS.enabled) { 
        console.log('📧 Лог:', params); 
        return false; 
    }
    try {
        const templateId = type === 'code' ? EMAILJS.templateVerify : EMAILJS.templateNotify;
        const templateParams = type === 'code' ? {
            subject: params.subject,
            title: params.title,
            message: params.message,
            code: params.code,
            expires: params.expires || '10 минут',
            to_email: params.email
        } : {
            subject: params.subject,
            color: params.color || '#1d9bf0',
            title: params.title,
            bg: params.bg || '#f0f8ff',
            content: params.content,
            to_email: params.email
        };
        await emailjs.send(EMAILJS.serviceId, templateId, templateParams);
        console.log('✅ Отправлено:', params.subject);
        return true;
    } catch(e) { 
        console.error('❌ Ошибка:', e); 
        return false; 
    }
}

// ПОКАЗ СТРАНИЦ
function showMain() {
    document.getElementById('authPage').classList.remove('active');
    document.getElementById('mainHeader').style.display = 'block';
    if (currentUser?.is_admin) {
        document.getElementById('adminBtn').style.display = 'inline-block';
    }
}

function showAuthTab(t) {
    document.getElementById('loginForm').classList.toggle('active', t === 'login');
    document.getElementById('registerForm').classList.toggle('active', t === 'register');
    document.getElementById('loginTab').classList.toggle('active', t === 'login');
    document.getElementById('registerTab').classList.toggle('active', t === 'register');
}

function showPage(p) {
    document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
    document.getElementById(p + 'Page').classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
    const btn = document.getElementById(p + 'Btn');
    if (btn) btn.classList.add('active');
    if (p === 'feed') loadFeed();
    if (p === 'profile') loadProfile(currentUser?.id);
    if (p === 'messages') loadMessages();
}

// ПРЕДПРОСМОТР МЕДИА
function previewMedia(type) {
    const input = document.getElementById(type === 'image' ? 'postImage' : 'postVideo');
    const file = input.files[0];
    if (!file) return;
    
    // Проверка размера
    const maxSize = type === 'image' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
        alert(`❌ Файл слишком большой! Макс: ${type === 'image' ? '10MB' : '50MB'}`);
        input.value = '';
        return;
    }
    
    selectedMediaFile = file;
    selectedMediaType = type;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('mediaPreview');
        preview.style.display = 'block';
        preview.innerHTML = type === 'image' 
            ? `<img src="${e.target.result}" alt="Preview">`
            : `<video src="${e.target.result}" controls></video>`;
    };
    reader.readAsDataURL(file);
}

// ОБНОВЛЕНИЕ СЧЁТЧИКА
document.addEventListener('input', function(e) {
    if (e.target.id === 'postContent') {
        const len = e.target.value.length;
        document.getElementById('charCounter').textContent = len + '/280';
        document.getElementById('postBtn').disabled = len === 0 || len > 280;
    }
});

// РЕГИСТРАЦИЯ
async function handleRegister(e) {
    e.preventDefault();
    
    const email = document.getElementById('regEmail').value;
    const nickname = document.getElementById('regNickname').value;
    const password = document.getElementById('regPassword').value;
    const birth = document.getElementById('regBirthDate').value;
    
    // Проверка возраста
    const age = Math.floor((Date.now() - new Date(birth)) / 31557600000);
    if (age < 10) return alert('❌ Минимальный возраст: 10 лет');
    
    // Проверка никнейма
    if (!/^[a-zA-Zа-яА-ЯёЁ0-9_\-\.]+$/.test(nickname)) {
        return alert('❌ Недопустимые символы в никнейме');
    }
    
    // Проверка пароля
    if (password.length < 6) return alert('❌ Пароль минимум 6 символов');
    
    // Получаем IP
    const ip = await (await fetch('https://api.ipify.org?format=json')).json();
    
    // Проверка существования
    const { data: exist } = await supabase.from('users')
        .select('*').or(`email.eq.${email},nickname.eq.${nickname}`).single();
    
    if (exist) return alert('❌ Email или никнейм уже занят');
    
    // Создаём пользователя
    const { error } = await supabase.from('users').insert([{
        email: email,
        nickname: nickname,
        password_hash: btoa(password),
        date_of_birth: birth,
        ip_address: ip.ip
    }]);
    
    if (error) return alert('❌ Ошибка: ' + error.message);
    
    // Отправляем код подтверждения
    const code = genCode();
    await supabase.from('users').update({
        verification_code: code,
        verification_code_expires: new Date(Date.now() + 600000).toISOString()
    }).eq('email', email);
    
    await sendEmail('code', {
        email: email,
        code: code,
        subject: 'Подтверждение регистрации',
        title: '🔐 Код подтверждения',
        message: `Здравствуйте, ${nickname}! Ваш код для подтверждения email:`,
        expires: '10 минут'
    });
    
    pendingEmail = email;
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('verifyEmailSection').style.display = 'block';
    document.getElementById('verifyEmailDisplay').textContent = email;
    
    alert('📧 Код подтверждения отправлен на ' + email);
}

// ПОДТВЕРЖДЕНИЕ EMAIL
async function verifyEmailCode() {
    const code = document.getElementById('verificationCode').value;
    if (code.length !== 6) return alert('❌ Введите 6-значный код');
    
    const { data: user } = await supabase.from('users')
        .select('*').eq('email', pendingEmail).single();
    
    if (!user || user.verification_code !== code) {
        return alert('❌ Неверный код');
    }
    
    if (new Date(user.verification_code_expires) < new Date()) {
        return alert('❌ Код истёк. Запросите новый.');
    }
    
    // Подтверждаем
    await supabase.from('users').update({
        email_verified: true,
        verification_code: null,
        verification_code_expires: null
    }).eq('id', user.id);
    
    // Отправляем приветствие
    await sendEmail('notify', {
        email: user.email,
        subject: '🎉 Добро пожаловать!',
        title: 'Добро пожаловать в NOBUQR.SPACE!',
        bg: '#f0f8ff',
        content: `<p>Привет, <strong>${user.nickname}</strong>!</p>
                  <p>Вы успешно зарегистрировались!</p>
                  <p>📜 Соблюдайте правила:</p>
                  <ul>
                    <li>Будьте вежливы</li>
                    <li>Без спама и 18+</li>
                    <li>Уважайте других</li>
                  </ul>
                  <p>По вопросам: ${ADMIN_EMAIL}</p>`
    });
    
    alert('✅ Email подтверждён! Теперь войдите.');
    location.reload();
}

// ПОВТОРНАЯ ОТПРАВКА КОДА
async function resendCode() {
    if (!pendingEmail) return;
    
    const code = genCode();
    await supabase.from('users').update({
        verification_code: code,
        verification_code_expires: new Date(Date.now() + 600000).toISOString()
    }).eq('email', pendingEmail);
    
    const { data: user } = await supabase.from('users')
        .select('nickname').eq('email', pendingEmail).single();
    
    await sendEmail('code', {
        email: pendingEmail,
        code: code,
        subject: 'Новый код подтверждения',
        title: '🔐 Новый код',
        message: `Здравствуйте, ${user?.nickname || 'пользователь'}! Ваш новый код:`,
        expires: '10 минут'
    });
    
    alert('📧 Новый код отправлен!');
}

// ВХОД
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    // Проверка IP бана
    const ip = await (await fetch('https://api.ipify.org?format=json')).json();
    const { data: bannedIP } = await supabase.from('banned_ips')
        .select('*').eq('ip_address', ip.ip).single();
    
    if (bannedIP) {
        return alert('🚫 Ваш IP заблокирован. Причина: ' + bannedIP.reason + '\nОбжалование: ' + ADMIN_EMAIL);
    }
    
    const { data: user } = await supabase.from('users')
        .select('*').eq('email', email).single();
    
    if (!user || user.password_hash !== btoa(password)) {
        return alert('❌ Неверный email или пароль');
    }
    
    if (!user.email_verified) {
        pendingEmail = email;
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('verifyEmailSection').style.display = 'block';
        document.getElementById('verifyEmailDisplay').textContent = email;
        return alert('❌ Email не подтверждён. Введите код из письма.');
    }
    
    if (user.is_banned) {
        if (user.ban_expires && new Date(user.ban_expires) < new Date()) {
            await supabase.from('users').update({
                is_banned: false, ban_reason: null, ban_expires: null
            }).eq('id', user.id);
        } else {
            return alert('🚫 Аккаунт заблокирован: ' + user.ban_reason + '\nОбжалование: ' + ADMIN_EMAIL);
        }
    }
    
    // Создаём сессию на 24 часа
    localStorage.setItem('nobuqr_session', JSON.stringify({
        user: user,
        expiry: Date.now() + 24 * 60 * 60 * 1000
    }));
    
    currentUser = user;
    showMain();
    showPage('feed');
    loadFeed();
}

// ВЫХОД
function logout() {
    localStorage.removeItem('nobuqr_session');
    currentUser = null;
    location.reload();
}

// СОЗДАНИЕ ПОСТА
async function createPost() {
    const content = document.getElementById('postContent').value.trim();
    
    if (!content && !selectedMediaFile) return;
    
    // Проверка времени
    if (Date.now() - lastPostTime < 30000) {
        return alert('⏳ Подождите 30 секунд между постами');
    }
    
    // Модерация контента
    const moderated = content ? moderateContent(content) : '📷 Медиа';
    
    // Проверка ссылок для неверифицированных
    if (!currentUser.is_verified && /https?:\/\//.test(content)) {
        return alert('❌ Только верифицированные пользователи могут публиковать ссылки');
    }
    
    // Загрузка медиа
    let imageUrl = null, videoUrl = null, mediaType = 'none';
    
    if (selectedMediaFile) {
        const bucket = selectedMediaType === 'image' ? 'images' : 'videos';
        const path = `${currentUser.id}/${Date.now()}_${selectedMediaFile.name}`;
        
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(path, selectedMediaFile);
        
        if (!error) {
            const url = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
            if (selectedMediaType === 'image') {
                imageUrl = url;
                mediaType = 'image';
            } else {
                videoUrl = url;
                mediaType = 'video';
            }
        }
    }
    
    // Создаём пост
    await supabase.from('chirps').insert([{
        user_id: currentUser.id,
        content: moderated,
        image_url: imageUrl,
        video_url: videoUrl,
        media_type: mediaType
    }]);
    
    // Очистка
    lastPostTime = Date.now();
    document.getElementById('postContent').value = '';
    document.getElementById('postImage').value = '';
    document.getElementById('postVideo').value = '';
    document.getElementById('mediaPreview').style.display = 'none';
    document.getElementById('mediaPreview').innerHTML = '';
    document.getElementById('charCounter').textContent = '0/280';
    document.getElementById('postBtn').disabled = true;
    selectedMediaFile = null;
    selectedMediaType = null;
    
    loadFeed();
}

// МОДЕРАЦИЯ КОНТЕНТА
function moderateContent(content) {
    const badWords = ['badword1', 'badword2', 'badword3'];
    let moderated = content;
    
    badWords.forEach(word => {
        moderated = moderated.replace(new RegExp(word, 'gi'), '***');
    });
    
    // Фильтр телефонов
    moderated = moderated.replace(/\+?[\d\s\-\(\)]{10,}/g, '***');
    
    // Фильтр email
    moderated = moderated.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***');
    
    return moderated;
}

// ЗАГРУЗКА ЛЕНТЫ
async function loadFeed() {
    const { data: posts } = await supabase
        .from('chirps')
        .select('*, users:user_id(nickname, emoji, is_verified)')
        .order('created_at', { ascending: false })
        .limit(50);
    
    const container = document.getElementById('postsFeed');
    
    if (!posts || posts.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#666;">Нет постов. Будьте первым!</p>';
        return;
    }
    
    let html = '';
    for (const post of posts) {
        const user = post.users;
        
        let mediaHtml = '';
        if (post.media_type === 'image' && post.image_url) {
            mediaHtml = `<div class="post-media"><img src="${post.image_url}" alt="Post"></div>`;
        } else if (post.media_type === 'video' && post.video_url) {
            mediaHtml = `<div class="post-media"><video src="${post.video_url}" controls></video></div>`;
        }
        
        html += `
            <div class="post">
                <div class="post-header">
                    <div class="user-avatar">${user.emoji}</div>
                    <div class="user-info">
                        <div class="user-nickname">
                            ${user.nickname}
                            ${user.is_verified ? '<span class="verified-badge">✓</span>' : ''}
                        </div>
                        <small>${new Date(post.created_at).toLocaleString('ru-RU')}</small>
                    </div>
                </div>
                ${post.content !== '📷 Медиа' ? `<div class="post-content">${post.content}</div>` : ''}
                ${mediaHtml}
                <div class="post-actions-bar">
                    <button class="action-btn" onclick="toggleLike('${post.id}')">❤️</button>
                    <button class="action-btn" onclick="showComments('${post.id}')">💬</button>
                    <button class="action-btn" onclick="reportPost('${post.id}')">🚩</button>
                    ${currentUser && currentUser.id === post.user_id ? 
                        `<button class="action-btn" onclick="deletePost('${post.id}')">🗑️</button>` : ''}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// ЛАЙКИ
async function toggleLike(chirpId) {
    if (!currentUser) return alert('❌ Войдите в аккаунт');
    
    const { data: existing } = await supabase
        .from('likes')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('chirp_id', chirpId)
        .single();
    
    if (existing) {
        await supabase.from('likes').delete().eq('id', existing.id);
    } else {
        await supabase.from('likes').insert([{
            user_id: currentUser.id,
            chirp_id: chirpId
        }]);
    }
    
    loadFeed();
}

// КОММЕНТАРИИ
async function showComments(chirpId) {
    const { data: comments } = await supabase
        .from('comments')
        .select('*, users:user_id(nickname)')
        .eq('chirp_id', chirpId)
        .order('created_at', { ascending: true });
    
    let html = '<h3>Комментарии</h3>';
    
    if (comments && comments.length > 0) {
        comments.forEach(c => {
            html += `
                <div style="padding:10px;border-bottom:1px solid #e0e0e0;">
                    <strong>${c.users.nickname}</strong>: ${c.content}
                    <br><small>${new Date(c.created_at).toLocaleString('ru-RU')}</small>
                </div>
            `;
        });
    } else {
        html += '<p style="color:#666;">Нет комментариев</p>';
    }
    
    html += `
        <div style="margin-top:15px;">
            <textarea id="commentContent" placeholder="Написать комментарий..." style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:10px;"></textarea>
            <button class="primary-btn" onclick="addComment('${chirpId}')" style="margin-top:10px;">Отправить</button>
        </div>
    `;
    
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
}

async function addComment(chirpId) {
    const content = document.getElementById('commentContent').value.trim();
    if (!content) return;
    
    await supabase.from('comments').insert([{
        user_id: currentUser.id,
        chirp_id: chirpId,
        content: moderateContent(content)
    }]);
    
    closeModal();
    loadFeed();
}

// ЖАЛОБЫ
async function reportPost(chirpId) {
    if (!currentUser) return alert('❌ Войдите в аккаунт');
    
    const reason = prompt('Причина жалобы:');
    if (!reason) return;
    
    await supabase.from('reports').insert([{
        reporter_id: currentUser.id,
        chirp_id: chirpId,
        reason: reason
    }]);
    
    alert('✅ Жалоба отправлена администратору');
}

// УДАЛЕНИЕ ПОСТА
async function deletePost(postId) {
    if (!confirm('Удалить пост?')) return;
    
    await supabase.from('chirps').delete().eq('id', postId);
    loadFeed();
}

// ПОИСК
async function searchHashtags() {
    const query = document.getElementById('searchInput').value.trim();
    const container = document.getElementById('searchResults');
    
    if (!query) {
        container.innerHTML = '';
        return;
    }
    
    const { data: posts } = await supabase
        .from('chirps')
        .select('*, users:user_id(nickname, emoji, is_verified)')
        .ilike('content', `%#${query}%`)
        .order('created_at', { ascending: false });
    
    if (!posts || posts.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#666;">Ничего не найдено</p>';
        return;
    }
    
    container.innerHTML = posts.map(p => `
        <div class="post">
            <strong>${p.users.nickname}</strong>: ${p.content}
            <br><small>${new Date(p.created_at).toLocaleString('ru-RU')}</small>
        </div>
    `).join('');
}

// ПРОФИЛЬ
async function loadProfile(userId) {
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (!user) return;
    
    const { count: followers } = await supabase.from('follows')
        .select('*', { count: 'exact' }).eq('following_id', userId);
    
    const { count: following } = await supabase.from('follows')
        .select('*', { count: 'exact' }).eq('follower_id', userId);
    
    document.getElementById('profileInfo').innerHTML = `
        <div class="profile-emoji">${user.emoji}</div>
        <div class="profile-name">
            ${user.nickname}
            ${user.is_verified ? '<span class="verified-badge">✓</span>' : ''}
        </div>
        <div class="profile-bio">${user.bio || 'Нет описания'}</div>
        <div class="profile-stats">
            <div class="stat">
                <div class="stat-number">${followers || 0}</div>
                <div class="stat-label">Подписчики</div>
            </div>
            <div class="stat">
                <div class="stat-number">${following || 0}</div>
                <div class="stat-label">Подписки</div>
            </div>
        </div>
        ${currentUser && currentUser.id !== userId ? 
            `<button class="primary-btn" onclick="toggleFollow('${userId}')">Подписаться/Отписаться</button>` : ''}
    `;
    
    const { data: posts } = await supabase.from('chirps')
        .select('*, users:user_id(nickname, emoji, is_verified)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    
    displayProfilePosts(posts);
}

function displayProfilePosts(posts) {
    const container = document.getElementById('profilePosts');
    if (!posts || posts.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#666;">Нет постов</p>';
        return;
    }
    
    container.innerHTML = posts.map(p => `
        <div class="post">
            <div class="post-content">${p.content}</div>
            ${p.media_type === 'image' ? `<div class="post-media"><img src="${p.image_url}"></div>` : ''}
            ${p.media_type === 'video' ? `<div class="post-media"><video src="${p.video_url}" controls></video></div>` : ''}
            <small>${new Date(p.created_at).toLocaleString('ru-RU')}</small>
        </div>
    `).join('');
}

async function toggleFollow(userId) {
    if (!currentUser) return alert('❌ Войдите в аккаунт');
    
    const { data: existing } = await supabase.from('follows')
        .select('*').eq('follower_id', currentUser.id).eq('following_id', userId).single();
    
    if (existing) {
        await supabase.from('follows').delete().eq('id', existing.id);
    } else {
        await supabase.from('follows').insert([{
            follower_id: currentUser.id,
            following_id: userId
        }]);
    }
    
    loadProfile(userId);
}

// СООБЩЕНИЯ АДМИНУ
async function sendMessage(e) {
    e.preventDefault();
    
    const subject = document.getElementById('messageSubject').value.trim();
    const message = document.getElementById('messageText').value.trim();
    
    if (!subject || !message) return;
    
    await supabase.from('admin_messages').insert([{
        from_user_id: currentUser.id,
        subject: subject,
        message: message
    }]);
    
    alert('✅ Сообщение отправлено! Ответ придёт на вашу почту.');
    document.getElementById('messageSubject').value = '';
    document.getElementById('messageText').value = '';
    loadMessages();
}

async function loadMessages() {
    if (!currentUser) return;
    
    const { data: messages } = await supabase.from('admin_messages')
        .select('*').eq('from_user_id', currentUser.id)
        .order('created_at', { ascending: false });
    
    const container = document.getElementById('sentMessages');
    
    if (!messages || messages.length === 0) {
        container.innerHTML = '<p style="color:#666;">У вас нет отправленных сообщений</p>';
        return;
    }
    
    container.innerHTML = '<h3>Ваши сообщения:</h3>' + messages.map(m => `
        <div style="padding:10px;border:1px solid #e0e0e0;margin:10px 0;border-radius:5px;">
            <strong>${m.subject}</strong>
            <p>${m.message}</p>
            <small>${new Date(m.created_at).toLocaleString('ru-RU')} - 
            ${m.is_read ? '✅ Прочитано' : '📩 Отправлено'}</small>
        </div>
    `).join('');
}

// ВОССТАНОВЛЕНИЕ ПАРОЛЯ
function showResetPassword() {
    document.getElementById('resetPasswordSection').style.display = 'block';
}

async function sendResetCode() {
    const email = document.getElementById('resetEmail').value;
    if (!email) return alert('❌ Введите email');
    
    const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
    if (!user) return alert('❌ Пользователь не найден');
    
    const code = genCode();
    await supabase.from('users').update({
        reset_code: code,
        reset_code_expires: new Date(Date.now() + 300000).toISOString()
    }).eq('id', user.id);
    
    await sendEmail('code', {
        email: email,
        code: code,
        subject: 'Восстановление пароля',
        title: '🔑 Сброс пароля',
        message: 'Ваш код для восстановления пароля:',
        expires: '5 минут'
    });
    
    document.getElementById('resetCodeSection').style.display = 'block';
    alert('📧 Код отправлен!');
}

async function resetPassword() {
    const email = document.getElementById('resetEmail').value;
    const code = document.getElementById('resetCode').value;
    const newPassword = document.getElementById('newPassword').value;
    
    const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
    
    if (!user || user.reset_code !== code) return alert('❌ Неверный код');
    if (new Date(user.reset_code_expires) < new Date()) return alert('❌ Код истёк');
    
    await supabase.from('users').update({
        password_hash: btoa(newPassword),
        reset_code: null,
        reset_code_expires: null
    }).eq('id', user.id);
    
    alert('✅ Пароль изменён! Войдите.');
    location.reload();
}

// АДМИН-ПАНЕЛЬ
function adminLogin() {
    if (document.getElementById('adminPassword').value === 'NobuQRAdmin2025!') {
        document.getElementById('adminLoginForm').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        showAdminSection('users');
    } else {
        alert('❌ Неверный пароль');
    }
}

async function showAdminSection(section) {
    const content = document.getElementById('adminContent');
    
    switch(section) {
        case 'users':
            const { data: users } = await supabase.from('users')
                .select('*').order('created_at', { ascending: false });
            
            content.innerHTML = '<h3>👥 Пользователи</h3>' + users.map(u => `
                <div style="padding:15px;border:1px solid #e0e0e0;margin:10px 0;border-radius:10px;">
                    <strong>${u.nickname}</strong> (${u.email})<br>
                    IP: ${u.ip_address}<br>
                    Статус: ${u.is_banned ? '🔴 Забанен' : '🟢 Активен'} 
                    ${u.is_verified ? '✓' : ''}<br>
                    ${u.is_banned ? `Причина: ${u.ban_reason}<br>До: ${u.ban_expires ? new Date(u.ban_expires).toLocaleString('ru-RU') : 'Навсегда'}<br>` : ''}
                    <button onclick="verifyUser('${u.id}')" class="primary-btn" style="margin:5px;">
                        ${u.is_verified ? 'Снять ✓' : 'Выдать ✓'}
                    </button>
                    <button onclick="banUser('${u.id}')" class="danger-btn" style="margin:5px;">Забанить</button>
                    ${u.is_banned ? `<button onclick="unbanUser('${u.id}')" class="primary-btn" style="margin:5px;">Разбанить</button>` : ''}
                </div>
            `).join('');
            break;
            
        case 'reports':
            const { data: reports } = await supabase.from('reports')
                .select('*, reporter:reporter_id(nickname), chirps:chirp_id(content)')
                .eq('status', 'pending');
            
            content.innerHTML = '<h3>🚩 Жалобы</h3>' + 
                (reports?.length ? reports.map(r => `
                    <div style="padding:15px;border:1px solid #e0e0e0;margin:10px 0;border-radius:10px;">
                        <p><strong>От:</strong> ${r.reporter?.nickname}</p>
                        <p><strong>Пост:</strong> ${r.chirps?.content}</p>
                        <p><strong>Причина:</strong> ${r.reason}</p>
                        <button onclick="handleReport('${r.id}', 'delete')" class="danger-btn">Удалить пост</button>
                        <button onclick="handleReport('${r.id}', 'dismiss')" class="primary-btn">Отклонить</button>
                    </div>
                `).join('') : '<p>Нет жалоб</p>');
            break;
            
        case 'messages':
            const { data: messages } = await supabase.from('admin_messages')
                .select('*, from_user:from_user_id(nickname, email)')
                .order('created_at', { ascending: false });
            
            content.innerHTML = '<h3>✉️ Обращения</h3>' + 
                (messages?.length ? messages.map(m => `
                    <div style="padding:15px;border:1px solid #e0e0e0;margin:10px 0;border-radius:10px;">
                        <p><strong>От:</strong> ${m.from_user?.nickname} (${m.from_user?.email})</p>
                        <p><strong>Тема:</strong> ${m.subject}</p>
                        <p>${m.message}</p>
                        <small>${new Date(m.created_at).toLocaleString('ru-RU')} - 
                        ${m.is_read ? '✅ Прочитано' : '📩 Новое'}</small>
                    </div>
                `).join('') : '<p>Нет обращений</p>');
            break;
            
        case 'banned':
            const { data: ips } = await supabase.from('banned_ips').select('*');
            
            content.innerHTML = '<h3>🚫 Забаненные IP</h3>' + 
                (ips?.length ? ips.map(ip => `
                    <div style="padding:15px;border:1px solid #e0e0e0;margin:10px 0;border-radius:10px;">
                        <p><strong>IP:</strong> ${ip.ip_address}</p>
                        <p><strong>Причина:</strong> ${ip.reason}</p>
                        <p><strong>Дата:</strong> ${new Date(ip.created_at).toLocaleString('ru-RU')}</p>
                        <button onclick="unbanIP('${ip.ip_address}')" class="primary-btn">Разбанить IP</button>
                    </div>
                `).join('') : '<p>Нет забаненных IP</p>');
            break;
    }
}

async function verifyUser(userId) {
    const { data: user } = await supabase.from('users')
        .select('is_verified').eq('id', userId).single();
    
    await supabase.from('users').update({
        is_verified: !user.is_verified
    }).eq('id', userId);
    
    showAdminSection('users');
}

async function banUser(userId) {
    const reason = prompt('Причина бана:');
    if (!reason) return;
    
    const duration = prompt('Длительность (1h, 24h, 7d, forever):');
    let banExpires = null;
    
    switch(duration) {
        case '1h': banExpires = new Date(Date.now() + 3600000); break;
        case '24h': banExpires = new Date(Date.now() + 86400000); break;
        case '7d': banExpires = new Date(Date.now() + 604800000); break;
        case 'forever': banExpires = null; break;
        default: return alert('Неверная длительность');
    }
    
    const { data: user } = await supabase.from('users')
        .select('*').eq('id', userId).single();
    
    await supabase.from('users').update({
        is_banned: true,
        ban_reason: reason,
        ban_expires: banExpires?.toISOString()
    }).eq('id', userId);
    
    // Отправляем уведомление о бане
    await sendEmail('notify', {
        email: user.email,
        subject: '⚠️ Аккаунт заблокирован',
        color: '#ff4757',
        title: 'Аккаунт заблокирован',
        bg: '#fff5f5',
        content: `<p><strong>Причина:</strong> ${reason}</p>
                  <p><strong>Срок:</strong> ${duration === 'forever' ? 'Навсегда' : duration}</p>
                  <p>Обжалование: ${ADMIN_EMAIL}</p>`
    });
    
    // Бан по IP
    if (confirm('Забанить все аккаунты с этим IP?')) {
        await supabase.from('banned_ips').insert([{
            ip_address: user.ip_address,
            banned_by: currentUser.id,
            reason: reason
        }]);
        
        await supabase.from('users').update({
            is_banned: true,
            ban_reason: reason,
            ban_expires: banExpires?.toISOString()
        }).eq('ip_address', user.ip_address);
    }
    
    showAdminSection('users');
}

async function unbanUser(userId) {
    await supabase.from('users').update({
        is_banned: false,
        ban_reason: null,
        ban_expires: null
    }).eq('id', userId);
    
    showAdminSection('users');
}

async function handleReport(reportId, action) {
    if (action === 'delete') {
        const { data: report } = await supabase.from('reports')
            .select('chirp_id').eq('id', reportId).single();
        
        await supabase.from('chirps').delete().eq('id', report.chirp_id);
    }
    
    await supabase.from('reports').update({
        status: action === 'delete' ? 'resolved' : 'dismissed'
    }).eq('id', reportId);
    
    showAdminSection('reports');
}

async function unbanIP(ipAddress) {
    await supabase.from('banned_ips').delete().eq('ip_address', ipAddress);
    showAdminSection('banned');
}

function massSessionReset() {
    if (confirm('Сбросить ВСЕ сессии? Всех выкинет из аккаунтов!')) {
        localStorage.clear();
        alert('✅ Все сессии сброшены');
    }
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

window.onclick = function(event) {
    if (event.target === document.getElementById('modal')) {
        closeModal();
    }
}