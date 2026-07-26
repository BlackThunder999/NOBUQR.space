// ============================================
// NOBUSUMER — ПОЛНЫЙ SCRIPT.JS v2.0
// Игровой маркетплейс с Telegram Stars
// ============================================

var SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
var SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Настройки платформы
var ADMIN_USERNAME = '@hhhhhein';
var ORDER_COMMISSION = 0.20;
var WITHDRAW_COMMISSION = 0.05;
var BOOST_PRICE = 15;
var MIN_WITHDRAW = 400;
var MIN_REVIEWS_FOR_BOOST = 10;
var MIN_AGE = 13;
var PROCESSING_TIME = 'до 24 часов';

var currentUser = null;
var currentSession = null;
var currentScreen = 'loading';
var isAdmin = false;
var modalCallback = null;
var selectedMediaFile = null;
var servicePage = 0;
var allServices = [];
var currentGameId = null;
var currentServiceId = null;
var currentChatId = null;
var chatSubscription = null;

window.onload = function() { checkSession(); };

// ======================== СЕССИИ ========================
function checkSession() {
    var sessionData = localStorage.getItem('nobusumer_session');
    if (sessionData) {
        try {
            var session = JSON.parse(sessionData);
            if (session.expires_at && new Date().getTime() < session.expires_at) {
                currentSession = session;
                fetchUserById(session.user_id);
                return;
            }
        } catch(e) {}
        localStorage.removeItem('nobusumer_session');
    }
    currentUser = null;
    renderScreen('auth');
}

function createSession(userId) {
    var token = '';
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < 64; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    var session = { user_id: userId, token: token, expires_at: new Date().getTime() + 86400000 };
    localStorage.setItem('nobusumer_session', JSON.stringify(session));
    currentSession = session;
}

function destroySession() {
    localStorage.removeItem('nobusumer_session');
    currentSession = null; currentUser = null; isAdmin = false;
    renderScreen('auth');
}

async function fetchUserById(userId) {
    var { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error || !data) { destroySession(); return; }
    currentUser = data;
    if (data.role === 'admin') isAdmin = true;
    var { data: gemData } = await supabase.from('gems').select('*').eq('user_id', userId).single();
    if (!gemData) {
        await supabase.from('gems').insert({ user_id: userId, balance: 0, frozen: 0, total_earned: 0, total_spent: 0 });
        currentUser.gems = 0; currentUser.frozen = 0;
    } else {
        currentUser.gems = gemData.balance || 0; currentUser.frozen = gemData.frozen || 0;
    }
    var { data: sellerData } = await supabase.from('sellers').select('*').eq('user_id', userId).single();
    currentUser.isSeller = sellerData ? true : false;
    currentUser.sellerData = sellerData || null;
    renderScreen('main');
}

// ======================== ХЕШИРОВАНИЕ ========================
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
var bannedWords = ['хуй','пизда','ебать','блядь','сука','нахуй','залупа','член','жопа','fuck','shit','ass','bitch','dick','pussy'];
function containsProfanity(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < bannedWords.length; i++) if (lower.indexOf(bannedWords[i]) !== -1) return true;
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

// ======================== UI ========================
function showToast(message, type) {
    type = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<span class="toast-icon">' + (type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️') + '</span>' + message;
    document.getElementById('toastContainer').appendChild(toast);
    setTimeout(function() { toast.classList.add('out'); setTimeout(function() { toast.remove(); }, 300); }, 3000);
}
function openModal(title, content, showCancel, callback) {
    modalCallback = callback || null;
    var cancelBtn = showCancel ? '<button class="btn btn-secondary" onclick="window.closeModal()" style="width:auto">Отмена</button>' : '';
    var html = '<div class="modal-handle"></div><div class="modal-header"><h3 class="modal-title">' + title + '</h3><button class="modal-close" onclick="window.closeModal()">✕</button></div><div class="modal-body">' + content + '</div><div class="modal-footer">' + cancelBtn + '<button class="btn btn-primary" onclick="window.confirmModal()" style="width:auto">Подтвердить</button></div>';
    document.getElementById('modalSheet').innerHTML = html;
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('modalSheet').classList.add('active');
}
function confirmModal() { if (modalCallback) modalCallback(); closeModal(); }
function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('modalSheet').classList.remove('active');
    modalCallback = null;
}

// ======================== ГЕНЕРАЦИЯ КОДА ========================
function generateDepositCode() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var code = 'DEP_';
    for (var i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

// ======================== РЕНДЕРИНГ ========================
function renderScreen(screen) {
    currentScreen = screen;
    var app = document.getElementById('app');
    switch(screen) {
        case 'loading': app.innerHTML = '<div class="loading-screen"><div class="loading-logo">N</div><div class="loading-text">NOBUSUMER</div><div class="loading-subtext">Игровой маркетплейс</div><div class="loading-bar"><div class="loading-bar-fill"></div></div></div>'; break;
        case 'auth': renderAuthScreen(); break;
        case 'main': renderMainScreen(); break;
        case 'game': renderGameScreen(); break;
        case 'service': renderServiceDetail(); break;
        case 'create-service': renderCreateService(); break;
        case 'profile': renderProfileScreen(); break;
        case 'orders': renderOrdersScreen(); break;
        case 'balance': renderBalanceScreen(); break;
        case 'chat': renderChatScreen(); break;
        case 'admin': renderAdminScreen(); break;
        case 'rules': renderRulesScreen(); break;
        case 'privacy': renderPrivacyScreen(); break;
        default: renderMainScreen();
    }
}

// ======================== АВТОРИЗАЦИЯ ========================
function renderAuthScreen() {
    var html = '<div class="auth-screen"><div class="auth-logo">N</div><h1 class="auth-title">NOBUSUMER</h1><p class="auth-subtitle">Игровой маркетплейс • от 13 лет</p><div class="auth-card"><div class="auth-tabs"><button class="auth-tab active" onclick="window.switchAuthTab(\'login\')">Вход</button><button class="auth-tab" onclick="window.switchAuthTab(\'register\')">Регистрация</button></div><div id="authFormContainer"></div></div><div class="auth-links"><a class="auth-link" onclick="window.renderScreen(\'rules\')">Правила</a> · <a class="auth-link" onclick="window.renderScreen(\'privacy\')">Конфиденциальность</a></div></div>';
    document.getElementById('app').innerHTML = html;
    switchAuthTab('login');
}
function switchAuthTab(tab) {
    var tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'login') { tabs[0].classList.add('active'); renderLoginForm(); }
    else { tabs[1].classList.add('active'); renderRegisterForm(); }
}
function renderLoginForm() {
    document.getElementById('authFormContainer').innerHTML = '<div class="form-group"><label class="form-label">Email</label><input type="email" id="loginEmail" class="form-input" placeholder="your@email.com"></div><div class="form-group"><label class="form-label">Пароль</label><input type="password" id="loginPassword" class="form-input" placeholder="••••••"></div><button class="btn btn-primary" onclick="window.handleLogin()">Войти</button>';
}
function renderRegisterForm() {
    document.getElementById('authFormContainer').innerHTML = '<div class="form-group"><label class="form-label">Имя</label><input type="text" id="regUsername" class="form-input" placeholder="Ваше имя" maxlength="30"></div><div class="form-group"><label class="form-label">@handle</label><input type="text" id="regHandle" class="form-input" placeholder="vash_nick" maxlength="30"></div><div class="form-group"><label class="form-label">Email</label><input type="email" id="regEmail" class="form-input" placeholder="email@example.com"></div><div class="form-group"><label class="form-label">Пароль (мин. 6 символов)</label><input type="password" id="regPassword" class="form-input" placeholder="Минимум 6 символов" minlength="6"></div><div class="form-group"><label class="form-label">Возраст (мин. 13 лет)</label><input type="number" id="regAge" class="form-input" placeholder="13" min="13" max="150"></div><div class="form-group"><label class="form-label">Ваш Telegram @username (для вывода звёзд)</label><input type="text" id="regTelegram" class="form-input" placeholder="@username"></div><div class="form-checkbox"><input type="checkbox" id="agreeTerms"><span>Мне есть 13 лет. Принимаю <a onclick="window.renderScreen(\'rules\')" style="color:var(--accent)">правила</a></span></div><button class="btn btn-primary" onclick="window.handleRegister()">Зарегистрироваться</button>';
}
async function handleLogin() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!email || !password) { showToast('Заполните поля', 'error'); return; }
    var { data: users } = await supabase.from('users').select('*').eq('email', email);
    if (!users || users.length === 0) { showToast('Неверный email или пароль', 'error'); return; }
    var user = users[0];
    if (user.is_banned) { showToast('Аккаунт заблокирован', 'error'); return; }
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
    var telegram = document.getElementById('regTelegram').value.trim();
    var agree = document.getElementById('agreeTerms').checked;
    if (!username || !handle || !email || !password || !age || !telegram) { showToast('Заполните все поля', 'error'); return; }
    if (password.length < 6) { showToast('Пароль минимум 6 символов', 'error'); return; }
    if (age < MIN_AGE) { showToast('Минимальный возраст: ' + MIN_AGE + ' лет', 'error'); return; }
    if (!agree) { showToast('Подтвердите возраст и примите правила', 'error'); return; }
    if (containsProfanity(username) || containsProfanity(handle)) { showToast('Запрещённые слова', 'error'); return; }
    var { data: exist } = await supabase.from('users').select('id').or('email.eq.' + email + ',handle.eq.' + handle);
    if (exist && exist.length > 0) { showToast('Email или handle занят', 'error'); return; }
    var salt = generateSalt();
    var hash = await sha256(password + salt);
    var { data: newUser, error } = await supabase.from('users').insert({
        username: username, handle: handle, email: email, password_hash: hash, salt: salt, age: age, telegram: telegram
    }).select().single();
    if (error) { showToast('Ошибка регистрации', 'error'); return; }
    createSession(newUser.id);
    currentUser = newUser;
    await supabase.from('gems').insert({ user_id: newUser.id, balance: 0, frozen: 0, total_earned: 0, total_spent: 0 });
    currentUser.gems = 0; currentUser.frozen = 0;
    renderScreen('main');
}

