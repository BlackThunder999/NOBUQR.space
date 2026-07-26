// ============================================
// NOBUQR.SPACE - MAIN SCRIPT
// Supabase backend, vanilla JS
// ============================================

// ------------------------------
// SUPABASE INIT
// ------------------------------
var SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
var SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------------------
// GLOBAL STATE
// ------------------------------
var currentUser = null;         // { id, username, email, ... }
var currentSession = null;     // { token, expires_at }
var currentScreen = 'loading'; // loading, auth, main, profile, admin, legal
var feedTab = 'latest';        // latest, popular, following
var modalCallback = null;      // callback for modal confirmations
var selectedMediaFile = null;
var selectedMediaType = null;  // 'image' or 'video'
var adminPassword = 'N0buSp@ce2024';
var isAdmin = false;

// Cache elements
var appContainer = null;
var modalOverlay = null;
var modalContainer = null;
var toastContainer = null;

// ------------------------------
// INITIALIZATION
// ------------------------------
window.onload = function() {
    appContainer = document.getElementById('app');
    modalOverlay = document.getElementById('modalOverlay');
    modalContainer = document.getElementById('modalContainer');
    toastContainer = document.getElementById('toastContainer');
    
    checkSession();
};

// ------------------------------
// SESSION MANAGEMENT
// ------------------------------
function checkSession() {
    var sessionData = localStorage.getItem('nobuqr_session');
    if (sessionData) {
        try {
            var session = JSON.parse(sessionData);
            var now = new Date().getTime();
            if (session.expires_at && now < session.expires_at) {
                // Session valid, fetch user
                currentSession = session;
                fetchUserById(session.user_id);
                return;
            } else {
                // Expired
                localStorage.removeItem('nobuqr_session');
            }
        } catch(e) {
            localStorage.removeItem('nobuqr_session');
        }
    }
    // No valid session
    currentUser = null;
    currentSession = null;
    renderScreen('auth');
}

