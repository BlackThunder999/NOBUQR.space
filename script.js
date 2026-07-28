// ============================================
// NobuSocial - Complete JavaScript Application
// ============================================

// Supabase Configuration
var SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
var SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase = null;

// Application State
var currentUser = null;
var currentSession = null;
var currentScreen = 'auth';
var currentProfileUser = null;
var currentChirp = null;
var currentChat = null;
var currentChatUser = null;
var feedTab = 'latest';
var feedPage = 1;
var feedLoading = false;
var feedEnded = false;
var searchQuery = '';
var searchTimeout = null;
var notifications = [];
var chatsList = [];
var isSupabaseReady = false;

// Initialize Supabase when loaded
function initSupabase() {
    if (window.Supabase && window.Supabase.createClient) {
        supabase = window.Supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        isSupabaseReady = true;
        init();
    } else {
        setTimeout(initSupabase, 500);
    }
}

// Initialize the application
function init() {
    if (!isSupabaseReady) return;
    cacheDOMElements();
    setupEventListeners();
    checkSession();
    setupRealtimeSubscriptions();
}

// Cache DOM elements
function cacheDOMElements() {
    window.appElement = document.getElementById('app');
    window.mainContentElement = document.getElementById('main-content');
    window.bottomNavElement = document.getElementById('bottom-nav');
    window.toastContainerElement = document.getElementById('toast-container');
    window.loadingOverlayElement = document.getElementById('loading-overlay');
    window.headerElement = document.getElementById('header');
}

// Setup event listeners
function setupEventListeners() {
    window.onpopstate = function(event) {
        if (event.state && event.state.screen) {
            navigateTo(event.state.screen, { skipHistory: true });
        }
    };
}

// Show loading overlay
function showLoading() {
    if (window.loadingOverlayElement) {
        window.loadingOverlayElement.classList.remove('hidden');
    }
}

// Hide loading overlay
function hideLoading() {
    if (window.loadingOverlayElement) {
        window.loadingOverlayElement.classList.add('hidden');
    }
}

