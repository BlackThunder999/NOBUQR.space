// ============================================
// NOBUQR.SPACE - FULL SCRIPT (v2.0)
// ============================================
var SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
var SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

var currentUser = null;
var currentSession = null;
var currentScreen = 'loading';
var feedTab = 'latest';
var adminPassword = 'N0buSp@ce2024';
var isAdmin = false;
var modalCallback = null;
var selectedMediaFile = null;
var selectedMediaType = null;
var discordInviteUrl = 'https://discord.gg/UfudC69FX';

// Инициализация после загрузки
window.onload = function() {
    appContainer = document.getElementById('app');
    modalOverlay = document.getElementById('modalOverlay');
    modalContainer = document.getElementById('modalContainer');
    toastContainer = document.getElementById('toastContainer');
    checkSession();
};

// ========================
// СЕССИИ И АВТОРИЗАЦИЯ
// ========================
function checkSession() {
    var sessionData = localStorage.getItem('nobuqr_session');
    if (sessionData) {
        try {
            var session = JSON.parse(sessionData);
            if (session.expires_at && new Date().getTime() < session.expires_at) {
                currentSession = session;
                fetchUserById(session.user_id);
                return;
            }
        } catch(e) {}
        localStorage.removeItem('nobuqr_session');
    }
    currentUser = null;
    renderScreen('auth');
}

function createSession(userId) {
    var token = generateToken();
    var expiresAt = new Date().getTime() + 86400000;
    var session = { user_id: userId, token: token, expires_at: expiresAt };
    localStorage.setItem('nobuqr_session', JSON.stringify(session));
    currentSession = session;
}

function destroySession() {
    localStorage.removeItem('nobuqr_session');
    currentSession = null;
    currentUser = null;
    isAdmin = false;
    renderScreen('auth');
}

function generateToken() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var token = '';
    for (var i = 0; i < 64; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    return token;
}

async function fetchUserById(userId) {
    var { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error || !data) {
        destroySession();
        return;
    }
    currentUser = data;
    if (data.role === 'admin') isAdmin = true;

    // Проверяем кошелёк
    var { data: gemData } = await supabase.from('gems').select('balance').eq('user_id', userId).single();
    if (!gemData) {
        await supabase.from('gems').insert({ user_id: userId, balance: 50, total_earned: 50 });
        currentUser.gems = 50;
    } else {
        currentUser.gems = gemData.balance;
    }
    renderScreen('main');
    giveDailyBonus();
}

// SHA-256 и соль
function sha256(input) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
        .then(function(buffer) {
            return Array.prototype.map.call(new Uint8Array(buffer), function(x) {
                return ('00' + x.toString(16)).slice(-2);
            }).join('');
        });
}
function generateSalt() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var salt = '';
    for (var i = 0; i < 32; i++) salt += chars.charAt(Math.floor(Math.random() * chars.length));
    return salt;
}

// Фильтр контента
var bannedWords = ['хуй', 'пизда', 'ебать', 'блядь', 'сука', 'нахуй', 'залупа', 'член', 'жопа',
                   'fuck', 'shit', 'ass', 'bitch', 'dick', 'pussy', 'bastard', 'damn'];
function containsProfanity(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < bannedWords.length; i++) {
        if (lower.indexOf(bannedWords[i]) !== -1) return true;
    }
    return false;
}
function filterContent(text) {
    var filtered = text;
    for (var i = 0; i < bannedWords.length; i++) {
        var regex = new RegExp(bannedWords[i], 'gi');
        filtered = filtered.replace(regex, function(m) { return m[0] + '***'; });
    }
    return filtered;
}