function createSession(userId) {
    var token = generateToken();
    var expiresAt = new Date().getTime() + 24 * 60 * 60 * 1000; // 24 hours
    
    var session = {
        user_id: userId,
        token: token,
        expires_at: expiresAt
    };
    
    // Store in localStorage
    localStorage.setItem('nobuqr_session', JSON.stringify(session));
    
    // Also try to store in database (optional, for IP tracking)
    try {
        supabase.from('sessions').insert({
            user_id: userId,
            token: token,
            ip_address: '',
            user_agent: navigator.userAgent,
            expires_at: new Date(expiresAt).toISOString()
        }).then(function(res) {
            if (res.error) console.error('Session insert error:', res.error);
        });
    } catch(e) {}
    
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
    for (var i = 0; i < 64; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

async function fetchUserById(userId) {
    var { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error || !data) {
        destroySession();
        return;
    }
    currentUser = data;
    if (data.role === 'admin') {
        isAdmin = true;
    }
    renderScreen('main');
}

// ------------------------------
// HASHING & SECURITY
// ------------------------------
function sha256(input) {
    // Use SubtleCrypto API
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
    for (var i = 0; i < 32; i++) {
        salt += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return salt;
}

// ------------------------------
// PROFANITY & SPAM FILTER
// ------------------------------
var bannedWords = [
    'хуй', 'пизда', 'ебать', 'блядь', 'сука', 'нахуй', 'залупа', 'член', 'жопа',
    'fuck', 'shit', 'ass', 'bitch', 'dick', 'pussy', 'bastard', 'damn'
];

var spamPatterns = [
    /https?:\/\/[^\s]+/gi,  // URLs (для обнаружения рекламы)
    /@[a-zA-Z0-9_]{3,}/g,   // упоминания (разрешены, просто проверка)
    /#[a-zA-Zа-яА-Я0-9_]+/g // хештеги (разрешены)
];

function containsProfanity(text) {
    var lowerText = text.toLowerCase();
    for (var i = 0; i < bannedWords.length; i++) {
        if (lowerText.indexOf(bannedWords[i]) !== -1) {
            return true;
        }
    }
    return false;
}

function containsSpam(text) {
    // Слишком много ссылок (более 2) или повторяющиеся символы (>5)
    var urlCount = (text.match(/https?:\/\/[^\s]+/gi) || []).length;
    if (urlCount > 2) return true;
    var repeatedChars = /(.)\1{4,}/g;
    if (repeatedChars.test(text)) return true;
    return false;
}

function filterContent(text) {
    // Заменяем мат звёздочками
    var filtered = text;
    for (var i = 0; i < bannedWords.length; i++) {
        var regex = new RegExp(bannedWords[i], 'gi');
        filtered = filtered.replace(regex, function(match) {
            return match[0] + '***';
        });
    }
    return filtered;
}

// ------------------------------
// TOAST NOTIFICATIONS
// ------------------------------
function showToast(message, type) {
    type = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    setTimeout(function() {
        toast.classList.add('out');
        setTimeout(function() {
            toast.remove();
        }, 300);
    }, 3000);
}

// ------------------------------
// MODAL
// ------------------------------
function openModal(title, content, showCancel, callback) {
    modalCallback = callback || null;
    var cancelBtn = showCancel ? '<button class="btn btn-secondary" onclick="window.closeModal()">Отмена</button>' : '';
    var html = '<div class="modal-handle"></div>' +
        '<div class="modal-header">' +
            '<h3 class="modal-title">' + title + '</h3>' +
            '<button class="modal-close" onclick="window.closeModal()">✕</button>' +
        '</div>' +
        '<div class="modal-body">' + content + '</div>' +
        '<div class="modal-footer">' +
            cancelBtn +
            '<button class="btn btn-primary" onclick="window.confirmModal()">Подтвердить</button>' +
        '</div>';
    
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

// Close modal on overlay click
modalOverlay && modalOverlay.addEventListener('click', function(e) {
    if (e.target === modalOverlay) closeModal();
});

// ------------------------------
// RENDER SCREENS
// ------------------------------
function renderScreen(screen) {
    currentScreen = screen;
    switch(screen) {
        case 'loading': renderLoadingScreen(); break;
        case 'auth': renderAuthScreen(); break;
        case 'main': renderMainScreen(); break;
        case 'profile': renderProfileScreen(); break;
        case 'admin': renderAdminScreen(); break;
        case 'rules': renderRulesScreen(); break;
        case 'privacy': renderPrivacyScreen(); break;
        default: renderMainScreen();
    }
}

// ---------- LOADING ----------
function renderLoadingScreen() {
    appContainer.innerHTML = 
        '<div class="screen-loading">' +
            '<div class="logo-wrapper">' +
                '<div class="logo-circle"></div>' +
            '</div>' +
            '<div class="loading-title">NOBUQR</div>' +
            '<div class="loading-bar">' +
                '<div class="loading-bar-fill"></div>' +
            '</div>' +
        '</div>';
}

// ---------- AUTH ----------
function renderAuthScreen() {
    var html = 
        '<div class="screen-auth">' +
            '<div class="auth-header">' +
                '<div class="auth-logo">N</div>' +
                '<h1 class="auth-title">NOBUQR.SPACE</h1>' +
                '<p class="auth-subtitle">Твоя вселенная общения</p>' +
            '</div>' +
            '<div class="auth-card">' +
                '<div class="auth-tabs">' +
                    '<button class="auth-tab active" onclick="window.switchAuthTab(\'login\')">Вход</button>' +
                    '<button class="auth-tab" onclick="window.switchAuthTab(\'register\')">Регистрация</button>' +
                '</div>' +
                '<div id="authFormContainer"></div>' +
            '</div>' +
            '<div class="auth-links">' +
                '<a class="auth-link" onclick="window.renderScreen(\'rules\')">Правила</a> · ' +
                '<a class="auth-link" onclick="window.renderScreen(\'privacy\')">Конфиденциальность</a>' +
            '</div>' +
        '</div>';
    appContainer.innerHTML = html;
    switchAuthTab('login'); // default
}

function switchAuthTab(tab) {
    var tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'login') {
        tabs[0].classList.add('active');
        renderLoginForm();
    } else {
        tabs[1].classList.add('active');
        renderRegisterForm();
    }
}

function renderLoginForm() {
    var container = document.getElementById('authFormContainer');
    if (!container) return;
    container.innerHTML = 
        '<div class="form-group">' +
            '<label class="form-label">Email</label>' +
            '<input type="email" id="loginEmail" class="form-input" placeholder="your@email.com">' +
        '</div>' +
        '<div class="form-group">' +
            '<label class="form-label">Пароль</label>' +
            '<input type="password" id="loginPassword" class="form-input" placeholder="••••••">' +
        '</div>' +
        '<button class="btn btn-primary mt-2" onclick="window.handleLogin()">Войти</button>';
}

function renderRegisterForm() {
    var container = document.getElementById('authFormContainer');
    if (!container) return;
    container.innerHTML = 
        '<div class="form-group">' +
            '<label class="form-label">Имя пользователя</label>' +
            '<input type="text" id="regUsername" class="form-input" placeholder="Ваш никнейм" maxlength="30">' +
        '</div>' +
        '<div class="form-group">' +
            '<label class="form-label">Email</label>' +
            '<input type="email" id="regEmail" class="form-input" placeholder="email@example.com">' +
        '</div>' +
        '<div class="form-group">' +
            '<label class="form-label">Пароль (мин. 6 символов)</label>' +
            '<input type="password" id="regPassword" class="form-input" placeholder="Минимум 6 символов" minlength="6">' +
        '</div>' +
        '<div class="form-group">' +
            '<label class="form-label">Возраст</label>' +
            '<input type="number" id="regAge" class="form-input" placeholder="Ваш возраст" min="10" max="150">' +
        '</div>' +
        '<div class="form-checkbox">' +
            '<input type="checkbox" id="agreeTerms">' +
            '<span>Я принимаю <a onclick="window.renderScreen(\'rules\')">правила</a> и <a onclick="window.renderScreen(\'privacy\')">политику конфиденциальности</a></span>' +
        '</div>' +
        '<button class="btn btn-primary mt-2" onclick="window.handleRegister()">Зарегистрироваться</button>';
}

// ---------- AUTH HANDLERS ----------
async function handleLogin() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showToast('Заполните все поля', 'error');
        return;
    }
    
    // Get user by email
    var { data: users, error } = await supabase.from('users').select('*').eq('email', email);
    if (error || !users || users.length === 0) {
        showToast('Неверный email или пароль', 'error');
        return;
    }
    
    var user = users[0];
    if (user.is_banned) {
        showToast('Ваш аккаунт заблокирован: ' + (user.ban_reason || 'Нарушение правил'), 'error');
        return;
    }
    
    // Hash password with salt
    var hashed = await sha256(password + user.salt);
    if (hashed !== user.password_hash) {
        showToast('Неверный email или пароль', 'error');
        return;
    }
    
    // Update last_seen
    await supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', user.id);
    
    // Create session
    createSession(user.id);
    currentUser = user;
    if (user.role === 'admin') isAdmin = true;
    renderScreen('main');
}

async function handleRegister() {
    var username = document.getElementById('regUsername').value.trim();
    var email = document.getElementById('regEmail').value.trim();
    var password = document.getElementById('regPassword').value;
    var age = parseInt(document.getElementById('regAge').value);
    var agree = document.getElementById('agreeTerms').checked;
    
    if (!username || !email || !password || !age) {
        showToast('Заполните все поля', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Пароль должен быть минимум 6 символов', 'error');
        return;
    }
    
    if (age < 10) {
        showToast('Вам должно быть минимум 10 лет', 'error');
        return;
    }
    
    if (!agree) {
        showToast('Вы должны принять правила и политику конфиденциальности', 'error');
        return;
    }
    
    if (containsProfanity(username)) {
        showToast('Имя пользователя содержит запрещённые слова', 'error');
        return;
    }
    
    // Check if email or username exists
    var { data: existing } = await supabase.from('users').select('id').or('email.eq.' + email + ',username.eq.' + username);
    if (existing && existing.length > 0) {
        showToast('Пользователь с таким email или именем уже существует', 'error');
        return;
    }
    
    // Create salt and hash
    var salt = generateSalt();
    var hashed = await sha256(password + salt);
    
    // Insert user
    var { data: newUser, error } = await supabase.from('users').insert({
        username: username,
        email: email,
        password_hash: hashed,
        salt: salt,
        age: age
    }).select().single();
    
    if (error) {
        showToast('Ошибка регистрации: ' + error.message, 'error');
        return;
    }
    
    // Auto login
    createSession(newUser.id);
    currentUser = newUser;
    renderScreen('main');
}

// ---------- MAIN SCREEN ----------
function renderMainScreen() {
    if (!currentUser) { renderScreen('auth'); return; }
    
    var html = 
        '<div class="screen-main">' +
            // Top bar
            '<header class="topbar">' +
                '<div class="topbar-content">' +
                    '<div class="topbar-left">' +
                        '<div class="topbar-avatar" onclick="window.openProfile(\'' + currentUser.id + '\')">' +
                            (currentUser.avatar_url ? '<img src="' + currentUser.avatar_url + '" alt="">' : '') +
                        '</div>' +
                        '<h1 class="topbar-title">NOBUQR</h1>' +
                    '</div>' +
                    '<div class="topbar-actions">' +
                        '<button class="btn-icon" onclick="window.renderScreen(\'admin\')" title="Админ-панель" ' + (isAdmin ? '' : 'style="display:none"') + '>⚙️</button>' +
                    '</div>' +
                '</div>' +
            '</header>' +
            
            // Main content
            '<div class="feed-container" id="feedContainer">' +
                // Create post
                '<div class="create-post-container">' +
                    '<div class="create-post-card">' +
                        '<div class="create-post-avatar">' +
                            (currentUser.avatar_url ? '<img src="' + currentUser.avatar_url + '" alt="">' : '') +
                        '</div>' +
                        '<div class="create-post-input-area">' +
                            '<textarea id="chirpInput" class="create-post-input" placeholder="Что нового?" maxlength="280" oninput="window.updateCharCount()"></textarea>' +
                            '<div id="mediaPreview" class="media-preview" style="display:none;"></div>' +
                            '<div class="create-post-toolbar">' +
                                '<div class="create-post-tools">' +
                                    '<button class="create-post-tool-btn" onclick="window.selectMedia(\'image\')" title="Фото">🖼️</button>' +
                                    '<button class="create-post-tool-btn" onclick="window.selectMedia(\'video\')" title="Видео">🎬</button>' +
                                '</div>' +
                                '<div class="flex items-center gap-2">' +
                                    '<span id="charCount" class="char-count">0/280</span>' +
                                    '<button id="submitChirp" class="create-post-submit" onclick="window.submitChirp()" disabled>Опубликовать</button>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                
                // Feed tabs
                '<div class="feed-header">' +
                    '<div class="feed-tabs">' +
                        '<button class="feed-tab active" onclick="window.switchFeedTab(\'latest\')">Последние</button>' +
                        '<button class="feed-tab" onclick="window.switchFeedTab(\'popular\')">Популярные</button>' +
                        '<button class="feed-tab" onclick="window.switchFeedTab(\'following\')">Подписки</button>' +
                    '</div>' +
                '</div>' +
                
                // Chirps list
                '<div id="chirpsList" class="chirps-list"></div>' +
                '<div id="loadingMore" class="loading-more" style="display:none;"><div class="spinner"></div></div>' +
            '</div>' +
            
            // Bottom nav
            '<nav class="bottom-nav">' +
                '<button class="nav-item active" onclick="window.navTo(\'feed\')">' +
                    '<span class="nav-item-icon">🏠</span>' +
                    '<span class="nav-item-label">Главная</span>' +
                '</button>' +
                '<button class="nav-item" onclick="window.navTo(\'search\')">' +
                    '<span class="nav-item-icon">🔍</span>' +
                    '<span class="nav-item-label">Поиск</span>' +
                '</button>' +
                '<button class="nav-item" onclick="window.navTo(\'notifications\')">' +
                    '<span class="nav-item-icon">🔔</span>' +
                    '<span class="nav-item-label">Уведомления</span>' +
                    '<span id="notifBadge" class="nav-item-badge" style="display:none;">0</span>' +
                '</button>' +
                '<button class="nav-item" onclick="window.navTo(\'profile\')">' +
                    '<span class="nav-item-icon">👤</span>' +
                    '<span class="nav-item-label">Профиль</span>' +
                '</button>' +
            '</nav>' +
            
            // FAB
            '<button class="fab-create" onclick="window.scrollToCreate()">+</button>' +
        '</div>';
    
    appContainer.innerHTML = html;
    
    // Load initial chirps
    loadChirps('latest');
    
    // Load notification count
    loadNotificationCount();
    
    // Add file input for media
    addMediaInput();
}

function addMediaInput() {
    var input = document.createElement('input');
    input.type = 'file';
    input.id = 'mediaFileInput';
    input.accept = 'image/*,video/*';
    input.style.display = 'none';
    input.onchange = function(e) { window.handleMediaSelect(e); };
    document.body.appendChild(input);
}

function selectMedia(type) {
    if (currentUser && currentUser.age < 18) {
        showToast('Загрузка медиа доступна только с 18 лет', 'error');
        return;
    }
    selectedMediaType = type;
    document.getElementById('mediaFileInput').click();
}

function handleMediaSelect(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    var maxSize = selectedMediaType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
        showToast('Файл слишком большой. Максимум ' + (selectedMediaType === 'video' ? '50MB' : '10MB'), 'error');
        return;
    }
    
    selectedMediaFile = file;
    
    // Preview
    var preview = document.getElementById('mediaPreview');
    var reader = new FileReader();
    reader.onload = function(e) {
        var mediaHTML = '';
        if (selectedMediaType === 'image') {
            mediaHTML = '<img src="' + e.target.result + '" alt="preview">';
        } else {
            mediaHTML = '<video src="' + e.target.result + '" controls></video>';
        }
        mediaHTML += '<button class="media-preview-remove" onclick="window.removeMedia()">✕</button>';
        preview.innerHTML = mediaHTML;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function removeMedia() {
    selectedMediaFile = null;
    selectedMediaType = null;
    document.getElementById('mediaPreview').style.display = 'none';
    document.getElementById('mediaPreview').innerHTML = '';
    document.getElementById('mediaFileInput').value = '';
}

function updateCharCount() {
    var input = document.getElementById('chirpInput');
    var count = input ? input.value.length : 0;
    var counter = document.getElementById('charCount');
    var submitBtn = document.getElementById('submitChirp');
    
    if (counter) {
        counter.textContent = count + '/280';
        counter.className = 'char-count';
        if (count > 260) counter.classList.add('warning');
        if (count >= 280) counter.classList.add('danger');
    }
    if (submitBtn) {
        submitBtn.disabled = (count === 0 && !selectedMediaFile);
    }
}

async function submitChirp() {
    var input = document.getElementById('chirpInput');
    var content = input.value.trim();
    
    if (!content && !selectedMediaFile) return;
    
    // Content filter
    if (containsProfanity(content) || containsSpam(content)) {
        showToast('Сообщение содержит запрещённый контент', 'error');
        return;
    }
    
    // Upload media if present
    var mediaUrl = null;
    var mediaType = null;
    if (selectedMediaFile) {
        var bucket = selectedMediaType === 'video' ? 'videos' : 'images';
        var fileName = currentUser.id + '/' + Date.now() + '_' + selectedMediaFile.name;
        
        var { data: uploadData, error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(fileName, selectedMediaFile);
        
        if (uploadError) {
            showToast('Ошибка загрузки файла', 'error');
            return;
        }
        
        var { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
        mediaUrl = publicUrl;
        mediaType = selectedMediaType;
    }
    
    // Extract hashtags
    var hashtags = [];
    var matches = content.match(/#[a-zA-Zа-яА-Я0-9_]+/g);
    if (matches) {
        hashtags = matches.map(function(t) { return t.toLowerCase(); });
    }
    
    // Insert chirp
    var { data: chirp, error } = await supabase.from('chirps').insert({
        user_id: currentUser.id,
        content: filterContent(content),
        media_url: mediaUrl,
        media_type: mediaType,
        hashtags: hashtags
    }).select().single();
    
    if (error) {
        showToast('Ошибка публикации', 'error');
        return;
    }
    
    // Update user chirp count
    await supabase.from('users').update({ chirps_count: (currentUser.chirps_count || 0) + 1 }).eq('id', currentUser.id);
    currentUser.chirps_count = (currentUser.chirps_count || 0) + 1;
    
    // Clear form
    input.value = '';
    removeMedia();
    updateCharCount();
    
    // Reload feed
    loadChirps(feedTab);
    showToast('Опубликовано!', 'success');
}

// ---------- FEED ----------
var chirpsPage = 0;
var chirpsPerPage = 10;
var allChirps = [];

function switchFeedTab(tab) {
    feedTab = tab;
    var tabs = document.querySelectorAll('.feed-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'latest') tabs[0].classList.add('active');
    else if (tab === 'popular') tabs[1].classList.add('active');
    else tabs[2].classList.add('active');
    
    chirpsPage = 0;
    allChirps = [];
    loadChirps(tab);
}

async function loadChirps(tab) {
    var list = document.getElementById('chirpsList');
    var loadingEl = document.getElementById('loadingMore');
    if (!list) return;
    
    if (chirpsPage === 0) {
        list.innerHTML = '<div class="loading-more"><div class="spinner"></div></div>';
    } else {
        if (loadingEl) loadingEl.style.display = 'flex';
    }
    
    var query = supabase.from('chirps').select('*, users:user_id (username, avatar_url, is_verified)');
    
    switch(tab) {
        case 'latest':
            query = query.order('created_at', { ascending: false });
            break;
        case 'popular':
            query = query.order('likes_count', { ascending: false });
            break;
        case 'following':
            if (currentUser) {
                var { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', currentUser.id);
                var followingIds = follows ? follows.map(function(f) { return f.following_id; }) : [];
                if (followingIds.length > 0) {
                    query = query.in('user_id', followingIds);
                } else {
                    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Подписки</div><div class="empty-state-text">Подпишитесь на пользователей, чтобы видеть их посты</div></div>';
                    return;
                }
            }
            query = query.order('created_at', { ascending: false });
            break;
    }
    
    query = query.range(chirpsPage * chirpsPerPage, (chirpsPage + 1) * chirpsPerPage - 1);
    
    var { data: chirps, error } = await query;
    
    if (error) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-title">Ошибка загрузки</div></div>';
        return;
    }
    
    if (chirpsPage === 0) {
        allChirps = chirps || [];
    } else {
        allChirps = allChirps.concat(chirps || []);
    }
    
    renderChirps(allChirps, list);
    chirpsPage++;
    
    if (loadingEl) loadingEl.style.display = 'none';
}

function renderChirps(chirps, container) {
    if (!chirps || chirps.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🐣</div><div class="empty-state-title">Пока нет постов</div><div class="empty-state-text">Будьте первым, кто что-то напишет!</div></div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < chirps.length; i++) {
        var c = chirps[i];
        var user = c.users;
        var timeAgo = getTimeAgo(new Date(c.created_at));
        var content = formatChirpContent(c.content);
        var mediaHtml = '';
        if (c.media_url) {
            if (c.media_type === 'image') {
                mediaHtml = '<div class="chirp-media"><img src="' + c.media_url + '" alt="" loading="lazy"></div>';
            } else if (c.media_type === 'video') {
                mediaHtml = '<div class="chirp-media"><video src="' + c.media_url + '" controls preload="metadata"></video></div>';
            }
        }
        
        html += 
            '<div class="chirp-card" onclick="window.openChirp(\'' + c.id + '\')">' +
                '<div class="chirp-card-header">' +
                    '<div class="chirp-avatar" onclick="event.stopPropagation(); window.openProfile(\'' + user.id + '\')">' +
                        (user.avatar_url ? '<img src="' + user.avatar_url + '" alt="">' : '') +
                    '</div>' +
                    '<div class="chirp-user-info">' +
                        '<div class="chirp-username">' +
                            user.username +
                            (user.is_verified ? '<span class="chirp-verified">✓</span>' : '') +
                        '</div>' +
                        '<div class="chirp-handle">@' + user.username + '</div>' +
                    '</div>' +
                    '<div class="chirp-time">' + timeAgo + '</div>' +
                '</div>' +
                '<div class="chirp-content">' + content + '</div>' +
                mediaHtml +
                '<div class="chirp-actions">' +
                    '<button class="chirp-action-btn" onclick="event.stopPropagation(); window.likeChirp(\'' + c.id + '\', this)" data-chirp="' + c.id + '">' +
                        '❤️ <span class="chirp-action-count">' + (c.likes_count || 0) + '</span>' +
                    '</button>' +
                    '<button class="chirp-action-btn commented" onclick="event.stopPropagation(); window.openChirp(\'' + c.id + '\')">' +
                        '💬 <span class="chirp-action-count">' + (c.comments_count || 0) + '</span>' +
                    '</button>' +
                    '<button class="chirp-action-btn rechirp">' +
                        '🔄 <span class="chirp-action-count">' + (c.rechirps_count || 0) + '</span>' +
                    '</button>' +
                    '<button class="chirp-action-btn" onclick="event.stopPropagation(); window.reportChirp(\'' + c.id + '\')">🚩</button>' +
                '</div>' +
            '</div>';
    }
    container.innerHTML = html;
}

function formatChirpContent(content) {
    // Format hashtags and mentions
    return content
        .replace(/#[a-zA-Zа-яА-Я0-9_]+/g, '<span class="hashtag">$&</span>')
        .replace(/@[a-zA-Z0-9_]+/g, '<span class="mention">$&</span>');
}

function getTimeAgo(date) {
    var seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'только что';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + ' мин.';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' ч.';
    var days = Math.floor(hours / 24);
    if (days < 7) return days + ' д.';
    return date.toLocaleDateString();
}

async function likeChirp(chirpId, button) {
    if (!currentUser) return;
    
    // Check if already liked
    var { data: existing } = await supabase.from('likes')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('chirp_id', chirpId)
        .is('comment_id', null);
    
    if (existing && existing.length > 0) {
        // Unlike
        await supabase.from('likes').delete().eq('id', existing[0].id);
        await supabase.from('chirps').update({ likes_count: supabase.raw('GREATEST(likes_count - 1, 0)') }).eq('id', chirpId);
        button.classList.remove('liked');
    } else {
        // Like
        await supabase.from('likes').insert({
            user_id: currentUser.id,
            chirp_id: chirpId
        });
        await supabase.from('chirps').update({ likes_count: supabase.raw('likes_count + 1') }).eq('id', chirpId);
        button.classList.add('liked');
        
        // Notify
        var { data: chirp } = await supabase.from('chirps').select('user_id').eq('id', chirpId).single();
        if (chirp && chirp.user_id !== currentUser.id) {
            await supabase.from('notifications').insert({
                user_id: chirp.user_id,
                from_user_id: currentUser.id,
                type: 'like',
                chirp_id: chirpId
            });
        }
    }
    
    // Refresh count
    var { data: updated } = await supabase.from('chirps').select('likes_count').eq('id', chirpId).single();
    if (updated) {
        var countSpan = button.querySelector('.chirp-action-count');
        if (countSpan) countSpan.textContent = updated.likes_count;
    }
}

// ---------- CHIRP DETAIL (Modal) ----------
async function openChirp(chirpId) {
    var { data: chirp, error } = await supabase.from('chirps')
        .select('*, users:user_id (username, avatar_url, is_verified)')
        .eq('id', chirpId)
        .single();
    
    if (error || !chirp) return;
    
    var content = 
        '<div class="chirp-card" style="border-bottom:none">' +
            // chirp content similar to feed but with full details
            '<div class="chirp-card-header">' +
                '<div class="chirp-avatar"><img src="' + (chirp.users.avatar_url || '') + '" alt=""></div>' +
                '<div class="chirp-user-info">' +
                    '<div class="chirp-username">' + chirp.users.username + '</div>' +
                    '<div class="chirp-handle">@' + chirp.users.username + '</div>' +
                '</div>' +
                '<div class="chirp-time">' + getTimeAgo(new Date(chirp.created_at)) + '</div>' +
            '</div>' +
            '<div class="chirp-content">' + formatChirpContent(chirp.content) + '</div>' +
            (chirp.media_url ? '<div class="chirp-media"><' + (chirp.media_type === 'video' ? 'video controls' : 'img') + ' src="' + chirp.media_url + '"></' + (chirp.media_type === 'video' ? 'video' : 'img') + '></div>' : '') +
            '<div class="chirp-actions">' +
                '<button class="chirp-action-btn">❤️ ' + (chirp.likes_count || 0) + '</button>' +
                '<button class="chirp-action-btn">💬 ' + (chirp.comments_count || 0) + '</button>' +
            '</div>' +
        '</div>' +
        '<div class="comments-section" id="commentsSection">' +
            '<div class="create-post-container" style="border-bottom:1px solid var(--border-secondary)">' +
                '<div class="create-post-card">' +
                    '<div class="create-post-avatar"><img src="' + (currentUser.avatar_url || '') + '" alt=""></div>' +
                    '<div class="create-post-input-area">' +
                        '<textarea id="commentInput" class="create-post-input" placeholder="Написать комментарий..." rows="2"></textarea>' +
                        '<button class="create-post-submit" onclick="window.submitComment(\'' + chirpId + '\')">Ответить</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div id="commentsList">Загрузка комментариев...</div>' +
        '</div>';
    
    openModal('Чирп', content, false, null);
    loadComments(chirpId);
}

async function loadComments(chirpId) {
    var { data: comments, error } = await supabase.from('comments')
        .select('*, users:user_id (username, avatar_url)')
        .eq('chirp_id', chirpId)
        .order('created_at', { ascending: true });
    
    var list = document.getElementById('commentsList');
    if (!list) return;
    
    if (error || !comments || comments.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-text">Нет комментариев</div></div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < comments.length; i++) {
        var c = comments[i];
        html += 
            '<div class="comment-item">' +
                '<div class="comment-avatar"><img src="' + (c.users.avatar_url || '') + '" alt=""></div>' +
                '<div class="comment-body">' +
                    '<div class="comment-header">' +
                        '<span class="comment-username">' + c.users.username + '</span>' +
                        '<span class="comment-time">' + getTimeAgo(new Date(c.created_at)) + '</span>' +
                    '</div>' +
                    '<div class="comment-content">' + c.content + '</div>' +
                '</div>' +
            '</div>';
    }
    list.innerHTML = html;
}

async function submitComment(chirpId) {
    var input = document.getElementById('commentInput');
    var content = input.value.trim();
    if (!content) return;
    
    if (containsProfanity(content) || containsSpam(content)) {
        showToast('Комментарий содержит запрещённый контент', 'error');
        return;
    }
    
    var { error } = await supabase.from('comments').insert({
        chirp_id: chirpId,
        user_id: currentUser.id,
        content: filterContent(content)
    });
    
    if (error) {
        showToast('Ошибка', 'error');
        return;
    }
    
    // Update count
    await supabase.from('chirps').update({ comments_count: supabase.raw('comments_count + 1') }).eq('id', chirpId);
    
    input.value = '';
    loadComments(chirpId);
    showToast('Комментарий добавлен', 'success');
}

// ---------- NOTIFICATIONS ----------
async function loadNotificationCount() {
    if (!currentUser) return;
    var { count } = await supabase.from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id)
        .eq('is_read', false);
    
    var badge = document.getElementById('notifBadge');
    if (badge) {
        if (count > 0) {
            badge.style.display = 'flex';
            badge.textContent = count > 99 ? '99+' : count;
        } else {
            badge.style.display = 'none';
        }
    }
}

// ---------- NAVIGATION ----------
function navTo(section) {
    if (section === 'feed') {
        renderScreen('main');
    } else if (section === 'search') {
        openSearchModal();
    } else if (section === 'notifications') {
        openNotificationsModal();
    } else if (section === 'profile') {
        openProfile(currentUser.id);
    }
}

function scrollToCreate() {
    var input = document.getElementById('chirpInput');
    if (input) input.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openSearchModal() {
    var content = 
        '<div class="search-container">' +
            '<div class="search-input-wrapper">' +
                '<span class="search-icon">🔍</span>' +
                '<input type="text" id="searchInput" class="search-input" placeholder="Поиск по хештегам и пользователям" oninput="window.searchAll()">' +
            '</div>' +
            '<div id="searchResults" class="search-results"></div>' +
        '</div>';
    openModal('Поиск', content, false, null);
}

async function searchAll() {
    var query = document.getElementById('searchInput').value.trim();
    var results = document.getElementById('searchResults');
    if (!query) {
        results.innerHTML = '';
        return;
    }
    
    // Search users
    var { data: users } = await supabase.from('users')
        .select('id, username, avatar_url')
        .ilike('username', '%' + query + '%')
        .limit(5);
    
    // Search chirps with hashtag
    var { data: chirps } = await supabase.from('chirps')
        .select('id, content, hashtags, created_at, users:user_id (username, avatar_url)')
        .contains('hashtags', [query.startsWith('#') ? query : '#' + query])
        .limit(10);
    
    var html = '';
    if (users && users.length > 0) {
        html += '<div class="search-section-title">Пользователи</div>';
        for (var i = 0; i < users.length; i++) {
            html += '<div class="search-result-item" onclick="window.openProfile(\'' + users[i].id + '\'); window.closeModal();">' +
                '<div class="chirp-avatar"><img src="' + (users[i].avatar_url || '') + '" alt=""></div>' +
                '<div><strong>' + users[i].username + '</strong></div>' +
            '</div>';
        }
    }
    if (chirps && chirps.length > 0) {
        html += '<div class="search-section-title">Посты</div>';
        for (var j = 0; j < chirps.length; j++) {
            html += '<div class="search-result-item" onclick="window.openChirp(\'' + chirps[j].id + '\'); window.closeModal();">' +
                '<div>' + formatChirpContent(chirps[j].content.substring(0, 100)) + '</div>' +
            '</div>';
        }
    }
    if (!html) html = '<div class="empty-state-text">Ничего не найдено</div>';
    results.innerHTML = html;
}

async function openNotificationsModal() {
    if (!currentUser) return;
    var { data: notifications } = await supabase.from('notifications')
        .select('*, from_user:from_user_id (username, avatar_url)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(50);
    
    var html = '';
    if (!notifications || notifications.length === 0) {
        html = '<div class="empty-state"><div class="empty-state-icon">🔔</div><div class="empty-state-title">Нет уведомлений</div></div>';
    } else {
        for (var i = 0; i < notifications.length; i++) {
            var n = notifications[i];
            var iconClass = '';
            var text = '';
            if (n.type === 'like') {
                iconClass = 'like';
                text = '<strong>' + n.from_user.username + '</strong> понравился ваш пост';
            } else if (n.type === 'comment') {
                iconClass = 'comment';
                text = '<strong>' + n.from_user.username + '</strong> прокомментировал ваш пост';
            } else if (n.type === 'follow') {
                iconClass = 'follow';
                text = '<strong>' + n.from_user.username + '</strong> подписался на вас';
            } else if (n.type === 'warning') {
                iconClass = 'warning';
                text = '⚠️ Вы получили предупреждение';
            }
            
            html += '<div class="notification-item ' + (n.is_read ? '' : 'unread') + '" onclick="window.markNotifRead(\'' + n.id + '\', \'' + n.chirp_id + '\')">' +
                '<div class="notification-icon ' + iconClass + '">' + (iconClass === 'like' ? '❤️' : iconClass === 'comment' ? '💬' : iconClass === 'follow' ? '👤' : '⚠️') + '</div>' +
                '<div class="notification-content">' + text + '<div class="notification-time">' + getTimeAgo(new Date(n.created_at)) + '</div></div>' +
            '</div>';
        }
    }
    
    openModal('Уведомления', html, false, null);
    
    // Mark all as read
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id).eq('is_read', false);
    loadNotificationCount();
}

async function markNotifRead(notifId, chirpId) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
    closeModal();
    if (chirpId) openChirp(chirpId);
}

// ---------- PROFILE ----------
async function openProfile(userId) {
    var { data: user, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error || !user) return;
    
    var isOwnProfile = currentUser && currentUser.id === user.id;
    var isFollowing = false;
    if (!isOwnProfile && currentUser) {
        var { data: follow } = await supabase.from('follows')
            .select('id')
            .eq('follower_id', currentUser.id)
            .eq('following_id', userId);
        isFollowing = follow && follow.length > 0;
    }
    
    var content = 
        '<div class="profile-header">' +
            '<div class="profile-banner">' + (user.banner_url ? '<img src="' + user.banner_url + '" alt="">' : '') + '</div>' +
            '<div class="profile-avatar-section">' +
                '<div class="profile-avatar-large"><img src="' + (user.avatar_url || '') + '" alt=""></div>' +
                (isOwnProfile ? '<button class="btn btn-secondary btn-small" onclick="window.editProfile()">Редактировать</button>' : 
                    '<button class="btn btn-primary btn-small" onclick="window.toggleFollow(\'' + userId + '\')">' + (isFollowing ? 'Отписаться' : 'Подписаться') + '</button>') +
            '</div>' +
            '<div class="profile-info">' +
                '<div class="profile-name-section">' +
                    '<div class="profile-display-name">' + user.username + (user.is_verified ? ' <span class="chirp-verified">✓</span>' : '') + '</div>' +
                    '<div class="profile-handle">@' + user.username + '</div>' +
                '</div>' +
                (user.bio ? '<div class="profile-bio">' + user.bio + '</div>' : '') +
                '<div class="profile-meta">' +
                    (user.location ? '<span class="profile-meta-item">📍 ' + user.location + '</span>' : '') +
                    (user.website ? '<span class="profile-meta-item">🔗 <a href="' + user.website + '" target="_blank">' + user.website + '</a></span>' : '') +
                    '<span class="profile-meta-item">📅 На сайте с ' + new Date(user.created_at).toLocaleDateString() + '</span>' +
                '</div>' +
                '<div class="profile-stats">' +
                    '<div class="profile-stat"><strong>' + (user.followers_count || 0) + '</strong> <span>подписчиков</span></div>' +
                    '<div class="profile-stat"><strong>' + (user.following_count || 0) + '</strong> <span>подписок</span></div>' +
                    '<div class="profile-stat"><strong>' + (user.chirps_count || 0) + '</strong> <span>постов</span></div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div id="profileChirps" class="chirps-list"><div class="loading-more"><div class="spinner"></div></div></div>';
    
    openModal('Профиль', content, false, null);
    
    // Load user's chirps
    var { data: chirps } = await supabase.from('chirps')
        .select('*, users:user_id (username, avatar_url, is_verified)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
    
    var list = document.getElementById('profileChirps');
    if (list) renderChirps(chirps || [], list);
}

async function toggleFollow(userId) {
    if (!currentUser) return;
    var { data: follow } = await supabase.from('follows')
        .select('id')
        .eq('follower_id', currentUser.id)
        .eq('following_id', userId);
    
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
        
        // Notify
        await supabase.from('notifications').insert({
            user_id: userId,
            from_user_id: currentUser.id,
            type: 'follow'
        });
    }
    // Refresh profile modal
    openProfile(userId);
}

function editProfile() {
    alert('Редактирование профиля будет доступно в следующей версии');
}

// ---------- REPORT ----------
function reportChirp(chirpId) {
    var content = 
        '<p>Выберите причину жалобы:</p>' +
        '<select id="reportReason" class="form-input">' +
            '<option value="spam">Спам</option>' +
            '<option value="harassment">Оскорбление</option>' +
            '<option value="inappropriate">Неприемлемый контент</option>' +
            '<option value="other">Другое</option>' +
        '</select>' +
        '<textarea id="reportDetails" class="form-input mt-2" placeholder="Дополнительная информация"></textarea>';
    
    openModal('Пожаловаться', content, true, function() {
        var reason = document.getElementById('reportReason').value;
        var details = document.getElementById('reportDetails').value;
        window.submitReport(chirpId, reason, details);
    });
}

async function submitReport(chirpId, reason, details) {
    if (!currentUser) return;
    
    // Get chirp owner
    var { data: chirp } = await supabase.from('chirps').select('user_id').eq('id', chirpId).single();
    
    await supabase.from('reports').insert({
        reporter_id: currentUser.id,
        reported_user_id: chirp ? chirp.user_id : null,
        chirp_id: chirpId,
        reason: details || reason,
        report_type: reason
    });
    
    showToast('Жалоба отправлена', 'success');
}

// ---------- ADMIN PANEL ----------
function renderAdminScreen() {
    if (!isAdmin) {
        // Prompt password
        var password = prompt('Введите пароль администратора:');
        if (password !== adminPassword) {
            showToast('Неверный пароль', 'error');
            renderScreen('main');
            return;
        }
        isAdmin = true;
    }
    
    var html = 
        '<div class="screen-main">' +
            '<header class="topbar">' +
                '<div class="topbar-content">' +
                    '<button class="btn-icon" onclick="window.renderScreen(\'main\')">← Назад</button>' +
                    '<h1 class="topbar-title">Админ-панель</h1>' +
                '</div>' +
            '</header>' +
            '<div class="admin-panel">' +
                '<div class="admin-section">' +
                    '<h3 class="admin-section-title">📊 Статистика</h3>' +
                    '<div class="admin-stat-grid" id="adminStats"></div>' +
                '</div>' +
                '<div class="admin-section">' +
                    '<h3 class="admin-section-title">👥 Пользователи</h3>' +
                    '<div id="adminUsersTable"></div>' +
                '</div>' +
                '<div class="admin-section">' +
                    '<h3 class="admin-section-title">🚩 Жалобы</h3>' +
                    '<div id="adminReportsTable"></div>' +
                '</div>' +
            '</div>' +
        '</div>';
    
    appContainer.innerHTML = html;
    loadAdminStats();
    loadAdminUsers();
    loadAdminReports();
}

async function loadAdminStats() {
    var { count: usersCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    var { count: chirpsCount } = await supabase.from('chirps').select('*', { count: 'exact', head: true });
    var { count: reportsCount } = await supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    
    var statsEl = document.getElementById('adminStats');
    if (statsEl) {
        statsEl.innerHTML = 
            '<div class="admin-stat-card"><div class="admin-stat-value">' + (usersCount || 0) + '</div><div class="admin-stat-label">Пользователей</div></div>' +
            '<div class="admin-stat-card"><div class="admin-stat-value">' + (chirpsCount || 0) + '</div><div class="admin-stat-label">Постов</div></div>' +
            '<div class="admin-stat-card"><div class="admin-stat-value">' + (reportsCount || 0) + '</div><div class="admin-stat-label">Жалоб</div></div>';
    }
}

async function loadAdminUsers() {
    var { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false }).limit(50);
    var table = document.getElementById('adminUsersTable');
    if (!table) return;
    
    var html = '<table class="admin-table"><tr><th>Пользователь</th><th>Статус</th><th>Предупреждения</th><th>Действия</th></tr>';
    for (var i = 0; i < users.length; i++) {
        var u = users[i];
        html += '<tr>' +
            '<td>' + u.username + '</td>' +
            '<td>' + (u.is_banned ? '<span class="admin-badge banned">Забанен</span>' : '<span class="admin-badge active">Активен</span>') + '</td>' +
            '<td>' + (u.warnings_count || 0) + '/' + u.max_warnings + '</td>' +
            '<td>' +
                '<button class="btn btn-small btn-ghost" onclick="window.warnUser(\'' + u.id + '\')">⚠️</button>' +
                '<button class="btn btn-small btn-ghost" onclick="window.banUser(\'' + u.id + '\')">🚫</button>' +
            '</td>' +
        '</tr>';
    }
    html += '</table>';
    table.innerHTML = html;
}

async function loadAdminReports() {
    var { data: reports } = await supabase.from('reports')
        .select('*, reporter:reporter_id (username), reported:reported_user_id (username), chirp:chirp_id (content)')
        .order('created_at', { ascending: false })
        .limit(20);
    
    var table = document.getElementById('adminReportsTable');
    if (!table) return;
    
    var html = '<table class="admin-table"><tr><th>Отправитель</th><th>Нарушитель</th><th>Причина</th><th>Действия</th></tr>';
    for (var i = 0; i < reports.length; i++) {
        var r = reports[i];
        html += '<tr>' +
            '<td>' + (r.reporter ? r.reporter.username : '?') + '</td>' +
            '<td>' + (r.reported ? r.reported.username : '?') + '</td>' +
            '<td>' + r.reason + '</td>' +
            '<td>' +
                '<button class="btn btn-small btn-ghost" onclick="window.resolveReport(\'' + r.id + '\', \'dismiss\')">Отклонить</button>' +
                '<button class="btn btn-small btn-ghost" onclick="window.resolveReport(\'' + r.id + '\', \'warn\')">Предупредить</button>' +
            '</td>' +
        '</tr>';
    }
    html += '</table>';
    table.innerHTML = html;
}

async function warnUser(userId) {
    var reason = prompt('Причина предупреждения:');
    if (!reason) return;
    
    var { data: user } = await supabase.from('users').select('warnings_count, max_warnings').eq('id', userId).single();
    if (!user) return;
    
    var newWarnings = (user.warnings_count || 0) + 1;
    var updateData = { warnings_count: newWarnings };
    
    if (newWarnings >= user.max_warnings) {
        updateData.is_banned = true;
        updateData.ban_reason = 'Достигнут лимит предупреждений';
        updateData.ban_expires = new Date(Date.now() + 7*24*60*60*1000).toISOString(); // 7 days
    }
    
    await supabase.from('users').update(updateData).eq('id', userId);
    
    // Notify user
    await supabase.from('notifications').insert({
        user_id: userId,
        from_user_id: currentUser.id,
        type: 'warning'
    });
    
    showToast('Предупреждение вынесено', 'success');
    loadAdminUsers();
}

async function banUser(userId) {
    var reason = prompt('Причина бана:');
    if (!reason) return;
    
    await supabase.from('users').update({
        is_banned: true,
        ban_reason: reason,
        ban_expires: new Date(Date.now() + 30*24*60*60*1000).toISOString() // 30 days
    }).eq('id', userId);
    
    showToast('Пользователь забанен', 'success');
    loadAdminUsers();
}

async function resolveReport(reportId, action) {
    if (action === 'warn') {
        var { data: report } = await supabase.from('reports').select('reported_user_id').eq('id', reportId).single();
        if (report && report.reported_user_id) {
            await warnUser(report.reported_user_id);
        }
    }
    
    await supabase.from('reports').update({
        status: 'resolved',
        resolved_by: currentUser.id,
        resolution_note: action,
        resolved_at: new Date().toISOString()
    }).eq('id', reportId);
    
    showToast('Жалоба обработана', 'success');
    loadAdminReports();
}

// ---------- LEGAL PAGES ----------
function renderRulesScreen() {
    var html = 
        '<div class="legal-page">' +
            '<button class="legal-back-btn" onclick="window.goBack()">← Назад</button>' +
            '<h1>Правила использования NOBUQR.SPACE</h1>' +
            '<p class="last-updated">Последнее обновление: 26 июля 2026 г.</p>' +
            
            '<h2>1. Общие положения</h2>' +
            '<p>NOBUQR.SPACE — это социальная платформа для общения и обмена контентом. Используя наш сервис, вы соглашаетесь с настоящими правилами.</p>' +
            
            '<h2>2. Возрастные ограничения</h2>' +
            '<p>Минимальный возраст для регистрации — 10 лет. Пользователи младше 18 лет не могут загружать медиафайлы (фото, видео).</p>' +
            
            '<h2>3. Запрещённый контент</h2>' +
            '<ul>' +
                '<li>Оскорбления, разжигание ненависти, дискриминация</li>' +
                '<li>Спам, реклама без согласования</li>' +
                '<li>Материалы для взрослых (18+)</li>' +
                '<li>Насилие, угрозы, преследование</li>' +
                '<li>Нарушение авторских прав</li>' +
                '<li>Фишинг, вредоносное ПО</li>' +
            '</ul>' +
            
            '<h2>4. Меры наказания</h2>' +
            '<p>За нарушения предусмотрены предупреждения (до 3-х), временная блокировка (7-30 дней) или перманентный бан.</p>' +
            
            '<h2>5. Ответственность</h2>' +
            '<p>Пользователи несут полную ответственность за публикуемый контент. Администрация оставляет за собой право удалять любой контент без объяснения причин.</p>' +
            
            '<h2>6. Изменения правил</h2>' +
            '<p>Мы можем обновлять правила в любое время. Продолжение использования сервиса означает согласие с новой версией.</p>' +
        '</div>';
    
    appContainer.innerHTML = html;
    currentScreen = 'rules';
}

function renderPrivacyScreen() {
    var html = 
        '<div class="legal-page">' +
            '<button class="legal-back-btn" onclick="window.goBack()">← Назад</button>' +
            '<h1>Политика конфиденциальности</h1>' +
            '<p class="last-updated">Последнее обновление: 26 июля 2026 г.</p>' +
            
            '<h2>1. Какие данные мы собираем</h2>' +
            '<ul>' +
                '<li>Email, имя пользователя, возраст (при регистрации)</li>' +
                '<li>Публикуемый контент (посты, комментарии, медиа)</li>' +
                '<li>IP-адрес (для защиты от злоупотреблений)</li>' +
                '<li>Cookies и localStorage для сессий</li>' +
            '</ul>' +
            
            '<h2>2. Как мы используем данные</h2>' +
            '<p>Ваши данные используются исключительно для функционирования сервиса: авторизация, отображение контента, защита от нарушений.</p>' +
            
            '<h2>3. Передача третьим лицам</h2>' +
            '<p>Мы не продаём и не передаём ваши данные третьим лицам, за исключением случаев, предусмотренных законом.</p>' +
            
            '<h2>4. Хранение данных</h2>' +
            '<p>Данные хранятся в базе данных Supabase с применением шифрования паролей (SHA-256 + соль). Срок хранения — до удаления аккаунта.</p>' +
            
            '<h2>5. Ваши права</h2>' +
            '<p>Вы можете запросить удаление аккаунта и всех связанных данных, отправив запрос через администратора.</p>' +
            
            '<h2>6. Файлы cookie</h2>' +
            '<p>Мы используем localStorage для хранения сессии. Вы можете очистить хранилище браузера, чтобы выйти.</p>' +
            
            '<h2>7. Защита от судебных исков</h2>' +
            '<p>Пользователи соглашаются, что любые споры решаются путём переговоров. Администрация не несёт ответственности за контент, опубликованный пользователями, но обязуется реагировать на жалобы в течение 48 часов.</p>' +
            
            '<h2>8. Контакты</h2>' +
            '<p>Для вопросов: support@nobuqr.space</p>' +
        '</div>';
    
    appContainer.innerHTML = html;
    currentScreen = 'privacy';
}

function goBack() {
    if (currentUser) {
        renderScreen('main');
    } else {
        renderScreen('auth');
    }
}

// ------------------------------
// INFINITE SCROLL
// ------------------------------
// Add scroll event listener for infinite loading
window.addEventListener('scroll', function() {
    if (currentScreen !== 'main') return;
    var container = document.getElementById('feedContainer');
    if (!container) return;
    
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
        // Load more chirps
        if (feedTab && chirpsPage > 0) {
            loadChirps(feedTab);
        }
    }
});

// ------------------------------
// INITIAL LOAD
// ------------------------------
renderScreen('loading');