// Show toast notification
function showToast(message, type) {
    type = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    window.toastContainerElement.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3000);
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    var map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'};
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Sanitize HTML
function sanitizeHTML(text) {
    if (!text) return '';
    text = escapeHtml(text);
    text = text.replace(/\@([\w]+)/g, '<span class="mention">@$1</span>');
    text = text.replace(/\#([\w]+)/g, '<span class="hashtag">#$1</span>');
    text = text.replace(/\n/g, '<br>');
    return text;
}

// Filter profanity
function filterProfanity(text) {
    if (!text) return '';
    var profanityList = ['хуй', 'пизда', 'ебать', 'блядь', 'сука', 'залупа', 'пиздец', 'говно', 'мудак'];
    var filtered = text;
    profanityList.forEach(function(word) {
        var regex = new RegExp(word, 'gi');
        filtered = filtered.replace(regex, '*'.repeat(word.length));
    });
    return filtered;
}

// Validate email
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate username
function isValidUsername(username) {
    return /^[a-zA-Z0-9_.]+$/.test(username) && username.length >= 3 && username.length <= 50;
}

// Generate default avatar
function getDefaultAvatar(username) {
    var colors = ['#7c4dff', '#5a3dff', '#9d7dff', '#4caf50', '#f44336', '#2196f3', '#ff9800'];
    var index = username.charCodeAt(0) % colors.length;
    return 'https://via.placeholder.com/100x100/' + colors[index] + '/ffffff?text=' + username.charAt(0).toUpperCase();
}

// Generate random salt
function generateSalt() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Hash password with SHA-256
function hashPassword(password, salt) {
    var encoder = new TextEncoder();
    var data = encoder.encode(password + salt);
    return window.crypto.subtle.digest('SHA-256', data).then(function(hash) {
        return Array.from(new Uint8Array(hash)).map(function(b) {
            return b.toString(16).padStart(2, '0');
        }).join('');
    });
}

// Get time ago
function getTimeAgo(dateString) {
    var date = new Date(dateString);
    var now = new Date();
    var seconds = Math.floor((now - date) / 1000);
    var intervals = {'год': 31536000, 'месяц': 2592000, 'неделя': 604800, 'день': 86400, 'час': 3600, 'минута': 60};
    for (var interval in intervals) {
        var count = Math.floor(seconds / intervals[interval]);
        if (count >= 1) {
            return count + ' ' + interval + (count > 1 ? 'а' : '') + ' назад';
        }
    }
    return 'Только что';
}

// Check session
function checkSession() {
    var sessionData = localStorage.getItem('nobuSession');
    if (sessionData) {
        try {
            currentSession = JSON.parse(sessionData);
            var sessionAge = Date.now() - currentSession.timestamp;
            var sessionExpiry = 24 * 60 * 60 * 1000;
            if (sessionAge < sessionExpiry) {
                currentUser = currentSession.user;
                loadUserData(currentUser.id);
                navigateTo('home');
                return;
            }
        } catch (error) {
            console.error('Session error:', error);
        }
    }
    showScreen('auth');
    updateBottomNavVisibility();
}

// Load user data
function loadUserData(userId) {
    if (!supabase) { showToast('Supabase не загружен', 'error'); return; }
    showLoading();
    supabase.from('users').select('*').eq('id', userId).single()
        .then(function(response) {
            hideLoading();
            if (response.error) {
                showToast('Ошибка загрузки данных: ' + response.error.message, 'error');
                return;
            }
            currentUser = response.data;
            updateHeader();
            loadNotifications();
            loadChatsList();
            setupRealtimeSubscriptions();
        })
        .catch(function(error) {
            hideLoading();
            showToast('Ошибка: ' + error.message, 'error');
        });
}

// Update header
function updateHeader() {
    if (!currentUser) return;
    var pageTitle = document.getElementById('page-title');
    if (currentScreen === 'profile' && currentProfileUser && currentProfileUser.id === currentUser.id) {
        pageTitle.textContent = 'Мой профиль';
    } else if (currentScreen === 'profile' && currentProfileUser) {
        pageTitle.textContent = currentProfileUser.display_name || currentProfileUser.username;
    } else if (currentScreen === 'chat') {
        pageTitle.textContent = currentChatUser ? (currentChatUser.display_name || currentChatUser.username) : 'Чат';
    } else if (currentScreen === 'view-chirp') {
        pageTitle.textContent = 'Чирп';
    } else {
        var titles = {'home': 'NobuSocial', 'search': 'Поиск', 'create': 'Создать chirp', 'notifications': 'Уведомления', 'settings': 'Настройки', 'edit-profile': 'Редактировать профиль', 'admin': 'Админ-панель', 'chats-list': 'Чаты'};
        pageTitle.textContent = titles[currentScreen] || 'NobuSocial';
    }
}

// Navigate to screen
function navigateTo(screenName, options) {
    options = options || {};
    var screens = document.querySelectorAll('.screen');
    screens.forEach(function(screen) { screen.classList.remove('active'); });
    currentScreen = screenName;
    var screenElement = document.getElementById(screenName + '-screen');
    if (screenElement) { screenElement.classList.add('active'); }
    updateHeader();
    updateBottomNavVisibility();
    switch (screenName) {
        case 'home': loadFeed('latest'); break;
        case 'search': document.getElementById('search-input').value = ''; document.getElementById('search-results').innerHTML = ''; break;
        case 'create': resetCreateForm(); break;
        case 'profile': if (options.userId) { loadProfile(options.userId); } else if (currentUser) { loadProfile(currentUser.id); } break;
        case 'notifications': loadNotifications(); break;
        case 'settings': break;
        case 'edit-profile': populateEditProfileForm(); break;
        case 'admin': if (currentUser && currentUser.is_admin) { loadAdminStats(); } else { navigateTo('home'); showToast('Доступ запрещен', 'error'); } break;
        case 'chats-list': loadChatsList(); break;
    }
    if (!options.skipHistory) {
        window.history.pushState({ screen: screenName, options: options }, '', '#' + screenName);
    }
}

// Go back
function goBack() { window.history.back(); }

// Show screen
function showScreen(screenName) { navigateTo(screenName); }

// Update bottom nav visibility
function updateBottomNavVisibility() {
    if (!window.bottomNavElement) return;
    var hideNavScreens = ['auth', 'view-chirp', 'chat', 'edit-profile', 'settings', 'admin'];
    if (hideNavScreens.indexOf(currentScreen) !== -1 || !currentUser) {
        window.bottomNavElement.style.display = 'none';
    } else {
        window.bottomNavElement.style.display = 'flex';
    }
    var navItems = window.bottomNavElement.querySelectorAll('.nav-item');
    navItems.forEach(function(item) { item.classList.remove('active'); });
    var screenMap = {'home': 0, 'search': 1, 'create': 2, 'chats-list': 3, 'profile': 4};
    if (screenMap[currentScreen] !== undefined) {
        navItems[screenMap[currentScreen]].classList.add('active');
    }
}

// Switch auth tab
function switchAuthTab(tab) {
    var loginTab = document.getElementById('login-tab');
    var registerTab = document.getElementById('register-tab');
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');
    if (tab === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    } else {
        loginTab.classList.remove('active');
        registerTab.classList.add('active');
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
    }
}

// Handle login
function handleLogin(event) {
    if (event) event.preventDefault();
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    if (!email || !password) { showToast('Заполните все поля', 'error'); return; }
    if (!isValidEmail(email)) { showToast('Неверный email', 'error'); return; }
    showLoading();
    supabase.from('users').select('*').eq('email', email).single()
        .then(function(response) {
            if (response.error || !response.data) {
                hideLoading();
                showToast('Пользователь не найден', 'error');
                return;
            }
            var user = response.data;
            if (user.is_banned) {
                hideLoading();
                showToast('Аккаунт заблокирован: ' + (user.banned_reason || ''), 'error');
                return;
            }
            return hashPassword(password, user.password_salt).then(function(hashedPassword) {
                if (hashedPassword === user.password_hash) {
                    currentUser = user;
                    currentSession = { user: user, timestamp: Date.now() };
                    localStorage.setItem('nobuSession', JSON.stringify(currentSession));
                    hideLoading();
                    loadUserData(user.id);
                    navigateTo('home');
                    showToast('Добро пожаловать, ' + user.display_name + '!', 'success');
                } else {
                    hideLoading();
                    showToast('Неверный пароль', 'error');
                }
            });
        })
        .catch(function(error) {
            hideLoading();
            showToast('Ошибка входа: ' + error.message, 'error');
        });
}

// Handle register
function handleRegister(event) {
    if (event) event.preventDefault();
    var username = document.getElementById('reg-username').value.trim();
    var email = document.getElementById('reg-email').value.trim();
    var password = document.getElementById('reg-password').value;
    var displayName = document.getElementById('reg-display-name').value.trim() || username;
    if (!username || !email || !password) { showToast('Заполните все поля', 'error'); return; }
    if (!isValidEmail(email)) { showToast('Неверный email', 'error'); return; }
    if (!isValidUsername(username)) { showToast('Неверное имя пользователя', 'error'); return; }
    if (password.length < 6) { showToast('Пароль должен быть не менее 6 символов', 'error'); return; }
    showLoading();
    var usernameCheck = supabase.from('users').select('id').eq('username', username).single();
    var emailCheck = supabase.from('users').select('id').eq('email', email).single();
    Promise.all([usernameCheck, emailCheck])
        .then(function(results) {
            if (results[0].data) { hideLoading(); showToast('Имя пользователя занято', 'error'); return; }
            if (results[1].data) { hideLoading(); showToast('Email уже используется', 'error'); return; }
            var salt = generateSalt();
            return hashPassword(password, salt).then(function(hashedPassword) {
                var newUser = {
                    username: username,
                    email: email,
                    password_hash: hashedPassword,
                    password_salt: salt,
                    display_name: displayName,
                    bio: '',
                    avatar_url: getDefaultAvatar(username),
                    banner_url: '',
                    website: '',
                    location: '',
                    is_admin: false,
                    is_banned: false
                };
                return supabase.from('users').insert(newUser).select().single();
            });
        })
        .then(function(response) {
            hideLoading();
            if (response.error) { showToast('Ошибка регистрации: ' + response.error.message, 'error'); return; }
            showToast('Регистрация успешна!', 'success');
            switchAuthTab('login');
        })
        .catch(function(error) {
            hideLoading();
            showToast('Ошибка: ' + error.message, 'error');
        });
}

// Logout
function logout() {
    currentUser = null;
    currentSession = null;
    localStorage.removeItem('nobuSession');
    var screens = document.querySelectorAll('.screen');
    screens.forEach(function(screen) { screen.classList.remove('active'); });
    showScreen('auth');
    updateBottomNavVisibility();
    showToast('Вы вышли из аккаунта', 'success');
    currentProfileUser = null;
    currentChirp = null;
    currentChat = null;
    feedPage = 1;
    feedEnded = false;
}

// Switch feed tab
function switchFeedTab(tab) {
    feedTab = tab;
    feedPage = 1;
    feedEnded = false;
    var tabs = document.querySelectorAll('.feed-tab');
    tabs.forEach(function(tabElement) { tabElement.classList.remove('active'); });
    event.target.classList.add('active');
    loadFeed(tab);
}

// Load feed
function loadFeed(tab) {
    if (feedLoading || feedEnded) return;
    feedLoading = true;
    var feedContainer = document.getElementById('feed-content');
    var loader = document.getElementById('feed-loader');
    if (feedPage === 1) { feedContainer.innerHTML = ''; }
    loader.style.display = 'flex';
    var query = supabase.from('chirps').select('*, users(*)').order('created_at', { ascending: false });
    switch (tab) {
        case 'popular':
            query = supabase.from('chirps').select('*, users(*)').order('like_count', { ascending: false }).order('created_at', { ascending: false });
            break;
        case 'following':
            if (currentUser) {
                query = supabase.from('chirps').select('*, users(*)').in('user_id', supabase.from('follows').select('following_id').eq('follower_id', currentUser.id)).order('created_at', { ascending: false });
            }
            break;
    }
    query.range((feedPage - 1) * 20, feedPage * 20 - 1)
        .then(function(response) {
            feedLoading = false;
            loader.style.display = 'none';
            if (response.error) { showToast('Ошибка загрузки: ' + response.error.message, 'error'); return; }
            var chirps = response.data;
            if (chirps.length === 0) {
                if (feedPage === 1) {
                    feedContainer.innerHTML = '<div class="empty-state"><i class="fas fa-feather-alt"></i><h3>Нет chirпов</h3><p>Будьте первым!</p></div>';
                }
                feedEnded = true;
                return;
            }
            chirps.forEach(function(chirp) { renderChirp(chirp, feedContainer); });
            feedPage++;
            if (feedPage === 2) {
                mainContentElement.addEventListener('scroll', handleFeedScroll);
            }
        })
        .catch(function(error) {
            feedLoading = false;
            loader.style.display = 'none';
            showToast('Ошибка: ' + error.message, 'error');
        });
}

// Handle feed scroll
function handleFeedScroll() {
    if (feedLoading || feedEnded) return;
    var scrollTop = mainContentElement.scrollTop;
    var scrollHeight = mainContentElement.scrollHeight;
    var clientHeight = mainContentElement.clientHeight;
    if (scrollTop + clientHeight > scrollHeight - 100) { loadFeed(feedTab); }
}

// Render chirp
function renderChirp(chirp, container) {
    var user = chirp.users || chirp.user;
    var timeAgo = getTimeAgo(chirp.created_at);
    var displayName = user.display_name || user.username;
    var username = '@' + user.username;
    var content = sanitizeHTML(chirp.content);
    var chirpElement = document.createElement('div');
    chirpElement.className = 'chirp-card';
    chirpElement.dataset.chirpId = chirp.id;
    chirpElement.innerHTML = '<div class="chirp-header">' +
        '<img src="' + (user.avatar_url || getDefaultAvatar(user.username)) + '" alt="Avatar" class="chirp-avatar" onclick="navigateTo(\'profile\', { userId: \'' + user.id + '\' })">' +
        '<div class="chirp-user-info" onclick="navigateTo(\'profile\', { userId: \'' + user.id + '\' })">' +
        '<h4>' + escapeHtml(displayName) + '</h4>' +
        '<p>' + escapeHtml(username) + '</p>' +
        '</div>' +
        '<span class="chirp-time">' + escapeHtml(timeAgo) + '</span>' +
        '</div>' +
        '<div class="chirp-content"><p class="chirp-text">' + content + '</p></div>';
    if (chirp.media_url) {
        var mediaHtml = chirp.media_type === 'video' ?
            '<video src="' + escapeHtml(chirp.media_url) + '" controls></video>' :
            '<img src="' + escapeHtml(chirp.media_url) + '" alt="Chirp image">';
        chirpElement.innerHTML += '<div class="chirp-media">' + mediaHtml + '</div>';
    }
    chirpElement.innerHTML += '<div class="chirp-stats">' +
        '<div class="chirp-stat"><i class="far fa-heart"></i> <span>' + chirp.like_count + '</span></div>' +
        '<div class="chirp-stat"><i class="fas fa-retweet"></i> <span>' + chirp.rechirp_count + '</span></div>' +
        '<div class="chirp-stat"><i class="far fa-comment"></i> <span>' + chirp.comment_count + '</span></div>' +
        '<div class="chirp-stat"><i class="far fa-eye"></i> <span>' + chirp.view_count + '</span></div>' +
        '</div>' +
        '<div class="chirp-actions">' +
        '<button class="chirp-action like-btn" onclick="likeChirp(\'' + chirp.id + '\', this)"><i class="far fa-heart" id="like-icon-' + chirp.id + '"></i> <span>Лайк</span></button>' +
        '<button class="chirp-action" onclick="showComments(\'' + chirp.id + '\')"><i class="far fa-comment"></i> <span>Комментировать</span></button>' +
        '<button class="chirp-action" onclick="rechirp(\'' + chirp.id + '\')"><i class="fas fa-retweet"></i> <span>Речирп</span></button>' +
        '<button class="chirp-action more-btn" onclick="showChirpActions(\'' + chirp.id + '\', event)"><i class="fas fa-ellipsis-h"></i></button>' +
        '</div>';
    chirpElement.onclick = function(event) {
        if (!event.target.closest('.chirp-action') && !event.target.closest('.chirp-avatar') && !event.target.closest('.chirp-user-info')) {
            viewChirp(chirp.id);
        }
    };
    container.appendChild(chirpElement);
    if (currentUser) {
        supabase.from('likes').select('id').eq('user_id', currentUser.id).eq('chirp_id', chirp.id).single()
            .then(function(response) {
                if (response.data) {
                    document.getElementById('like-icon-' + chirp.id).className = 'fas fa-heart';
                }
            });
    }
}

// Like chirp
function likeChirp(chirpId, buttonElement) {
    if (!currentUser) { showToast('Авторизуйтесь', 'error'); return; }
    var isLiked = document.getElementById('like-icon-' + chirpId).classList.contains('fas');
    if (isLiked) {
        supabase.from('likes').delete().eq('user_id', currentUser.id).eq('chirp_id', chirpId)
            .then(function(response) {
                if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
                document.getElementById('like-icon-' + chirpId).className = 'far fa-heart';
                var likeCount = buttonElement.closest('.chirp-actions').previousElementSibling.querySelector('.chirp-stat:first-child span');
                if (likeCount) { likeCount.textContent = parseInt(likeCount.textContent) - 1; }
                showToast('Лайк удален', 'success');
            });
    } else {
        supabase.from('likes').insert({ user_id: currentUser.id, chirp_id: chirpId })
            .then(function(response) {
                if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
                document.getElementById('like-icon-' + chirpId).className = 'fas fa-heart';
                var likeCount = buttonElement.closest('.chirp-actions').previousElementSibling.querySelector('.chirp-stat:first-child span');
                if (likeCount) { likeCount.textContent = parseInt(likeCount.textContent) + 1; }
                supabase.from('chirps').select('user_id').eq('id', chirpId).single()
                    .then(function(chirpResponse) {
                        if (chirpResponse.data && chirpResponse.data.user_id !== currentUser.id) {
                            supabase.from('notifications').insert({
                                recipient_id: chirpResponse.data.user_id,
                                sender_id: currentUser.id,
                                notification_type: 'like',
                                chirp_id: chirpId
                            });
                        }
                    });
                showToast('Лайк добавлен', 'success');
            });
    }
}

// View chirp
function viewChirp(chirpId) {
    supabase.from('chirps').select('*, users(*)').eq('id', chirpId).single()
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            currentChirp = response.data;
            renderChirpDetail(currentChirp);
            navigateTo('view-chirp');
            supabase.from('chirps').update({ view_count: currentChirp.view_count + 1 }).eq('id', chirpId);
        });
}