// ========================
// UI: TOAST И MODAL
// ========================
function showToast(message, type) {
    type = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(function() {
        toast.classList.add('out');
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

function openModal(title, content, showCancel, callback) {
    modalCallback = callback || null;
    var cancelBtn = showCancel ? '<button class="btn btn-secondary" onclick="window.closeModal()">Отмена</button>' : '';
    var html = '<div class="modal-handle"></div>' +
        '<div class="modal-header"><h3 class="modal-title">' + title + '</h3>' +
        '<button class="modal-close" onclick="window.closeModal()">✕</button></div>' +
        '<div class="modal-body">' + content + '</div>' +
        '<div class="modal-footer">' + cancelBtn +
        '<button class="btn btn-primary" onclick="window.confirmModal()">Подтвердить</button></div>';
    modalContainer.innerHTML = html;
    modalOverlay.classList.add('active');
    modalContainer.classList.add('active');
}
function confirmModal() {
    if (modalCallback) modalCallback();
    closeModal();
}
function closeModal() {
    modalOverlay.classList.remove('active');
    modalContainer.classList.remove('active');
    modalCallback = null;
}

// ========================
// РЕНДЕРИНГ ЭКРАНОВ
// ========================
function renderScreen(screen) {
    currentScreen = screen;
    switch(screen) {
        case 'loading': renderLoadingScreen(); break;
        case 'auth': renderAuthScreen(); break;
        case 'main': renderMainScreen(); break;
        case 'profile': /* будет открываться как модальное окно */ break;
        case 'admin': renderAdminScreen(); break;
        case 'market': renderMarketScreen(); break;
        case 'inventory': renderInventoryScreen(); break;
        case 'rules': renderRulesScreen(); break;
        case 'privacy': renderPrivacyScreen(); break;
        default: renderMainScreen();
    }
}

function renderLoadingScreen() {
    appContainer.innerHTML = '<div class="screen-loading"><div class="logo-wrapper"><div class="logo-circle"></div></div><div class="loading-title">NOBUQR</div><div class="loading-bar"><div class="loading-bar-fill"></div></div></div>';
}

function renderAuthScreen() {
    var html = '<div class="screen-auth"><div class="auth-header"><div class="auth-logo">N</div><h1 class="auth-title">NOBUQR.SPACE</h1><p class="auth-subtitle">Твоя вселенная общения</p></div><div class="auth-card"><div class="auth-tabs"><button class="auth-tab active" onclick="window.switchAuthTab(\'login\')">Вход</button><button class="auth-tab" onclick="window.switchAuthTab(\'register\')">Регистрация</button></div><div id="authFormContainer"></div></div><div class="auth-links"><a class="auth-link" onclick="window.renderScreen(\'rules\')">Правила</a> · <a class="auth-link" onclick="window.renderScreen(\'privacy\')">Конфиденциальность</a></div></div>';
    appContainer.innerHTML = html;
    switchAuthTab('login');
}
function switchAuthTab(tab) {
    var tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'login') { tabs[0].classList.add('active'); renderLoginForm(); }
    else { tabs[1].classList.add('active'); renderRegisterForm(); }
}
function renderLoginForm() {
    var container = document.getElementById('authFormContainer');
    if (!container) return;
    container.innerHTML = '<div class="form-group"><label class="form-label">Email</label><input type="email" id="loginEmail" class="form-input" placeholder="your@email.com"></div><div class="form-group"><label class="form-label">Пароль</label><input type="password" id="loginPassword" class="form-input" placeholder="••••••"></div><button class="btn btn-primary mt-2" onclick="window.handleLogin()">Войти</button>';
}
function renderRegisterForm() {
    var container = document.getElementById('authFormContainer');
    if (!container) return;
    container.innerHTML = '<div class="form-group"><label class="form-label">Имя</label><input type="text" id="regUsername" class="form-input" placeholder="Имя" maxlength="30"></div><div class="form-group"><label class="form-label">@handle</label><input type="text" id="regHandle" class="form-input" placeholder="vash_nick" maxlength="30"></div><div class="form-group"><label class="form-label">Email</label><input type="email" id="regEmail" class="form-input" placeholder="email@example.com"></div><div class="form-group"><label class="form-label">Пароль</label><input type="password" id="regPassword" class="form-input" placeholder="Минимум 6 символов" minlength="6"></div><div class="form-group"><label class="form-label">Возраст</label><input type="number" id="regAge" class="form-input" placeholder="10+" min="10" max="150"></div><div class="form-checkbox"><input type="checkbox" id="agreeTerms"><span>Принимаю <a onclick="window.renderScreen(\'rules\')">правила</a></span></div><button class="btn btn-primary mt-2" onclick="window.handleRegister()">Зарегистрироваться</button>';
}

async function handleLogin() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!email || !password) { showToast('Заполните поля', 'error'); return; }
    var { data: users } = await supabase.from('users').select('*').eq('email', email);
    if (!users || users.length === 0) { showToast('Неверный email или пароль', 'error'); return; }
    var user = users[0];
    if (user.is_banned) { showToast('Аккаунт заблокирован: ' + (user.ban_reason || ''), 'error'); return; }
    var hash = await sha256(password + user.salt);
    if (hash !== user.password_hash) { showToast('Неверный email или пароль', 'error'); return; }
    await supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', user.id);
    createSession(user.id);
    currentUser = user;
    if (user.role === 'admin') isAdmin = true;
    renderScreen('main');
}

async function handleRegister() {
    var username = document.getElementById('regUsername').value.trim();
    var handle = document.getElementById('regHandle').value.trim().toLowerCase();
    var email = document.getElementById('regEmail').value.trim();
    var password = document.getElementById('regPassword').value;
    var age = parseInt(document.getElementById('regAge').value);
    var agree = document.getElementById('agreeTerms').checked;
    if (!username || !handle || !email || !password || !age) { showToast('Заполните все поля', 'error'); return; }
    if (password.length < 6) { showToast('Пароль минимум 6 символов', 'error'); return; }
    if (age < 10) { showToast('Возраст от 10 лет', 'error'); return; }
    if (!agree) { showToast('Примите правила', 'error'); return; }
    if (containsProfanity(username) || containsProfanity(handle)) { showToast('Запрещённые слова', 'error'); return; }
    var { data: exist } = await supabase.from('users').select('id').or('email.eq.' + email + ',handle.eq.' + handle);
    if (exist && exist.length > 0) { showToast('Email или handle занят', 'error'); return; }
    var salt = generateSalt();
    var hash = await sha256(password + salt);
    var { data: newUser, error } = await supabase.from('users').insert({
        username: username, handle: handle, email: email, password_hash: hash, salt: salt, age: age
    }).select().single();
    if (error) { showToast('Ошибка регистрации', 'error'); return; }
    createSession(newUser.id);
    currentUser = newUser;
    await supabase.from('gems').insert({ user_id: newUser.id, balance: 50, total_earned: 50 });
    renderScreen('main');
}

