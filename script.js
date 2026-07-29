// Инициализация Supabase
var supabaseUrl = 'https://iljsednetiogjtowlexo.supabase.co';
var supabaseKey = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Глобальные переменные
var currentUser = null;
var currentSession = null;
var currentFeed = 'latest';
var currentChatId = null;
var currentGroupId = null;
var currentProfileId = null;
var feedPage = 0;
var feedLoading = false;
var hasMoreFeed = true;
var realtimeChannels = [];
var lastPostTime = 0;
var dailyBonusDate = null;

// Определение ОС и применение стиля
(function() {
    var ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) {
        document.body.className = 'ios';
    } else if (/Android/.test(ua)) {
        document.body.className = 'android';
    } else {
        document.body.className = 'desktop';
    }
})();

// Вспомогательные функции
function showToast(message, type) {
    var toast = document.getElementById('auth-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(function() { toast.className = 'toast ' + type; }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function filterBadWords(text) {
    var badWords = ['badword1', 'badword2']; // минимальный список
    var filtered = text;
    for (var i = 0; i < badWords.length; i++) {
        var regex = new RegExp(badWords[i], 'gi');
        filtered = filtered.replace(regex, '***');
    }
    return filtered;
}

function xssProtect(str) {
    return escapeHtml(str);
}

// Шифрование сообщений (простое для демонстрации)
function encodeMessage(text) {
    return btoa(unescape(encodeURIComponent(text)));
}
function decodeMessage(encoded) {
    return decodeURIComponent(escape(atob(encoded)));
}

// SHA-256 хэширование
function sha256(password, salt) {
    return sha512.sha256(password + salt);
}

// Управление сессией
function saveSession(session) {
    localStorage.setItem('nobu_session', JSON.stringify(session));
    currentSession = session;
    currentUser = session.user;
}

function loadSession() {
    var sessionData = localStorage.getItem('nobu_session');
    if (sessionData) {
        var session = JSON.parse(sessionData);
        var now = new Date().getTime();
        if (session.expires_at && now < session.expires_at) {
            currentSession = session;
            currentUser = session.user;
            return true;
        } else {
            localStorage.removeItem('nobu_session');
        }
    }
    return false;
}

function clearSession() {
    localStorage.removeItem('nobu_session');
    currentSession = null;
    currentUser = null;
}

// Переключение экранов
function showScreen(screenId) {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('main-screen').classList.remove('active');
    document.getElementById(screenId).classList.add('active');
}

// Аутентификация
function switchAuthTab(tab) {
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.remove('active');
    document.getElementById(tab + '-form').classList.add('active');
    var tabs = document.querySelectorAll('.auth-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    if (tab === 'login') tabs[0].classList.add('active');
    else tabs[1].classList.add('active');
}

async function login() {
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    if (!email || !password) {
        showToast('Заполните все поля', 'error');
        return;
    }
    try {
        var { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        if (error || !user) {
            showToast('Неверный email или пароль', 'error');
            return;
        }
        var hash = sha256(password, user.salt);
        if (hash !== user.password_hash) {
            showToast('Неверный email или пароль', 'error');
            return;
        }
        // Проверка бана
        var { data: ban } = await supabase
            .from('bans')
            .select('*')
            .eq('user_id', user.id)
            .gte('banned_until', new Date().toISOString())
            .maybeSingle();
        if (ban) {
            showToast('Ваш аккаунт заблокирован до ' + new Date(ban.banned_until).toLocaleString(), 'error');
            return;
        }
        var session = {
            user: user,
            expires_at: new Date().getTime() + 24 * 60 * 60 * 1000
        };
        saveSession(session);
        showScreen('main-screen');
        initMainScreen();
        showToast('Добро пожаловать!', 'success');
    } catch (e) {
        showToast('Ошибка входа', 'error');
    }
}

async function register() {
    var email = document.getElementById('reg-email').value.trim();
    var username = document.getElementById('reg-username').value.trim();
    var handle = document.getElementById('reg-handle').value.trim();
    var password = document.getElementById('reg-password').value;
    if (!email || !username || !handle || !password) {
        showToast('Заполните все поля', 'error');
        return;
    }
    if (handle.charAt(0) !== '@') handle = '@' + handle;
    try {
        var { data: existing } = await supabase.from('users').select('id').or('email.eq.' + email + ',handle.eq.' + handle).limit(1);
        if (existing && existing.length > 0) {
            showToast('Пользователь с таким email или handle уже существует', 'error');
            return;
        }
        var salt = Math.random().toString(36).substring(2, 15);
        var hash = sha256(password, salt);
        var { data: newUser, error } = await supabase
            .from('users')
            .insert({
                email: email,
                username: username,
                handle: handle,
                password_hash: hash,
                salt: salt,
                is_admin: false,
                is_premium: false,
                gems: 0
            })
            .select()
            .single();
        if (error) {
            showToast('Ошибка регистрации', 'error');
            return;
        }
        showToast('Регистрация успешна! Войдите.', 'success');
        switchAuthTab('login');
    } catch (e) {
        showToast('Ошибка регистрации', 'error');
    }
}

function logout() {
    clearSession();
    closeRealtimeChannels();
    showScreen('auth-screen');
    document.getElementById('auth-screen').classList.add('active');
}

// Инициализация основного экрана
function initMainScreen() {
    if (!currentUser) return;
    document.getElementById('sidebar-handle').textContent = currentUser.handle;
    document.getElementById('sidebar-avatar').style.backgroundImage = currentUser.avatar_url ? 'url(' + currentUser.avatar_url + ')' : '';
    setupRealtime();
    showFeed('latest');
    loadNotifications();
    checkDailyBonus();
}

// Переключение вкладок ленты
function showFeed(type) {
    currentFeed = type;
    feedPage = 0;
    hasMoreFeed = true;
    document.getElementById('feed-posts').innerHTML = '';
    document.querySelectorAll('.feed-tab').forEach(function(t) { t.classList.remove('active'); });
    if (type === 'latest') document.querySelectorAll('.feed-tab')[0].classList.add('active');
    else if (type === 'popular') document.querySelectorAll('.feed-tab')[1].classList.add('active');
    else document.querySelectorAll('.feed-tab')[2].classList.add('active');
    loadFeed();
    hideAllContainers();
    document.getElementById('feed-container').style.display = 'block';
}

async function loadFeed() {
    if (feedLoading || !hasMoreFeed) return;
    feedLoading = true;
    document.getElementById('feed-loader').style.display = 'block';
    try {
        var query = supabase.from('chirps').select('*, users!inner(id, handle, username, avatar_url, is_premium, is_admin)').order('created_at', { ascending: false }).range(feedPage * 10, feedPage * 10 + 9);
        if (currentFeed === 'popular') {
            query = supabase.from('chirps').select('*, users!inner(id, handle, username, avatar_url, is_premium, is_admin), likes(count)').order('created_at', { ascending: false }).range(feedPage * 10, feedPage * 10 + 9);
        } else if (currentFeed === 'subscriptions') {
            var { data: followees } = await supabase.from('follows').select('followee_id').eq('follower_id', currentUser.id);
            if (followees && followees.length > 0) {
                var ids = followees.map(function(f) { return f.followee_id; });
                query = supabase.from('chirps').select('*, users!inner(id, handle, username, avatar_url, is_premium, is_admin)').in('user_id', ids).order('created_at', { ascending: false }).range(feedPage * 10, feedPage * 10 + 9);
            } else {
                document.getElementById('feed-posts').innerHTML += '<p>Подпишитесь на кого-нибудь, чтобы видеть их чирпы.</p>';
                hasMoreFeed = false;
                document.getElementById('feed-loader').style.display = 'none';
                feedLoading = false;
                return;
            }
        }
        var { data: posts, error } = await query;
        if (error || !posts || posts.length === 0) {
            hasMoreFeed = false;
            document.getElementById('feed-loader').style.display = 'none';
            feedLoading = false;
            return;
        }
        renderPosts(posts);
        feedPage++;
    } catch (e) {
        showToast('Ошибка загрузки ленты', 'error');
    }
    document.getElementById('feed-loader').style.display = 'none';
    feedLoading = false;
}

function renderPosts(posts) {
    var container = document.getElementById('feed-posts');
    for (var i = 0; i < posts.length; i++) {
        var post = posts[i];
        var user = post.users;
        var card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = '<div class="post-header">' +
            '<div class="post-avatar" style="background-image:url(' + (user.avatar_url || '') + ')"></div>' +
            '<div><span class="post-author">' + xssProtect(user.username) + '</span> <span class="post-handle">' + xssProtect(user.handle) + '</span>' +
            (user.is_premium ? ' <span style="color:gold;">⭐</span>' : '') +
            (user.is_admin ? ' <span style="color:blue;">✔️</span>' : '') +
            '</div></div>' +
            '<div class="post-content">' + xssProtect(filterBadWords(post.content)) + '</div>' +
            (post.media_url ? ('<img src="' + post.media_url + '" class="post-media">') : '') +
            '<div class="post-actions">' +
            '<button class="action-btn" onclick="likeChirp(\'' + post.id + '\', this)">❤️ <span>' + (post.likes ? post.likes[0] ? post.likes[0].count : 0 : 0) + '</span></button>' +
            '<button class="action-btn" onclick="rechirp(\'' + post.id + '\')">🔄</button>' +
            '</div>';
        container.appendChild(card);
    }
}

// Бесконечная прокрутка
window.onscroll = function() {
    if (feedLoading || !hasMoreFeed) return;
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
        loadFeed();
    }
};

// Поиск
function performSearch() {
    var query = document.getElementById('search-input').value.trim();
    if (!query) return;
    hideAllContainers();
    document.getElementById('search-container').style.display = 'block';
    document.getElementById('search-results').innerHTML = 'Поиск...';
    if (query.startsWith('@')) {
        searchByHandle(query.substring(1));
    } else if (query.startsWith('#')) {
        searchByHashtag(query.substring(1));
    } else {
        searchAll(query);
    }
}

async function searchByHandle(handle) {
    var { data: users } = await supabase.from('users').select('*').ilike('handle', '%' + handle + '%');
    var html = '';
    if (users) {
        for (var i = 0; i < users.length; i++) {
            html += '<div onclick="viewProfile(\'' + users[i].id + '\')">' + users[i].handle + '</div>';
        }
    }
    document.getElementById('search-results').innerHTML = html || 'Ничего не найдено';
}

async function searchByHashtag(tag) {
    var { data: posts } = await supabase.from('chirps').select('*, users(*)').ilike('content', '%#' + tag + '%');
    var container = document.getElementById('search-results');
    container.innerHTML = '';
    if (posts) {
        renderPosts(posts);
    } else {
        container.innerHTML = 'Ничего не найдено';
    }
}

// Профиль
function viewProfile(userId) {
    currentProfileId = userId;
    hideAllContainers();
    document.getElementById('profile-container').style.display = 'block';
    loadProfile(userId);
}

async function loadProfile(userId) {
    var { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (!user) return;
    document.getElementById('profile-banner').style.backgroundImage = user.banner_url ? 'url(' + user.banner_url + ')' : '';
    document.getElementById('profile-avatar').style.backgroundImage = user.avatar_url ? 'url(' + user.avatar_url + ')' : '';
    document.getElementById('profile-name').textContent = user.username;
    document.getElementById('profile-handle-display').textContent = user.handle;
    document.getElementById('profile-bio').textContent = user.bio || '';
    document.getElementById('profile-location').textContent = user.location || '';
    document.getElementById('profile-link').href = user.link || '#';
    document.getElementById('profile-link').textContent = user.link || '';
    var { count: chirpsCount } = await supabase.from('chirps').select('*', { count: 'exact' }).eq('user_id', userId);
    var { count: followersCount } = await supabase.from('follows').select('*', { count: 'exact' }).eq('followee_id', userId);
    var { count: followingCount } = await supabase.from('follows').select('*', { count: 'exact' }).eq('follower_id', userId);
    document.getElementById('profile-chirps').textContent = chirpsCount + ' чирпов';
    document.getElementById('profile-followers').textContent = followersCount + ' подписчиков';
    document.getElementById('profile-following').textContent = followingCount + ' подписок';
    if (currentUser && currentUser.id === userId) {
        document.getElementById('follow-btn').style.display = 'none';
        document.getElementById('edit-profile-btn').style.display = 'inline-block';
        document.getElementById('premium-btn').style.display = 'inline-block';
    } else {
        document.getElementById('follow-btn').style.display = 'inline-block';
        document.getElementById('edit-profile-btn').style.display = 'none';
        document.getElementById('premium-btn').style.display = 'none';
        checkFollowStatus(userId);
    }
    loadUserPosts(userId);
}

async function checkFollowStatus(userId) {
    var { data } = await supabase.from('follows').select('*').eq('follower_id', currentUser.id).eq('followee_id', userId).maybeSingle();
    var btn = document.getElementById('follow-btn');
    if (data) {
        btn.textContent = 'Отписаться';
        btn.onclick = function() { unfollowUser(userId); };
    } else {
        btn.textContent = 'Подписаться';
        btn.onclick = function() { followUser(userId); };
    }
}

async function followUser(userId) {
    await supabase.from('follows').insert({ follower_id: currentUser.id, followee_id: userId });
    createNotification(userId, 'follow');
    checkFollowStatus(userId);
}

async function unfollowUser(userId) {
    await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('followee_id', userId);
    checkFollowStatus(userId);
}

async function loadUserPosts(userId) {
    var { data: posts } = await supabase.from('chirps').select('*, users(*)').eq('user_id', userId).order('created_at', { ascending: false });
    var container = document.getElementById('profile-posts');
    container.innerHTML = '';
    if (posts) renderPostsToContainer(posts, container);
}

function renderPostsToContainer(posts, container) {
    for (var i = 0; i < posts.length; i++) {
        var post = posts[i];
        var user = post.users;
        var card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = '<div class="post-header">' +
            '<div class="post-avatar" style="background-image:url(' + (user.avatar_url || '') + ')"></div>' +
            '<div><span class="post-author">' + xssProtect(user.username) + '</span></div></div>' +
            '<div class="post-content">' + xssProtect(post.content) + '</div>' +
            (post.media_url ? '<img src="' + post.media_url + '" class="post-media">' : '');
        container.appendChild(card);
    }
}

function toggleFollow() {
    // обрабатывается в checkFollowStatus
}

function showEditProfile() {
    openModal('edit-profile-modal');
}

async function updateProfile() {
    var bio = document.getElementById('bio-input').value;
    var location = document.getElementById('location-input').value;
    var link = document.getElementById('link-input').value;
    var avatarFile = document.getElementById('avatar-upload').files[0];
    var bannerFile = document.getElementById('banner-upload').files[0];
    var updates = { bio: bio, location: location, link: link };
    if (avatarFile) {
        var avatarUrl = await uploadFile(avatarFile, 'avatars');
        if (avatarUrl) updates.avatar_url = avatarUrl;
    }
    if (bannerFile) {
        var bannerUrl = await uploadFile(bannerFile, 'banners');
        if (bannerUrl) updates.banner_url = bannerUrl;
    }
    await supabase.from('users').update(updates).eq('id', currentUser.id);
    currentUser = Object.assign(currentUser, updates);
    saveSession({ user: currentUser, expires_at: currentSession.expires_at });
    closeModal();
    loadProfile(currentUser.id);
    showToast('Профиль обновлён', 'success');
}

async function uploadFile(file, bucket) {
    var fileName = Date.now() + '_' + file.name;
    var { data, error } = await supabase.storage.from(bucket).upload(fileName, file);
    if (error) {
        showToast('Ошибка загрузки файла', 'error');
        return null;
    }
    return supabase.storage.from(bucket).getPublicUrl(fileName).publicURL;
}

// Чирпы
async function createPost() {
    if (!currentUser) return;
    var now = Date.now();
    if (now - lastPostTime < 10000) {
        showToast('Слишком часто, подождите 10 секунд', 'error');
        return;
    }
    var content = document.getElementById('post-content').value.trim();
    if (!content || content.length > 280) return;
    var mediaFile = document.getElementById('post-media').files[0];
    var mediaUrl = null;
    if (mediaFile) {
        if (mediaFile.size > 10 * 1024 * 1024 && mediaFile.type.startsWith('image/')) {
            showToast('Фото до 10MB', 'error'); return;
        }
        if (mediaFile.size > 50 * 1024 * 1024 && mediaFile.type.startsWith('video/')) {
            showToast('Видео до 50MB', 'error'); return;
        }
        if (mediaFile.size > 5 * 1024 * 1024 && mediaFile.type.startsWith('audio/')) {
            showToast('Аудио до 5MB', 'error'); return;
        }
        mediaUrl = await uploadFile(mediaFile, 'media');
    }
    var { data: post } = await supabase.from('chirps').insert({
        user_id: currentUser.id,
        content: filterBadWords(content),
        media_url: mediaUrl
    }).select('*, users(*)').single();
    if (post) {
        lastPostTime = now;
        document.getElementById('post-content').value = '';
        document.getElementById('post-media').value = '';
        closeModal();
        if (currentFeed === 'latest') {
            var container = document.getElementById('feed-posts');
            var tempDiv = document.createElement('div');
            renderPostsToContainer([post], tempDiv);
            container.insertBefore(tempDiv.firstChild, container.firstChild);
        }
        showToast('Чирп опубликован!', 'success');
        giveGems(1, 'За пост');
    }
}

// Лайки
async function likeChirp(chirpId, btn) {
    if (!currentUser) return;
    var { data: existing } = await supabase.from('likes').select('*').eq('user_id', currentUser.id).eq('chirp_id', chirpId).maybeSingle();
    if (existing) {
        await supabase.from('likes').delete().eq('id', existing.id);
        btn.classList.remove('liked');
    } else {
        await supabase.from('likes').insert({ user_id: currentUser.id, chirp_id: chirpId });
        btn.classList.add('liked');
        var { data: chirp } = await supabase.from('chirps').select('user_id').eq('id', chirpId).single();
        if (chirp && chirp.user_id !== currentUser.id) createNotification(chirp.user_id, 'like', chirpId);
    }
}

function rechirp(chirpId) {
    showToast('Речирпнуто! (заглушка)', 'success');
}

// Подписки (follow) уже выше

// Уведомления
async function createNotification(userId, type, chirpId) {
    await supabase.from('notifications').insert({
        user_id: userId,
        type: type,
        from_user_id: currentUser.id,
        chirp_id: chirpId || null
    });
}

async function loadNotifications() {
    if (!currentUser) return;
    var { data: notifs } = await supabase.from('notifications').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20);
    var container = document.getElementById('notifications-list');
    if (!container) return;
    container.innerHTML = '';
    if (notifs) {
        for (var i = 0; i < notifs.length; i++) {
            var n = notifs[i];
            var div = document.createElement('div');
            div.className = 'notification-item';
            div.textContent = n.type + ' от пользователя ' + n.from_user_id;
            container.appendChild(div);
        }
    }
}

function showNotifications() {
    openModal('notifications-modal');
    loadNotifications();
}

// Модальные окна
function openModal(modalId) {
    document.getElementById('modal-overlay').style.display = 'block';
    document.getElementById(modalId).style.display = 'block';
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    var modals = document.querySelectorAll('.modal');
    for (var i = 0; i < modals.length; i++) modals[i].style.display = 'none';
}

function hideAllContainers() {
    document.getElementById('feed-container').style.display = 'none';
    document.getElementById('profile-container').style.display = 'none';
    document.getElementById('chats-container').style.display = 'none';
    document.getElementById('chat-window').style.display = 'none';
    document.getElementById('search-container').style.display = 'none';
}

// Чаты
function showChatsTab(tab) {
    document.getElementById('private-chats').style.display = tab === 'private' ? 'block' : 'none';
    document.getElementById('group-chats').style.display = tab === 'groups' ? 'block' : 'none';
    if (tab === 'private') loadPrivateChats();
    else loadGroupChats();
}

async function loadPrivateChats() {
    var { data: chats } = await supabase.from('chats').select('*').or('user1_id.eq.' + currentUser.id + ',user2_id.eq.' + currentUser.id);
    var container = document.getElementById('private-chats');
    container.innerHTML = '';
    if (chats) {
        for (var i = 0; i < chats.length; i++) {
            var chat = chats[i];
            var otherId = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
            var { data: otherUser } = await supabase.from('users').select('handle, username').eq('id', otherId).single();
            var div = document.createElement('div');
            div.className = 'chat-item';
            div.textContent = otherUser ? otherUser.username : 'Пользователь';
            div.onclick = function() { openChat(chat.id); };
            container.appendChild(div);
        }
    }
}

async function openChat(chatId) {
    currentChatId = chatId;
    currentGroupId = null;
    hideAllContainers();
    document.getElementById('chat-window').style.display = 'flex';
    var { data: chat } = await supabase.from('chats').select('*').eq('id', chatId).single();
    var otherId = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
    var { data: otherUser } = await supabase.from('users').select('handle').eq('id', otherId).single();
    document.getElementById('chat-title').textContent = otherUser ? otherUser.handle : 'Чат';
    loadChatMessages(chatId);
}

async function loadChatMessages(chatId) {
    var { data: messages } = await supabase.from('chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    var container = document.getElementById('chat-messages');
    container.innerHTML = '';
    if (messages) {
        for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];
            var div = document.createElement('div');
            div.className = 'chat-message' + (msg.sender_id === currentUser.id ? ' self' : '');
            div.textContent = decodeMessage(msg.content);
            container.appendChild(div);
        }
    }
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    if (!currentChatId) return;
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    if (!text) return;
    var encoded = encodeMessage(text);
    await supabase.from('chat_messages').insert({
        chat_id: currentChatId,
        sender_id: currentUser.id,
        content: encoded
    });
    input.value = '';
}

function closeChat() {
    currentChatId = null;
    document.getElementById('chat-window').style.display = 'none';
    showFeed(currentFeed);
}

// Групповые чаты
async function loadGroupChats() {
    var { data: memberships } = await supabase.from('group_members').select('group_id').eq('user_id', currentUser.id);
    if (!memberships || memberships.length === 0) {
        document.getElementById('group-chats').innerHTML = 'Вы не состоите в группах';
        return;
    }
    var ids = memberships.map(function(m) { return m.group_id; });
    var { data: groups } = await supabase.from('groups_chats').select('*').in('id', ids);
    var container = document.getElementById('group-chats');
    container.innerHTML = '';
    if (groups) {
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var div = document.createElement('div');
            div.className = 'chat-item';
            div.textContent = g.name;
            div.onclick = function() { openGroupChat(g.id); };
            container.appendChild(div);
        }
    }
}