// Render chirp detail
function renderChirpDetail(chirp) {
    var user = chirp.users || chirp.user;
    var displayName = user.display_name || user.username;
    var username = '@' + user.username;
    var timeAgo = getTimeAgo(chirp.created_at);
    var content = sanitizeHTML(chirp.content);
    document.getElementById('chirp-avatar').src = user.avatar_url || getDefaultAvatar(user.username);
    document.getElementById('chirp-display-name').textContent = escapeHtml(displayName);
    document.getElementById('chirp-username').textContent = escapeHtml(username);
    document.getElementById('chirp-text').innerHTML = content;
    document.getElementById('chirp-likes').textContent = chirp.like_count;
    document.getElementById('chirp-rechirps').textContent = chirp.rechirp_count;
    document.getElementById('chirp-comments').textContent = chirp.comment_count;
    document.getElementById('chirp-views').textContent = chirp.view_count + 1;
    var mediaContainer = document.getElementById('chirp-media');
    mediaContainer.innerHTML = '';
    if (chirp.media_url) {
        mediaContainer.innerHTML = chirp.media_type === 'video' ?
            '<video src="' + escapeHtml(chirp.media_url) + '" controls id="chirp-video"></video>' :
            '<img src="' + escapeHtml(chirp.media_url) + '" alt="Chirp image" id="chirp-image">';
    }
    loadComments(chirp.id);
    if (currentUser) {
        supabase.from('likes').select('id').eq('user_id', currentUser.id).eq('chirp_id', chirp.id).single()
            .then(function(response) {
                document.getElementById('like-icon').className = response.data ? 'fas fa-heart' : 'far fa-heart';
            });
    }
}

// Load comments
function loadComments(chirpId) {
    supabase.from('chirps').select('*, users(*)').eq('original_chirp_id', chirpId).order('created_at', { ascending: true })
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            var commentsList = document.getElementById('comments-list');
            commentsList.innerHTML = '';
            if (response.data.length === 0) {
                commentsList.innerHTML = '<p class="text-muted text-center p-sm">Нет комментариев</p>';
                return;
            }
            response.data.forEach(function(comment) { renderComment(comment, commentsList); });
        });
}

// Render comment
function renderComment(comment, container) {
    var user = comment.users || comment.user;
    var displayName = user.display_name || user.username;
    var username = '@' + user.username;
    var timeAgo = getTimeAgo(comment.created_at);
    var content = sanitizeHTML(comment.content);
    var commentElement = document.createElement('div');
    commentElement.className = 'comment';
    commentElement.innerHTML = '<img src="' + (user.avatar_url || getDefaultAvatar(user.username)) + '" alt="Avatar" class="comment-avatar" onclick="navigateTo(\'profile\', { userId: \'' + user.id + '\' })">' +
        '<div class="comment-content">' +
        '<div class="comment-header">' +
        '<h5 onclick="navigateTo(\'profile\', { userId: \'' + user.id + '\' })">' + escapeHtml(displayName) + '</h5>' +
        '<span>' + escapeHtml(username) + ' • ' + escapeHtml(timeAgo) + '</span>' +
        '</div>' +
        '<p class="comment-text">' + content + '</p>' +
        '</div>';
    container.appendChild(commentElement);
}

// Show comments
function showComments(chirpId) {
    viewChirp(chirpId);
    setTimeout(function() {
        var commentsSection = document.getElementById('chirp-comments');
        if (commentsSection) { commentsSection.scrollIntoView({ behavior: 'smooth' }); }
    }, 100);
}