// ======================== ГЛАВНЫЙ ЭКРАН ========================
function renderMainScreen() {
    if (!currentUser) { renderScreen('auth'); return; }
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><div class="topbar-left"><div class="topbar-avatar" onclick="window.renderScreen(\'profile\')">' + (currentUser.avatar_url ? '<img src="' + currentUser.avatar_url + '">' : '') + '</div><h1 class="topbar-title">NOBUSUMER</h1><span class="gems-badge" onclick="window.renderScreen(\'balance\')">💎 <span id="gemsBalance">' + (currentUser.gems || 0) + '</span></span></div><div>' + (isAdmin ? '<button class="btn-icon" onclick="window.renderScreen(\'admin\')">⚙️</button>' : '') + '</div></div></header><div style="flex:1;overflow-y:auto">' +
        '<div class="hero-banner"><div class="hero-title">🎮 Игровой маркетплейс</div><div class="hero-subtitle">Покупай и продавай игровые услуги</div><div class="hero-stats"><div class="hero-stat"><div class="hero-stat-value" id="totalServices">...</div><div class="hero-stat-label">Услуг</div></div><div class="hero-stat"><div class="hero-stat-value" id="totalSellers">...</div><div class="hero-stat-label">Продавцов</div></div></div></div>' +
        '<div class="search-bar"><div class="search-input-wrap"><span class="search-icon">🔍</span><input type="text" id="searchInput" placeholder="Поиск игр и услуг..." oninput="window.searchServices()"><button class="search-clear" id="searchClear" onclick="window.clearSearch()">✕</button></div></div>' +
        '<div class="section-title">🎮 Популярные игры<span onclick="window.showAllGames()">Все →</span></div><div class="game-slider" id="gameSlider">Загрузка...</div>' +
        '<div class="section-title">📂 Категории</div><div class="categories" id="categoriesGrid">Загрузка...</div>' +
        '<div class="section-title">🔥 Услуги<span onclick="window.showAllServices()">Все →</span></div><div class="filter-bar" id="filterBar"></div><div id="servicesList"></div><div id="loadingMore" class="loading-more" style="display:none;"><div class="spinner"></div></div></div>' +
        '<nav class="bottom-nav"><button class="nav-item active" onclick="window.renderScreen(\'main\')"><span class="nav-item-icon">🏠</span>Главная</button><button class="nav-item" onclick="window.renderScreen(\'orders\')"><span class="nav-item-icon">📋</span>Заказы</button><button class="nav-item" onclick="window.renderScreen(\'create-service\')"><span class="nav-item-icon">➕</span>Продать</button><button class="nav-item" onclick="window.renderScreen(\'profile\')"><span class="nav-item-icon">👤</span>Профиль</button></nav></div>';
    document.getElementById('app').innerHTML = html;
    loadMainData();
}

async function loadMainData() {
    // Загружаем игры
    var { data: games } = await supabase.from('games').select('*').order('is_popular', { ascending: false }).limit(10);
    var gameHTML = '';
    if (games) for (var i = 0; i < games.length; i++) {
        gameHTML += '<div class="game-card" onclick="window.openGame(\'' + games[i].id + '\')"><div class="game-card-icon">' + (games[i].icon_url ? '<img src="' + games[i].icon_url + '" style="width:100%;height:100%;object-fit:cover;border-radius:16px">' : '🎮') + '</div><div class="game-card-name">' + games[i].name + '</div></div>';
    }
    document.getElementById('gameSlider').innerHTML = gameHTML || '<div class="text-muted">Нет игр</div>';

    // Загружаем категории
    var { data: categories } = await supabase.from('game_categories').select('*');
    var catHTML = '';
    if (categories) for (var j = 0; j < categories.length; j++) {
        catHTML += '<div class="category-card" onclick="window.filterByCategory(\'' + categories[j].slug + '\')"><div class="category-card-icon">' + categories[j].icon + '</div><div class="category-card-name">' + categories[j].name + '</div></div>';
    }
    document.getElementById('categoriesGrid').innerHTML = catHTML || '';

    // Загружаем услуги
    loadServices();

    // Статистика
    var { count: servicesCount } = await supabase.from('gaming_services').select('*', { count: 'exact', head: true }).eq('is_active', true);
    var { count: sellersCount } = await supabase.from('sellers').select('*', { count: 'exact', head: true });
    document.getElementById('totalServices').textContent = servicesCount || 0;
    document.getElementById('totalSellers').textContent = sellersCount || 0;
}

// Продолжение в следующем сообщении...
// ======================== УСЛУГИ (ЗАГРУЗКА, ПОИСК, ФИЛЬТР) ========================
async function loadServices(category, gameId, searchQuery) {
    var list = document.getElementById('servicesList');
    var loadingEl = document.getElementById('loadingMore');
    if (!list) return;
    
    if (servicePage === 0) {
        list.innerHTML = '<div class="loading-more"><div class="spinner"></div></div>';
    } else {
        if (loadingEl) loadingEl.style.display = 'flex';
    }
    
    var query = supabase.from('gaming_services')
        .select('*, seller:seller_id (username, handle, avatar_url), seller_profile:seller_id (rating, reviews_count, completed_orders)')
        .eq('is_active', true)
        .order('is_boosted', { ascending: false })
        .order('created_at', { ascending: false });
    
    if (category) query = query.eq('category', category);
    if (gameId) query = query.eq('game_id', gameId);
    if (searchQuery) query = query.ilike('title', '%' + searchQuery + '%');
    
    query = query.range(servicePage * 10, (servicePage + 1) * 10 - 1);
    
    var { data: services, error } = await query;
    
    if (error || !services || services.length === 0) {
        if (servicePage === 0) list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Ничего не найдено</div><div class="empty-text">Попробуйте изменить фильтры</div></div>';
        if (loadingEl) loadingEl.style.display = 'none';
        return;
    }
    
    if (servicePage === 0) allServices = services;
    else allServices = allServices.concat(services);
    
    var html = '';
    for (var i = 0; i < allServices.length; i++) {
        html += buildServiceCard(allServices[i]);
    }
    list.innerHTML = html;
    servicePage++;
    if (loadingEl) loadingEl.style.display = 'none';
}