function openGroupChat(groupId) {
    currentGroupId = groupId;
    currentChatId = null;
    hideAllContainers();
    document.getElementById('chat-window').style.display = 'flex';
    document.getElementById('chat-title').textContent = 'Группа';
    loadGroupMessages(groupId);
}

async function loadGroupMessages(groupId) {
    var { data: messages } = await supabase.from('group_messages').select('*').eq('group_id', groupId).order('created_at', { ascending: true });
    var container = document.getElementById('chat-messages');
    container.innerHTML = '';
    if (messages) {
        for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];
            var div = document.createElement('div');
            div.className = 'chat-message' + (msg.sender_id === currentUser.id ? ' self' : '');
            div.textContent = decodeMessage(msg.content);
            container.appendChild(div);
        }
    }
}

async function sendGroupMessage() {
    if (!currentGroupId) return;
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    if (!text) return;
    var encoded = encodeMessage(text);
    await supabase.from('group_messages').insert({
        group_id: currentGroupId,
        sender_id: currentUser.id,
        content: encoded
    });
    input.value = '';
}

function showCreateGroup() {
    var name = prompt('Название группы:');
    if (name) {
        supabase.from('groups_chats').insert({ name: name, creator_id: currentUser.id }).select().single().then(function(res) {
            if (res.data) {
                supabase.from('group_members').insert({ group_id: res.data.id, user_id: currentUser.id });
                loadGroupChats();
                showToast('Группа создана', 'success');
            }
        });
    }
}