// ========================
// ГЛАВНЫЙ ЭКРАН
// ========================
function renderMainScreen() {
    if (!currentUser) { renderScreen('auth'); return; }
    var html = '<div class="screen-main"><header class="topbar"><div class="topbar-content"><div class="topbar-left"><div class="topbar-avatar" onclick="window.openProfile(\'' + currentUser.id + '\')">' +
        (currentUser.avatar_url ? '<img src="' + currentUser.avatar_url + '">' : '') + '</div><h1 class="topbar-title">NOBUQR</h1>' +
        '<span class="gems-badge">💎 <span id="gemsBalance">' + (currentUser.gems || 0) + '</span></span></div>' +
        '<div class="topbar-actions">' + (isAdmin ? '<button class="btn-icon" onclick="window.renderScreen(\'admin\')">⚙️</button>' : '') + '</div></div></header>' +
        '<div class="feed-container" id="feedContainer"><div class="create-post-container"><div class="create-post-card"><div class="create-post-avatar">' +
        (currentUser.avatar_url ? '<img src="' + currentUser.avatar_url + '">' : '') + '</div><div class="create-post-input-area">' +
        '<textarea id="chirpInput" class="create-post-input" placeholder="Что нового?" maxlength="280" oninput="window.updateCharCount()"></textarea>' +
        '<div id="mediaPreview" class="media-preview" style="display:none;"></div><div class="create-post-toolbar"><div class="create-post-tools">' +
        '<button class="create-post-tool-btn" onclick="window.selectMedia(\'image\')">🖼️</button><button class="create-post-tool-btn" onclick="window.selectMedia(\'video\')">🎬</button></div>' +
        '<div class="flex items-center gap-2"><span id="charCount" class="char-count">0/280</span>' +
        '<button id="submitChirp" class="create-post-submit" onclick="window.submitChirp()" disabled>Опубликовать</button></div></div></div></div></div>' +
        '<div class="feed-header"><div class="feed-tabs"><button class="feed-tab active" onclick="window.switchFeedTab(\'latest\')">Последние</button>' +
        '<button class="feed-tab" onclick="window.switchFeedTab(\'popular\')">Популярные</button><button class="feed-tab" onclick="window.switchFeedTab(\'following\')">Подписки</button></div></div>' +
        '<div id="chirpsList" class="chirps-list"></div><div id="loadingMore" class="loading-more" style="display:none;"><div class="spinner"></div></div></div>' +
        '<nav class="bottom-nav"><button class="nav-item active" onclick="window.navTo(\'feed\')"><span class="nav-item-icon">🏠</span><span class="nav-item-label">Главная</span></button>' +
        '<button class="nav-item" onclick="window.navTo(\'market\')"><span class="nav-item-icon">🛒</span><span class="nav-item-label">Маркет</span></button>' +
        '<button class="nav-item" onclick="window.navTo(\'notifications\')"><span class="nav-item-icon">🔔</span><span class="nav-item-label">Уведомления</span><span id="notifBadge" class="nav-item-badge" style="display:none;">0</span></button>' +
        '<button class="nav-item" onclick="window.navTo(\'profile\')"><span class="nav-item-icon">👤</span><span class="nav-item-label">Профиль</span></button></nav>' +
        '<button class="fab-create" onclick="window.scrollToCreate()">+</button></div>';
    appContainer.innerHTML = html;
    loadChirps('latest');
    loadNotificationCount();
    if (!document.getElementById('mediaFileInput')) {
        var input = document.createElement('input');
        input.type = 'file'; input.id = 'mediaFileInput'; input.accept = 'image/*,video/*'; input.style.display = 'none';
        input.onchange = function(e) { window.handleMediaSelect(e); };
        document.body.appendChild(input);
    }
    setTimeout(function() { if (currentScreen === 'main') showDiscordBanner(); }, 5000);
}