function buildServiceCard(service) {
    var seller = service.seller || {};
    var sellerProfile = service.seller_profile || {};
    var rating = sellerProfile.rating ? sellerProfile.rating.toFixed(1) : '0.0';
    var reviewsCount = sellerProfile.reviews_count || 0;
    var isBoosted = service.is_boosted && new Date(service.boost_expires) > new Date();
    var isNewSeller = (sellerProfile.completed_orders || 0) < 3;
    
    var html = '<div class="service-card' + (isBoosted ? ' boosted' : '') + ' animate-in" onclick="window.openService(\'' + service.id + '\')">';
    
    if (isBoosted) html += '<div class="boost-badge">🚀 ТОП</div>';
    
    html += '<div class="service-card-header">';
    html += '<div class="service-card-img">';
    if (service.image_url) {
        html += '<img src="' + service.image_url + '" alt="" loading="lazy">';
    } else {
        html += '<div class="service-card-img-placeholder">🎮</div>';
    }
    html += '</div>';
    
    html += '<div class="service-card-info">';
    html += '<div class="service-card-title">' + escapeHTML(service.title) + '</div>';
    html += '<div class="service-card-game">🎯 ' + (service.game_name || 'Без игры') + '</div>';
    html += '<div class="service-card-seller">';
    html += '<div class="service-card-seller-avatar">' + (seller.avatar_url ? '<img src="' + seller.avatar_url + '">' : '') + '</div>';
    html += '<span class="service-card-seller-name">@' + (seller.handle || 'unknown') + '</span>';
    html += '<span class="service-card-rating">⭐ ' + rating + '</span>';
    if (isNewSeller) html += '<span class="new-seller-badge">НОВИЧОК</span>';
    html += '</div></div></div>';
    
    html += '<div class="service-card-footer">';
    html += '<div class="service-card-price">' + service.price + ' <small>💎</small></div>';
    html += '<div class="service-card-delivery">⏱ ' + (service.delivery_time || 'По договорённости') + '</div>';
    html += '<button class="btn-buy" onclick="event.stopPropagation(); window.buyService(\'' + service.id + '\')">Купить</button>';
    html += '</div></div>';
    
    return html;
}

function escapeHTML(text) {
    if (!text) return '';
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function searchServices() {
    var query = document.getElementById('searchInput').value.trim();
    var clearBtn = document.getElementById('searchClear');
    if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);
    servicePage = 0; allServices = [];
    loadServices(null, null, query);
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').classList.remove('visible');
    servicePage = 0; allServices = [];
    loadServices();
}

function filterByCategory(category) {
    servicePage = 0; allServices = [];
    loadServices(category);
}

function showAllGames() {
    showToast('Все игры загружены', 'info');
    servicePage = 0; allServices = [];
    loadServices();
}

function showAllServices() {
    servicePage = 0; allServices = [];
    loadServices();
}

// ======================== ИГРЫ ========================
function openGame(gameId) {
    currentGameId = gameId;
    servicePage = 0; allServices = [];
    renderScreen('game');
}

async function renderGameScreen() {
    if (!currentGameId) { renderScreen('main'); return; }
    var { data: game } = await supabase.from('games').select('*').eq('id', currentGameId).single();
    if (!game) { renderScreen('main'); return; }
    
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">' + game.name + '</h1></div></header><div style="flex:1;overflow-y:auto">' +
        '<div class="game-header"><div class="game-header-content"><div class="game-icon-large">🎮</div><div class="game-info"><h1>' + game.name + '</h1><p>' + (game.genre || '') + '</p><div class="game-stats"><span>📦 ' + (game.services_count || 0) + ' услуг</span></div></div></div></div>' +
        '<div class="filter-bar" id="gameFilterBar"></div><div id="servicesList"></div><div id="loadingMore" class="loading-more" style="display:none;"><div class="spinner"></div></div></div>' +
        '<nav class="bottom-nav"><button class="nav-item" onclick="window.renderScreen(\'main\')">🏠 Главная</button><button class="nav-item active">🎮 Услуги</button></nav></div>';
    document.getElementById('app').innerHTML = html;
    
    // Загружаем категории для фильтра
    var { data: categories } = await supabase.from('game_categories').select('*');
    var filterHTML = '<button class="filter-chip active" onclick="window.filterGameServices(null)">Все</button>';
    if (categories) for (var i = 0; i < categories.length; i++) {
        filterHTML += '<button class="filter-chip" onclick="window.filterGameServices(\'' + categories[i].slug + '\')">' + categories[i].icon + ' ' + categories[i].name + '</button>';
    }
    document.getElementById('gameFilterBar').innerHTML = filterHTML;
    
    loadServices(null, currentGameId);
}

function filterGameServices(category) {
    var chips = document.querySelectorAll('#gameFilterBar .filter-chip');
    chips.forEach(function(c) { c.classList.remove('active'); });
    if (!category) chips[0].classList.add('active');
    else {
        var allChips = document.querySelectorAll('#gameFilterBar .filter-chip');
        for (var i = 0; i < allChips.length; i++) {
            if (allChips[i].textContent.indexOf(category) !== -1) allChips[i].classList.add('active');
        }
    }
    servicePage = 0; allServices = [];
    loadServices(category, currentGameId);
}

// ======================== УСЛУГА (ДЕТАЛИ) ========================
function openService(serviceId) {
    currentServiceId = serviceId;
    renderScreen('service');
}

async function renderServiceDetail() {
    if (!currentServiceId) { renderScreen('main'); return; }
    
    var { data: service } = await supabase.from('gaming_services')
        .select('*, seller:seller_id (*), seller_profile:seller_id (rating, reviews_count, completed_orders, description, display_name)')
        .eq('id', currentServiceId).single();
    
    if (!service) { showToast('Услуга не найдена', 'error'); renderScreen('main'); return; }
    
    var seller = service.seller || {};
    var sellerProfile = service.seller_profile || {};
    var rating = sellerProfile.rating ? sellerProfile.rating.toFixed(1) : '0.0';
    var reviewsCount = sellerProfile.reviews_count || 0;
    
    // Увеличиваем просмотры
    await supabase.from('gaming_services').update({ views_count: (service.views_count || 0) + 1 }).eq('id', currentServiceId);
    
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.goBack()">←</button><h1 class="topbar-title">Услуга</h1></div></header><div style="flex:1;overflow-y:auto">' +
        '<div class="service-detail">' +
        '<div class="service-detail-img">' + (service.image_url ? '<img src="' + service.image_url + '" alt="">' : '<div class="service-detail-img-placeholder">🎮</div>') + '</div>' +
        '<div class="service-detail-info">' +
        '<h1 class="service-detail-title">' + escapeHTML(service.title) + '</h1>' +
        '<div class="service-detail-price-block"><span class="service-detail-price">' + service.price + ' 💎</span></div>' +
        '<div class="service-detail-meta">' +
        '<span class="service-detail-tag">🎯 ' + (service.game_name || 'Без игры') + '</span>' +
        '<span class="service-detail-tag">📂 ' + service.category + '</span>' +
        '<span class="service-detail-tag">⏱ ' + (service.delivery_time || 'По договорённости') + '</span>' +
        '<span class="service-detail-tag">👁 ' + (service.views_count || 0) + ' просмотров</span>' +
        '<span class="service-detail-tag">📦 ' + (service.orders_count || 0) + ' заказов</span>' +
        '</div>' +
        '<p class="service-detail-desc">' + escapeHTML(service.description || 'Описание отсутствует') + '</p>' +
        
        '<div class="seller-card">' +
        '<div class="seller-card-avatar">' + (seller.avatar_url ? '<img src="' + seller.avatar_url + '">' : '') + '</div>' +
        '<div class="seller-card-info"><div class="seller-card-name">@' + (seller.handle || 'unknown') + '</div><div class="seller-card-rating">⭐ ' + rating + ' (' + reviewsCount + ' отзывов)</div><div class="seller-card-stats">📦 ' + (sellerProfile.completed_orders || 0) + ' заказов</div></div>' +
        '</div>' +
        
        '<button class="btn btn-primary btn-large" onclick="window.buyService(\'' + service.id + '\')">💎 Купить за ' + service.price + ' Gems</button>' +
        '<p style="text-align:center;margin-top:8px;font-size:11px;color:var(--text-muted)">После покупки откроется чат с продавцом</p>' +
        '</div></div></div>' +
        '<nav class="bottom-nav"><button class="nav-item" onclick="window.goBack()">← Назад</button><button class="nav-item" onclick="window.renderScreen(\'orders\')">📋 Заказы</button></nav></div>';
    
    document.getElementById('app').innerHTML = html;
}

function goBack() {
    if (currentScreen === 'service' || currentScreen === 'game') renderScreen('main');
    else if (currentScreen === 'chat') renderScreen('orders');
    else renderScreen('main');
}