// Add comment
function addComment() {
    if (!currentUser) { showToast('Авторизуйтесь', 'error'); return; }
    var content = document.getElementById('comment-input').value.trim();
    if (!content) { showToast('Введите комментарий', 'error'); return; }
    if (content.length > 280) { showToast('Слишком длинный комментарий', 'error'); return; }
    content = filterProfanity(content);
    content = sanitizeHTML(content);
    supabase.from('chirps').insert({
        user_id: currentUser.id,
        content: content,
        original_chirp_id: currentChirp.id,
        is_rechirp: false
    })
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            document.getElementById('comment-input').value = '';
            supabase.from('chirps').update({ comment_count: currentChirp.comment_count + 1 }).eq('id', currentChirp.id);
            currentChirp.comment_count++;
            document.getElementById('chirp-comments').textContent = currentChirp.comment_count;
            loadComments(currentChirp.id);
            if (currentChirp.user_id !== currentUser.id) {
                supabase.from('notifications').insert({
                    recipient_id: currentChirp.user_id,
                    sender_id: currentUser.id,
                    notification_type: 'comment',
                    chirp_id: currentChirp.id
                });
            }
            showToast('Комментарий добавлен', 'success');
        });
}

// Rechirp
function rechirp(chirpId) {
    if (!currentUser) { showToast('Авторизуйтесь', 'error'); return; }
    showLoading();
    supabase.from('chirps').select('content, user_id').eq('id', chirpId).single()
        .then(function(response) {
            if (response.error) { hideLoading(); showToast('Ошибка: ' + response.error.message, 'error'); return; }
            supabase.from('chirps').insert({
                user_id: currentUser.id,
                content: 'Rechirped',
                original_chirp_id: chirpId,
                is_rechirp: true
            })
                .then(function(insertResponse) {
                    hideLoading();
                    if (insertResponse.error) { showToast('Ошибка: ' + insertResponse.error.message, 'error'); return; }
                    supabase.from('chirps').update({ rechirp_count: response.data.rechirp_count + 1 }).eq('id', chirpId);
                    showToast('Речирп добавлен', 'success');
                    feedPage = 1; feedEnded = false; loadFeed(feedTab);
                    navigateTo('home');
                    if (response.data.user_id !== currentUser.id) {
                        supabase.from('notifications').insert({
                            recipient_id: response.data.user_id,
                            sender_id: currentUser.id,
                            notification_type: 'rechirp',
                            chirp_id: chirpId
                        });
                    }
                });
        });
}

// Show chirp actions
function showChirpActions(chirpId, event) {
    if (event) event.stopPropagation();
    var isOwn = currentUser && currentChirp && currentChirp.user_id === currentUser.id;
    var actions = isOwn ?
        [{ icon: 'fa-edit', text: 'Редактировать', action: 'editChirp(\'' + chirpId + '\')' },
         { icon: 'fa-trash', text: 'Удалить', action: 'deleteChirp(\'' + chirpId + '\')', danger: true }] :
        [{ icon: 'fa-flag', text: 'Пожаловаться', action: 'reportChirp(\'' + chirpId + '\')' },
         { icon: 'fa-share', text: 'Поделиться', action: 'shareChirp(\'' + chirpId + '\')' }];
    showActionSheet(actions);
}

// Edit chirp
function editChirp(chirpId) {
    supabase.from('chirps').select('content').eq('id', chirpId).single()
        .then(function(response) {
            if (response.error) { showToast('Ошибка', 'error'); return; }
            var editContent = prompt('Редактировать chirp:', response.data.content);
            if (editContent !== null && editContent !== response.data.content) {
                if (editContent.length > 280) { showToast('Слишком длинно', 'error'); return; }
                if (editContent.length === 0) { showToast('Пустой chirp', 'error'); return; }
                editContent = filterProfanity(editContent);
                editContent = sanitizeHTML(editContent);
                showLoading();
                supabase.from('chirps').update({ content: editContent }).eq('id', chirpId)
                    .then(function(updateResponse) {
                        hideLoading();
                        if (updateResponse.error) { showToast('Ошибка: ' + updateResponse.error.message, 'error'); return; }
                        showToast('Chirp обновлен', 'success');
                        feedPage = 1; feedEnded = false; loadFeed(feedTab);
                    });
            }
        });
}

// Delete chirp
function deleteChirp(chirpId) {
    if (!confirm('Удалить chirp?')) return;
    showLoading();
    supabase.from('chirps').delete().eq('id', chirpId)
        .then(function(response) {
            hideLoading();
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            showToast('Chirp удален', 'success');
            feedPage = 1; feedEnded = false; loadFeed(feedTab);
            if (currentChirp && currentChirp.id === chirpId) { navigateTo('home'); }
        });
}

// Report chirp
function reportChirp(chirpId) {
    if (!currentUser) { showToast('Авторизуйтесь', 'error'); return; }
    var reason = prompt('Причина жалобы (spam/abuse/inappropriate/other):');
    if (!reason) return;
    supabase.from('reports').insert({
        reporter_id: currentUser.id,
        chirp_id: chirpId,
        report_type: reason,
        status: 'pending'
    })
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            showToast('Жалоба отправлена', 'success');
        });
}

// Share chirp
function shareChirp(chirpId) {
    var chirpUrl = window.location.origin + '/#view-chirp?id=' + chirpId;
    if (navigator.share) {
        navigator.share({ title: 'NobuSocial Chirp', text: 'Посмотрите этот chirp', url: chirpUrl }).catch(function() {});
    } else {
        prompt('Скопируйте ссылку:', chirpUrl);
        showToast('Ссылка скопирована', 'success');
    }
}

// Show action sheet
function showActionSheet(actions) {
    var actionSheet = document.createElement('div');
    actionSheet.className = 'action-sheet';
    actions.forEach(function(action, index) {
        if (index > 0) {
            var separator = document.createElement('div');
            separator.className = 'action-sheet-separator';
            actionSheet.appendChild(separator);
        }
        var item = document.createElement('button');
        item.className = 'action-sheet-item ' + (action.danger ? 'danger' : '');
        item.innerHTML = '<i class="fas ' + action.icon + '"></i> ' + action.text;
        item.onclick = function() { actionSheet.remove(); eval(action.action); };
        actionSheet.appendChild(item);
    });
    var separator = document.createElement('div');
    separator.className = 'action-sheet-separator';
    actionSheet.appendChild(separator);
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'action-sheet-item action-sheet-cancel';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i> Отмена';
    cancelBtn.onclick = function() { actionSheet.remove(); };
    actionSheet.appendChild(cancelBtn);
    document.body.appendChild(actionSheet);
}

// Reset create form
function resetCreateForm() {
    document.getElementById('chirp-content').value = '';
    document.getElementById('char-count').textContent = '0';
    document.getElementById('media-preview').classList.remove('has-media');
    document.getElementById('media-preview').innerHTML = '';
    document.getElementById('media-upload').value = '';
    updateChirpCounter();
}

// Update character counter
function updateChirpCounter() {
    var content = document.getElementById('chirp-content').value;
    var count = content.length;
    var counter = document.getElementById('char-count');
    counter.textContent = count;
    counter.parentElement.classList.remove('warning', 'error');
    if (count > 280) { counter.parentElement.classList.add('error'); }
    else if (count > 240) { counter.parentElement.classList.add('warning'); }
}

// Handle media upload
function handleMediaUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    var maxImageSize = 10 * 1024 * 1024;
    var maxVideoSize = 50 * 1024 * 1024;
    var isImage = file.type.startsWith('image/');
    var isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { showToast('Загрузите изображение или видео', 'error'); resetMediaUpload(); return; }
    if (isImage && file.size > maxImageSize) { showToast('Изображение > 10MB', 'error'); resetMediaUpload(); return; }
    if (isVideo && file.size > maxVideoSize) { showToast('Видео > 50MB', 'error'); resetMediaUpload(); return; }
    var preview = document.getElementById('media-preview');
    preview.classList.add('has-media');
    preview.innerHTML = '';
    if (isImage) {
        var img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        preview.appendChild(img);
    } else if (isVideo) {
        var video = document.createElement('video');
        video.controls = true;
        video.src = URL.createObjectURL(file);
        preview.appendChild(video);
    }
    var removeBtn = document.createElement('button');
    removeBtn.className = 'remove-media';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.onclick = removeMedia;
    preview.appendChild(removeBtn);
}

// Remove media
function removeMedia() { resetMediaUpload(); }

// Reset media upload
function resetMediaUpload() {
    var preview = document.getElementById('media-preview');
    preview.classList.remove('has-media');
    preview.innerHTML = '';
    document.getElementById('media-upload').value = '';
}