// Публикация постов
function updateCharCount() {
    var input = document.getElementById('chirpInput');
    var count = input ? input.value.length : 0;
    var counter = document.getElementById('charCount');
    var submitBtn = document.getElementById('submitChirp');
    if (counter) {
        counter.textContent = count + '/280';
        counter.className = 'char-count' + (count > 260 ? ' warning' : '') + (count >= 280 ? ' danger' : '');
    }
    if (submitBtn) submitBtn.disabled = (count === 0 && !selectedMediaFile);
}
function selectMedia(type) {
    if (currentUser && currentUser.age < 18) { showToast('Загрузка медиа с 18 лет', 'error'); return; }
    selectedMediaType = type;
    document.getElementById('mediaFileInput').click();
}
function handleMediaSelect(event) {
    var file = event.target.files[0];
    if (!file) return;
    var maxSize = selectedMediaType === 'video' ? 52428800 : 10485760;
    if (file.size > maxSize) { showToast('Файл слишком большой', 'error'); return; }
    selectedMediaFile = file;
    var reader = new FileReader();
    reader.onload = function(e) {
        var preview = document.getElementById('mediaPreview');
        preview.innerHTML = (selectedMediaType === 'image' ? '<img src="' + e.target.result + '">' : '<video src="' + e.target.result + '" controls></video>') +
            '<button class="media-preview-remove" onclick="window.removeMedia()">✕</button>';
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}
function removeMedia() {
    selectedMediaFile = null; selectedMediaType = null;
    document.getElementById('mediaPreview').style.display = 'none';
    document.getElementById('mediaPreview').innerHTML = '';
    document.getElementById('mediaFileInput').value = '';
    updateCharCount();
}
async function submitChirp() {
    var input = document.getElementById('chirpInput');
    var content = input.value.trim();
    if (!content && !selectedMediaFile) return;
    if (containsProfanity(content) || containsSpam(content)) { showToast('Запрещённый контент', 'error'); return; }
    var btn = document.getElementById('submitChirp');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-btn"></span> Публикация...';
    var mediaUrl = null, mediaType = null;
    if (selectedMediaFile) {
        var bucket = selectedMediaType === 'video' ? 'videos' : 'images';
        var fileName = currentUser.id + '/' + Date.now() + '_' + selectedMediaFile.name;
        var { data: uploadData, error: uploadError } = await supabase.storage.from(bucket).upload(fileName, selectedMediaFile);
        if (uploadError) { showToast('Ошибка загрузки', 'error'); btn.disabled = false; btn.textContent = 'Опубликовать'; return; }
        var { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
        mediaUrl = publicUrl; mediaType = selectedMediaType;
    }
    var hashtags = [];
    var matches = content.match(/#[a-zA-Zа-яА-Я0-9_]+/g);
    if (matches) hashtags = matches.map(function(t) { return t.toLowerCase(); });
    var { data: chirp, error } = await supabase.from('chirps').insert({
        user_id: currentUser.id,
        content: filterContent(content),
        media_url: mediaUrl,
        media_type: mediaType,
        hashtags: hashtags
    }).select().single();
    if (error) { showToast('Ошибка публикации', 'error'); btn.disabled = false; btn.textContent = 'Опубликовать'; return; }
    await supabase.from('users').update({ chirps_count: (currentUser.chirps_count || 0) + 1 }).eq('id', currentUser.id);
    currentUser.chirps_count = (currentUser.chirps_count || 0) + 1;
    input.value = ''; removeMedia(); updateCharCount();
    btn.disabled = false; btn.textContent = 'Опубликовать';
    prependChirp(chirp);
    // Награда за пост
    addGems(1, 'earn', 'За публикацию поста');
    showToast('Опубликовано! +1 💎', 'success');
}
function containsSpam(text) {
    var urls = text.match(/https?:\/\/[^\s]+/gi);
    if (urls && urls.length > 2) return true;
    if (/(.)\1{4,}/g.test(text)) return true;
    return false;
}

// Лента
var chirpsPage = 0;
var allChirps = [];
function switchFeedTab(tab) {
    feedTab = tab;
    var tabs = document.querySelectorAll('.feed-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'latest') tabs[0].classList.add('active');
    else if (tab === 'popular') tabs[1].classList.add('active');
    else tabs[2].classList.add('active');
    chirpsPage = 0; allChirps = [];
    loadChirps(tab);
}
async function loadChirps(tab) {
    var list = document.getElementById('chirpsList');
    var loadingEl = document.getElementById('loadingMore');
    if (!list) return;
    if (chirpsPage === 0) list.innerHTML = '<div class="loading-more"><div class="spinner"></div></div>';
    else loadingEl.style.display = 'flex';
    var query = supabase.from('chirps').select('*, users:user_id (username, handle, avatar_url, is_verified)');
    // Промо-посты
    if (tab === 'latest' || tab === 'popular') {
        var now = new Date().toISOString();
        var { data: promoted } = await supabase.from('promoted_posts').select('chirp_id').eq('is_active', true).lte('starts_at', now).gte('ends_at', now);
        if (promoted && promoted.length > 0) {
            var promoIds = promoted.map(function(p) { return p.chirp_id; });
            query = query.or('id.in.' + promoIds.join(','));
        }
    }
    switch(tab) {
        case 'latest': query = query.order('created_at', { ascending: false }); break;
        case 'popular': query = query.order('likes_count', { ascending: false }); break;
        case 'following':
            var { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', currentUser.id);
            var ids = follows ? follows.map(function(f) { return f.following_id; }) : [];
            if (ids.length > 0) query = query.in('user_id', ids);
            else { list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Подписки</div></div>'; return; }
            query = query.order('created_at', { ascending: false });
            break;
    }
    query = query.range(chirpsPage * 10, (chirpsPage + 1) * 10 - 1);
    var { data: chirps, error } = await query;
    if (error) { list.innerHTML = '<div class="empty-state">Ошибка</div>'; return; }
    if (chirpsPage === 0) allChirps = chirps || [];
    else allChirps = allChirps.concat(chirps || []);
    renderChirps(allChirps, list);
    chirpsPage++;
    loadingEl.style.display = 'none';
}
function renderChirps(chirps, container) {
    if (!chirps || chirps.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🐣</div><div class="empty-state-title">Нет постов</div></div>';
        return;
    }
    var html = '';
    for (var i = 0; i < chirps.length; i++) {
        var c = chirps[i], u = c.users;
        var timeAgo = getTimeAgo(new Date(c.created_at));
        var mediaHtml = c.media_url ? '<div class="chirp-media">' + (c.media_type === 'image' ? '<img src="' + c.media_url + '">' : '<video src="' + c.media_url + '" controls></video>') + '</div>' : '';
        var promoLabel = '';
        // проверяем, промо ли это
        html += '<div class="chirp-card" onclick="window.openChirp(\'' + c.id + '\')"><div class="chirp-card-header"><div class="chirp-avatar" onclick="event.stopPropagation(); window.openProfile(\'' + u.id + '\')">' +
            (u.avatar_url ? '<img src="' + u.avatar_url + '">' : '') + '</div><div class="chirp-user-info"><div class="chirp-username">' + u.username +
            (u.is_verified ? ' <span class="chirp-verified">✓</span>' : '') + promoLabel + '</div><div class="chirp-handle">@' + u.handle + '</div></div><div class="chirp-time">' + timeAgo + '</div></div>' +
            '<div class="chirp-content">' + formatChirpContent(c.content) + '</div>' + mediaHtml +
            '<div class="chirp-actions"><button class="chirp-action-btn" onclick="event.stopPropagation(); window.likeChirp(\'' + c.id + '\', this)">❤️ <span class="chirp-action-count">' + (c.likes_count || 0) + '</span></button>' +
            '<button class="chirp-action-btn commented" onclick="event.stopPropagation(); window.openChirp(\'' + c.id + '\')">💬 <span class="chirp-action-count">' + (c.comments_count || 0) + '</span></button>' +
            '<button class="chirp-action-btn">🔄 <span class="chirp-action-count">' + (c.rechirps_count || 0) + '</span></button>' +
            '<button class="chirp-action-btn" onclick="event.stopPropagation(); window.reportChirp(\'' + c.id + '\')">🚩</button></div></div>';
    }
    container.innerHTML = html;
}
function formatChirpContent(content) {
    return content.replace(/#[a-zA-Zа-яА-Я0-9_]+/g, '<span class="hashtag">$&</span>').replace(/@[a-zA-Z0-9_]+/g, '<span class="mention">$&</span>');
}
function getTimeAgo(date) {
    var sec = Math.floor((new Date() - date) / 1000);
    if (sec < 60) return 'только что';
    var min = Math.floor(sec / 60); if (min < 60) return min + ' мин.';
    var hr = Math.floor(min / 60); if (hr < 24) return hr + ' ч.';
    var d = Math.floor(hr / 24); if (d < 7) return d + ' д.';
    return date.toLocaleDateString();
}

// Лайки
async function likeChirp(chirpId, button) {
    if (!currentUser) return;
    var { data: existing } = await supabase.from('likes').select('id').eq('user_id', currentUser.id).eq('chirp_id', chirpId).is('comment_id', null);
    if (existing && existing.length > 0) {
        await supabase.from('likes').delete().eq('id', existing[0].id);
        var { data: chirp } = await supabase.from('chirps').select('likes_count').eq('id', chirpId).single();
        var newCount = Math.max((chirp.likes_count || 1) - 1, 0);
        await supabase.from('chirps').update({ likes_count: newCount }).eq('id', chirpId);
        button.classList.remove('liked');
        button.querySelector('.chirp-action-count').textContent = newCount;
    } else {
        await supabase.from('likes').insert({ user_id: currentUser.id, chirp_id: chirpId });
        var { data: chirp } = await supabase.from('chirps').select('likes_count').eq('id', chirpId).single();
        var newCount = (chirp.likes_count || 0) + 1;
        await supabase.from('chirps').update({ likes_count: newCount }).eq('id', chirpId);
        button.classList.add('liked');
        button.querySelector('.chirp-action-count').textContent = newCount;
        var { data: owner } = await supabase.from('chirps').select('user_id').eq('id', chirpId).single();
        if (owner && owner.user_id !== currentUser.id) {
            await supabase.from('notifications').insert({ user_id: owner.user_id, from_user_id: currentUser.id, type: 'like', chirp_id: chirpId });
        }
        // Награда за лайк
        addGems(1, 'earn', 'За лайк');
    }
}

// Комментарии
async function openChirp(chirpId) {
    var { data: chirp } = await supabase.from('chirps').select('*, users:user_id (username, handle, avatar_url, is_verified)').eq('id', chirpId).single();
    if (!chirp) return;
    var content = '<div class="chirp-card" style="border-bottom:none">' +
        '<div class="chirp-card-header"><div class="chirp-avatar"><img src="' + (chirp.users.avatar_url || '') + '"></div><div class="chirp-user-info"><div class="chirp-username">' + chirp.users.username + '</div><div class="chirp-handle">@' + chirp.users.handle + '</div></div><div class="chirp-time">' + getTimeAgo(new Date(chirp.created_at)) + '</div></div>' +
        '<div class="chirp-content">' + formatChirpContent(chirp.content) + '</div>' +
        (chirp.media_url ? '<div class="chirp-media">' + (chirp.media_type === 'image' ? '<img src="' + chirp.media_url + '">' : '<video src="' + chirp.media_url + '" controls></video>') + '</div>' : '') +
        '</div><div class="comments-section"><div class="create-post-container"><div class="create-post-card"><div class="create-post-avatar"><img src="' + (currentUser.avatar_url || '') + '"></div><div class="create-post-input-area"><textarea id="commentInput" class="create-post-input" placeholder="Комментарий..."></textarea><button class="create-post-submit" onclick="window.submitComment(\'' + chirpId + '\')">Ответить</button></div></div></div><div id="commentsList">Загрузка...</div></div>';
    openModal('Чирп', content, false, null);
    loadComments(chirpId);
}
async function loadComments(chirpId) {
    var { data: comments } = await supabase.from('comments').select('*, users:user_id (username, avatar_url)').eq('chirp_id', chirpId).order('created_at', { ascending: true });
    var list = document.getElementById('commentsList');
    if (!list) return;
    if (!comments || comments.length === 0) { list.innerHTML = '<div class="empty-state-text">Нет комментариев</div>'; return; }
    var html = '';
    for (var i = 0; i < comments.length; i++) {
        var c = comments[i];
        html += '<div class="comment-item"><div class="comment-avatar"><img src="' + (c.users.avatar_url || '') + '"></div><div class="comment-body"><div class="comment-header"><span class="comment-username">' + c.users.username + '</span><span class="comment-time">' + getTimeAgo(new Date(c.created_at)) + '</span></div><div class="comment-content">' + c.content + '</div></div></div>';
    }
    list.innerHTML = html;
}
async function submitComment(chirpId) {
    var input = document.getElementById('commentInput');
    var content = input.value.trim();
    if (!content) return;
    if (containsProfanity(content) || containsSpam(content)) { showToast('Запрещённый контент', 'error'); return; }
    await supabase.from('comments').insert({ chirp_id: chirpId, user_id: currentUser.id, content: filterContent(content) });
    await supabase.from('chirps').update({ comments_count: supabase.raw('comments_count + 1') }).eq('id', chirpId);
    input.value = '';
    loadComments(chirpId);
    addGems(1, 'earn', 'За комментарий');
    showToast('Комментарий добавлен', 'success');
}

// Профили
function openProfile(userId) {
    // реализовано в основном коде через модальное окно
    var content = '<div id="profileContent">Загрузка...</div>';
    openModal('Профиль', content, false, null);
    loadProfileData(userId);
}
async function loadProfileData(userId) {
    var { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (!user) return;
    var isOwn = currentUser && currentUser.id === user.id;
    var followStatus = '';
    if (!isOwn && currentUser) {
        var { data: f } = await supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', userId);
        followStatus = f && f.length > 0 ? 'Отписаться' : 'Подписаться';
    }
    var html = '<div class="profile-header"><div class="profile-banner">' + (user.banner_url ? '<img src="' + user.banner_url + '">' : '') + '</div><div class="profile-avatar-section"><div class="profile-avatar-large"><img src="' + (user.avatar_url || '') + '"></div>' +
        (isOwn ? '' : '<button class="btn btn-primary btn-small" onclick="window.toggleFollow(\'' + userId + '\')">' + followStatus + '</button>') +
        '</div><div class="profile-info"><div class="profile-name-section"><div class="profile-display-name">' + user.username + (user.is_verified ? ' <span class="chirp-verified">✓</span>' : '') + '</div><div class="profile-handle">@' + user.handle + '</div></div>' +
        (user.bio ? '<div class="profile-bio">' + user.bio + '</div>' : '') + '<div class="profile-meta"><span class="profile-meta-item">📅 На сайте с ' + new Date(user.created_at).toLocaleDateString() + '</span></div>' +
        '<div class="profile-stats"><div class="profile-stat"><strong>' + (user.followers_count || 0) + '</strong> <span>подписчиков</span></div><div class="profile-stat"><strong>' + (user.following_count || 0) + '</strong> <span>подписок</span></div><div class="profile-stat"><strong>' + (user.chirps_count || 0) + '</strong> <span>постов</span></div></div></div></div><div id="profileChirps" class="chirps-list">Загрузка...</div>';
    document.querySelector('.modal-body').innerHTML = html;
    // загружаем посты пользователя
    var { data: chirps } = await supabase.from('chirps').select('*, users:user_id (username, handle, avatar_url, is_verified)').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    renderChirps(chirps || [], document.getElementById('profileChirps'));
}
async function toggleFollow(userId) {
    if (!currentUser) return;
    var { data: follow } = await supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', userId);
    if (follow && follow.length > 0) {
        await supabase.from('follows').delete().eq('id', follow[0].id);
        await supabase.from('users').update({ followers_count: supabase.raw('GREATEST(followers_count - 1, 0)') }).eq('id', userId);
        await supabase.from('users').update({ following_count: supabase.raw('GREATEST(following_count - 1, 0)') }).eq('id', currentUser.id);
        showToast('Вы отписались', 'info');
    } else {
        await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: userId });
        await supabase.from('users').update({ followers_count: supabase.raw('followers_count + 1') }).eq('id', userId);
        await supabase.from('users').update({ following_count: supabase.raw('following_count + 1') }).eq('id', currentUser.id);
        showToast('Вы подписались', 'success');
        await supabase.from('notifications').insert({ user_id: userId, from_user_id: currentUser.id, type: 'follow' });
    }
    // обновить модальное окно профиля
    loadProfileData(userId);
}

// Уведомления, Поиск, Discord
async function loadNotificationCount() {
    var { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id).eq('is_read', false);
    var badge = document.getElementById('notifBadge');
    if (badge) {
        if (count > 0) { badge.style.display = 'flex'; badge.textContent = count > 99 ? '99+' : count; }
        else badge.style.display = 'none';
    }
}
function navTo(section) {
    if (section === 'feed') renderScreen('main');
    else if (section === 'market') renderScreen('market');
    else if (section === 'notifications') openNotificationsModal();
    else if (section === 'profile') openProfile(currentUser.id);
}
async function openNotificationsModal() {
    var { data: notifications } = await supabase.from('notifications').select('*, from_user:from_user_id (username, avatar_url)').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(50);
    var html = '';
    if (!notifications || notifications.length === 0) html = '<div class="empty-state"><div class="empty-state-icon">🔔</div><div class="empty-state-title">Нет уведомлений</div></div>';
    else {
        for (var i = 0; i < notifications.length; i++) {
            var n = notifications[i];
            var iconClass = n.type === 'like' ? '❤️' : (n.type === 'comment' ? '💬' : (n.type === 'follow' ? '👤' : '⚠️'));
            html += '<div class="notification-item ' + (n.is_read ? '' : 'unread') + '" onclick="window.markNotifRead(\'' + n.id + '\', \'' + (n.chirp_id || '') + '\')"><div class="notification-icon">' + iconClass + '</div><div class="notification-content"><strong>' + n.from_user.username + '</strong> ' + (n.type === 'like' ? 'понравился ваш пост' : (n.type === 'comment' ? 'прокомментировал ваш пост' : (n.type === 'follow' ? 'подписался на вас' : 'предупреждение'))) + '<div class="notification-time">' + getTimeAgo(new Date(n.created_at)) + '</div></div></div>';
        }
    }
    openModal('Уведомления', html, false, null);
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id).eq('is_read', false);
    loadNotificationCount();
}
function markNotifRead(notifId, chirpId) {
    closeModal();
    if (chirpId) openChirp(chirpId);
}
function showDiscordBanner() {
    var banner = document.getElementById('discordBanner');
    if (banner && !localStorage.getItem('discord_banner_closed')) banner.style.display = 'block';
}
function closeDiscordBanner() {
    document.getElementById('discordBanner').style.display = 'none';
    localStorage.setItem('discord_banner_closed', 'true');
}
function openDiscord() {
    window.open(discordInviteUrl, '_blank');
}

// ========================
// АДМИНКА
// ========================
function renderAdminScreen() {
    if (!isAdmin) { var p = prompt('Пароль админа:'); if (p !== adminPassword) { showToast('Неверно', 'error'); renderScreen('main'); return; } isAdmin = true; }
    var html = '<div class="screen-main"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">← Назад</button><h1 class="topbar-title">Админ-панель</h1></div></header><div class="admin-panel"><div class="admin-section"><h3 class="admin-section-title">📊 Статистика</h3><div class="admin-stat-grid" id="adminStats"></div></div><div class="admin-section"><h3 class="admin-section-title">👥 Пользователи</h3><div id="adminUsersTable"></div></div><div class="admin-section"><h3 class="admin-section-title">🚩 Жалобы</h3><div id="adminReportsTable"></div></div></div></div>';
    appContainer.innerHTML = html;
    loadAdminStats(); loadAdminUsers(); loadAdminReports();
}
async function loadAdminStats() {
    var { count: usersCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    var { count: chirpsCount } = await supabase.from('chirps').select('*', { count: 'exact', head: true });
    var { count: reportsCount } = await supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    document.getElementById('adminStats').innerHTML = '<div class="admin-stat-card"><div class="admin-stat-value">' + (usersCount||0) + '</div><div class="admin-stat-label">Пользователей</div></div><div class="admin-stat-card"><div class="admin-stat-value">' + (chirpsCount||0) + '</div><div class="admin-stat-label">Постов</div></div><div class="admin-stat-card"><div class="admin-stat-value">' + (reportsCount||0) + '</div><div class="admin-stat-label">Жалоб</div></div>';
}
async function loadAdminUsers() {
    var { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false }).limit(50);
    var html = '<table class="admin-table"><tr><th>Пользователь</th><th>Статус</th><th>Предупреждения</th><th>Действия</th></tr>';
    for (var i = 0; i < users.length; i++) {
        var u = users[i];
        html += '<tr><td>' + u.username + '</td><td>' + (u.is_banned ? '<span class="admin-badge banned">Забанен</span>' : '<span class="admin-badge active">Активен</span>') + '</td><td>' + (u.warnings_count||0) + '/' + u.max_warnings + '</td><td><button class="btn btn-small btn-ghost" onclick="window.warnUser(\'' + u.id + '\')">⚠️</button><button class="btn btn-small btn-ghost" onclick="window.banUser(\'' + u.id + '\')">🚫</button></td></tr>';
    }
    html += '</table>';
    document.getElementById('adminUsersTable').innerHTML = html;
}
async function loadAdminReports() {
    var { data: reports } = await supabase.from('reports').select('*, reporter:reporter_id (username), reported:reported_user_id (username), chirp:chirp_id (content)').order('created_at', { ascending: false }).limit(20);
    var html = '<table class="admin-table"><tr><th>От</th><th>Нарушитель</th><th>Причина</th><th>Действия</th></tr>';
    for (var i = 0; i < reports.length; i++) {
        var r = reports[i];
        html += '<tr><td>' + (r.reporter?r.reporter.username:'?') + '</td><td>' + (r.reported?r.reported.username:'?') + '</td><td>' + r.reason + '</td><td><button class="btn btn-small btn-ghost" onclick="window.resolveReport(\'' + r.id + '\', \'dismiss\')">Отклонить</button><button class="btn btn-small btn-ghost" onclick="window.resolveReport(\'' + r.id + '\', \'warn\')">Предупредить</button></td></tr>';
    }
    html += '</table>';
    document.getElementById('adminReportsTable').innerHTML = html;
}
async function warnUser(userId) {
    var reason = prompt('Причина предупреждения:');
    if (!reason) return;
    var { data: user } = await supabase.from('users').select('warnings_count, max_warnings').eq('id', userId).single();
    var newWarnings = (user.warnings_count || 0) + 1;
    var updateData = { warnings_count: newWarnings };
    if (newWarnings >= user.max_warnings) {
        updateData.is_banned = true;
        updateData.ban_reason = 'Достигнут лимит предупреждений';
        updateData.ban_expires = new Date(Date.now() + 7*86400000).toISOString();
    }
    await supabase.from('users').update(updateData).eq('id', userId);
    await supabase.from('notifications').insert({ user_id: userId, from_user_id: currentUser.id, type: 'warning' });
    showToast('Предупреждение вынесено', 'success');
    loadAdminUsers();
}
async function banUser(userId) {
    var reason = prompt('Причина бана:');
    if (!reason) return;
    await supabase.from('users').update({ is_banned: true, ban_reason: reason, ban_expires: new Date(Date.now() + 30*86400000).toISOString() }).eq('id', userId);
    showToast('Пользователь забанен', 'success');
    loadAdminUsers();
}
async function resolveReport(reportId, action) {
    if (action === 'warn') {
        var { data: report } = await supabase.from('reports').select('reported_user_id').eq('id', reportId).single();
        if (report && report.reported_user_id) await warnUser(report.reported_user_id);
    }
    await supabase.from('reports').update({ status: 'resolved', resolved_by: currentUser.id, resolution_note: action, resolved_at: new Date().toISOString() }).eq('id', reportId);
    showToast('Жалоба обработана', 'success');
    loadAdminReports();
}

// ========================
// МАРКЕТ, ВАЛЮТА, ЛУТБОКСЫ
// ========================
async function addGems(amount, type, reason, relatedUserId) {
    if (!currentUser) return;
    var newBalance = (currentUser.gems || 0) + amount;
    await supabase.from('gems').update({ balance: newBalance, total_earned: currentUser.gems + (amount > 0 ? amount : 0), total_spent: currentUser.gems - (amount < 0 ? -amount : 0) }).eq('user_id', currentUser.id);
    await supabase.from('gem_transactions').insert({ user_id: currentUser.id, amount: amount, type: type, reason: reason, related_user_id: relatedUserId });
    currentUser.gems = newBalance;
    var balanceEl = document.getElementById('gemsBalance');
    if (balanceEl) balanceEl.textContent = newBalance;
}
function giveDailyBonus() {
    var lastBonus = localStorage.getItem('nobuqr_daily_bonus');
    var today = new Date().toDateString();
    if (lastBonus !== today) {
        addGems(5, 'earn', 'Ежедневный бонус');
        localStorage.setItem('nobuqr_daily_bonus', today);
        showToast('Ежедневный бонус: +5 💎', 'success');
    }
}

function renderMarketScreen() {
    var html = '<div class="screen-main"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">← Назад</button><h1 class="topbar-title">Маркет</h1><span class="gems-badge">💎 <span id="gemsBalance">' + (currentUser.gems||0) + '</span></span></div></header><div class="market-container"><div class="market-tabs"><button class="market-tab active" onclick="window.switchMarketTab(\'all\')">Все</button><button class="market-tab" onclick="window.switchMarketTab(\'cosmetic\')">Скины</button><button class="market-tab" onclick="window.switchMarketTab(\'boost\')">Бусты</button><button class="market-tab" onclick="window.switchMarketTab(\'lootbox\')">Лутбоксы</button></div><div id="marketItems"></div></div><nav class="bottom-nav"><button class="nav-item" onclick="window.renderScreen(\'main\')">🏠 Главная</button><button class="nav-item" onclick="window.renderScreen(\'inventory\')">🎒 Инвентарь</button></nav></div>';
    appContainer.innerHTML = html;
    loadMarketItems('all');
}
function switchMarketTab(tab) {
    var tabs = document.querySelectorAll('.market-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    event.target.classList.add('active');
    loadMarketItems(tab);
}
async function loadMarketItems(category) {
    var query = supabase.from('gem_items').select('*').eq('is_active', true);
    if (category === 'cosmetic') query = query.in('item_type', ['nickname_color', 'avatar_frame', 'badge', 'title', 'animated_avatar', 'banner']);
    else if (category === 'boost') query = query.eq('item_type', 'boost');
    else if (category === 'lootbox') query = query.eq('item_type', 'lootbox');
    var { data: items } = await query;
    var container = document.getElementById('marketItems');
    if (!items || items.length === 0) { container.innerHTML = '<div class="empty-state">Нет товаров</div>'; return; }
    var html = '';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        html += '<div class="market-item"><div class="market-item-icon">' + getItemIcon(item.item_type) + '</div><div class="market-item-info"><div class="market-item-name">' + item.name + '</div><div class="market-item-desc">' + (item.description || '') + '</div></div><div class="market-item-actions"><span class="market-item-price">💎 ' + item.price + '</span><button class="btn-buy" onclick="window.buyItem(\'' + item.id + '\')">Купить</button></div></div>';
    }
    container.innerHTML = html;
}
function getItemIcon(type) {
    if (type === 'nickname_color') return '🎨';
    if (type === 'avatar_frame') return '🖼️';
    if (type === 'badge') return '🏅';
    if (type === 'title') return '👑';
    if (type === 'animated_avatar') return '✨';
    if (type === 'banner') return '🌌';
    if (type === 'boost') return '🚀';
    if (type === 'lootbox') return '🎁';
    return '📦';
}
async function buyItem(itemId) {
    var { data: item } = await supabase.from('gem_items').select('*').eq('id', itemId).single();
    if (!item) return;
    if (currentUser.gems < item.price) { showToast('Недостаточно Gems', 'error'); return; }
    // Проверяем, есть ли уже такой предмет (для некоторых)
    if (item.item_type !== 'lootbox' && item.item_type !== 'boost') {
        var { data: existing } = await supabase.from('user_inventory').select('id').eq('user_id', currentUser.id).eq('item_id', itemId).maybeSingle();
        if (existing) { showToast('У вас уже есть этот предмет', 'warning'); return; }
    }
    await addGems(-item.price, 'spend', 'Покупка: ' + item.name);
    // Добавляем в инвентарь или сразу активируем
    if (item.item_type === 'lootbox') {
        openLootbox(item);
    } else if (item.item_type === 'boost') {
        // Активировать продвижение
        var hours = (item.effect_data && item.effect_data.duration_hours) ? item.effect_data.duration_hours : 24;
        var superPromo = (item.effect_data && item.effect_data.super) || false;
        showToast('Выберите пост для продвижения', 'info');
        // здесь можно открыть модалку со списком постов пользователя, упрощённо:
        var postsHtml = '<p>Выберите пост:</p><div id="promoPostsList">Загрузка...</div>';
        openModal('Выбор поста', postsHtml, true, function() {
            var selectedPost = document.querySelector('input[name="promoPost"]:checked');
            if (selectedPost) activatePromotion(selectedPost.value, hours, superPromo);
            else showToast('Пост не выбран', 'error');
        });
        loadUserPostsForPromo();
    } else {
        await supabase.from('user_inventory').insert({ user_id: currentUser.id, item_id: itemId });
        showToast('Предмет куплен! В инвентаре', 'success');
    }
}
function loadUserPostsForPromo() {
    supabase.from('chirps').select('id, content').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(10).then(function(res) {
        var html = '';
        for (var i = 0; i < res.data.length; i++) {
            html += '<label><input type="radio" name="promoPost" value="' + res.data[i].id + '"> ' + res.data[i].content.substring(0, 50) + '...</label><br>';
        }
        document.getElementById('promoPostsList').innerHTML = html;
    });
}
async function activatePromotion(chirpId, hours, superPromo) {
    var ends = new Date(Date.now() + hours * 3600000).toISOString();
    await supabase.from('promoted_posts').insert({ chirp_id: chirpId, user_id: currentUser.id, promo_type: superPromo ? 'super' : 'basic', ends_at: ends });
    showToast('Продвижение активировано!', 'success');
    closeModal();
    renderScreen('main');
}

async function openLootbox(item) {
    var lootboxData = item.effect_data || {};
    var tier = lootboxData.tier || 'common';
    // Определяем возможный дроп
    var possibleTypes = lootboxData.drops || ['nickname_color', 'badge'];
    var { data: allItems } = await supabase.from('gem_items').select('*').in('item_type', possibleTypes).neq('item_type', 'lootbox');
    if (!allItems || allItems.length === 0) { showToast('Нет доступных предметов', 'error'); return; }
    var randomItem = allItems[Math.floor(Math.random() * allItems.length)];
    // Анимация
    var modalContent = '<div class="lootbox-animation"><div class="lootbox-chest">🎁</div><p>Открываем...</p></div>';
    openModal('Лутбокс', modalContent, false, null);
    setTimeout(async function() {
        document.querySelector('.modal-body').innerHTML = '<div class="lootbox-result"><div class="lootbox-result-item">' + getItemIcon(randomItem.item_type) + '</div><div class="lootbox-result-name">' + randomItem.name + '</div></div>';
        await supabase.from('user_inventory').insert({ user_id: currentUser.id, item_id: randomItem.id });
        addGems(0, 'spend', 'Лутбокс: ' + randomItem.name); // просто запись
    }, 1500);
}

// Инвентарь
function renderInventoryScreen() {
    var html = '<div class="screen-main"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">← Назад</button><h1 class="topbar-title">Инвентарь</h1></div></header><div class="inventory-container" id="inventoryItems"></div><nav class="bottom-nav"><button class="nav-item" onclick="window.renderScreen(\'main\')">🏠 Главная</button><button class="nav-item" onclick="window.renderScreen(\'market\')">🛒 Маркет</button></nav></div>';
    appContainer.innerHTML = html;
    loadInventory();
}
async function loadInventory() {
    var { data: inv } = await supabase.from('user_inventory').select('*, item:item_id (*)').eq('user_id', currentUser.id);
    var container = document.getElementById('inventoryItems');
    if (!inv || inv.length === 0) { container.innerHTML = '<div class="empty-state">Инвентарь пуст</div>'; return; }
    var html = '';
    for (var i = 0; i < inv.length; i++) {
        var entry = inv[i];
        var item = entry.item;
        html += '<div class="market-item"><div class="market-item-icon">' + getItemIcon(item.item_type) + '</div><div class="market-item-info"><div class="market-item-name">' + item.name + '</div><div class="market-item-desc">' + (item.description || '') + '</div></div><div class="market-item-actions">' +
            (entry.is_equipped ? '<button class="btn-unequip" onclick="window.unequipItem(\'' + entry.id + '\')">Снять</button>' : '<button class="btn-equip" onclick="window.equipItem(\'' + entry.id + '\')">Надеть</button>') +
            '</div></div>';
    }
    container.innerHTML = html;
}
async function equipItem(invId) {
    await supabase.from('user_inventory').update({ is_equipped: true }).eq('id', invId);
    showToast('Надето!', 'success');
    loadInventory();
}
async function unequipItem(invId) {
    await supabase.from('user_inventory').update({ is_equipped: false }).eq('id', invId);
    showToast('Снято', 'info');
    loadInventory();
}

// ========================
// ПРАВИЛА И КОНФИДЕНЦИАЛЬНОСТЬ
// ========================
function renderRulesScreen() {
    appContainer.innerHTML = '<div class="legal-page"><button class="legal-back-btn" onclick="window.goBack()">← Назад</button><h1>Правила</h1><p>...</p></div>';
}
function renderPrivacyScreen() {
    appContainer.innerHTML = '<div class="legal-page"><button class="legal-back-btn" onclick="window.goBack()">← Назад</button><h1>Конфиденциальность</h1><p>...</p></div>';
}
function goBack() { renderScreen(currentUser ? 'main' : 'auth'); }

// Вспомогательное
function scrollToCreate() {
    var input = document.getElementById('chirpInput');
    if (input) input.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Загружаем ленту при скролле
window.addEventListener('scroll', function() {
    if (currentScreen === 'main') {
        var container = document.getElementById('feedContainer');
        if (container && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
            if (feedTab && chirpsPage > 0) loadChirps(feedTab);
        }
    }
});

renderScreen('loading');