// ======================== ПОКУПКА УСЛУГИ ========================
async function buyService(serviceId) {
    if (!currentUser) { showToast('Войдите в аккаунт', 'error'); return; }
    
    var { data: service } = await supabase.from('gaming_services')
        .select('*, seller:seller_id (*)')
        .eq('id', serviceId).single();
    
    if (!service) { showToast('Услуга не найдена', 'error'); return; }
    if (service.seller_id === currentUser.id) { showToast('Нельзя купить свою услугу', 'error'); return; }
    if (!service.is_active) { showToast('Услуга неактивна', 'error'); return; }
    
    var price = service.price;
    if (currentUser.gems < price) {
        showToast('Недостаточно Gems. Пополните баланс.', 'error');
        renderScreen('balance');
        return;
    }
    
    var commission = Math.floor(price * ORDER_COMMISSION);
    var sellerGets = price - commission;
    
    var confirmHTML = '<div style="text-align:center"><p style="font-size:18px;margin-bottom:8px"><strong>' + escapeHTML(service.title) + '</strong></p>' +
        '<p style="font-size:24px;font-weight:900;color:var(--accent)">' + price + ' 💎</p>' +
        '<p style="font-size:12px;color:var(--text-muted)">Продавец получит: ' + sellerGets + ' 💎</p>' +
        '<p style="font-size:12px;color:var(--text-muted)">Комиссия платформы: ' + commission + ' 💎 (20%)</p>' +
        '<p style="margin-top:8px;font-size:12px">После оплаты откроется чат с продавцом</p></div>';
    
    openModal('Подтверждение покупки', confirmHTML, true, async function() {
        // Замораживаем Gems
        await supabase.from('gems').update({
            balance: currentUser.gems - price,
            frozen: (currentUser.frozen || 0) + price
        }).eq('user_id', currentUser.id);
        
        currentUser.gems -= price;
        currentUser.frozen = (currentUser.frozen || 0) + price;
        
        // Создаём заказ
        var { data: order, error } = await supabase.from('service_orders').insert({
            buyer_id: currentUser.id,
            seller_id: service.seller_id,
            service_id: serviceId,
            amount: price,
            commission_platform: commission,
            seller_gets: sellerGets,
            status: 'pending'
        }).select().single();
        
        if (error) { showToast('Ошибка создания заказа', 'error'); return; }
        
        // Создаём чат
        var { data: chat } = await supabase.from('chats').insert({
            order_id: order.id,
            buyer_id: currentUser.id,
            seller_id: service.seller_id
        }).select().single();
        
        // Уведомление продавцу
        await supabase.from('notifications').insert({
            user_id: service.seller_id,
            type: 'new_order',
            title: 'Новый заказ!',
            message: 'Пользователь @' + currentUser.handle + ' купил вашу услугу «' + service.title + '»'
        });
        
        // Обновляем счётчик заказов
        await supabase.from('gaming_services').update({ orders_count: (service.orders_count || 0) + 1 }).eq('id', serviceId);
        
        showToast('Заказ создан! Чат открыт.', 'success');
        closeModal();
        
        // Открываем чат
        currentChatId = chat.id;
        currentOrderId = order.id;
        renderScreen('chat');
    });
}

// ======================== ЧАТ ========================
async function renderChatScreen() {
    if (!currentChatId || !currentOrderId) { renderScreen('orders'); return; }
    
    var { data: chat } = await supabase.from('chats').select('*, order:order_id (*, service:service_id (title))').eq('id', currentChatId).single();
    if (!chat) { renderScreen('orders'); return; }
    
    var otherUserId = chat.buyer_id === currentUser.id ? chat.seller_id : chat.buyer_id;
    var { data: otherUser } = await supabase.from('users').select('username, handle').eq('id', otherUserId).single();
    
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'orders\')">←</button><div><h1 class="topbar-title">@' + (otherUser ? otherUser.handle : 'user') + '</h1><div style="font-size:10px;color:var(--text-muted)">Заказ: ' + (chat.order && chat.order.service ? chat.order.service.title : '...') + '</div></div></div></header>' +
        '<div class="chat-warning"><span>⚠️</span><p><strong>Не выходите за пределы платформы!</strong> Все переговоры только здесь. Мы не несём ответственности за сделки вне NobuSumer. При нарушении — блокировка.</p></div>' +
        '<div class="chat-messages" id="chatMessages"><div class="spinner"></div></div>' +
        '<div class="chat-input-area"><input type="text" id="chatInput" placeholder="Сообщение..." onkeypress="if(event.key===\'Enter\')window.sendMessage()"><button class="chat-send-btn" onclick="window.sendMessage()">➤</button></div></div>';
    
    document.getElementById('app').innerHTML = html;
    loadMessages();
    subscribeToChat();
}

async function loadMessages() {
    var { data: messages } = await supabase.from('chat_messages')
        .select('*')
        .eq('chat_id', currentChatId)
        .order('created_at', { ascending: true });
    
    var container = document.getElementById('chatMessages');
    if (!container) return;
    
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">Напишите первое сообщение</div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        var isMine = msg.sender_id === currentUser.id;
        html += '<div class="chat-msg ' + (isMine ? 'mine' : 'theirs') + '">' + escapeHTML(msg.content) + '<div class="chat-msg-time">' + getTimeAgo(new Date(msg.created_at)) + '</div></div>';
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function subscribeToChat() {
    if (chatSubscription) supabase.removeChannel(chatSubscription);
    chatSubscription = supabase
        .channel('chat_' + currentChatId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'chat_id=eq.' + currentChatId }, function() {
            loadMessages();
        })
        .subscribe();
}

async function sendMessage() {
    var input = document.getElementById('chatInput');
    var content = input.value.trim();
    if (!content) return;
    
    var { error } = await supabase.from('chat_messages').insert({
        chat_id: currentChatId,
        sender_id: currentUser.id,
        content: content
    });
    
    if (!error) {
        input.value = '';
        loadMessages();
    }
}

// Продолжение (заказы, пополнение, вывод, профиль, админка) в следующей части...
// ======================== ЗАКАЗЫ ========================
function renderOrdersScreen() {
    if (!currentUser) { renderScreen('auth'); return; }
    
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">Мои заказы</h1></div></header>' +
        '<div class="tabs"><button class="tab active" onclick="window.switchOrderTab(\'buying\')">Покупаю</button><button class="tab" onclick="window.switchOrderTab(\'selling\')">Продаю</button></div>' +
        '<div style="flex:1;overflow-y:auto" id="ordersList"><div class="spinner"></div></div>' +
        '<nav class="bottom-nav"><button class="nav-item" onclick="window.renderScreen(\'main\')">🏠 Главная</button><button class="nav-item active">📋 Заказы</button></nav></div>';
    
    document.getElementById('app').innerHTML = html;
    loadOrders('buying');
}

function switchOrderTab(tab) {
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'buying') tabs[0].classList.add('active');
    else tabs[1].classList.add('active');
    loadOrders(tab);
}

async function loadOrders(type) {
    var query = supabase.from('service_orders')
        .select('*, service:service_id (title, game_name), buyer:buyer_id (username, handle), seller:seller_id (username, handle)')
        .order('created_at', { ascending: false });
    
    if (type === 'buying') query = query.eq('buyer_id', currentUser.id);
    else query = query.eq('seller_id', currentUser.id);
    
    var { data: orders } = await query;
    var container = document.getElementById('ordersList');
    if (!container) return;
    
    if (!orders || orders.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Нет заказов</div><div class="empty-text">' + (type === 'buying' ? 'Купите услугу в каталоге' : 'Создайте услугу для продажи') + '</div></div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < orders.length; i++) {
        var o = orders[i];
        var statusText = '';
        var statusClass = '';
        switch(o.status) {
            case 'pending': statusText = 'Ожидает'; statusClass = 'pending'; break;
            case 'in_progress': statusText = 'В работе'; statusClass = 'in_progress'; break;
            case 'completed': statusText = 'Выполнен'; statusClass = 'completed'; break;
            case 'dispute': statusText = 'Спор'; statusClass = 'dispute'; break;
            case 'cancelled': statusText = 'Отменён'; statusClass = 'cancelled'; break;
        }
        
        html += '<div class="order-card">' +
            '<div class="order-card-header"><div class="order-card-title">' + escapeHTML(o.service ? o.service.title : 'Услуга удалена') + '</div><span class="order-status ' + statusClass + '">' + statusText + '</span></div>' +
            '<div class="order-card-meta"><span>💎 ' + o.amount + ' Gems</span><span>' + (type === 'buying' ? 'Продавец: @' + (o.seller ? o.seller.handle : '?') : 'Покупатель: @' + (o.buyer ? o.buyer.handle : '?')) + '</span></div>' +
            '<div class="order-card-meta" style="margin-top:4px"><span>' + getTimeAgo(new Date(o.created_at)) + '</span></div>';
        
        if (o.status === 'pending' && type === 'selling') {
            html += '<div class="order-card-actions"><button class="btn btn-small btn-success" onclick="window.acceptOrder(\'' + o.id + '\')">Принять</button><button class="btn btn-small btn-danger" onclick="window.cancelOrder(\'' + o.id + '\')">Отклонить</button></div>';
        }
        if (o.status === 'in_progress' && type === 'selling') {
            html += '<div class="order-card-actions"><button class="btn btn-small btn-success" onclick="window.completeOrder(\'' + o.id + '\')">Отметить выполненным</button></div>';
        }
        if (o.status === 'in_progress' && type === 'buying') {
            html += '<div class="order-card-actions"><button class="btn btn-small btn-success" onclick="window.confirmOrder(\'' + o.id + '\')">Подтвердить</button><button class="btn btn-small btn-danger" onclick="window.disputeOrder(\'' + o.id + '\')">Проблема</button></div>';
        }
        if (o.status === 'pending' || o.status === 'in_progress') {
            html += '<div class="order-card-actions"><button class="btn btn-small btn-outline" onclick="window.openOrderChat(\'' + o.id + '\')">💬 Чат</button></div>';
        }
        
        html += '</div>';
    }
    container.innerHTML = html;
}

