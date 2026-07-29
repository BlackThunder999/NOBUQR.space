// ===== КОНСТАНТЫ =====
var SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
var SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase = null;

// ===== ПЕРЕМЕННЫЕ СОСТОЯНИЯ =====
var currentUser = null;
var currentSession = null;
var currentView = 'welcome';
var currentChatId = null;
var currentProfileId = null;
var currentFeedType = 'latest';
var posts = [];
var chats = [];
var notifications = [];
var userData = null;
var attachments = [];
var realtimeChannels = [];
var isLoading = false;

// ===== ИНИЦИАЛИЗАЦИЯ =====
function init() {
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        checkDevice();
    } catch (e) {
        console.error('Init error:', e);
        showModal('Ошибка', 'Не удалось инициализировать приложение');
    }
}

// ===== ЗАПУСК ПРИЛОЖЕНИЯ =====
window.onload = init;
window.onbeforeunload = function() {
    cleanupRealtime();
};
// ===== ПРОВЕРКА УСТРОЙСТВА =====
function checkDevice() {
    var userAgent = navigator.userAgent || '';
    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    // iPhone/iPad → сразу форма входа
    if (/iPhone|iPad|iPod/i.test(userAgent)) {
        showAuthScreen();
        return;
    }

    // Android → приветственная страница с кнопкой APK
    if (/Android/i.test(userAgent)) {
        showWelcomeScreen();
        var downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) downloadBtn.textContent = 'Скачать APK';
        return;
    }

    // ПК (Windows/Mac/Linux) → приветственная страница
    showWelcomeScreen();
}

// ===== ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ =====
function showWelcomeScreen() {
    hideAllScreens();
    var welcomeScreen = document.getElementById('welcome-screen');
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    currentView = 'welcome';
}

function showAuthScreen() {
    hideAllScreens();
    var authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.classList.remove('hidden');
    showLogin();
    currentView = 'auth';
    checkSession();
}

function showMainScreen() {
    hideAllScreens();
    var mainScreen = document.getElementById('main-screen');
    if (mainScreen) mainScreen.classList.remove('hidden');
    showView('feed');
    currentView = 'main';
    setupRealtime();
    loadUserData();
}

function hideAllScreens() {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
        screens[i].classList.add('hidden');
    }
}

// ===== ПЕРЕКЛЮЧЕНИЕ ВЬЮХ =====
function showView(viewName) {
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) {
        views[i].classList.add('hidden');
        views[i].classList.remove('active');
    }

    var view = document.getElementById(viewName + '-view');
    if (view) {
        view.classList.remove('hidden');
        view.classList.add('active');
        currentView = viewName;
    }

    // Обновляем активный пункт нижнего меню
    var menuItems = document.querySelectorAll('.bottom-menu .menu-item');
    for (var j = 0; j < menuItems.length; j++) {
        menuItems[j].classList.remove('active');
    }

    var menuOrder = ['feed', 'search', 'create-post', 'chats', 'notifications', 'profile'];
    for (var k = 0; k < menuOrder.length; k++) {
        if (menuOrder[k] === viewName) {
            var activeItem = document.querySelectorAll('.bottom-menu .menu-item')[k];
            if (activeItem) activeItem.classList.add('active');
            break;
        }
    }

    // Загружаем данные для вьюхи
    if (viewName === 'feed') loadFeed(currentFeedType);
    else if (viewName === 'chats') loadChats();
    else if (viewName === 'notifications') loadNotifications();
    else if (viewName === 'profile') goToProfile(currentUser ? currentUser.id : null);
    else if (viewName === 'shop') loadShop();
    else if (viewName === 'premium') loadPremium();
    else if (viewName === 'admin') loadAdminStats();
}

// Формы авторизации
function showLogin() {
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');
    var recoveryForm = document.getElementById('recovery-form');
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    if (recoveryForm) recoveryForm.classList.add('hidden');
}

function showRegister() {
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');
    var recoveryForm = document.getElementById('recovery-form');
    if (loginForm) loginForm.classList.add('hidden');
    if (registerForm) registerForm.classList.remove('hidden');
    if (recoveryForm) recoveryForm.classList.add('hidden');
}