// Магазин и Gems
async function loadShop() {
    var { data: items } = await supabase.from('shop_items').select('*');
    var container = document.getElementById('shop-items');
    container.innerHTML = '';
    var { data: user } = await supabase.from('users').select('gems').eq('id', currentUser.id).single();
    document.getElementById('gems-count').textContent = user.gems;
    if (items) {
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var div = document.createElement('div');
            div.className = 'shop-item';
            div.innerHTML = '<span>' + item.name + ' (' + item.type + ')</span><span>' + item.price + ' 💎</span><button onclick="buyItem(\'' + item.id + '\', ' + item.price + ')">Купить</button>';
            container.appendChild(div);
        }
    }
    openModal('shop-modal');
}

async function buyItem(itemId, price) {
    var { data: user } = await supabase.from('users').select('gems').eq('id', currentUser.id).single();
    if (user.gems < price) {
        showToast('Недостаточно Gems', 'error');
        return;
    }
    await supabase.from('users').update({ gems: user.gems - price }).eq('id', currentUser.id);
    await supabase.from('gem_transactions').insert({ user_id: currentUser.id, amount: -price, type: 'purchase', description: 'Покупка предмета' });
    await supabase.from('user_inventory').insert({ user_id: currentUser.id, item_id: itemId });
    currentUser.gems = user.gems - price;
    loadShop();
    showToast('Предмет куплен!', 'success');
}