async function acceptOrder(orderId) {
    await supabase.from('service_orders').update({ status: 'in_progress' }).eq('id', orderId).eq('seller_id', currentUser.id);
    showToast('Заказ принят!', 'success');
    loadOrders('selling');
}

async function cancelOrder(orderId) {
    var { data: order } = await supabase.from('service_orders').select('*').eq('id', orderId).single();
    if (!order) return;
    
    // Возвращаем Gems покупателю
    var { data: buyerGems } = await supabase.from('gems').select('*').eq('user_id', order.buyer_id).single();
    await supabase.from('gems').update({
        balance: (buyerGems.balance || 0) + order.amount,
        frozen: Math.max((buyerGems.frozen || 0) - order.amount, 0)
    }).eq('user_id', order.buyer_id);
    
    await supabase.from('service_orders').update({ status: 'cancelled' }).eq('id', orderId);
    showToast('Заказ отклонён. Gems возвращены покупателю.', 'info');
    loadOrders('selling');
}

async function completeOrder(orderId) {
    await supabase.from('service_orders').update({ status: 'completed', seller_confirmed: true }).eq('id', orderId).eq('seller_id', currentUser.id);
    showToast('Ожидайте подтверждения покупателя', 'info');
    loadOrders('selling');
}

async function confirmOrder(orderId) {
    var { data: order } = await supabase.from('service_orders').select('*').eq('id', orderId).single();
    if (!order) return;
    
    // Размораживаем и переводим Gems продавцу
    var { data: sellerGems } = await supabase.from('gems').select('*').eq('user_id', order.seller_id).single();
    var sellerBalance = sellerGems ? (sellerGems.balance || 0) : 0;
    
    await supabase.from('gems').update({
        balance: sellerBalance + order.seller_gets,
        total_earned: (sellerGems ? (sellerGems.total_earned || 0) : 0) + order.seller_gets
    }).eq('user_id', order.seller_id);
    
    // Комиссия платформе (тебе)
    var { data: adminGems } = await supabase.from('gems').select('*').eq('user_id', currentUser.id).single();
    // Здесь можно начислить админу, но пока просто фиксируем
    
    await supabase.from('service_orders').update({ status: 'completed', buyer_confirmed: true, completed_at: new Date().toISOString() }).eq('id', orderId);
    
    // Обновляем статистику продавца
    var { data: sellerProfile } = await supabase.from('sellers').select('*').eq('user_id', order.seller_id).single();
    if (sellerProfile) {
        await supabase.from('sellers').update({
            completed_orders: (sellerProfile.completed_orders || 0) + 1,
            total_orders: (sellerProfile.total_orders || 0) + 1
        }).eq('user_id', order.seller_id);
    }
    
    // Размораживаем Gems покупателя
    await supabase.from('gems').update({
        frozen: Math.max((currentUser.frozen || 0) - order.amount, 0)
    }).eq('user_id', currentUser.id);
    
    showToast('Заказ подтверждён!', 'success');
    loadOrders('buying');
}

async function disputeOrder(orderId) {
    var reason = prompt('Опишите проблему:');
    if (!reason) return;
    await supabase.from('disputes').insert({ order_id: orderId, raised_by: currentUser.id, reason: reason });
    await supabase.from('service_orders').update({ status: 'dispute' }).eq('id', orderId);
    showToast('Спор открыт. Администратор разберётся.', 'warning');
    loadOrders('buying');
}

async function openOrderChat(orderId) {
    var { data: chat } = await supabase.from('chats').select('id').eq('order_id', orderId).single();
    if (chat) {
        currentChatId = chat.id;
        currentOrderId = orderId;
        renderScreen('chat');
    } else {
        showToast('Чат не найден', 'error');
    }
}

// ======================== ПОПОЛНЕНИЕ ========================
function renderBalanceScreen() {
    if (!currentUser) { renderScreen('auth'); return; }
    
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">Баланс</h1></div></header><div style="flex:1;overflow-y:auto">' +
        '<div class="balance-card"><div class="balance-label">ДОСТУПНО</div><div class="balance-amount">' + (currentUser.gems || 0) + ' 💎</div><div style="font-size:12px;color:var(--text-muted)">Заморожено: ' + (currentUser.frozen || 0) + ' 💎</div>' +
        '<div class="balance-actions"><button class="balance-btn deposit" onclick="window.showDepositModal()">💎 Пополнить</button><button class="balance-btn withdraw" onclick="window.showWithdrawModal()">💸 Вывести</button></div></div>' +
        '<div class="section-title">📊 История транзакций</div><div id="txList" style="padding:0 16px"><div class="spinner"></div></div></div>' +
        '<nav class="bottom-nav"><button class="nav-item" onclick="window.renderScreen(\'main\')">🏠 Главная</button><button class="nav-item" onclick="window.renderScreen(\'profile\')">👤 Профиль</button></nav></div>';
    
    document.getElementById('app').innerHTML = html;
    loadTransactions();
}

function showDepositModal() {
    var code = generateDepositCode();
    
    var content = '<div style="text-align:center">' +
        '<p style="font-size:16px;margin-bottom:12px">Пополнение баланса</p>' +
        '<p style="font-size:14px;color:var(--text-secondary);margin-bottom:8px">1 ⭐ = 1 💎</p>' +
        '<div style="background:var(--bg-input);border-radius:var(--radius-lg);padding:20px;margin:12px 0">' +
        '<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">1. Отправьте Telegram Stars пользователю:</p>' +
        '<p style="font-size:18px;font-weight:900;color:var(--accent)">' + ADMIN_USERNAME + '</p>' +
        '<p style="font-size:12px;color:var(--text-muted);margin-top:8px">2. В комментарии к переводу укажите код:</p>' +
        '<p style="font-size:20px;font-weight:900;color:var(--accent);letter-spacing:2px">' + code + '</p>' +
        '</div>' +
        '<p style="font-size:12px;color:var(--warning)">⏱ Обработка до 24 часов</p>' +
        '<p style="font-size:11px;color:var(--text-muted);margin-top:8px">После отправки, администратор проверит платёж и зачислит Gems</p>' +
        '</div>';
    
    openModal('Пополнение', content, false, null);
    
    // Сохраняем код в базу
    supabase.from('deposits').insert({
        user_id: currentUser.id,
        code: code,
        status: 'pending'
    }).then(function() {});
}