// Create chirp
function createChirp() {
    if (!currentUser) { showToast('Авторизуйтесь', 'error'); navigateTo('auth'); return; }
    var content = document.getElementById('chirp-content').value.trim();
    var mediaFile = document.getElementById('media-upload').files[0];
    if (!content && !mediaFile) { showToast('Введите текст или загрузите медиа', 'error'); return; }
    if (content.length > 280) { showToast('Слишком длинно', 'error'); return; }
    content = filterProfanity(content);
    content = sanitizeHTML(content);
    showLoading();
    var chirpData = { user_id: currentUser.id, content: content, is_rechirp: false, original_chirp_id: null };
    if (mediaFile) {
        var fileName = Date.now() + '-' + mediaFile.name;
        var filePath = 'chirps/' + currentUser.id + '/' + fileName;
        var isImage = mediaFile.type.startsWith('image/');
        chirpData.media_type = isImage ? 'image' : 'video';
        chirpData.media_size = mediaFile.size;
        supabase.storage.from('chirps').upload(filePath, mediaFile)
            .then(function(uploadResponse) {
                if (uploadResponse.error) { hideLoading(); showToast('Ошибка загрузки: ' + uploadResponse.error.message, 'error'); return; }
                var publicUrl = supabase.storage.from('chirps').getPublicUrl(filePath).data.publicUrl;
                chirpData.media_url = publicUrl;
                return supabase.from('chirps').insert(chirpData).select().single();
            })
            .then(function(response) {
                hideLoading();
                if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
                resetCreateForm();
                showToast('Chirp опубликован!', 'success');
                navigateTo('home');
                feedPage = 1; feedEnded = false; loadFeed(feedTab);
            })
            .catch(function(error) { hideLoading(); showToast('Ошибка: ' + error.message, 'error'); });
    } else {
        supabase.from('chirps').insert(chirpData)
            .then(function(response) {
                hideLoading();
                if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
                resetCreateForm();
                showToast('Chirp опубликован!', 'success');
                navigateTo('home');
                feedPage = 1; feedEnded = false; loadFeed(feedTab);
            })
            .catch(function(error) { hideLoading(); showToast('Ошибка: ' + error.message, 'error'); });
    }
}

// Load profile
function loadProfile(userId) {
    currentProfileUser = null;
    supabase.from('users').select('*').eq('id', userId).single()
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); navigateTo('home'); return; }
            currentProfileUser = response.data;
            renderProfile(currentProfileUser);
            loadProfileChirps(userId, 'chirps');
        });
}

// Render profile
function renderProfile(user) {
    var displayName = user.display_name || user.username;
    var username = '@' + user.username;
    var bio = user.bio || '';
    var location = user.location || '';
    document.getElementById('profile-avatar').src = user.avatar_url || getDefaultAvatar(user.username);
    document.getElementById('profile-banner').innerHTML = '<img id="banner-img" src="' + (user.banner_url || '') + '" alt="Banner">';
    document.getElementById('profile-display-name').textContent = escapeHtml(displayName);
    document.getElementById('profile-username').textContent = escapeHtml(username);
    document.getElementById('profile-bio').textContent = escapeHtml(bio);
    document.getElementById('profile-location').textContent = escapeHtml(location);
    loadProfileStats(user.id);
    updateFollowButton(user.id);
    if (!location) { document.getElementById('profile-location').style.display = 'none'; }
}

// Load profile stats
function loadProfileStats(userId) {
    var statsPromises = [
        supabase.from('chirps').select('id').eq('user_id', userId).eq('is_rechirp', false),
        supabase.from('follows').select('id').eq('follower_id', userId),
        supabase.from('follows').select('id').eq('following_id', userId),
        supabase.from('likes').select('id').eq('user_id', userId)
    ];
    Promise.all(statsPromises)
        .then(function(results) {
            document.getElementById('profile-chirps').textContent = results[0].data ? results[0].data.length : 0;
            document.getElementById('profile-following').textContent = results[1].data ? results[1].data.length : 0;
            document.getElementById('profile-followers').textContent = results[2].data ? results[2].data.length : 0;
            document.getElementById('profile-likes').textContent = results[3].data ? results[3].data.length : 0;
        });
}

// Update follow button
function updateFollowButton(userId) {
    if (!currentUser || userId === currentUser.id) {
        document.getElementById('follow-btn').style.display = 'none';
        document.getElementById('message-btn').style.display = 'none';
        document.getElementById('settings-btn').style.display = 'block';
        return;
    }
    document.getElementById('follow-btn').style.display = 'block';
    document.getElementById('message-btn').style.display = 'block';
    document.getElementById('settings-btn').style.display = 'none';
    supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', userId).single()
        .then(function(response) {
            var followBtn = document.getElementById('follow-btn');
            if (response.data) {
                followBtn.textContent = 'Отписаться';
                followBtn.classList.add('following');
            } else {
                followBtn.textContent = 'Подписаться';
                followBtn.classList.remove('following');
            }
        });
}

// Toggle follow
function toggleFollow() {
    if (!currentUser || !currentProfileUser) return;
    var userId = currentProfileUser.id;
    supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', userId).single()
        .then(function(response) {
            if (response.data) {
                supabase.from('follows').delete().eq('id', response.data.id)
                    .then(function(deleteResponse) {
                        if (deleteResponse.error) { showToast('Ошибка: ' + deleteResponse.error.message, 'error'); return; }
                        document.getElementById('follow-btn').textContent = 'Подписаться';
                        document.getElementById('follow-btn').classList.remove('following');
                        loadProfileStats(userId);
                        showToast('Вы отписались', 'success');
                    });
            } else {
                supabase.from('follows').insert({ follower_id: currentUser.id, following_id: userId })
                    .then(function(insertResponse) {
                        if (insertResponse.error) { showToast('Ошибка: ' + insertResponse.error.message, 'error'); return; }
                        document.getElementById('follow-btn').textContent = 'Отписаться';
                        document.getElementById('follow-btn').classList.add('following');
                        loadProfileStats(userId);
                        supabase.from('notifications').insert({
                            recipient_id: userId,
                            sender_id: currentUser.id,
                            notification_type: 'follow'
                        });
                        showToast('Вы подписались', 'success');
                    });
            }
        });
}

// Start chat
function startChat() {
    if (!currentUser || !currentProfileUser || currentProfileUser.id === currentUser.id) return;
    var checkFollow1 = supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', currentProfileUser.id).single();
    var checkFollow2 = supabase.from('follows').select('id').eq('follower_id', currentProfileUser.id).eq('following_id', currentUser.id).single();
    Promise.all([checkFollow1, checkFollow2])
        .then(function(results) {
            if (!results[0].data || !results[1].data) { showToast('Вы можете писать только взаимным подписчикам', 'error'); return; }
            var user1 = currentUser.id < currentProfileUser.id ? currentUser.id : currentProfileUser.id;
            var user2 = currentUser.id < currentProfileUser.id ? currentProfileUser.id : currentUser.id;
            supabase.from('chats').select('*').eq('user1_id', user1).eq('user2_id', user2).single()
                .then(function(response) {
                    if (response.data) {
                        currentChat = response.data;
                        currentChatUser = currentProfileUser;
                        loadChatMessages(response.data.id);
                    } else {
                        supabase.from('chats').insert({ user1_id: user1, user2_id: user2 }).select().single()
                            .then(function(chatResponse) {
                                if (chatResponse.error) { showToast('Ошибка: ' + chatResponse.error.message, 'error'); return; }
                                currentChat = chatResponse.data;
                                currentChatUser = currentProfileUser;
                                loadChatMessages(chatResponse.data.id);
                            });
                    }
                });
        });
}

// Load chat messages
function loadChatMessages(chatId) {
    supabase.from('chat_messages').select('*, users(*)').eq('chat_id', chatId).order('created_at', { ascending: true })
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            currentChat = { id: chatId };
            renderChatMessages(response.data);
            navigateTo('chat');
            markMessagesAsRead(chatId);
        });
}