function showRecovery() {
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');
    var recoveryForm = document.getElementById('recovery-form');
    if (loginForm) loginForm.classList.add('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    if (recoveryForm) recoveryForm.classList.remove('hidden');
}
// ===== ПРОВЕРКА СЕССИИ =====
function checkSession() {
    if (isLoading) return;
    isLoading = true;

    supabase.auth.getSession().then(function(sessionData) {
        isLoading = false;
        if (sessionData.error) {
            return;
        }
        if (sessionData.data.session) {
            currentSession = sessionData.data.session;
            currentUser = sessionData.data.session.user;
            showMainScreen();
            updateUIForUser();
        }
    }).catch(function() {
        isLoading = false;
    });
}

// ===== АВТОРИЗАЦИЯ =====
function login() {
    var usernameInput = document.getElementById('login-username');
    var passwordInput = document.getElementById('login-password');
    if (!usernameInput || !passwordInput) return;

    var username = usernameInput.value.trim();
    var password = passwordInput.value;

    if (!username || !password) {
        showModal('Ошибка', 'Заполните все поля');
        return;
    }

    showLoader();
    isLoading = true;

    var email = username.includes('@') ? username : username + '@nobusocial.fake';

    supabase.auth.signInWithPassword({
        email: email,
        password: password
    }).then(function(response) {
        hideLoader();
        isLoading = false;

        if (response.error) {
            showModal('Ошибка', response.error.message);
            return;
        }

        currentSession = response.data.session;
        currentUser = response.data.user;
        loadUserData();
        showMainScreen();
        updateUIForUser();
    }).catch(function() {
        hideLoader();
        isLoading = false;
        showModal('Ошибка', 'Ошибка входа');
    });
}

function register() {
    var usernameInput = document.getElementById('reg-username');
    var emailInput = document.getElementById('reg-email');
    var passwordInput = document.getElementById('reg-password');
    var confirmInput = document.getElementById('reg-confirm');
    if (!usernameInput || !emailInput || !passwordInput || !confirmInput) return;

    var username = usernameInput.value.trim();
    var email = emailInput.value.trim();
    var password = passwordInput.value;
    var confirm = confirmInput.value;

    if (!username || !email || !password || !confirm) {
        showModal('Ошибка', 'Заполните все поля');
        return;
    }
    if (username.length < 3 || username.length > 20) {
        showModal('Ошибка', 'Логин должен быть от 3 до 20 символов');
        return;
    }
    if (password.length < 8) {
        showModal('Ошибка', 'Пароль должен быть не менее 8 символов');
        return;
    }
    if (password !== confirm) {
        showModal('Ошибка', 'Пароли не совпадают');
        return;
    }
    if (!validateEmail(email)) {
        showModal('Ошибка', 'Некорректный email');
        return;
    }

    showLoader();
    isLoading = true;

    supabase.auth.signUp({
        email: email,
        password: password,
        options: { data: { username: username } }
    }).then(function(response) {
        if (response.error) {
            hideLoader();
            isLoading = false;
            showModal('Ошибка', response.error.message);
            return;
        }

        var userId = response.data.user.id;
        var salt = generateSalt();
        var hashedPassword = sha256(password + salt);

        supabase.from('profiles').insert({
            id: userId,
            username: username,
            email: email,
            password_hash: hashedPassword,
            salt: salt,
            display_name: username,
            bio: '',
            avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username,
            created_at: new Date().toISOString(),
            gems: 0,
            is_premium: false
        }).then(function(profileResponse) {
            hideLoader();
            isLoading = false;
            if (profileResponse.error) {
                showModal('Ошибка', profileResponse.error.message);
                return;
            }
            showModal('Успех', 'Регистрация успешна! Проверьте email для подтверждения.');
            showLogin();
        }).catch(function() {
            hideLoader();
            isLoading = false;
            showModal('Ошибка', 'Ошибка создания профиля');
        });
    }).catch(function() {
        hideLoader();
        isLoading = false;
        showModal('Ошибка', 'Ошибка регистрации');
    });
}

function logout() {
    showLoader();
    isLoading = true;
    supabase.auth.signOut().then(function() {
        hideLoader();
        isLoading = false;
        cleanupRealtime();
        currentUser = null;
        currentSession = null;
        currentView = 'welcome';
        showWelcomeScreen();
    }).catch(function() {
        hideLoader();
        isLoading = false;
    });
}

function recoverPassword() {
    var emailInput = document.getElementById('rec-email');
    if (!emailInput) return;
    var email = emailInput.value.trim();
    if (!email) {
        showModal('Ошибка', 'Введите email');
        return;
    }
    showLoader();
    supabase.auth.resetPasswordForEmail(email).then(function(response) {
        hideLoader();
        if (response.error) {
            showModal('Ошибка', response.error.message);
            return;
        }
        showModal('Успех', 'Письмо с инструкциями отправлено на ваш email');
        showLogin();
    });
}

// ===== REALTIME =====
function setupRealtime() {
    cleanupRealtime();

    var postsChannel = supabase.channel('posts_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, function() {
            if (currentView === 'feed' || currentView === 'profile') {
                debounceLoadFeed();
            }
        })
        .subscribe();

    var messagesChannel = supabase.channel('messages_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, function(payload) {
            if (payload.new && payload.new.chat_id === currentChatId) {
                debounceLoadMessages();
            }
            if (payload.new && payload.new.receiver_id === currentUser.id) {
                debounceLoadChats();
                debounceLoadNotifications();
            }
        })
        .subscribe();

    var notificationsChannel = supabase.channel('notifications_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, function(payload) {
            if (payload.new && payload.new.user_id === currentUser.id) {
                debounceLoadNotifications();
            }
        })
        .subscribe();

    realtimeChannels.push(postsChannel, messagesChannel, notificationsChannel);
}

function cleanupRealtime() {
    for (var i = 0; i < realtimeChannels.length; i++) {
        try { supabase.removeChannel(realtimeChannels[i]); } catch (e) {}
    }
    realtimeChannels = [];
}

var debounceTimers = {};
function debounceLoadFeed() {
    clearTimeout(debounceTimers.feed);
    debounceTimers.feed = setTimeout(function() {
        if (currentView === 'feed') loadFeed(currentFeedType);
    }, 500);
}
function debounceLoadMessages() {
    clearTimeout(debounceTimers.messages);
    debounceTimers.messages = setTimeout(function() {
        if (currentChatId) loadMessages(currentChatId);
    }, 300);
}
function debounceLoadChats() {
    clearTimeout(debounceTimers.chats);
    debounceTimers.chats = setTimeout(function() {
        if (currentView === 'chats') loadChats();
    }, 500);
}
function debounceLoadNotifications() {
    clearTimeout(debounceTimers.notifications);
    debounceTimers.notifications = setTimeout(function() {
        if (currentView === 'notifications') loadNotifications();
    }, 500);
}

// ===== ЗАГРУЗКА ДАННЫХ ПОЛЬЗОВАТЕЛЯ =====
function loadUserData() {
    if (!currentUser || isLoading) return;
    isLoading = true;
    supabase.from('profiles').select('*').eq('id', currentUser.id).single().then(function(response) {
        isLoading = false;
        if (response.error) { console.error('Error loading user data:', response.error); return; }
        userData = response.data;
        updateUserUI();
    }).catch(function() { isLoading = false; });
}

function updateUserUI() {
    if (!userData) return;
    var userAvatar = document.getElementById('user-avatar');
    if (userAvatar) userAvatar.src = userData.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (userData.username || 'default');
    var menuAvatar = document.getElementById('menu-avatar');
    if (menuAvatar) menuAvatar.src = userData.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (userData.username || 'default');
    var menuUsername = document.getElementById('menu-username');
    if (menuUsername) menuUsername.textContent = userData.display_name || userData.username || 'Пользователь';
    if (userData.role === 'admin') {
        var adminBtn = document.getElementById('admin-menu-btn');
        if (adminBtn) adminBtn.style.display = 'block';
    }
}

function updateUIForUser() {
    var authScreen = document.getElementById('auth-screen');
    var mainScreen = document.getElementById('main-screen');
    if (currentUser) {
        if (authScreen) authScreen.classList.add('hidden');
        if (mainScreen) mainScreen.classList.remove('hidden');
    }
}
// ===== ЗАГРУЗКА ЛЕНТЫ =====
function loadFeed(type) {
    if (isLoading) return;
    isLoading = true;
    showLoader();
    currentFeedType = type || 'latest';

    var query = supabase.from('posts')
        .select('*, profiles(*), likes(count), reposts(count)')
        .order('created_at', { ascending: false })
        .limit(20);

    if (type === 'popular') {
        query = supabase.from('posts')
            .select('*, profiles(*), likes(count), reposts(count)')
            .order('likes.count', { ascending: false })
            .limit(20);
    } else if (type === 'following' && currentUser) {
        supabase.from('follows')
            .select('following_id')
            .eq('follower_id', currentUser.id)
            .then(function(followResponse) {
                if (followResponse.error || !followResponse.data || followResponse.data.length === 0) {
                    isLoading = false; hideLoader();
                    var container = document.getElementById('feed-container');
                    if (container) container.innerHTML = '<p class="no-results">Подпишитесь на пользователей, чтобы видеть их посты</p>';
                    return;
                }
                var followingIds = followResponse.data.map(function(f) { return f.following_id; });
                supabase.from('posts')
                    .select('*, profiles(*), likes(count), reposts(count)')
                    .in('author_id', followingIds)
                    .order('created_at', { ascending: false })
                    .limit(20)
                    .then(function(postsResponse) {
                        isLoading = false; hideLoader();
                        if (postsResponse.error) { showModal('Ошибка', postsResponse.error.message); return; }
                        posts = postsResponse.data || [];
                        renderFeed();
                    }).catch(function() { isLoading = false; hideLoader(); });
            }).catch(function() { isLoading = false; hideLoader(); });
        return;
    }

    query.then(function(response) {
        isLoading = false; hideLoader();
        if (response.error) { showModal('Ошибка', response.error.message); return; }
        posts = response.data || [];
        renderFeed();
    }).catch(function() { isLoading = false; hideLoader(); });
}