function giveGems(amount, reason) {
    if (!currentUser) return;
    supabase.from('users').select('gems').eq('id', currentUser.id).single().then(function(res) {
        var newGems = res.data.gems + amount;
        supabase.from('users').update({ gems: newGems }).eq('id', currentUser.id);
        supabase.from('gem_transactions').insert({ user_id: currentUser.id, amount: amount, type: 'bonus', description: reason });
        currentUser.gems = newGems;
    });
}

// Ежедневный бонус
function checkDailyBonus() {
    var today = new Date().toDateString();
    var lastDate = localStorage.getItem('daily_bonus_date');
    if (lastDate !== today) {
        giveGems(5, 'Ежедневный бонус');
        localStorage.setItem('daily_bonus_date', today);
        showToast('Получено +5 Gems ежедневного бонуса!', 'success');
    }
}

// Premium подписка
function showPremiumModal() {
    openModal('premium-modal');
    document.getElementById('premium-code').style.display = 'none';
}

function selectPremium(plan) {
    var stars = plan === '1month' ? 15 : (plan === '3months' ? 40 : 140);
    document.getElementById('stars-amount').textContent = stars;
    document.getElementById('premium-code').style.display = 'block';
    // Генерация кода и сохранение
    var code = Math.random().toString(36).substring(2, 10).toUpperCase();
    document.getElementById('activation-code').textContent = code;
    document.getElementById('activation-code-display').style.display = 'block';
    // Сохраняем код в БД
    supabase.from('subscription_codes').insert({
        code: code,
        user_id: currentUser.id,
        plan: plan,
        stars_amount: stars,
        used: false
    }).then();
}