// Render chat messages
function renderChatMessages(messages) {
    var chatMessagesElement = document.getElementById('chat-messages');
    chatMessagesElement.innerHTML = '';
    if (messages.length === 0) {
        chatMessagesElement.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><h3>Нет сообщений</h3><p>Начните чат!</p></div>';
        return;
    }
    messages.forEach(function(message) {
        var user = message.users || message.user;
        var isOutgoing = user.id === currentUser.id;
        var timeAgo = getTimeAgo(message.created_at);
        var content = sanitizeHTML(message.content);
        var messageElement = document.createElement('div');
        messageElement.className = 'chat-message ' + (isOutgoing ? 'outgoing' : 'incoming');
        messageElement.innerHTML = '<p class="chat-message-text">' + content + '</p><span class="chat-message-time">' + escapeHtml(timeAgo) + '</span>';
        chatMessagesElement.appendChild(messageElement);
    });
    setTimeout(function() { chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight; }, 100);
}

// Mark messages as read
function markMessagesAsRead(chatId) {
    supabase.from('chat_messages').update({ is_read: true }).eq('chat_id', chatId).neq('sender_id', currentUser.id);
}

// Send chat message
function sendChatMessage() {
    if (!currentUser || !currentChat || !currentChatUser) return;
    var content = document.getElementById('chat-input').value.trim();
    if (!content) return;
    content = filterProfanity(content);
    content = sanitizeHTML(content);
    supabase.from('chat_messages').insert({
        chat_id: currentChat.id,
        sender_id: currentUser.id,
        content: content
    })
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            document.getElementById('chat-input').value = '';
            supabase.from('notifications').insert({
                recipient_id: currentChatUser.id,
                sender_id: currentUser.id,
                notification_type: 'message',
                chat_id: currentChat.id
            });
        });
}

// Handle chat key press
function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChatMessage(); }
}

// Back to chats list
function backToChats() { navigateTo('chats-list'); }

// Load chats list
function loadChatsList() {
    if (!currentUser) return;
    supabase.from('chats').select('*, users1:users!chats_user1_id_fkey, users2:users!chats_user2_id_fkey')
        .or('user1_id.eq.' + currentUser.id + ',user2_id.eq.' + currentUser.id)
        .order('updated_at', { ascending: false })
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            chatsList = response.data;
            renderChatsList(chatsList);
        });
}

// Render chats list
function renderChatsList(chats) {
    var chatsListContent = document.getElementById('chats-list-content');
    chatsListContent.innerHTML = '';
    if (chats.length === 0) {
        chatsListContent.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><h3>Нет чатов</h3><p>Начните чат с взаимными подписчиками</p></div>';
        return;
    }
    chats.forEach(function(chat) {
        var otherUser = chat.user1_id === currentUser.id ? chat.users2 : chat.users1;
        supabase.from('chat_messages').select('*').eq('chat_id', chat.id).order('created_at', { ascending: false }).limit(1).single()
            .then(function(lastMessageResponse) {
                var lastMessage = lastMessageResponse.data;
                var lastMessageText = lastMessage ? lastMessage.content : 'Новый чат';
                var lastMessageTime = lastMessage ? getTimeAgo(lastMessage.created_at) : '';
                supabase.from('chat_messages').select('id').eq('chat_id', chat.id).eq('sender_id', otherUser.id).eq('is_read', false)
                    .then(function(unreadResponse) {
                        var hasUnread = unreadResponse.data && unreadResponse.data.length > 0;
                        var chatItem = document.createElement('div');
                        chatItem.className = 'chat-item';
                        chatItem.onclick = function() { currentChatUser = otherUser; loadChatMessages(chat.id); };
                        chatItem.innerHTML = '<img src="' + (otherUser.avatar_url || getDefaultAvatar(otherUser.username)) + '" alt="Avatar" class="chat-item-avatar">' +
                            '<div class="chat-item-info">' +
                            '<h4>' + escapeHtml(otherUser.display_name || otherUser.username) + '</h4>' +
                            '<p>' + escapeHtml(lastMessageText.length > 30 ? lastMessageText.substring(0, 30) + '...' : lastMessageText) + '</p>' +
                            '</div>' +
                            '<div class="chat-item-meta">' +
                            '<span class="chat-item-time">' + escapeHtml(lastMessageTime) + '</span>' +
                            (hasUnread ? '<div class="chat-item-unread"></div>' : '') +
                            '</div>';
                        chatsListContent.appendChild(chatItem);
                    });
            });
    });
}

// Switch profile tab
function switchProfileTab(tab) {
    var tabs = document.querySelectorAll('.profile-tab');
    tabs.forEach(function(tabElement) { tabElement.classList.remove('active'); });
    event.target.classList.add('active');
    loadProfileChirps(currentProfileUser.id, tab);
}

// Load profile chirps
function loadProfileChirps(userId, tab) {
    var query = supabase.from('chirps').select('*, users(*)').eq('user_id', userId);
    if (tab === 'likes') {
        query = supabase.from('chirps').select('*, users(*), likes!inner(*)').eq('likes.user_id', userId);
    } else if (tab !== 'chirps') {
        query = query.eq('is_rechirp', true);
    } else {
        query = query.eq('is_rechirp', false);
    }
    query.order('created_at', { ascending: false })
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            var profileContent = document.getElementById('profile-content');
            profileContent.innerHTML = '';
            if (response.data.length === 0) {
                profileContent.innerHTML = '<div class="empty-state"><i class="fas fa-feather-alt"></i><h3>Нет chirпов</h3></div>';
                return;
            }
            response.data.forEach(function(chirp) { renderChirp(chirp, profileContent); });
        });
}

// Load notifications
function loadNotifications() {
    if (!currentUser) return;
    supabase.from('notifications').select('*, sender:users!notifications_sender_id_fkey').eq('recipient_id', currentUser.id).order('created_at', { ascending: false })
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            notifications = response.data;
            renderNotifications(notifications);
            updateUnreadCount();
        });
}

// Render notifications
function renderNotifications(notifications) {
    var notificationsList = document.getElementById('notifications-list');
    notificationsList.innerHTML = '';
    if (notifications.length === 0) {
        notificationsList.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><h3>Нет уведомлений</h3></div>';
        return;
    }
    notifications.forEach(function(notification) {
        var sender = notification.sender || {};
        var displayName = sender.display_name || sender.username || 'Пользователь';
        var username = '@' + (sender.username || '');
        var timeAgo = getTimeAgo(notification.created_at);
        var message = '';
        var iconClass = '';
        switch (notification.notification_type) {
            case 'like': message = '<span>' + escapeHtml(displayName) + '</span> лайкнул ваш chirp'; iconClass = 'fa-heart'; break;
            case 'comment': message = '<span>' + escapeHtml(displayName) + '</span> прокомментировал ваш chirp'; iconClass = 'fa-comment'; break;
            case 'rechirp': message = '<span>' + escapeHtml(displayName) + '</span> сделали речирп вашего chirpa'; iconClass = 'fa-retweet'; break;
            case 'follow': message = '<span>' + escapeHtml(displayName) + '</span> подписался на вас'; iconClass = 'fa-user-plus'; break;
            case 'message': message = '<span>' + escapeHtml(displayName) + '</span> отправил вам сообщение'; iconClass = 'fa-envelope'; break;
            default: message = 'Новое уведомление'; iconClass = 'fa-bell';
        }
        var notificationElement = document.createElement('div');
        notificationElement.className = 'notification ' + (notification.is_read ? '' : 'unread');
        notificationElement.onclick = function() {
            markNotificationAsRead(notification.id);
            handleNotificationClick(notification);
        };
        notificationElement.innerHTML = '<div class="notification-icon ' + notification.notification_type + '">' +
            '<i class="fas ' + iconClass + '"></i>' +
            '</div>' +
            '<div class="notification-content">' +
            '<p>' + message + '</p>' +
            '</div>' +
            '<span class="notification-time">' + escapeHtml(timeAgo) + '</span>';
        notificationsList.appendChild(notificationElement);
    });
}

// Mark notification as read
function markNotificationAsRead(notificationId) {
    supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
}

// Handle notification click
function handleNotificationClick(notification) {
    switch (notification.notification_type) {
        case 'like':
        case 'comment':
        case 'rechirp':
            if (notification.chirp_id) { viewChirp(notification.chirp_id); }
            break;
        case 'follow':
            if (notification.sender_id) { navigateTo('profile', { userId: notification.sender_id }); }
            break;
        case 'message':
            if (notification.chat_id) {
                var chatId = notification.chat_id;
                supabase.from('chats').select('*, users1:users!chats_user1_id_fkey, users2:users!chats_user2_id_fkey').eq('id', chatId).single()
                    .then(function(response) {
                        if (response.data) {
                            var chat = response.data;
                            var otherUser = chat.user1_id === currentUser.id ? chat.users2 : chat.users1;
                            currentChatUser = otherUser;
                            loadChatMessages(chatId);
                        }
                    });
            }
            break;
    }
}