function renderFeed() {
    var container = document.getElementById('feed-container');
    if (!container) return;
    if (posts.length === 0) {
        container.innerHTML = '<p class="no-results">Нет постов</p>';
        return;
    }
    container.innerHTML = '';
    for (var i = 0; i < posts.length; i++) {
        container.appendChild(createPostCard(posts[i]));
    }
}

function createPostCard(post) {
    var card = document.createElement('div');
    card.className = 'post-card';

    var author = post.profiles || { username: 'Unknown', display_name: 'Unknown', avatar_url: null, is_premium: false };
    var authorAvatar = author.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + author.username;
    var authorName = filterText(author.display_name || author.username);
    var premiumBadge = author.is_premium ? '<span class="premium-badge">PREMIUM</span>' : '';

    var likeCount = post.likes ? post.likes.length : 0;
    var repostCount = post.reposts ? post.reposts.length : 0;
    var isLiked = false;
    if (currentUser && post.likes) {
        for (var j = 0; j < post.likes.length; j++) {
            if (post.likes[j].user_id === currentUser.id) { isLiked = true; break; }
        }
    }

    var mediaHtml = '';
    if (post.media_url) {
        if (post.media_url.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
            mediaHtml = '<div class="post-media"><img src="' + post.media_url + '" onclick="openMedia(\'' + post.media_url + '\')"></div>';
        } else if (post.media_url.match(/\.(mp4|webm|ogg)$/i)) {
            mediaHtml = '<div class="post-media"><video src="' + post.media_url + '" controls onclick="openMedia(\'' + post.media_url + '\')"></video></div>';
        } else if (post.media_url.match(/\.(mp3|wav|ogg)$/i)) {
            mediaHtml = '<div class="post-media"><audio src="' + post.media_url + '" controls></audio></div>';
        }
    }

    card.innerHTML = `
        <div class="post-header">
            <img src="${authorAvatar}" class="post-avatar" onclick="goToProfile('${author.id}')">
            <div class="post-user">
                <div class="post-username">${authorName} ${premiumBadge}</div>
                <div class="post-time">${formatTime(post.created_at)}</div>
            </div>
        </div>
        <div class="post-content">${filterText(post.content)}</div>
        ${mediaHtml}
        <div class="post-actions">
            <button class="post-action ${isLiked ? 'active' : ''}" onclick="toggleLike('${post.id}')">
                ❤️ <span class="post-action-count">${likeCount}</span>
            </button>
            <button class="post-action" onclick="repost('${post.id}')">🔄 <span class="post-action-count">${repostCount}</span></button>
            <button class="post-action" onclick="showComments('${post.id}')">💬</button>
        </div>
    `;
    return card;
}