function showWithdrawModal() {
    var minWithdraw = MIN_WITHDRAW;
    
    var content = '<div style="text-align:center">' +
        '<p style="font-size:16px;margin-bottom:12px">Вывод Gems</p>' +
        '<p style="font-size:14px;color:var(--text-muted);margin-bottom:4px">Доступно: ' + (currentUser.gems || 0) + ' 💎</p>' +
        '<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Минимум: ' + minWithdraw + ' 💎</p>' +
        '<div class="form-group"><input type="number" id="withdrawAmount" class="form-input" placeholder="Сумма" min="' + minWithdraw + '" max="' + (currentUser.gems || 0) + '"></div>' +
        '<div id="withdrawCalc" style="font-size:14px;color:var(--text-secondary);margin:8px 0"></div>' +
        '<p style="font-size:11px;color:var(--text-muted)">Комиссия вывода: 5%</p>' +
        '<p style="font-size:11px;color:var(--text-muted)">Звёзды будут отправлены на ваш Telegram: ' + (currentUser.telegram || 'не указан') + '</p>' +
        '<p style="font-size:12px;color:var(--warning);margin-top:8px">⏱ Обработка до 24 часов</p>' +
        '</div>';
    
    openModal('Вывод средств', content, true, async function() {
        var amount = parseInt(document.getElementById('withdrawAmount').value);
        if (!amount || amount < minWithdraw) { showToast('Минимальная сумма: ' + minWithdraw + ' 💎', 'error'); return; }
        if (amount > (currentUser.gems || 0)) { showToast('Недостаточно средств', 'error'); return; }
        
        var commission = Math.floor(amount * WITHDRAW_COMMISSION);
        var toUser = amount - commission;
        
        await supabase.from('gems').update({ balance: (currentUser.gems || 0) - amount }).eq('user_id', currentUser.id);
        currentUser.gems -= amount;
        
        await supabase.from('withdrawals').insert({
            user_id: currentUser.id,
            amount: amount,
            commission: commission,
            to_user: toUser,
            status: 'pending'
        });
        
        showToast('Заявка на вывод создана! Ожидайте.', 'success');
        closeModal();
        renderScreen('balance');
    });
    
    // Калькулятор вывода
    setTimeout(function() {
        var input = document.getElementById('withdrawAmount');
        if (input) {
            input.oninput = function() {
                var val = parseInt(this.value) || 0;
                var comm = Math.floor(val * WITHDRAW_COMMISSION);
                var result = val - comm;
                var calc = document.getElementById('withdrawCalc');
                if (calc) calc.innerHTML = 'Вы получите: <strong>' + result + ' ⭐</strong> (комиссия: ' + comm + ' 💎)';
            };
        }
    }, 100);
}

async function loadTransactions() {
    var { data: transactions } = await supabase.from('gem_transactions')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(30);
    
    var container = document.getElementById('txList');
    if (!container) return;
    
    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет транзакций</div></div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        var iconClass = '';
        var amountClass = '';
        var prefix = '';
        
        switch(tx.type) {
            case 'deposit': iconClass = 'deposit'; amountClass = 'positive'; prefix = '+'; break;
            case 'withdraw': iconClass = 'withdraw'; amountClass = 'negative'; prefix = '-'; break;
            case 'purchase': iconClass = 'purchase'; amountClass = 'negative'; prefix = '-'; break;
            case 'sale': iconClass = 'sale'; amountClass = 'positive'; prefix = '+'; break;
            default: iconClass = 'purchase'; amountClass = 'positive'; prefix = '';
        }
        
        html += '<div class="tx-item">' +
            '<div class="tx-icon ' + iconClass + '">' + (amountClass === 'positive' ? '↓' : '↑') + '</div>' +
            '<div class="tx-info"><div class="tx-type">' + tx.reason + '</div><div class="tx-date">' + getTimeAgo(new Date(tx.created_at)) + '</div></div>' +
            '<div class="tx-amount ' + amountClass + '">' + prefix + tx.amount + ' 💎</div>' +
            '</div>';
    }
    container.innerHTML = html;
}

// ======================== ПРОФИЛЬ ========================
function renderProfileScreen() {
    if (!currentUser) { renderScreen('auth'); return; }
    
    var sellerInfo = currentUser.isSeller ? currentUser.sellerData : null;
    var rating = sellerInfo ? (sellerInfo.rating ? sellerInfo.rating.toFixed(1) : '0.0') : '0.0';
    var reviewsCount = sellerInfo ? (sellerInfo.reviews_count || 0) : 0;
    
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">Профиль</h1><button class="btn-icon" onclick="window.destroySession()">🚪</button></div></header><div style="flex:1;overflow-y:auto">' +
        '<div class="profile-header-section">' +
        '<div class="profile-avatar-wrap"><div class="profile-avatar-large">' + (currentUser.avatar_url ? '<img src="' + currentUser.avatar_url + '">' : '👤') + '</div></div>' +
        '<div class="profile-name">' + currentUser.username + '</div>' +
        '<div class="profile-role">@' + currentUser.handle + ' · ' + (currentUser.isSeller ? 'Продавец ⭐ ' + rating : 'Покупатель') + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Telegram: ' + (currentUser.telegram || 'не указан') + '</div>' +
        '</div>' +
        '<div class="profile-stats-grid">' +
        '<div class="profile-stat-item"><div class="profile-stat-value">' + (currentUser.gems || 0) + '</div><div class="profile-stat-label">Баланс</div></div>' +
        '<div class="profile-stat-item"><div class="profile-stat-value">' + (sellerInfo ? sellerInfo.completed_orders || 0 : 0) + '</div><div class="profile-stat-label">Продаж</div></div>' +
        '<div class="profile-stat-item"><div class="profile-stat-value">' + reviewsCount + '</div><div class="profile-stat-label">Отзывов</div></div>' +
        '<div class="profile-stat-item"><div class="profile-stat-value">' + (sellerInfo ? sellerInfo.rating ? sellerInfo.rating.toFixed(1) : '0' : '0') + '</div><div class="profile-stat-label">Рейтинг</div></div>' +
        '</div>' +
        '<div class="tabs"><button class="tab active" onclick="window.switchProfileTab(\'services\')">Услуги</button><button class="tab" onclick="window.switchProfileTab(\'reviews\')">Отзывы</button></div>' +
        '<div id="profileContent" style="padding:0 16px"><div class="spinner"></div></div>' +
        '</div>' +
        '<nav class="bottom-nav"><button class="nav-item" onclick="window.renderScreen(\'main\')">🏠 Главная</button><button class="nav-item" onclick="window.renderScreen(\'balance\')">💎 Баланс</button><button class="nav-item" onclick="window.renderScreen(\'orders\')">📋 Заказы</button></nav></div>';
    
    document.getElementById('app').innerHTML = html;
    loadProfileServices();
}

function switchProfileTab(tab) {
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'services') { tabs[0].classList.add('active'); loadProfileServices(); }
    else { tabs[1].classList.add('active'); loadProfileReviews(); }
}

async function loadProfileServices() {
    var { data: services } = await supabase.from('gaming_services')
        .select('*')
        .eq('seller_id', currentUser.id)
        .order('created_at', { ascending: false });
    
    var container = document.getElementById('profileContent');
    if (!container) return;
    
    if (!services || services.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет услуг</div><button class="btn btn-small btn-primary" onclick="window.renderScreen(\'create-service\')">Создать услугу</button></div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < services.length; i++) {
        var s = services[i];
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">' +
            '<div><strong>' + escapeHTML(s.title) + '</strong><br><span style="font-size:11px;color:var(--text-muted)">💎 ' + s.price + ' · ' + (s.is_active ? '✅ Активна' : '❌ Неактивна') + '</span></div>' +
            '<button class="btn btn-small btn-ghost" onclick="window.toggleService(\'' + s.id + '\')">' + (s.is_active ? 'Скрыть' : 'Показать') + '</button></div>';
    }
    container.innerHTML = html;
}

async function toggleService(serviceId) {
    var { data: service } = await supabase.from('gaming_services').select('is_active').eq('id', serviceId).single();
    await supabase.from('gaming_services').update({ is_active: !service.is_active }).eq('id', serviceId);
    loadProfileServices();
}

async function loadProfileReviews() {
    var { data: reviews } = await supabase.from('service_reviews')
        .select('*, reviewer:reviewer_id (username, avatar_url), order:order_id (created_at)')
        .eq('seller_id', currentUser.id)
        .order('created_at', { ascending: false });
    
    var container = document.getElementById('profileContent');
    if (!container) return;
    
    if (!reviews || reviews.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет отзывов</div></div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < reviews.length; i++) {
        var r = reviews[i];
        var stars = '';
        for (var j = 1; j <= 5; j++) stars += j <= r.rating ? '⭐' : '☆';
        html += '<div class="review-card"><div class="review-header"><div class="review-avatar">' + (r.reviewer && r.reviewer.avatar_url ? '<img src="' + r.reviewer.avatar_url + '">' : '') + '</div><div class="review-name">' + (r.reviewer ? r.reviewer.username : '?') + '</div><div class="review-stars">' + stars + '</div></div><div class="review-text">' + escapeHTML(r.comment || '') + '</div><div class="review-date">' + getTimeAgo(new Date(r.created_at)) + '</div></div>';
    }
    container.innerHTML = html;
}