async function activatePremium() {
    var codeInput = document.getElementById('code-input').value.trim();
    if (!codeInput) return;
    var { data: codeData } = await supabase.from('subscription_codes').select('*').eq('code', codeInput).eq('user_id', currentUser.id).eq('used', false).maybeSingle();
    if (!codeData) {
        showToast('Неверный код', 'error');
        return;
    }
    var months = codeData.plan === '1month' ? 1 : (codeData.plan === '3months' ? 3 : 12);
    var now = new Date();
    var endsAt = new Date(now.setMonth(now.getMonth() + months));
    await supabase.from('subscriptions').insert({
        user_id: currentUser.id,
        plan: codeData.plan,
        starts_at: new Date().toISOString(),
        ends_at: endsAt.toISOString()
    });
    await supabase.from('users').update({ is_premium: true, premium_until: endsAt.toISOString() }).eq('id', currentUser.id);
    await supabase.from('subscription_codes').update({ used: true }).eq('id', codeData.id);
    currentUser.is_premium = true;
    currentUser.premium_until = endsAt.toISOString();
    saveSession({ user: currentUser, expires_at: currentSession.expires_at });
    closeModal();
    showToast('Premium активирован!', 'success');
}

// Админ-панель
function showAdminPanel() {
    if (!currentUser || !currentUser.is_admin) return;
    openModal('admin-modal');
}