function showFeed(type) {
    currentFeedType = type;
    loadFeed(type);
    var tabs = document.querySelectorAll('#feed-view .tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    var tabIndex = type === 'popular' ? 1 : type === 'following' ? 2 : 0;
    var activeTab = document.querySelectorAll('#feed-view .tab')[tabIndex];
    if (activeTab) activeTab.classList.add('active');
}

// ===== ЛАЙКИ И РЕПОСТЫ =====
function toggleLike(postId) {
    if (!currentUser) { showModal('Ошибка', 'Авторизуйтесь'); return; }
    supabase.from('likes').select('*').eq('post_id', postId).eq('user_id', currentUser.id).single().then(function(response) {
        if (response.data) {
            supabase.from('likes').delete().eq('id', response.data.id).then(function() { loadFeed(currentFeedType); });
        } else {
            supabase.from('likes').insert({
                post_id: postId,
                user_id: currentUser.id,
                created_at: new Date().toISOString()
            }).then(function() { loadFeed(currentFeedType); });
        }
    });
}

function repost(postId) {
    if (!currentUser) { showModal('Ошибка', 'Авторизуйтесь'); return; }
    supabase.from('posts').select('*').eq('id', postId).single().then(function(response) {
        if (response.error) { showModal('Ошибка', response.error.message); return; }
        var originalPost = response.data;
        supabase.from('posts').insert({
            author_id: currentUser.id,
            content: '🔄 ' + originalPost.content,
            media_url: originalPost.media_url,
            original_post_id: postId,
            is_repost: true,
            created_at: new Date().toISOString()
        }).then(function(repostResponse) {
            if (repostResponse.error) { showModal('Ошибка', repostResponse.error.message); return; }
            supabase.from('reposts').insert({
                post_id: postId,
                user_id: currentUser.id,
                created_at: new Date().toISOString()
            }).then(function() {
                showModal('Успех', 'Пост репостнут!');
                loadFeed(currentFeedType);
            });
        });
    });
}

// ===== СОЗДАНИЕ ПОСТА =====
function attachImage() { document.getElementById('hidden-file-input').accept = 'image/*'; document.getElementById('hidden-file-input').click(); }
function attachVideo() { document.getElementById('hidden-file-input').accept = 'video/*'; document.getElementById('hidden-file-input').click(); }
function attachAudio() { document.getElementById('hidden-file-input').accept = 'audio/*'; document.getElementById('hidden-file-input').click(); }

function handleFileUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    var fileName = Date.now() + '-' + file.name;
    var filePath = 'posts/' + currentUser.id + '/' + fileName;
    showLoader(); isLoading = true;
    supabase.storage.from('posts').upload(filePath, file).then(function(response) {
        if (response.error) { hideLoader(); isLoading = false; showModal('Ошибка', response.error.message); return; }
        supabase.storage.from('posts').getPublicUrl(filePath).then(function(urlResponse) {
            hideLoader(); isLoading = false;
            if (urlResponse.error) { showModal('Ошибка', urlResponse.error.message); return; }
            attachments.push({ url: urlResponse.data.publicUrl, type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio' });
            renderAttachments(); e.target.value = '';
        });
    }).catch(function() { hideLoader(); isLoading = false; });
}

function renderAttachments() {
    var preview = document.getElementById('post-preview');
    if (!preview) return;
    preview.innerHTML = '';
    for (var i = 0; i < attachments.length; i++) {
        var attachment = attachments[i];
        var item = document.createElement('div');
        item.className = 'post-preview-item';
        if (attachment.type === 'image') {
            item.innerHTML = '<img src="' + attachment.url + '"><button class="remove-btn" onclick="removeAttachment(' + i + ')">×</button>';
        } else if (attachment.type === 'video') {
            item.innerHTML = '<video src="' + attachment.url + '" controls></video><button class="remove-btn" onclick="removeAttachment(' + i + ')">×</button>';
        } else {
            item.innerHTML = '<audio src="' + attachment.url + '" controls></audio><button class="remove-btn" onclick="removeAttachment(' + i + ')">×</button>';
        }
        preview.appendChild(item);
    }
}

function removeAttachment(index) { attachments.splice(index, 1); renderAttachments(); }

function createPost() {
    var textInput = document.getElementById('post-text');
    if (!textInput) return;
    var text = textInput.value.trim();
    if (!text && attachments.length === 0) { showModal('Ошибка', 'Пост не может быть пустым'); return; }
    if (text.length > 280) { showModal('Ошибка', 'Максимум 280 символов'); return; }
    showLoader(); isLoading = true;
    supabase.from('posts').insert({
        author_id: currentUser.id,
        content: text,
        media_url: attachments.length > 0 ? attachments[0].url : null,
        created_at: new Date().toISOString()
    }).then(function(response) {
        hideLoader(); isLoading = false;
        if (response.error) { showModal('Ошибка', response.error.message); return; }
        textInput.value = ''; attachments = []; renderAttachments();
        showModal('Успех', 'Пост опубликован!'); showView('feed');
    }).catch(function() { hideLoader(); isLoading = false; });
}

function openMedia(url) {
    var preview = document.getElementById('media-preview');
    var modal = document.getElementById('media-preview-modal');
    if (preview && modal) { preview.src = url; modal.classList.remove('hidden'); }
}
function closeMediaPreview() { var modal = document.getElementById('media-preview-modal'); if (modal) modal.classList.add('hidden'); }
function showComments(postId) { showModal('Информация', 'Функция комментариев будет добавлена позже'); }
// ===== ПРОФИЛЬ =====
function goToProfile(userId) {
    currentProfileId = userId || currentUser.id;
    showView('profile');
    loadProfile(currentProfileId);
}

function loadProfile(userId) {
    if (isLoading) return;
    isLoading = true;
    showLoader();

    supabase.from('profiles').select('*, posts(count)').eq('id', userId).single().then(function(response) {
        if (response.error) { hideLoader(); isLoading = false; showModal('Ошибка', response.error.message); return; }

        var profile = response.data;
        var avatarEl = document.getElementById('profile-avatar');
        var usernameEl = document.getElementById('profile-username');
        var bioEl = document.getElementById('profile-bio');
        if (avatarEl) avatarEl.src = profile.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + profile.username;
        if (usernameEl) usernameEl.textContent = profile.display_name || profile.username;
        if (bioEl) bioEl.textContent = profile.bio || 'Нет описания';

        var postsEl = document.getElementById('profile-posts');
        if (postsEl) postsEl.textContent = (profile.posts ? profile.posts.length : 0) + ' постов';

        supabase.from('follows').select('*').eq('following_id', userId).then(function(followersResponse) {
            supabase.from('follows').select('*').eq('follower_id', userId).then(function(followingResponse) {
                hideLoader(); isLoading = false;
                var followersEl = document.getElementById('profile-followers');
                var followingEl = document.getElementById('profile-following');
                if (followersEl) followersEl.textContent = (followersResponse.data ? followersResponse.data.length : 0) + ' подписчиков';
                if (followingEl) followingEl.textContent = (followingResponse.data ? followingResponse.data.length : 0) + ' подписок';

                var editBtn = document.getElementById('profile-edit-btn');
                var subscribeBtn = document.getElementById('profile-subscribe-btn');
                if (userId === currentUser.id) {
                    if (editBtn) editBtn.classList.remove('hidden');
                    if (subscribeBtn) subscribeBtn.classList.add('hidden');
                } else {
                    if (editBtn) editBtn.classList.add('hidden');
                    if (subscribeBtn) subscribeBtn.classList.remove('hidden');
                }

                if (userId !== currentUser.id && subscribeBtn) {
                    supabase.from('follows').select('*').eq('follower_id', currentUser.id).eq('following_id', userId).single().then(function(subResponse) {
                        if (subResponse.data) {
                            subscribeBtn.textContent = 'Отписаться';
                            subscribeBtn.classList.remove('btn-primary');
                            subscribeBtn.classList.add('btn-secondary');
                        } else {
                            subscribeBtn.textContent = 'Подписаться';
                            subscribeBtn.classList.remove('btn-secondary');
                            subscribeBtn.classList.add('btn-primary');
                        }
                    });
                }
            });
        });
        loadProfilePosts(userId);
    }).catch(function() { hideLoader(); isLoading = false; });
}

function loadProfilePosts(userId) {
    if (isLoading) return;
    isLoading = true;
    supabase.from('posts').select('*, profiles(*), likes(count), reposts(count)')
        .eq('author_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
        .then(function(response) {
            isLoading = false;
            if (response.error) { console.error('Error loading profile posts:', response.error); return; }
            var container = document.getElementById('profile-posts');
            if (!container) return;
            container.innerHTML = '';
            for (var i = 0; i < response.data.length; i++) {
                container.appendChild(createPostCard(response.data[i]));
            }
        }).catch(function() { isLoading = false; });
}

function editProfile() {
    if (!userData) return;
    var nameInput = document.getElementById('edit-name');
    var bioInput = document.getElementById('edit-bio');
    var linkInput = document.getElementById('edit-link');
    if (nameInput) nameInput.value = userData.display_name || '';
    if (bioInput) bioInput.value = userData.bio || '';
    if (linkInput) linkInput.value = userData.website || '';
    var modal = document.getElementById('edit-profile-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeEditProfile() {
    var modal = document.getElementById('edit-profile-modal');
    if (modal) modal.classList.add('hidden');
}

function saveProfile() {
    var nameInput = document.getElementById('edit-name');
    var bioInput = document.getElementById('edit-bio');
    var linkInput = document.getElementById('edit-link');
    var avatarInput = document.getElementById('edit-avatar');
    if (!nameInput || !bioInput || !linkInput) return;

    var name = nameInput.value;
    var bio = bioInput.value;
    var link = linkInput.value;
    var avatarFile = avatarInput ? avatarInput.files[0] : null;

    showLoader(); isLoading = true;
    var updateData = { display_name: name, bio: bio, website: link };

    if (avatarFile) {
        var fileName = Date.now() + '-' + avatarFile.name;
        var filePath = 'avatars/' + currentUser.id + '/' + fileName;
        supabase.storage.from('avatars').upload(filePath, avatarFile).then(function(response) {
            if (response.error) { hideLoader(); isLoading = false; showModal('Ошибка', response.error.message); return; }
            supabase.storage.from('avatars').getPublicUrl(filePath).then(function(urlResponse) {
                if (urlResponse.error) { hideLoader(); isLoading = false; showModal('Ошибка', urlResponse.error.message); return; }
                updateData.avatar_url = urlResponse.data.publicUrl;
                updateProfileData(updateData);
            });
        }).catch(function() { hideLoader(); isLoading = false; });
    } else {
        updateProfileData(updateData);
    }
}

function updateProfileData(data) {
    supabase.from('profiles').update(data).eq('id', currentUser.id).then(function(response) {
        hideLoader(); isLoading = false;
        if (response.error) { showModal('Ошибка', response.error.message); return; }
        closeEditProfile(); showModal('Успех', 'Профиль обновлен!'); loadUserData(); goToProfile(currentUser.id);
    }).catch(function() { hideLoader(); isLoading = false; });
}

function toggleSubscribe() {
    if (!currentUser || !currentProfileId) return;
    var subscribeBtn = document.getElementById('profile-subscribe-btn');
    if (!subscribeBtn) return;
    supabase.from('follows').select('*').eq('follower_id', currentUser.id).eq('following_id', currentProfileId).single().then(function(response) {
        if (response.data) {
            supabase.from('follows').delete().eq('id', response.data.id).then(function() {
                subscribeBtn.textContent = 'Подписаться';
                subscribeBtn.classList.remove('btn-secondary');
                subscribeBtn.classList.add('btn-primary');
                loadProfile(currentProfileId);
            });
        } else {
            supabase.from('follows').insert({
                follower_id: currentUser.id,
                following_id: currentProfileId,
                created_at: new Date().toISOString()
            }).then(function() {
                subscribeBtn.textContent = 'Отписаться';
                subscribeBtn.classList.remove('btn-primary');
                subscribeBtn.classList.add('btn-secondary');
                loadProfile(currentProfileId);
                sendNotification(currentProfileId, 'Подписка', currentUser.id + ' подписался на вас');
            });
        }
    });
}

// ===== ЧАТЫ =====
function loadChats() {
    if (!currentUser || isLoading) return;
    isLoading = true; showLoader();
    supabase.from('chats').select('*, messages(*), profiles(*)')
        .or('created_by.eq.' + currentUser.id + ',participant_id.eq.' + currentUser.id)
        .order('updated_at', { ascending: false })
        .then(function(response) {
            hideLoader(); isLoading = false;
            if (response.error) { showModal('Ошибка', response.error.message); return; }
            chats = response.data || []; renderChats();
        }).catch(function() { hideLoader(); isLoading = false; });
}

function renderChats() {
    var container = document.getElementById('chats-list');
    if (!container) return;
    container.innerHTML = '';
    for (var i = 0; i < chats.length; i++) {
        var chat = chats[i];
        var otherUser = getOtherUser(chat);
        if (!otherUser) continue;
        var chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.onclick = function() { openChat(chat.id, otherUser.id); };
        var lastMessage = chat.messages && chat.messages.length > 0 ? chat.messages[0] : null;
        chatItem.innerHTML = `
            <img src="${otherUser.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + otherUser.username}" class="chat-avatar">
            <div class="chat-info">
                <div class="chat-name">${filterText(otherUser.display_name || otherUser.username)}</div>
                <div class="chat-last-message">${lastMessage ? filterText(lastMessage.content.substring(0, 30)) + (lastMessage.content.length > 30 ? '...' : '') : 'Новых сообщений'}</div>
            </div>
            <div class="chat-time">${lastMessage ? formatTime(lastMessage.created_at) : ''}</div>
        `;
        container.appendChild(chatItem);
    }
}

function getOtherUser(chat) {
    if (chat.created_by === currentUser.id) return chat.profiles_participant || chat.profiles;
    else return chat.profiles || chat.profiles_created;
}

function openChat(chatId, userId) {
    currentChatId = chatId;
    var chatView = document.getElementById('chat-view');
    if (chatView) chatView.classList.remove('hidden');
    supabase.from('profiles').select('*').eq('id', userId).single().then(function(response) {
        var chatTitle = document.getElementById('chat-title');
        if (chatTitle && response.data) chatTitle.textContent = filterText(response.data.display_name || response.data.username);
    });
    loadMessages(chatId);
    setTimeout(function() {
        var messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

function loadMessages(chatId) {
    if (isLoading) return;
    isLoading = true;
    supabase.from('messages').select('*, profiles(*)')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
        .then(function(response) {
            isLoading = false;
            if (response.error) { console.error('Error loading messages:', response.error); return; }
            var container = document.getElementById('messages-container');
            if (!container) return;
            container.innerHTML = '';
            for (var i = 0; i < response.data.length; i++) {
                container.appendChild(createMessageElement(response.data[i]));
            }
            setTimeout(function() { container.scrollTop = container.scrollHeight; }, 100);
            markMessagesAsRead(chatId);
        }).catch(function() { isLoading = false; });
}

function createMessageElement(message) {
    var isOutgoing = message.sender_id === currentUser.id;
    var messageEl = document.createElement('div');
    messageEl.className = 'message ' + (isOutgoing ? 'outgoing' : 'incoming');
    var avatarUrl = 'https://api.dicebear.com/7.x/avataaars/svg?seed=default';
    if (message.profiles) avatarUrl = message.profiles.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (message.profiles.username || 'default');
    messageEl.innerHTML = '<img src="' + avatarUrl + '" class="message-avatar"><div class="message-content">' + filterText(message.content) + '</div>';
    return messageEl;
}

function sendMessage() {
    var messageInput = document.getElementById('message-input');
    if (!currentChatId || !messageInput) return;
    var text = messageInput.value.trim();
    if (!text) return;
    supabase.from('messages').insert({
        chat_id: currentChatId,
        sender_id: currentUser.id,
        receiver_id: getReceiverId(currentChatId),
        content: text,
        created_at: new Date().toISOString()
    }).then(function(response) {
        if (response.error) { showModal('Ошибка', response.error.message); return; }
        messageInput.value = '';
        supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', currentChatId).then(function() {
            sendNotification(getReceiverId(currentChatId), 'Новое сообщение', 'У вас новое сообщение');
        });
    });
}

function getReceiverId(chatId) {
    for (var i = 0; i < chats.length; i++) {
        if (chats[i].id === chatId) return chats[i].created_by === currentUser.id ? chats[i].participant_id : chats[i].created_by;
    }
    return null;
}

function backToChats() {
    var chatView = document.getElementById('chat-view');
    if (chatView) chatView.classList.add('hidden');
    currentChatId = null;
}

function markMessagesAsRead(chatId) {
    supabase.from('messages').update({ is_read: true })
        .eq('chat_id', chatId)
        .neq('sender_id', currentUser.id)
        .then(function() { loadNotifications(); });
}

// ===== УВЕДОМЛЕНИЯ =====
function loadNotifications() {
    if (!currentUser || isLoading) return;
    isLoading = true;
    supabase.from('notifications').select('*, profiles(*)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(30)
        .then(function(response) {
            isLoading = false;
            if (response.error) { console.error('Error loading notifications:', response.error); return; }
            notifications = response.data || []; renderNotifications(); updateNotificationBadge();
        }).catch(function() { isLoading = false; });
}

function renderNotifications() {
    var container = document.getElementById('notifications-container');
    if (!container) return;
    container.innerHTML = '';
    for (var i = 0; i < notifications.length; i++) {
        var notif = notifications[i];
        var notifEl = document.createElement('div');
        notifEl.className = 'notification ' + (notif.is_read ? '' : 'unread');
        notifEl.onclick = function() { markNotificationAsRead(notif.id); };
        notifEl.innerHTML = '<span class="notification-icon">🔔</span><div class="notification-content"><div class="notification-text">' + filterText(notif.message) + '</div><div class="notification-time">' + formatTime(notif.created_at) + '</div></div>';
        container.appendChild(notifEl);
    }
}

function markNotificationAsRead(notifId) {
    supabase.from('notifications').update({ is_read: true }).eq('id', notifId).then(function() { loadNotifications(); });
}

function updateNotificationBadge() {
    if (!notifications) return;
    var unreadCount = 0;
    for (var i = 0; i < notifications.length; i++) if (!notifications[i].is_read) unreadCount++;
    var badge = document.getElementById('notif-badge');
    if (badge) {
        if (unreadCount > 0) { badge.textContent = unreadCount; badge.classList.remove('hidden'); }
        else badge.classList.add('hidden');
    }
}

function sendNotification(userId, title, message) {
    if (userId === currentUser.id || !currentUser) return;
    supabase.from('notifications').insert({
        user_id: userId, title: title, message: message,
        sender_id: currentUser.id, is_read: false,
        created_at: new Date().toISOString()
    }).then(function() {
        supabase.channel('user_' + userId).send({ type: 'broadcast', event: 'new_notification', payload: { title: title, message: message } });
    });
}
// ===== КОММЕНТАРИИ =====
function showComments(postId) {
    currentPostId = postId;
    var modal = document.getElementById('comments-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'comments-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <h3>Комментарии</h3>
                <div id="comments-container" class="comments-container"></div>
                <div class="comment-input">
                    <input type="text" id="comment-text" placeholder="Добавьте комментарий...">
                    <button onclick="addComment()" class="btn btn-primary">Отправить</button>
                </div>
                <button onclick="closeComments()" class="btn btn-secondary" style="margin-top: 12px;">Закрыть</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.onclick = function(e) { if (e.target.id === 'comments-modal') closeComments(); };
    }
    modal.classList.remove('hidden');
    loadComments(postId);

    var commentInput = document.getElementById('comment-text');
    if (commentInput) {
        commentInput.onkeypress = function(e) { if (e.key === 'Enter') addComment(); };
    }
}

function closeComments() {
    var modal = document.getElementById('comments-modal');
    if (modal) modal.classList.add('hidden');
    currentPostId = null;
}

var currentPostId = null;

function loadComments(postId) {
    if (isLoading) return;
    isLoading = true;
    supabase.from('comments')
        .select('*, profiles(*)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .then(function(response) {
            isLoading = false;
            if (response.error) { showModal('Ошибка', response.error.message); return; }
            renderComments(response.data || []);
        }).catch(function() { isLoading = false; });
}

function renderComments(comments) {
    var container = document.getElementById('comments-container');
    if (!container) return;
    container.innerHTML = '';
    if (comments.length === 0) {
        container.innerHTML = '<p class="no-results">Нет комментариев. Будьте первым!</p>';
        return;
    }
    for (var i = 0; i < comments.length; i++) {
        var comment = comments[i];
        var commentEl = document.createElement('div');
        commentEl.className = 'comment-item';
        var avatarUrl = comment.profiles ? (comment.profiles.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + comment.profiles.username) : 'https://api.dicebear.com/7.x/avataaars/svg?seed=default';
        var premiumBadge = comment.profiles && comment.profiles.is_premium ? '<span class="premium-badge">PREMIUM</span>' : '';
        commentEl.innerHTML = `
            <img src="${avatarUrl}" class="comment-avatar">
            <div class="comment-content">
                <div class="comment-header">
                    <span class="comment-username">${filterText(comment.profiles ? (comment.profiles.display_name || comment.profiles.username) : 'Неизвестно')}</span>
                    ${premiumBadge}
                    <span class="comment-time">${formatTime(comment.created_at)}</span>
                </div>
                <div class="comment-text">${filterText(comment.content)}</div>
            </div>
        `;
        container.appendChild(commentEl);
    }
}

function addComment() {
    if (!currentUser || !currentPostId) {
        showModal('Ошибка', 'Авторизуйтесь');
        return;
    }
    var commentInput = document.getElementById('comment-text');
    if (!commentInput) return;
    var text = commentInput.value.trim();
    if (!text) return;

    showLoader();
    isLoading = true;
    supabase.from('comments').insert({
        post_id: currentPostId,
        user_id: currentUser.id,
        content: text,
        created_at: new Date().toISOString()
    }).then(function(response) {
        hideLoader();
        isLoading = false;
        if (response.error) {
            showModal('Ошибка', response.error.message);
            return;
        }
        commentInput.value = '';
        loadComments(currentPostId);
        // Отправляем уведомление автору поста
        supabase.from('posts').select('author_id').eq('id', currentPostId).single().then(function(postResponse) {
            if (postResponse.data && postResponse.data.author_id !== currentUser.id) {
                sendNotification(postResponse.data.author_id, 'Новый комментарий', currentUser.id + ' оставил комментарий к вашему посту');
            }
        });
    }).catch(function() { hideLoader(); isLoading = false; });
}
// ===== МАГАЗИН GEMs =====
function loadShop() {
    var container = document.getElementById('shop-container');
    if (!container) return;
    container.innerHTML = '';

    if (currentUser) {
        supabase.from('profiles').select('gems').eq('id', currentUser.id).single().then(function(response) {
            var gemsEl = document.getElementById('user-gems');
            if (gemsEl) gemsEl.textContent = response.data ? (response.data.gems || 0) : 0;
        });
    }

    var gemsPackages = [
        { name: '100 Gems', description: 'Набор для начала', price: '99₽', gems: 100 },
        { name: '500 Gems', description: 'Популярный пакет', price: '399₽', gems: 500 },
        { name: '1500 Gems', description: 'Выгодное предложение', price: '999₽', gems: 1500 },
        { name: '5000 Gems', description: 'Максимальная выгода', price: '2499₽', gems: 5000 }
    ];

    for (var i = 0; i < gemsPackages.length; i++) {
        var pkg = gemsPackages[i];
        var item = document.createElement('div');
        item.className = 'shop-item';
        item.innerHTML = `
            <span class="shop-icon">💎</span>
            <div class="shop-info">
                <div class="shop-name">${pkg.name}</div>
                <div class="shop-description">${pkg.description}</div>
            </div>
            <div class="shop-price">${pkg.price}</div>
            <button onclick="buyGems(${pkg.gems}, '${pkg.price}')" class="btn btn-primary">Купить</button>
        `;
        container.appendChild(item);
    }
}

function buyGems(amount, price) {
    if (!currentUser) { showModal('Ошибка', 'Авторизуйтесь'); return; }

    showModal('Успех', 'Вы купили ' + amount + ' Gems за ' + price + '!');

    supabase.from('profiles').select('gems').eq('id', currentUser.id).single().then(function(response) {
        var currentGems = response.data ? (response.data.gems || 0) : 0;
        supabase.from('profiles').update({ gems: currentGems + amount }).eq('id', currentUser.id).then(function() {
            var gemsEl = document.getElementById('user-gems');
            if (gemsEl) gemsEl.textContent = currentGems + amount;

            supabase.from('purchases').insert({
                user_id: currentUser.id,
                gems_package_id: 1,
                gems: amount,
                price: price,
                created_at: new Date().toISOString()
            });
        });
    });
}

function showShop(tab) {
    showView('shop');
    var tabs = document.querySelectorAll('#shop-view .tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');

    if (tab === 'inventory') {
        var inventoryTab = document.querySelectorAll('#shop-view .tab')[1];
        if (inventoryTab) inventoryTab.classList.add('active');
        loadUserInventory();
    } else {
        var gemsTab = document.querySelectorAll('#shop-view .tab')[0];
        if (gemsTab) gemsTab.classList.add('active');
        loadShop();
    }
}

function loadUserInventory() {
    if (!currentUser) return;
    var container = document.getElementById('shop-container');
    if (!container) return;
    container.innerHTML = '<p>Загрузка...</p>';

    supabase.from('purchases').select('*, gems_packages(*)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .then(function(response) {
            if (response.error) { container.innerHTML = '<p>Ошибка загрузки</p>'; return; }
            container.innerHTML = '';
            if (!response.data || response.data.length === 0) {
                container.innerHTML = '<p class="no-results">У вас нет покупок</p>';
                return;
            }
            for (var i = 0; i < response.data.length; i++) {
                var purchase = response.data[i];
                var item = document.createElement('div');
                item.className = 'shop-item';
                item.innerHTML = `
                    <span class="shop-icon">🎁</span>
                    <div class="shop-info">
                        <div class="shop-name">${purchase.gems_packages ? purchase.gems_packages.name : 'Пакет Gems'}</div>
                        <div class="shop-description">Покупка от ${formatDate(purchase.created_at)}</div>
                    </div>
                    <div class="shop-price">${purchase.gems_packages ? purchase.gems_packages.gems + ' Gems' : ''}</div>
                `;
                container.appendChild(item);
            }
        });
}

// ===== PREMIUM =====
function loadPremium() {
    if (!currentUser) return;
    supabase.from('profiles').select('is_premium, premium_expires').eq('id', currentUser.id).single().then(function(response) {
        if (response.data) {
            var statusEl = document.getElementById('premium-status');
            if (statusEl) {
                if (response.data.is_premium) {
                    var expires = new Date(response.data.premium_expires);
                    statusEl.innerHTML = '<span class="premium-active">✓ Premium активен до ' + formatDate(expires) + '</span>';
                } else {
                    statusEl.textContent = 'Premium не активен';
                }
            }
        }
    });
}

function activatePremium() {
    var codeInput = document.getElementById('premium-code');
    if (!codeInput) return;
    var code = codeInput.value.trim();
    if (!code) { showModal('Ошибка', 'Введите код'); return; }

    showLoader(); isLoading = true;
    supabase.from('premium_codes').select('*').eq('code', code).single().then(function(response) {
        hideLoader(); isLoading = false;
        if (response.error || !response.data) { showModal('Ошибка', 'Неверный код'); return; }
        var codeData = response.data;
        if (codeData.used) { showModal('Ошибка', 'Код уже использован'); return; }

        var expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + codeData.duration_days);

        supabase.from('profiles').update({
            is_premium: true,
            premium_expires: expiresAt.toISOString()
        }).eq('id', currentUser.id).then(function() {
            supabase.from('premium_codes').update({
                used: true,
                used_by: currentUser.id,
                used_at: new Date().toISOString()
            }).eq('id', codeData.id).then(function() {
                showModal('Успех', 'Premium активирован!');
                loadPremium();
            });
        });
    }).catch(function() { hideLoader(); isLoading = false; });
}
// ===== АДМИН-ПАНЕЛЬ =====
function loadAdminStats() {
    if (!userData || userData.role !== 'admin') {
        showModal('Ошибка', 'Доступ запрещён');
        showView('feed');
        return;
    }

    showLoader();
    isLoading = true;

    var stats = { total_users: 0, total_posts: 0, total_chats: 0, total_gems_sold: 0 };

    supabase.from('profiles').select('count', { count: 'exact' }).then(function(response) {
        stats.total_users = response.count || 0;

        supabase.from('posts').select('count', { count: 'exact' }).then(function(postsResponse) {
            stats.total_posts = postsResponse.count || 0;

            supabase.from('chats').select('count', { count: 'exact' }).then(function(chatsResponse) {
                stats.total_chats = chatsResponse.count || 0;

                supabase.from('purchases').select('gems_packages(gems)').then(function(gemsResponse) {
                    hideLoader();
                    isLoading = false;

                    if (gemsResponse.data) {
                        for (var i = 0; i < gemsResponse.data.length; i++) {
                            if (gemsResponse.data[i].gems_packages) {
                                stats.total_gems_sold += gemsResponse.data[i].gems_packages.gems;
                            }
                        }
                    }
                    renderAdminStats(stats);
                });
            });
        });
    }).catch(function() { hideLoader(); isLoading = false; });
}

function renderAdminStats(stats) {
    var container = document.getElementById('admin-container');
    if (!container) return;
    container.innerHTML = `
        <div class="admin-stats">
            <div class="stat-card">
                <div class="stat-value">${stats.total_users}</div>
                <div class="stat-label">Пользователей</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.total_posts}</div>
                <div class="stat-label">Постов</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.total_chats}</div>
                <div class="stat-label">Чатов</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.total_gems_sold}</div>
                <div class="stat-label">Gems продано</div>
            </div>
        </div>
    `;
}

function showAdmin(tab) {
    showView('admin');
    var tabs = document.querySelectorAll('#admin-view .tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');

    var tabIndex = 0;
    if (tab === 'gems') tabIndex = 1;
    else if (tab === 'premium') tabIndex = 2;
    else if (tab === 'bans') tabIndex = 3;
    else if (tab === 'warnings') tabIndex = 4;

    var activeTab = document.querySelectorAll('#admin-view .tab')[tabIndex];
    if (activeTab) activeTab.classList.add('active');

    if (tab === 'stats') loadAdminStats();
    else if (tab === 'gems') loadAdminGems();
    else if (tab === 'premium') loadAdminPremium();
    else if (tab === 'bans') loadAdminBans();
    else if (tab === 'warnings') loadAdminWarnings();
}

function loadAdminGems() {
    supabase.from('purchases').select('*, profiles(*), gems_packages(*)')
        .order('created_at', { ascending: false })
        .then(function(response) {
            var container = document.getElementById('admin-container');
            if (!container) return;
            container.innerHTML = '<h3>История покупок Gems</h3>';
            if (response.error) { container.innerHTML += '<p>Ошибка загрузки</p>'; return; }
            if (!response.data || response.data.length === 0) { container.innerHTML += '<p>Нет покупок</p>'; return; }
            for (var i = 0; i < response.data.length; i++) {
                var purchase = response.data[i];
                var row = document.createElement('div');
                row.className = 'admin-action';
                row.innerHTML = `
                    <div>
                        <div><strong>${purchase.profiles ? (purchase.profiles.display_name || purchase.profiles.username) : 'Неизвестно'}</strong></div>
                        <div>${purchase.gems_packages ? purchase.gems_packages.name : 'Неизвестно'}</div>
                    </div>
                    <div>${formatDate(purchase.created_at)}</div>
                `;
                container.appendChild(row);
            }
        });
}

function loadAdminPremium() {
    supabase.from('premium_codes').select('*')
        .order('created_at', { ascending: false })
        .then(function(response) {
            var container = document.getElementById('admin-container');
            if (!container) return;
            container.innerHTML = '<h3>Premium коды</h3><button onclick="generatePremiumCode()" class="btn btn-primary" style="margin-bottom: 12px;">Сгенерировать код</button>';
            if (response.error) { container.innerHTML += '<p>Ошибка загрузки</p>'; return; }
            if (!response.data || response.data.length === 0) { container.innerHTML += '<p>Нет кодов</p>'; return; }
            for (var i = 0; i < response.data.length; i++) {
                var code = response.data[i];
                var row = document.createElement('div');
                row.className = 'admin-action';
                row.innerHTML = `
                    <div>
                        <div><strong>${code.code}</strong> (${code.duration_days} дней)</div>
                        <div>${code.used ? 'Использован: ' + (code.used_by || 'неизвестно') : 'Не использован'}</div>
                    </div>
                    <div>${formatDate(code.created_at)}</div>
                `;
                container.appendChild(row);
            }
        });
}

function generatePremiumCode() {
    var duration = prompt('Сколько дней действует код?', '30');
    if (!duration) return;
    var code = generateRandomCode(10);
    supabase.from('premium_codes').insert({
        code: code,
        duration_days: parseInt(duration),
        created_at: new Date().toISOString(),
        used: false
    }).then(function(response) {
        if (response.error) { showModal('Ошибка', response.error.message); return; }
        showModal('Успех', 'Код: <strong>' + code + '</strong><br>Действует ' + duration + ' дней');
        loadAdminPremium();
    });
}

function generateRandomCode(length) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var code = '';
    for (var i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function loadAdminBans() {
    supabase.from('bans').select('*, profiles(*)')
        .order('created_at', { ascending: false })
        .then(function(response) {
            var container = document.getElementById('admin-container');
            if (!container) return;
            container.innerHTML = '<h3>Заблокированные пользователи</h3>';
            if (response.error) { container.innerHTML += '<p>Ошибка загрузки</p>'; return; }
            if (!response.data || response.data.length === 0) { container.innerHTML += '<p>Нет заблокированных</p>'; return; }
            for (var i = 0; i < response.data.length; i++) {
                var ban = response.data[i];
                var row = document.createElement('div');
                row.className = 'admin-action';
                row.innerHTML = `
                    <div>
                        <div><strong>${ban.profiles ? (ban.profiles.display_name || ban.profiles.username) : 'Неизвестно'}</strong></div>
                        <div>Причина: ${ban.reason || 'Не указана'}</div>
                    </div>
                    <button onclick="unbanUser('${ban.user_id}')" class="btn btn-secondary">Разблокировать</button>
                `;
                container.appendChild(row);
            }
        });
}

function loadAdminWarnings() {
    supabase.from('warnings').select('*, profiles(*)')
        .order('created_at', { ascending: false })
        .then(function(response) {
            var container = document.getElementById('admin-container');
            if (!container) return;
            container.innerHTML = '<h3>Предупреждения</h3>';
            if (response.error) { container.innerHTML += '<p>Ошибка загрузки</p>'; return; }
            if (!response.data || response.data.length === 0) { container.innerHTML += '<p>Нет предупреждений</p>'; return; }
            for (var i = 0; i < response.data.length; i++) {
                var warning = response.data[i];
                var row = document.createElement('div');
                row.className = 'admin-action';
                row.innerHTML = `
                    <div>
                        <div><strong>${warning.profiles ? (warning.profiles.display_name || warning.profiles.username) : 'Неизвестно'}</strong></div>
                        <div>Причина: ${warning.reason || 'Не указана'}</div>
                    </div>
                    <div>${formatDate(warning.created_at)}</div>
                `;
                container.appendChild(row);
            }
        });
}

function unbanUser(userId) {
    supabase.from('bans').delete().eq('user_id', userId).then(function() {
        showModal('Успех', 'Пользователь разблокирован');
        loadAdminBans();
    });
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function filterText(text) {
    if (!text) return '';
    var badWords = ['хуй', 'пизда', 'блядь', 'ебать', 'сука', 'залупа', 'мудак', 'пидор', 'говно', 'жопа', 'член', 'вагина', 'кончать', 'трахать', 'еблан', 'залупа', 'пиздец', 'нахуй', 'пошел', 'нафиг'];
    for (var i = 0; i < badWords.length; i++) {
        var regex = new RegExp(badWords[i], 'gi');
        text = text.replace(regex, '***');
    }
    return text;
}

function formatTime(dateString) {
    if (!dateString) return '';
    var date = new Date(dateString);
    var now = new Date();
    var diff = now - date;
    var seconds = Math.floor(diff / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);
    if (days > 0) return days + ' д. назад';
    if (hours > 0) return hours + ' ч. назад';
    if (minutes > 0) return minutes + ' мин. назад';
    return 'Только что';
}

function formatDate(dateString) {
    if (!dateString) return '';
    var date = new Date(dateString);
    return date.toLocaleDateString('ru-RU');
}

function validateEmail(email) {
    var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function generateSalt() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function sha256(str) {
    return CryptoJS.SHA256(str).toString();
}

function showLoader() {
    var loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hidden');
}

function hideLoader() {
    var loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
}

function showModal(title, message) {
    var modalTitle = document.getElementById('modal-title');
    var modalMessage = document.getElementById('modal-message');
    var modal = document.getElementById('modal');
    if (modalTitle) modalTitle.textContent = title;
    if (modalMessage) modalMessage.innerHTML = message;
    if (modal) modal.classList.remove('hidden');
}

function closeModal() {
    var modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
}

function toggleMenu() {
    var menu = document.getElementById('side-menu');
    if (menu) menu.classList.toggle('hidden');
}