// ======================== СОЗДАНИЕ УСЛУГИ ========================
function renderCreateService() {
    if (!currentUser) { renderScreen('auth'); return; }
    
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">Создать услугу</h1></div></header><div style="flex:1;overflow-y:auto">' +
        '<div class="create-service-form">' +
        '<div class="form-group"><label class="form-label">Название услуги</label><input type="text" id="svcTitle" class="form-input" placeholder="Например: Буст в Valorant до Diamond" maxlength="150"></div>' +
        '<div class="form-group"><label class="form-label">Категория</label><select id="svcCategory" class="form-select"><option value="boost">🚀 Буст</option><option value="farm">📈 Прокачка</option><option value="coaching">🎓 Обучение</option><option value="donate">💎 Донат</option><option value="skins">🎨 Скины</option></select></div>' +
        '<div class="form-group"><label class="form-label">Игра</label><select id="svcGame" class="form-select"></select></div>' +
        '<div class="form-group"><label class="form-label">Цена (Gems)</label><div class="price-input-wrap"><input type="number" id="svcPrice" class="form-input" placeholder="100" min="1"><span class="price-currency">💎</span></div><p class="form-hint">Вы получите 80% от цены (комиссия 20%)</p></div>' +
        '<div class="form-group"><label class="form-label">Время выполнения</label><select id="svcDelivery" class="form-select"><option value="1 час">1 час</option><option value="3 часа">3 часа</option><option value="12 часов">12 часов</option><option value="24 часа">24 часа</option><option value="По договорённости">По договорённости</option></select></div>' +
        '<div class="form-group"><label class="form-label">Описание</label><textarea id="svcDesc" class="form-textarea" placeholder="Опишите услугу подробнее..."></textarea></div>' +
        '<div class="form-group"><label class="form-label">Обложка</label><div class="image-upload" id="imageUpload" onclick="document.getElementById(\'svcImage\').click()"><div class="image-upload-icon">🖼️</div><div class="image-upload-text">Нажмите, чтобы загрузить</div></div><input type="file" id="svcImage" accept="image/*" style="display:none" onchange="window.previewImage(event)"></div>' +
        '<button class="btn btn-primary btn-large" onclick="window.createService()">✅ Опубликовать услугу</button>' +
        '</div></div></div>';
    
    document.getElementById('app').innerHTML = html;
    
    // Загружаем список игр
    supabase.from('games').select('*').order('name').then(function(r) {
        var select = document.getElementById('svcGame');
        if (select && r.data) {
            for (var i = 0; i < r.data.length; i++) {
                select.innerHTML += '<option value="' + r.data[i].id + '">' + r.data[i].name + '</option>';
            }
        }
    });
}

function previewImage(event) {
    var file = event.target.files[0];
    if (!file) return;
    selectedMediaFile = file;
    var reader = new FileReader();
    reader.onload = function(e) {
        var upload = document.getElementById('imageUpload');
        upload.innerHTML = '<img src="' + e.target.result + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"><div class="image-upload-overlay" style="opacity:1">📸 Изменить</div>';
        upload.classList.add('has-image');
    };
    reader.readAsDataURL(file);
}

async function createService() {
    if (!currentUser) { showToast('Войдите в аккаунт', 'error'); return; }
    
    // Если нет профиля продавца — создаём
    if (!currentUser.isSeller) {
        await supabase.from('sellers').insert({
            user_id: currentUser.id,
            display_name: currentUser.username,
            rating: 0,
            reviews_count: 0,
            total_orders: 0,
            completed_orders: 0
        });
        currentUser.isSeller = true;
        await supabase.from('users').update({ role: 'seller' }).eq('id', currentUser.id);
    }
    
    var title = document.getElementById('svcTitle').value.trim();
    var category = document.getElementById('svcCategory').value;
    var gameId = document.getElementById('svcGame').value;
    var price = parseInt(document.getElementById('svcPrice').value);
    var delivery = document.getElementById('svcDelivery').value;
    var desc = document.getElementById('svcDesc').value.trim();
    
    if (!title || !price) { showToast('Заполните название и цену', 'error'); return; }
    if (containsProfanity(title) || containsProfanity(desc)) { showToast('Запрещённые слова', 'error'); return; }
    
    var gameName = '';
    if (gameId) {
        var { data: game } = await supabase.from('games').select('name').eq('id', gameId).single();
        if (game) gameName = game.name;
    }
    
    // Загружаем обложку, если есть
    var imageUrl = null;
    if (selectedMediaFile) {
        var fileName = 'services/' + currentUser.id + '/' + Date.now() + '_' + selectedMediaFile.name;
        var { error: uploadError } = await supabase.storage.from('images').upload(fileName, selectedMediaFile);
        if (!uploadError) {
            var { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName);
            imageUrl = publicUrl;
        }
    }
    
    var { error } = await supabase.from('gaming_services').insert({
        seller_id: currentUser.id,
        title: filterContent(title),
        description: filterContent(desc),
        price: price,
        category: category,
        game_id: gameId || null,
        game_name: gameName,
        image_url: imageUrl,
        delivery_time: delivery
    });
    
    if (error) { showToast('Ошибка создания услуги', 'error'); return; }
    
    showToast('Услуга опубликована!', 'success');
    selectedMediaFile = null;
    renderScreen('main');
}

// ======================== АДМИН-ПАНЕЛЬ ========================
function renderAdminScreen() {
    if (!isAdmin) { showToast('Нет доступа', 'error'); renderScreen('main'); return; }
    
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">Админ-панель</h1></div></header><div style="flex:1;overflow-y:auto">' +
        '<div class="tabs"><button class="tab active" onclick="window.switchAdminTab(\'deposits\')">Пополнения</button><button class="tab" onclick="window.switchAdminTab(\'withdrawals\')">Выводы</button><button class="tab" onclick="window.switchAdminTab(\'disputes\')">Споры</button></div>' +
        '<div id="adminContent" style="padding:16px"><div class="spinner"></div></div></div></div>';
    
    document.getElementById('app').innerHTML = html;
    loadAdminDeposits();
}

function switchAdminTab(tab) {
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'deposits') { tabs[0].classList.add('active'); loadAdminDeposits(); }
    else if (tab === 'withdrawals') { tabs[1].classList.add('active'); loadAdminWithdrawals(); }
    else { tabs[2].classList.add('active'); loadAdminDisputes(); }
}

async function loadAdminDeposits() {
    var { data: deposits } = await supabase.from('deposits').select('*, user:user_id (username, handle)').order('created_at', { ascending: false }).limit(50);
    var container = document.getElementById('adminContent');
    if (!container) return;
    
    if (!deposits || deposits.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет заявок на пополнение</div></div>';
        return;
    }
    
    var html = '<h3>Заявки на пополнение</h3><p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Проверьте перевод в Telegram и подтвердите</p>';
    for (var i = 0; i < deposits.length; i++) {
        var d = deposits[i];
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg-card);border-radius:var(--radius-md);margin-bottom:8px">' +
            '<div><strong>@' + (d.user ? d.user.handle : '?') + '</strong><br><span style="font-size:11px;color:var(--text-muted)">Код: ' + (d.code || '—') + ' · ' + getTimeAgo(new Date(d.created_at)) + '</span></div>' +
            '<div style="display:flex;gap:8px;align-items:center">' +
            '<input type="number" id="depAmount_' + d.id + '" placeholder="Сумма ⭐" style="width:80px;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">' +
            '<button class="btn btn-small btn-success" onclick="window.confirmDeposit(\'' + d.id + '\', \'' + d.user_id + '\')">✓</button>' +
            '<button class="btn btn-small btn-danger" onclick="window.rejectDeposit(\'' + d.id + '\')">✕</button></div></div>';
    }
    container.innerHTML = html;
}

async function confirmDeposit(depositId, userId) {
    var amountInput = document.getElementById('depAmount_' + depositId);
    var amount = parseInt(amountInput ? amountInput.value : 0);
    if (!amount || amount <= 0) { showToast('Введите сумму', 'error'); return; }
    
    var { data: userGems } = await supabase.from('gems').select('*').eq('user_id', userId).single();
    var currentBalance = userGems ? (userGems.balance || 0) : 0;
    
    await supabase.from('gems').update({ balance: currentBalance + amount, total_earned: (userGems ? (userGems.total_earned || 0) : 0) + amount }).eq('user_id', userId);
    await supabase.from('deposits').update({ status: 'completed', amount: amount }).eq('id', depositId);
    await supabase.from('gem_transactions').insert({ user_id: userId, amount: amount, type: 'deposit', reason: 'Пополнение баланса' });
    await supabase.from('notifications').insert({ user_id: userId, type: 'deposit', title: 'Баланс пополнен!', message: 'Зачислено ' + amount + ' 💎' });
    
    showToast('Пополнение подтверждено!', 'success');
    loadAdminDeposits();
}