function adminTab(tab) {
    var container = document.getElementById('admin-content');
    if (tab === 'stats') {
        // заглушка
        container.innerHTML = 'Статистика: загрузка...';
    } else if (tab === 'users') {
        loadAdminUsers();
    } else if (tab === 'posts') {
        loadAdminPosts();
    }
}

async function loadAdminUsers() {
    var { data: users } = await supabase.from('users').select('*');
    var html = '<table>';
    for (var i = 0; i < users.length; i++) {
        var u = users[i];
        html += '<tr><td>' + u.handle + '</td><td><button onclick="banUser(\'' + u.id + '\')">Бан</button></td></tr>';
    }
    html += '</table>';
    document.getElementById('admin-content').innerHTML = html;
}

async function banUser(userId) {
    var reason = prompt('Причина бана:');
    if (!reason) return;
    var duration = prompt('Длительность (в часах, 0 навсегда):');
    var until = duration === '0' ? new Date('2099-01-01').toISOString() : new Date(Date.now() + duration * 3600000).toISOString();
    await supabase.from('bans').insert({ user_id: userId, reason: reason, banned_until: until });
    showToast('Пользователь заблокирован', 'success');
}

function loadAdminPosts() {
    // удаление постов по клику
}

// Realtime подписки
function setupRealtime() {
    closeRealtimeChannels();
    // Лента
    var channel1 = supabase.channel('chirps-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chirps' }, function(payload) {
            if (currentFeed === 'latest' && document.getElementById('feed-container').style.display !== 'none') {
                var newPost = payload.new;
                // Добавить в начало ленты
                var container = document.getElementById('feed-posts');
                var tempDiv = document.createElement('div');
                supabase.from('users').select('*').eq('id', newPost.user_id).single().then(function(res) {
                    newPost.users = res.data;
                    renderPostsToContainer([newPost], tempDiv);
                    container.insertBefore(tempDiv.firstChild, container.firstChild);
                });
            }
        })
        .subscribe();
    realtimeChannels.push(channel1);

    // Сообщения
    var channel2 = supabase.channel('chat-messages-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, function(payload) {
            if (currentChatId && payload.new.chat_id === currentChatId) {
                loadChatMessages(currentChatId);
            }
        })
        .subscribe();
    realtimeChannels.push(channel2);

    // Групповые сообщения
    var channel3 = supabase.channel('group-messages-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, function(payload) {
            if (currentGroupId && payload.new.group_id === currentGroupId) {
                loadGroupMessages(currentGroupId);
            }
        })
        .subscribe();
    realtimeChannels.push(channel3);

    // Уведомления
    var channel4 = supabase.channel('notifications-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, function(payload) {
            if (payload.new.user_id === currentUser.id) {
                showToast('Новое уведомление', 'success');
                loadNotifications();
            }
        })
        .subscribe();
    realtimeChannels.push(channel4);
}