// Update unread count
function updateUnreadCount() {
    if (!currentUser) return;
    supabase.from('notifications').select('id').eq('recipient_id', currentUser.id).eq('is_read', false)
        .then(function(response) {
            var unreadCount = response.data ? response.data.length : 0;
            var navItem = document.querySelector('.nav-item[onclick*="notifications"]');
            if (navItem) {
                var badge = navItem.querySelector('.notification-badge');
                if (badge) { badge.remove(); }
                if (unreadCount > 0) {
                    var badgeElement = document.createElement('span');
                    badgeElement.className = 'notification-badge';
                    badgeElement.textContent = unreadCount;
                    navItem.appendChild(badgeElement);
                }
            }
        });
}

// Show search
function showSearch() { if (currentUser) { navigateTo('search'); } else { navigateTo('auth'); } }

// Handle search input
function handleSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() {
        var query = document.getElementById('search-input').value.trim();
        if (query.length >= 2) { searchUsers(query); }
        else if (query.length === 0) { document.getElementById('search-results').innerHTML = ''; }
    }, 300);
}

// Search users
function searchUsers(query) {
    supabase.from('users').select('*').ilike('username', '%' + query + '%').or('ilike(display_name,' + '%' + query + '%' + ')').limit(20)
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            renderSearchResults(response.data);
        });
}

// Render search results
function renderSearchResults(users) {
    var searchResults = document.getElementById('search-results');
    searchResults.innerHTML = '';
    if (users.length === 0) {
        searchResults.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><h3>Пользователи не найдены</h3></div>';
        return;
    }
    users.forEach(function(user) {
        var displayName = user.display_name || user.username;
        var username = '@' + user.username;
        var userElement = document.createElement('div');
        userElement.className = 'search-result';
        userElement.onclick = function() { navigateTo('profile', { userId: user.id }); };
        userElement.innerHTML = '<img src="' + (user.avatar_url || getDefaultAvatar(user.username)) + '" alt="Avatar" class="search-result-avatar">' +
            '<div class="search-result-info">' +
            '<h4>' + escapeHtml(displayName) + '</h4>' +
            '<p>' + escapeHtml(username) + '</p>' +
            '</div>';
        searchResults.appendChild(userElement);
    });
}

// Show settings
function showSettings() { navigateTo('settings'); }

// Edit profile
function editProfile() { navigateTo('edit-profile'); }

// Populate edit profile form
function populateEditProfileForm() {
    if (!currentUser) return;
    document.getElementById('edit-avatar').src = currentUser.avatar_url || getDefaultAvatar(currentUser.username);
    document.getElementById('edit-banner').src = currentUser.banner_url || '';
    document.getElementById('edit-display-name').value = currentUser.display_name || '';
    document.getElementById('edit-bio').value = currentUser.bio || '';
    document.getElementById('edit-website').value = currentUser.website || '';
    document.getElementById('edit-location').value = currentUser.location || '';
}

// Handle avatar upload
function handleAvatarUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Загрузите изображение', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Аватар > 5MB', 'error'); return; }
    var preview = document.getElementById('edit-avatar');
    preview.src = URL.createObjectURL(file);
    showLoading();
    var fileName = Date.now() + '-avatar.' + file.name.split('.').pop();
    var filePath = 'avatars/' + currentUser.id + '/' + fileName;
    supabase.storage.from('avatars').upload(filePath, file)
        .then(function(response) {
            hideLoading();
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            var publicUrl = supabase.storage.from('avatars').getPublicUrl(filePath).data.publicUrl;
            supabase.from('users').update({ avatar_url: publicUrl }).eq('id', currentUser.id)
                .then(function(updateResponse) {
                    if (updateResponse.error) { showToast('Ошибка: ' + updateResponse.error.message, 'error'); return; }
                    currentUser.avatar_url = publicUrl;
                    showToast('Аватар обновлен', 'success');
                });
        });
}

// Handle banner upload
function handleBannerUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Загрузите изображение', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('Баннер > 10MB', 'error'); return; }
    var preview = document.getElementById('edit-banner');
    preview.src = URL.createObjectURL(file);
    showLoading();
    var fileName = Date.now() + '-banner.' + file.name.split('.').pop();
    var filePath = 'banners/' + currentUser.id + '/' + fileName;
    supabase.storage.from('banners').upload(filePath, file)
        .then(function(response) {
            hideLoading();
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            var publicUrl = supabase.storage.from('banners').getPublicUrl(filePath).data.publicUrl;
            supabase.from('users').update({ banner_url: publicUrl }).eq('id', currentUser.id)
                .then(function(updateResponse) {
                    if (updateResponse.error) { showToast('Ошибка: ' + updateResponse.error.message, 'error'); return; }
                    currentUser.banner_url = publicUrl;
                    showToast('Баннер обновлен', 'success');
                });
        });
}

// Save profile
function saveProfile() {
    if (!currentUser) return;
    var displayName = document.getElementById('edit-display-name').value.trim();
    var bio = document.getElementById('edit-bio').value.trim();
    var website = document.getElementById('edit-website').value.trim();
    var location = document.getElementById('edit-location').value.trim();
    displayName = filterProfanity(displayName);
    bio = filterProfanity(bio);
    location = filterProfanity(location);
    displayName = sanitizeHTML(displayName);
    bio = sanitizeHTML(bio);
    website = sanitizeHTML(website);
    location = sanitizeHTML(location);
    showLoading();
    var updateData = { display_name: displayName, bio: bio, website: website, location: location };
    supabase.from('users').update(updateData).eq('id', currentUser.id)
        .then(function(response) {
            hideLoading();
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            currentUser.display_name = displayName;
            currentUser.bio = bio;
            currentUser.website = website;
            currentUser.location = location;
            showToast('Профиль обновлен', 'success');
            navigateTo('profile');
        });
}

// Change password
function changePassword() {
    var oldPassword = prompt('Введите текущий пароль:');
    if (!oldPassword) return;
    var newPassword = prompt('Введите новый пароль:');
    if (!newPassword) return;
    if (newPassword.length < 6) { showToast('Пароль должен быть не менее 6 символов', 'error'); return; }
    var confirmPassword = prompt('Подтвердите новый пароль:');
    if (newPassword !== confirmPassword) { showToast('Пароли не совпадают', 'error'); return; }
    showLoading();
    hashPassword(oldPassword, currentUser.password_salt).then(function(hashedOldPassword) {
        if (hashedOldPassword !== currentUser.password_hash) {
            hideLoading();
            showToast('Неверный текущий пароль', 'error');
            return;
        }
        var newSalt = generateSalt();
        hashPassword(newPassword, newSalt).then(function(hashedNewPassword) {
            supabase.from('users').update({ password_hash: hashedNewPassword, password_salt: newSalt }).eq('id', currentUser.id)
                .then(function(response) {
                    hideLoading();
                    if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
                    currentUser.password_hash = hashedNewPassword;
                    currentUser.password_salt = newSalt;
                    showToast('Пароль изменен', 'success');
                });
        });
    });
}

// Toggle private account
function togglePrivateAccount() { showToast('Функция временно недоступна', 'info'); }

// Load admin stats
function loadAdminStats() {
    var statsPromises = [
        supabase.from('users').select('id'),
        supabase.from('chirps').select('id'),
        supabase.from('likes').select('id'),
        supabase.from('chats').select('id')
    ];
    Promise.all(statsPromises)
        .then(function(results) {
            document.getElementById('admin-total-users').textContent = results[0].data ? results[0].data.length : 0;
            document.getElementById('admin-total-chirps').textContent = results[1].data ? results[1].data.length : 0;
            document.getElementById('admin-total-likes').textContent = results[2].data ? results[2].data.length : 0;
            document.getElementById('admin-total-chats').textContent = results[3].data ? results[3].data.length : 0;
        });
}