async function rejectDeposit(depositId) {
    await supabase.from('deposits').update({ status: 'rejected' }).eq('id', depositId);
    showToast('Заявка отклонена', 'info');
    loadAdminDeposits();
}

async function loadAdminWithdrawals() {
    var { data: withdrawals } = await supabase.from('withdrawals').select('*, user:user_id (username, handle, telegram)').order('created_at', { ascending: false }).limit(50);
    var container = document.getElementById('adminContent');
    if (!container) return;
    
    if (!withdrawals || withdrawals.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет заявок на вывод</div></div>';
        return;
    }
    
    var html = '<h3>Заявки на вывод</h3><p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Отправьте звёзды пользователю и подтвердите</p>';
    for (var i = 0; i < withdrawals.length; i++) {
        var w = withdrawals[i];
        html += '<div style="padding:10px;background:var(--bg-card);border-radius:var(--radius-md);margin-bottom:8px">' +
            '<div style="display:flex;justify-content:space-between"><strong>@' + (w.user ? w.user.handle : '?') + '</strong><span style="color:var(--accent)">' + w.to_user + ' ⭐</span></div>' +
            '<div style="font-size:11px;color:var(--text-muted)">Telegram: ' + (w.user ? w.user.telegram : '?') + ' · Комиссия: ' + w.commission + ' 💎</div>' +
            '<div style="margin-top:6px">' +
            '<button class="btn btn-small btn-success" onclick="window.confirmWithdrawal(\'' + w.id + '\')">✅ Отправлено</button>' +
            '<button class="btn btn-small btn-danger" onclick="window.rejectWithdrawal(\'' + w.id + '\', \'' + w.user_id + '\', ' + w.amount + ')">❌ Отклонить</button></div></div>';
    }
    container.innerHTML = html;
}

async function confirmWithdrawal(withdrawalId) {
    await supabase.from('withdrawals').update({ status: 'completed' }).eq('id', withdrawalId);
    showToast('Вывод подтверждён!', 'success');
    loadAdminWithdrawals();
}

async function rejectWithdrawal(withdrawalId, userId, amount) {
    var { data: userGems } = await supabase.from('gems').select('*').eq('user_id', userId).single();
    await supabase.from('gems').update({ balance: (userGems ? (userGems.balance || 0) : 0) + amount }).eq('user_id', userId);
    await supabase.from('withdrawals').update({ status: 'rejected' }).eq('id', withdrawalId);
    showToast('Вывод отклонён. Gems возвращены.', 'info');
    loadAdminWithdrawals();
}

async function loadAdminDisputes() {
    var { data: disputes } = await supabase.from('disputes').select('*, order:order_id (*, buyer:buyer_id (username), seller:seller_id (username)), raised_by_user:raised_by (username)').order('created_at', { ascending: false });
    var container = document.getElementById('adminContent');
    if (!container) return;
    
    if (!disputes || disputes.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет споров</div></div>';
        return;
    }
    
    var html = '<h3>Споры</h3>';
    for (var i = 0; i < disputes.length; i++) {
        var d = disputes[i];
        html += '<div style="padding:10px;background:var(--bg-card);border-radius:var(--radius-md);margin-bottom:8px">' +
            '<strong>Заказ #' + d.order_id + '</strong><br>' +
            '<span style="font-size:12px">От: @' + (d.raised_by_user ? d.raised_by_user.username : '?') + '</span><br>' +
            '<span style="font-size:12px">Причина: ' + escapeHTML(d.reason) + '</span><br>' +
            '<div style="margin-top:6px"><button class="btn btn-small btn-success" onclick="window.resolveDispute(\'' + d.id + '\', \'buyer\')">Вернуть покупателю</button>' +
            '<button class="btn btn-small btn-primary" onclick="window.resolveDispute(\'' + d.id + '\', \'seller\')">Продавцу</button></div></div>';
    }
    container.innerHTML = html;
}

async function resolveDispute(disputeId, side) {
    var { data: dispute } = await supabase.from('disputes').select('*').eq('id', disputeId).single();
    if (!dispute) return;
    
    var { data: order } = await supabase.from('service_orders').select('*').eq('id', dispute.order_id).single();
    if (!order) return;
    
    if (side === 'buyer') {
        var { data: buyerGems } = await supabase.from('gems').select('*').eq('user_id', order.buyer_id).single();
        await supabase.from('gems').update({
            balance: (buyerGems ? (buyerGems.balance || 0) : 0) + order.amount,
            frozen: Math.max((buyerGems ? (buyerGems.frozen || 0) : 0) - order.amount, 0)
        }).eq('user_id', order.buyer_id);
        await supabase.from('service_orders').update({ status: 'cancelled' }).eq('id', order.id);
    } else {
        var { data: sellerGems } = await supabase.from('gems').select('*').eq('user_id', order.seller_id).single();
        await supabase.from('gems').update({ balance: (sellerGems ? (sellerGems.balance || 0) : 0) + order.seller_gets }).eq('user_id', order.seller_id);
        await supabase.from('service_orders').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', order.id);
    }
    
    await supabase.from('disputes').update({ status: 'resolved', resolved_by: currentUser.id, resolution: side, resolved_at: new Date().toISOString() }).eq('id', disputeId);
    showToast('Спор разрешён', 'success');
    loadAdminDisputes();
}

// ======================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ========================
function getTimeAgo(date) {
    var sec = Math.floor((new Date() - date) / 1000);
    if (sec < 60) return 'сейчас';
    var min = Math.floor(sec / 60); if (min < 60) return min + ' мин.';
    var hr = Math.floor(min / 60); if (hr < 24) return hr + ' ч.';
    var d = Math.floor(hr / 24); if (d < 7) return d + ' д.';
    return date.toLocaleDateString();
}

// ======================== ПРАВИЛА И ПРИВАТНОСТЬ ========================
function renderRulesScreen() {
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.goBack()">←</button><h1 class="topbar-title">Правила</h1></div></header><div style="flex:1;overflow-y:auto"><div class="legal-page">' +
        '<h1>Условия использования NobuSumer</h1><p class="last-updated">Последнее обновление: 26.07.2026</p>' +
        '<h2>1. Общие положения</h2><p>NobuSumer — платформа для размещения и заказа игровых услуг. Платформа является посредником и не оказывает услуги самостоятельно.</p>' +
        '<h2>2. Возрастные ограничения</h2><p>Минимальный возраст: 13 лет. Если вам меньше — покиньте платформу. Администрация не несёт ответственности за пользователей, указавших ложный возраст.</p>' +
        '<h2>3. Продавцы и покупатели</h2><p>Продавец обязуется выполнить заказ в указанный срок. Покупатель обязуется подтвердить выполнение. Все переговоры только через чат платформы.</p>' +
        '<h2>4. Комиссии</h2><p>Платформа взимает 20% с каждого заказа и 5% с вывода средств. Буст объявления: 15 ⭐ (доступен от 10 отзывов).</p>' +
        '<h2>5. Ограничение ответственности</h2><p>Платформа не несёт ответственности за качество услуг, задержки, блокировку аккаунтов в играх. Сделки за пределами платформы запрещены — нарушители блокируются.</p>' +
        '<h2>6. Споры</h2><p>Споры решаются администрацией. Решение администрации окончательное.</p>' +
        '</div></div></div>';
    document.getElementById('app').innerHTML = html;
}

function renderPrivacyScreen() {
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.goBack()">←</button><h1 class="topbar-title">Конфиденциальность</h1></div></header><div style="flex:1;overflow-y:auto"><div class="legal-page">' +
        '<h1>Политика конфиденциальности</h1><p class="last-updated">Последнее обновление: 26.07.2026</p>' +
        '<h2>1. Сбор данных</h2><p>Мы собираем: email, имя пользователя, handle, Telegram username, хешированный пароль (SHA-256 + соль). Платёжные данные не хранятся — все расчёты в Telegram Stars.</p>' +
        '<h2>2. Использование данных</h2><p>Данные используются исключительно для работы платформы: авторизация, отображение профиля, история заказов.</p>' +
        '<h2>3. Передача третьим лицам</h2><p>Данные НЕ передаются третьим лицам.</p>' +
        '<h2>4. Защита</h2><p>Пароли хешируются SHA-256 + уникальная соль. Передача данных — HTTPS.</p>' +
        '<h2>5. Права пользователя</h2><p>Вы можете запросить удаление аккаунта — все данные будут безвозвратно удалены.</p>' +
        '</div></div></div>';
    document.getElementById('app').innerHTML = html;
}

// ======================== ЗАПУСК ========================
renderScreen('loading');