function closeRealtimeChannels() {
    for (var i = 0; i < realtimeChannels.length; i++) {
        supabase.removeChannel(realtimeChannels[i]);
    }
    realtimeChannels = [];
}

// Мобильная навигация
function mobileNav(section) {
    hideAllContainers();
    document.getElementById('feed-container').style.display = 'none';
    if (section === 'feed') {
        showFeed(currentFeed);
    } else if (section === 'search') {
        document.getElementById('search-container').style.display = 'block';
    } else if (section === 'chats') {
        document.getElementById('chats-container').style.display = 'block';
        showChatsTab('private');
    } else if (section === 'profile') {
        viewProfile(currentUser.id);
    }
    // Подсветка кнопок
    var btns = document.querySelectorAll('.mobile-nav-btn');
    btns.forEach(function(b) { b.classList.remove('active'); });
    if (section === 'feed') btns[0].classList.add('active');
    else if (section === 'search') btns[1].classList.add('active');
    else if (section === 'chats') btns[2].classList.add('active');
    else if (section === 'profile') btns[3].classList.add('active');
}

// Поиск для ПК
function performSearchPC() {
    var query = document.getElementById('search-input-pc').value.trim();
    if (query) {
        document.getElementById('search-input').value = query;
        performSearch();
    }
}

// Запуск при загрузке
window.onload = function() {
    if (loadSession()) {
        showScreen('main-screen');
        initMainScreen();
    } else {
        showScreen('auth-screen');
    }
};