// Search admin users
function searchAdminUsers() {
    var query = document.getElementById('admin-user-search').value.trim();
    var usersQuery = supabase.from('users').select('*').order('created_at', { ascending: false });
    if (query) { usersQuery = usersQuery.or('ilike(username,' + '%' + query + '%' + '),ilike(display_name,' + '%' + query + '%' + '),ilike(email,' + '%' + query + '%' + ')'); }
    usersQuery.limit(50)
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            renderAdminUsers(response.data);
        });
}

// Render admin users
function renderAdminUsers(users) {
    var adminUsersList = document.getElementById('admin-users-list');
    adminUsersList.innerHTML = '';
    if (users.length === 0) {
        adminUsersList.innerHTML = '<div class="empty-state"><i class="fas fa-users-slash"></i><h3>Пользователи не найдены</h3></div>';
        return;
    }
    users.forEach(function(user) {
        var statusBadge = '';
        if (user.is_admin) { statusBadge = '<span class="badge" style="background: var(--accent-primary); color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px;">Админ</span>'; }
        else if (user.is_banned) { statusBadge = '<span class="badge" style="background: var(--error); color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px;">Заблокирован</span>'; }
        var userElement = document.createElement('div');
        userElement.className = 'admin-list-item';
        userElement.innerHTML = '<img src="' + (user.avatar_url || getDefaultAvatar(user.username)) + '" alt="Avatar" class="admin-avatar" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">' +
            '<div class="admin-info" style="flex: 1;">' +
            '<h4 style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin: 0;">' + escapeHtml(user.display_name || user.username) + '</h4>' +
            '<p style="font-size: 10px; color: var(--text-muted); margin: 0;">@' + escapeHtml(user.username) + '</p>' +
            '</div>' +
            '<div class="admin-actions" style="display: flex; gap: 4px;">' +
            statusBadge +
            '<button class="admin-btn" onclick="viewUserDetails(\'' + user.id + '\')" style="padding: 4px 8px; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 4px; color: var(--text-secondary); font-size: 10px; cursor: pointer;">Просмотр</button>' +
            (user.is_banned ?
                '<button class="admin-btn" onclick="unbanUser(\'' + user.id + '\')" style="padding: 4px 8px; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 4px; color: var(--text-secondary); font-size: 10px; cursor: pointer;">Разблокировать</button>' :
                '<button class="admin-btn" onclick="banUser(\'' + user.id + '\')" style="padding: 4px 8px; background: var(--error); border: 1px solid var(--error); border-radius: 4px; color: white; font-size: 10px; cursor: pointer;">Заблокировать</button>') +
            '</div>';
        adminUsersList.appendChild(userElement);
    });
}

// View user details
function viewUserDetails(userId) { navigateTo('profile', { userId: userId }); }

// Ban user
function banUser(userId) {
    var reason = prompt('Причина блокировки:');
    if (reason === null) return;
    supabase.from('users').update({ is_banned: true, banned_reason: reason }).eq('id', userId)
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            showToast('Пользователь заблокирован', 'success');
            searchAdminUsers();
        });
}

// Unban user
function unbanUser(userId) {
    supabase.from('users').update({ is_banned: false, banned_reason: null }).eq('id', userId)
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            showToast('Пользователь разблокирован', 'success');
            searchAdminUsers();
        });
}

// Switch admin tab
function switchAdminTab(tab) {
    var tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(function(tabElement) { tabElement.classList.remove('active'); });
    event.target.classList.add('active');
    var sections = document.querySelectorAll('.admin-section');
    sections.forEach(function(section) { section.style.display = 'none'; });
    var sectionId = 'admin-' + tab;
    var section = document.getElementById(sectionId);
    if (section) { section.style.display = 'block'; }
    switch (tab) {
        case 'stats': loadAdminStats(); break;
        case 'users': searchAdminUsers(); break;
        case 'reports': loadAdminReports(); break;
    }
}

// Load admin reports
function loadAdminReports() {
    supabase.from('reports').select('*, reporter:users!reports_reporter_id_fkey, reported_user:users!reports_reported_user_id_fkey').order('created_at', { ascending: false })
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            renderAdminReports(response.data);
        });
}

// Render admin reports
function renderAdminReports(reports) {
    var adminReportsList = document.getElementById('admin-reports-list');
    adminReportsList.innerHTML = '';
    if (reports.length === 0) {
        adminReportsList.innerHTML = '<div class="empty-state"><i class="fas fa-flag-slash"></i><h3>Нет жалоб</h3></div>';
        return;
    }
    reports.forEach(function(report) {
        var reporter = report.reporter || {};
        var reportedUser = report.reported_user || {};
        var statusBadge = '';
        switch (report.status) {
            case 'pending': statusBadge = '<span style="background: #ff9800; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px;">Ожидает</span>'; break;
            case 'reviewed': statusBadge = '<span style="background: #2196f3; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px;">Просмотрено</span>'; break;
            case 'resolved': statusBadge = '<span style="background: #4caf50; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px;">Решено</span>'; break;
        }
        var reportElement = document.createElement('div');
        reportElement.className = 'admin-list-item';
        reportElement.innerHTML = '<div class="admin-info" style="flex: 1;">' +
            '<h4 style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin: 0;">Жалоба от ' + escapeHtml(reporter.display_name || reporter.username || 'Unknown') + '</h4>' +
            '<p style="font-size: 10px; color: var(--text-muted); margin: 0;">На: ' + escapeHtml(reportedUser.display_name || reportedUser.username || 'Unknown') + '</p>' +
            '<p style="font-size: 10px; color: var(--text-muted); margin: 0;">Тип: ' + escapeHtml(report.report_type) + '</p>' +
            '<p style="font-size: 10px; color: var(--text-muted); margin: 0;">Описание: ' + escapeHtml(report.description || 'Нет описания') + '</p>' +
            '<p style="font-size: 10px; color: var(--text-muted); margin: 0;">' + statusBadge + '</p>' +
            '</div>' +
            '<div class="admin-actions" style="display: flex; gap: 4px;">' +
            '<button class="admin-btn" onclick="resolveReport(\'' + report.id + '\')" style="padding: 4px 8px; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 4px; color: var(--text-secondary); font-size: 10px; cursor: pointer;">Решить</button>' +
            '</div>';
        adminReportsList.appendChild(reportElement);
    });
}

// Resolve report
function resolveReport(reportId) {
    supabase.from('reports').update({ status: 'resolved', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() }).eq('id', reportId)
        .then(function(response) {
            if (response.error) { showToast('Ошибка: ' + response.error.message, 'error'); return; }
            showToast('Жалоба помечена как решенная', 'success');
            loadAdminReports();
        });
}

// Setup realtime subscriptions
function setupRealtimeSubscriptions() {
    if (!currentUser) return;
    supabase.channel('notifications_' + currentUser.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'recipient_id=eq.' + currentUser.id }, function(payload) {
            notifications.unshift(payload.new);
            updateUnreadCount();
            var senderName = payload.new.sender_display_name || payload.new.sender_username || 'Пользователь';
            showToast(senderName + ' отправил вам уведомление', 'info');
        })
        .subscribe();
    supabase.channel('chats_' + currentUser.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'chat_id=eq.any(array[' + getUserChatIds() + '])' }, function(payload) {
            if (payload.new.sender_id !== currentUser.id) {
                var chatId = payload.new.chat_id;
                var senderId = payload.new.sender_id;
                if (currentChat && currentChat.id === chatId) {
                    var messageElement = createMessageElement(payload.new);
                    document.getElementById('chat-messages').appendChild(messageElement);
                    setTimeout(function() { document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight; }, 100);
                } else {
                    loadChatsList();
                }
            }
        })
        .subscribe();
}

// Get user chat IDs
function getUserChatIds() {
    return "'" + chatsList.map(function(chat) { return chat.id; }).join("','") + "'";
}

// Create message element
function createMessageElement(message) {
    var user = message.users || {};
    var isOutgoing = user.id === currentUser.id;
    var timeAgo = getTimeAgo(message.created_at);
    var content = sanitizeHTML(message.content);
    var messageElement = document.createElement('div');
    messageElement.className = 'chat-message ' + (isOutgoing ? 'outgoing' : 'incoming');
    messageElement.innerHTML = '<p class="chat-message-text">' + content + '</p><span class="chat-message-time">' + escapeHtml(timeAgo) + '</span>';
    return messageElement;
}

// Initialize
initSupabase();