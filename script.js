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
var activeMobileTab = 'feed';

// Вспомогательные функции
function showToast(message, type) {
    var toast = document.getElementById('global-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(function() {
        toast.className = 'toast ' + type;
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function filterBadWords(text) {
    var badWords = ['badword1', 'badword2'];
    var filtered = text;
    for (var i = 0; i < badWords.length; i++) {
        var regex = new RegExp(badWords[i], 'gi');
        filtered = filtered.replace(regex, '***');
    }
    return filtered;
}

// SHA-256 хэширование
function sha256(password, salt) {
    return sha512.sha256(password + salt);
}

// Управление сессией
function saveSession(user) {
    var session = {
        user: user,
        expires_at: new Date().getTime() + 24 * 60 * 60 * 1000
    };
    localStorage.setItem('nobu_session', JSON.stringify(session));
    currentSession = session;
    currentUser = user;
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
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');
    var tabs = document.querySelectorAll('.auth-tab');
    if (tab === 'login') {
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
}

function login() {
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    if (!email || !password) {
        showToast('Заполните все поля', 'error');
        return;
    }
    supabase.from('users').select('*').eq('email', email).single().then(function(res) {
        if (res.error || !res.data) {
            showToast('Неверный email или пароль', 'error');
            return;
        }
        var user = res.data;
        var hash = sha256(password, user.salt);
        if (hash !== user.password_hash) {
            showToast('Неверный email или пароль', 'error');
            return;
        }
        // Проверка бана
        supabase.from('bans').select('*').eq('user_id', user.id).gte('banned_until', new Date().toISOString()).maybeSingle().then(function(banRes) {
            if (banRes.data) {
                showToast('Аккаунт заблокирован до ' + new Date(banRes.data.banned_until).toLocaleString(), 'error');
                return;
            }
            saveSession(user);
            showScreen('main-screen');
            initMainScreen();
            showToast('Добро пожаловать!', 'success');
        });
    });
}

function register() {
    var email = document.getElementById('reg-email').value.trim();
    var username = document.getElementById('reg-username').value.trim();
    var handle = document.getElementById('reg-handle').value.trim();
    var password = document.getElementById('reg-password').value;
    if (!email || !username || !handle || !password) {
        showToast('Заполните все поля', 'error');
        return;
    }
    if (handle.charAt(0) !== '@') handle = '@' + handle;
    // Проверка существования
    supabase.from('users').select('id').or('email.eq.' + email + ',handle.eq.' + handle).limit(1).then(function(checkRes) {
        if (checkRes.data && checkRes.data.length > 0) {
            showToast('Пользователь с таким email или handle уже существует', 'error');
            return;
        }
        var salt = Math.random().toString(36).substring(2, 15);
        var hash = sha256(password, salt);
        supabase.from('users').insert({
            email: email,
            username: username,
            handle: handle,
            password_hash: hash,
            salt: salt,
            is_admin: false,
            is_premium: false,
            gems: 0,
            avatar_url: null,
            banner_url: null,
            bio: '',
            location: '',
            link: '',
            premium_until: null
        }).select().single().then(function(insertRes) {
            if (insertRes.error) {
                showToast('Ошибка регистрации: ' + insertRes.error.message, 'error');
                return;
            }
            showToast('Регистрация успешна! Теперь войдите.', 'success');
            switchAuthTab('login');
        });
    });
}

function logout() {
    clearSession();
    closeRealtimeChannels();
    showScreen('auth-screen');
}

// Инициализация после входа
function initMainScreen() {
    if (!currentUser) return;
    document.getElementById('sidebar-username').textContent = currentUser.username;
    document.getElementById('sidebar-handle').textContent = currentUser.handle;
    var avatarEl = document.getElementById('sidebar-avatar');
    if (currentUser.avatar_url) {
        avatarEl.style.backgroundImage = 'url(' + currentUser.avatar_url + ')';
    } else {
        avatarEl.style.backgroundImage = '';
    }
    document.getElementById('gems-display').textContent = currentUser.gems || 0;
    if (currentUser.is_admin) {
        document.getElementById('admin-btn').style.display = 'inline-block';
    }
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
    var feedPosts = document.getElementById('feed-posts');
    feedPosts.innerHTML = '';
    var tabs = document.querySelectorAll('.feed-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (type === 'latest') tabs[0].classList.add('active');
    else if (type === 'popular') tabs[1].classList.add('active');
    else tabs[2].classList.add('active');
    hideAllContainers();
    document.getElementById('feed-container').style.display = 'block';
    loadFeed();
}

function hideAllContainers() {
    document.getElementById('feed-container').style.display = 'none';
    document.getElementById('profile-container').style.display = 'none';
    document.getElementById('chats-container').style.display = 'none';
    document.getElementById('chat-window').style.display = 'none';
    document.getElementById('search-container').style.display = 'none';
}

async function loadFeed() {
    if (feedLoading || !hasMoreFeed) return;
    feedLoading = true;
    document.getElementById('feed-loader').style.display = 'block';
    try {
        var query;
        if (currentFeed === 'popular') {
            // Можно сортировать по количеству лайков, но упростим: обычный порядок
            query = supabase.from('chirps').select('*, users!inner(id, handle, username, avatar_url, is_premium, is_admin)').order('created_at', { ascending: false }).range(feedPage * 10, feedPage * 10 + 9);
        } else if (currentFeed === 'subscriptions') {
            var followRes = await supabase.from('follows').select('followee_id').eq('follower_id', currentUser.id);
            if (followRes.data && followRes.data.length > 0) {
                var ids = followRes.data.map(function(f) { return f.followee_id; });
                query = supabase.from('chirps').select('*, users!inner(id, handle, username, avatar_url, is_premium, is_admin)').in('user_id', ids).order('created_at', { ascending: false }).range(feedPage * 10, feedPage * 10 + 9);
            } else {
                document.getElementById('feed-posts').innerHTML = '<p style="color:#8888bb;">Подпишитесь на кого-нибудь, чтобы видеть чирпы.</p>';
                hasMoreFeed = false;
                document.getElementById('feed-loader').style.display = 'none';
                feedLoading = false;
                return;
            }
        } else {
            query = supabase.from('chirps').select('*, users!inner(id, handle, username, avatar_url, is_premium, is_admin)').order('created_at', { ascending: false }).range(feedPage * 10, feedPage * 10 + 9);
        }
        var res = await query;
        if (res.error || !res.data || res.data.length === 0) {
            hasMoreFeed = false;
            document.getElementById('feed-loader').style.display = 'none';
            feedLoading = false;
            return;
        }
        renderPosts(res.data);
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
        var avatarBg = user.avatar_url ? 'background-image:url(' + user.avatar_url + ')' : '';
        var premiumBadge = user.is_premium ? ' <span style="color:gold;">⭐</span>' : '';
        var verifiedBadge = user.is_admin ? ' <span style="color:#3b82f6;">✔️</span>' : '';
        var mediaHtml = post.media_url ? '<img src="' + post.media_url + '" class="post-media">' : '';
        var cardHtml = '<div class="post-card">' +
            '<div class="post-header">' +
            '<div class="post-avatar" style="' + avatarBg + '"></div>' +
            '<div><span class="post-author">' + escapeHtml(user.username) + '</span> <span class="post-handle">' + escapeHtml(user.handle) + '</span>' + premiumBadge + verifiedBadge + '</div>' +
            '</div>' +
            '<div class="post-content">' + escapeHtml(filterBadWords(post.content)) + '</div>' +
            mediaHtml +
            '<div class="post-actions">' +
            '<button class="action-btn" onclick="likeChirp(\'' + post.id + '\', this)">❤️ <span>0</span></button>' +
            '<button class="action-btn" onclick="rechirp(\'' + post.id + '\')">🔄</button>' +
            '</div></div>';
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        container.appendChild(tempDiv.firstChild);
    }
}

// Бесконечная прокрутка
window.onscroll = function() {
    if (feedLoading || !hasMoreFeed) return;
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 600) {
        loadFeed();
    }
};

// Поиск
function showSearch() {
    hideAllContainers();
    document.getElementById('search-container').style.display = 'block';
}

function performSearch() {
    var query = document.getElementById('search-input').value.trim();
    if (!query) return;
    var results = document.getElementById('search-results');
    results.innerHTML = '<p>Поиск...</p>';
    if (query.startsWith('@')) {
        searchByHandle(query.substring(1));
    } else if (query.startsWith('#')) {
        searchByHashtag(query.substring(1));
    } else {
        searchAll(query);
    }
}

function searchByHandle(handle) {
    supabase.from('users').select('*').ilike('handle', '%' + handle + '%').then(function(res) {
        var html = '';
        if (res.data) {
            for (var i = 0; i < res.data.length; i++) {
                var u = res.data[i];
                html += '<div class="chat-item" onclick="viewProfile(\'' + u.id + '\')">' + escapeHtml(u.handle) + ' - ' + escapeHtml(u.username) + '</div>';
            }
        }
        document.getElementById('search-results').innerHTML = html || '<p>Ничего не найдено</p>';
    });
}

function searchByHashtag(tag) {
    supabase.from('chirps').select('*, users(*)').ilike('content', '%#' + tag + '%').then(function(res) {
        var container = document.getElementById('search-results');
        container.innerHTML = '';
        if (res.data && res.data.length > 0) {
            renderPosts(res.data);
        } else {
            container.innerHTML = '<p>Ничего не найдено</p>';
        }
    });
}

function searchAll(query) {
    // Поиск по контенту и пользователям
    supabase.from('chirps').select('*, users(*)').ilike('content', '%' + query + '%').then(function(res) {
        var container = document.getElementById('search-results');
        container.innerHTML = '';
        if (res.data && res.data.length > 0) {
            renderPosts(res.data);
        } else {
            container.innerHTML = '<p>Ничего не найдено</p>';
        }
    });
}

function performSearchPC() {
    var query = document.getElementById('search-input-pc').value.trim();
    document.getElementById('search-input').value = query;
    performSearch();
    showSearch();
}

// Профиль
function viewProfile(userId) {
    currentProfileId = userId;
    hideAllContainers();
    document.getElementById('profile-container').style.display = 'block';
    loadProfile(userId);
}

function loadProfile(userId) {
    supabase.from('users').select('*').eq('id', userId).single().then(function(res) {
        if (!res.data) return;
        var user = res.data;
        document.getElementById('profile-banner').style.backgroundImage = user.banner_url ? 'url(' + user.banner_url + ')' : '';
        document.getElementById('profile-avatar').style.backgroundImage = user.avatar_url ? 'url(' + user.avatar_url + ')' : '';
        document.getElementById('profile-name').textContent = user.username;
        document.getElementById('profile-handle-display').textContent = user.handle;
        document.getElementById('profile-bio').textContent = user.bio || '';
        document.getElementById('profile-location').textContent = user.location ? '📍 ' + user.location : '📍 Не указано';
        var linkEl = document.getElementById('profile-link');
        if (user.link) {
            linkEl.href = user.link;
            linkEl.textContent = '🔗 ' + user.link;
            linkEl.style.display = 'inline';
        } else {
            linkEl.style.display = 'none';
        }
        // Статистика
        supabase.from('chirps').select('*', { count: 'exact' }).eq('user_id', userId).then(function(cRes) {
            document.getElementById('profile-chirps').innerHTML = '<strong>' + cRes.count + '</strong> чирпов';
        });
        supabase.from('follows').select('*', { count: 'exact' }).eq('followee_id', userId).then(function(fRes) {
            document.getElementById('profile-followers').innerHTML = '<strong>' + fRes.count + '</strong> подписчиков';
        });
        supabase.from('follows').select('*', { count: 'exact' }).eq('follower_id', userId).then(function(fRes) {
            document.getElementById('profile-following').innerHTML = '<strong>' + fRes.count + '</strong> подписок';
        });
        // Premium badge
        document.getElementById('profile-premium-badge').style.display = user.is_premium ? 'inline' : 'none';
        // Verified (admin)
        document.getElementById('profile-verified').style.display = user.is_admin ? 'inline' : 'none';
        // Кнопки
        var isOwner = currentUser && currentUser.id === userId;
        document.getElementById('follow-btn').style.display = isOwner ? 'none' : 'inline-block';
        document.getElementById('edit-profile-btn').style.display = isOwner ? 'inline-block' : 'none';
        document.getElementById('premium-btn').style.display = isOwner ? 'inline-block' : 'none';
        document.getElementById('admin-btn').style.display = (currentUser && currentUser.is_admin) ? 'inline-block' : 'none';
        if (!isOwner) {
            checkFollowStatus(userId);
        }
        // Посты пользователя
        loadUserPosts(userId);
    });
}

function checkFollowStatus(userId) {
    supabase.from('follows').select('*').eq('follower_id', currentUser.id).eq('followee_id', userId).maybeSingle().then(function(res) {
        var btn = document.getElementById('follow-btn');
        if (res.data) {
            btn.textContent = 'Отписаться';
            btn.onclick = function() { unfollowUser(userId); };
        } else {
            btn.textContent = 'Подписаться';
            btn.onclick = function() { followUser(userId); };
        }
    });
}

function toggleFollow() {
    // Вызывается из кнопки, которая уже настроена
}

function followUser(userId) {
    supabase.from('follows').insert({ follower_id: currentUser.id, followee_id: userId }).then(function() {
        createNotification(userId, 'follow', null);
        checkFollowStatus(userId);
        loadProfile(userId); // обновить счетчики
    });
}

function unfollowUser(userId) {
    supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('followee_id', userId).then(function() {
        checkFollowStatus(userId);
        loadProfile(userId);
    });
}

function loadUserPosts(userId) {
    supabase.from('chirps').select('*, users(*)').eq('user_id', userId).order('created_at', { ascending: false }).then(function(res) {
        var container = document.getElementById('profile-posts');
        container.innerHTML = '';
        if (res.data) {
            renderPostsToContainer(res.data, container);
        }
    });
}

function renderPostsToContainer(posts, container) {
    for (var i = 0; i < posts.length; i++) {
        var post = posts[i];
        var user = post.users;
        var avatarBg = user.avatar_url ? 'background-image:url(' + user.avatar_url + ')' : '';
        var mediaHtml = post.media_url ? '<img src="' + post.media_url + '" class="post-media">' : '';
        var cardHtml = '<div class="post-card">' +
            '<div class="post-header">' +
            '<div class="post-avatar" style="' + avatarBg + '"></div>' +
            '<div><span class="post-author">' + escapeHtml(user.username) + '</span> <span class="post-handle">' + escapeHtml(user.handle) + '</span></div>' +
            '</div>' +
            '<div class="post-content">' + escapeHtml(post.content) + '</div>' +
            mediaHtml +
            '</div>';
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        container.appendChild(tempDiv.firstChild);
    }
}

// Редактирование профиля
function showEditProfile() {
    openModal('edit-profile-modal');
    document.getElementById('bio-input').value = currentUser.bio || '';
    document.getElementById('location-input').value = currentUser.location || '';
    document.getElementById('link-input').value = currentUser.link || '';
}

function updateProfile() {
    var bio = document.getElementById('bio-input').value;
    var location = document.getElementById('location-input').value;
    var link = document.getElementById('link-input').value;
    var avatarFile = document.getElementById('avatar-upload').files[0];
    var bannerFile = document.getElementById('banner-upload').files[0];
    var updates = { bio: bio, location: location, link: link };
    var uploadPromises = [];
    if (avatarFile) {
        uploadPromises.push(uploadFile(avatarFile, 'avatars').then(function(url) { if (url) updates.avatar_url = url; }));
    }
    if (bannerFile) {
        uploadPromises.push(uploadFile(bannerFile, 'banners').then(function(url) { if (url) updates.banner_url = url; }));
    }
    Promise.all(uploadPromises).then(function() {
        supabase.from('users').update(updates).eq('id', currentUser.id).then(function() {
            // Обновить currentUser
            for (var key in updates) {
                if (updates.hasOwnProperty(key)) currentUser[key] = updates[key];
            }
            saveSession(currentUser);
            closeModal();
            loadProfile(currentUser.id);
            showToast('Профиль обновлён', 'success');
        });
    });
}

function uploadFile(file, bucket) {
    return supabase.storage.from(bucket).upload(Date.now() + '_' + file.name, file).then(function(res) {
        if (res.error) {
            showToast('Ошибка загрузки файла', 'error');
            return null;
        }
        return supabase.storage.from(bucket).getPublicUrl(res.data.path).publicURL;
    });
}

// Чирпы
function createPostFab() {
    openModal('create-post-modal');
}

function createPost() {
    if (!currentUser) return;
    var now = Date.now();
    if (now - lastPostTime < 10000) {
        showToast('Слишком часто, подождите 10 секунд', 'error');
        return;
    }
    var content = document.getElementById('post-content').value.trim();
    if (!content || content.length > 280) {
        showToast('Чирп должен быть от 1 до 280 символов', 'error');
        return;
    }
    var mediaFile = document.getElementById('post-media').files[0];
    var uploadPromise = mediaFile ? uploadFile(mediaFile, 'media') : Promise.resolve(null);
    uploadPromise.then(function(mediaUrl) {
        var postData = {
            user_id: currentUser.id,
            content: filterBadWords(content),
            media_url: mediaUrl
        };
        supabase.from('chirps').insert(postData).select('*, users(*)').single().then(function(res) {
            if (res.error) {
                showToast('Ошибка публикации', 'error');
                return;
            }
            lastPostTime = now;
            document.getElementById('post-content').value = '';
            document.getElementById('post-media').value = '';
            document.getElementById('char-count').textContent = '0';
            closeModal();
            if (currentFeed === 'latest' && document.getElementById('feed-container').style.display !== 'none') {
                var container = document.getElementById('feed-posts');
                var tempDiv = document.createElement('div');
                renderPostsToContainer([res.data], tempDiv);
                container.insertBefore(tempDiv.firstChild, container.firstChild);
            }
            showToast('Чирп опубликован!', 'success');
            giveGems(1, 'За пост');
        });
    });
}

// Обновление счетчика символов
document.addEventListener('DOMContentLoaded', function() {
    var postContent = document.getElementById('post-content');
    if (postContent) {
        postContent.addEventListener('input', function() {
            document.getElementById('char-count').textContent = this.value.length;
        });
    }
});

// Лайки
function likeChirp(chirpId, btn) {
    if (!currentUser) return;
    supabase.from('likes').select('*').eq('user_id', currentUser.id).eq('chirp_id', chirpId).maybeSingle().then(function(res) {
        if (res.data) {
            supabase.from('likes').delete().eq('id', res.data.id).then(function() {
                btn.classList.remove('liked');
                updateLikeCount(btn, -1);
            });
        } else {
            supabase.from('likes').insert({ user_id: currentUser.id, chirp_id: chirpId }).then(function() {
                btn.classList.add('liked');
                updateLikeCount(btn, 1);
                supabase.from('chirps').select('user_id').eq('id', chirpId).single().then(function(cRes) {
                    if (cRes.data && cRes.data.user_id !== currentUser.id) {
                        createNotification(cRes.data.user_id, 'like', chirpId);
                    }
                });
            });
        }
    });
}

function updateLikeCount(btn, delta) {
    var span = btn.querySelector('span');
    if (span) {
        var count = parseInt(span.textContent) || 0;
        span.textContent = count + delta;
    }
}

function rechirp(chirpId) {
    showToast('Речирпнуто!', 'success');
}

// Уведомления
function createNotification(userId, type, chirpId) {
    supabase.from('notifications').insert({
        user_id: userId,
        type: type,
        from_user_id: currentUser.id,
        chirp_id: chirpId || null
    }).then();
}

function loadNotifications() {
    if (!currentUser) return;
    supabase.from('notifications').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20).then(function(res) {
        var container = document.getElementById('notifications-list');
        if (!container) return;
        container.innerHTML = '';
        if (res.data && res.data.length > 0) {
            for (var i = 0; i < res.data.length; i++) {
                var n = res.data[i];
                var div = document.createElement('div');
                div.className = 'notification-item chat-item';
                div.textContent = n.type === 'follow' ? 'Новый подписчик!' : (n.type === 'like' ? 'Ваш чирп понравился!' : 'Упоминание');
                container.appendChild(div);
            }
        } else {
            container.innerHTML = '<p style="color:#8888bb;">Нет уведомлений</p>';
        }
    });
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
    for (var i = 0; i < modals.length; i++) {
        modals[i].style.display = 'none';
    }
}

// Чаты
function showChatsList() {
    hideAllContainers();
    document.getElementById('chats-container').style.display = 'block';
    switchChatsTab('private');
}

function switchChatsTab(tab) {
    document.getElementById('private-chats-list').style.display = tab === 'private' ? 'block' : 'none';
    document.getElementById('group-chats-list').style.display = tab === 'groups' ? 'block' : 'none';
    var tabs = document.querySelectorAll('.chat-tab');
    tabs[0].classList.toggle('active', tab === 'private');
    tabs[1].classList.toggle('active', tab === 'groups');
    if (tab === 'private') loadPrivateChats();
    else loadGroupChats();
}

function loadPrivateChats() {
    supabase.from('chats').select('*').or('user1_id.eq.' + currentUser.id + ',user2_id.eq.' + currentUser.id).then(function(res) {
        var container = document.getElementById('private-chats-list');
        container.innerHTML = '';
        if (res.data) {
            res.data.forEach(function(chat) {
                var otherId = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
                supabase.from('users').select('handle, username, avatar_url').eq('id', otherId).single().then(function(uRes) {
                    var user = uRes.data;
                    var avatarBg = user && user.avatar_url ? 'background-image:url(' + user.avatar_url + ')' : '';
                    var html = '<div class="chat-item" onclick="openChat(\'' + chat.id + '\')">' +
                        '<div class="post-avatar" style="' + avatarBg + '"></div>' +
                        '<div>' + (user ? escapeHtml(user.username) : 'Пользователь') + '</div></div>';
                    container.innerHTML += html;
                });
            });
        }
    });
}

function openChat(chatId) {
    currentChatId = chatId;
    currentGroupId = null;
    hideAllContainers();
    document.getElementById('chat-window').style.display = 'flex';
    supabase.from('chats').select('*').eq('id', chatId).single().then(function(res) {
        var chat = res.data;
        var otherId = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
        supabase.from('users').select('handle').eq('id', otherId).single().then(function(uRes) {
            document.getElementById('chat-title').textContent = uRes.data ? uRes.data.handle : 'Чат';
        });
    });
    loadChatMessages(chatId);
}

function loadChatMessages(chatId) {
    supabase.from('chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true }).then(function(res) {
        var container = document.getElementById('chat-messages');
        container.innerHTML = '';
        if (res.data) {
            res.data.forEach(function(msg) {
                var div = document.createElement('div');
                div.className = 'chat-message' + (msg.sender_id === currentUser.id ? ' self' : '');
                div.textContent = decodeMessage(msg.content);
                container.appendChild(div);
            });
        }
        container.scrollTop = container.scrollHeight;
    });
}

function encodeMessage(text) {
    return btoa(unescape(encodeURIComponent(text)));
}
function decodeMessage(encoded) {
    return decodeURIComponent(escape(atob(encoded)));
}

function sendMessage() {
    if (!currentChatId && !currentGroupId) return;
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    if (!text) return;
    var encoded = encodeMessage(text);
    if (currentChatId) {
        supabase.from('chat_messages').insert({ chat_id: currentChatId, sender_id: currentUser.id, content: encoded }).then(function() {
            input.value = '';
            loadChatMessages(currentChatId);
        });
    } else if (currentGroupId) {
        supabase.from('group_messages').insert({ group_id: currentGroupId, sender_id: currentUser.id, content: encoded }).then(function() {
            input.value = '';
            loadGroupMessages(currentGroupId);
        });
    }
}

function closeChat() {
    currentChatId = null;
    currentGroupId = null;
    document.getElementById('chat-window').style.display = 'none';
    showFeed(currentFeed);
}

// Групповые чаты
function loadGroupChats() {
    supabase.from('group_members').select('group_id').eq('user_id', currentUser.id).then(function(res) {
        if (!res.data || res.data.length === 0) {
            document.getElementById('group-chats-list').innerHTML = '<p>Нет групп</p>';
            return;
        }
        var ids = res.data.map(function(m) { return m.group_id; });
        supabase.from('groups_chats').select('*').in('id', ids).then(function(gRes) {
            var container = document.getElementById('group-chats-list');
            container.innerHTML = '';
            gRes.data.forEach(function(g) {
                var html = '<div class="chat-item" onclick="openGroupChat(\'' + g.id + '\')">' +
                    '<div>' + escapeHtml(g.name) + '</div></div>';
                container.innerHTML += html;
            });
        });
    });
}

function openGroupChat(groupId) {
    currentGroupId = groupId;
    currentChatId = null;
    hideAllContainers();
    document.getElementById('chat-window').style.display = 'flex';
    document.getElementById('chat-title').textContent = 'Группа';
    loadGroupMessages(groupId);
}

function loadGroupMessages(groupId) {
    supabase.from('group_messages').select('*').eq('group_id', groupId).order('created_at', { ascending: true }).then(function(res) {
        var container = document.getElementById('chat-messages');
        container.innerHTML = '';
        if (res.data) {
            res.data.forEach(function(msg) {
                var div = document.createElement('div');
                div.className = 'chat-message' + (msg.sender_id === currentUser.id ? ' self' : '');
                div.textContent = decodeMessage(msg.content);
                container.appendChild(div);
            });
        }
        container.scrollTop = container.scrollHeight;
    });
}

function showCreateGroup() {
    var name = prompt('Название группы:');
    if (name) {
        supabase.from('groups_chats').insert({ name: name, creator_id: currentUser.id }).select().single().then(function(res) {
            if (res.data) {
                supabase.from('group_members').insert({ group_id: res.data.id, user_id: currentUser.id }).then(function() {
                    loadGroupChats();
                    showToast('Группа создана', 'success');
                });
            }
        });
    }
}

// Магазин и Gems
function openShop() {
    loadShop();
    openModal('shop-modal');
}

function loadShop() {
    supabase.from('shop_items').select('*').then(function(res) {
        var container = document.getElementById('shop-items');
        container.innerHTML = '';
        document.getElementById('shop-gems-count').textContent = currentUser.gems || 0;
        if (res.data) {
            res.data.forEach(function(item) {
                var div = document.createElement('div');
                div.className = 'shop-item';
                div.innerHTML = '<span>' + item.name + ' (' + item.type + ')</span><span>' + item.price + ' 💎</span><button class="btn btn-primary btn-sm" onclick="buyItem(\'' + item.id + '\', ' + item.price + ')">Купить</button>';
                container.appendChild(div);
            });
        }
    });
}

function buyItem(itemId, price) {
    if (currentUser.gems < price) {
        showToast('Недостаточно Gems', 'error');
        return;
    }
    supabase.from('users').update({ gems: currentUser.gems - price }).eq('id', currentUser.id).then(function() {
        supabase.from('gem_transactions').insert({ user_id: currentUser.id, amount: -price, type: 'purchase', description: 'Покупка предмета' }).then();
        supabase.from('user_inventory').insert({ user_id: currentUser.id, item_id: itemId }).then();
        currentUser.gems -= price;
        document.getElementById('shop-gems-count').textContent = currentUser.gems;
        document.getElementById('gems-display').textContent = currentUser.gems;
        showToast('Предмет куплен!', 'success');
    });
}

function giveGems(amount, reason) {
    if (!currentUser) return;
    supabase.from('users').select('gems').eq('id', currentUser.id).single().then(function(res) {
        var newGems = res.data.gems + amount;
        supabase.from('users').update({ gems: newGems }).eq('id', currentUser.id).then(function() {
            supabase.from('gem_transactions').insert({ user_id: currentUser.id, amount: amount, type: 'bonus', description: reason }).then();
            currentUser.gems = newGems;
            document.getElementById('gems-display').textContent = newGems;
            var shopGems = document.getElementById('shop-gems-count');
            if (shopGems) shopGems.textContent = newGems;
        });
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

// Premium
function showPremiumModal() {
    openModal('premium-modal');
    document.getElementById('premium-code-section').style.display = 'none';
}

function selectPremium(plan) {
    var stars = plan === '1month' ? 15 : (plan === '3months' ? 40 : 140);
    document.getElementById('stars-amount').textContent = stars;
    // Генерация кода
    var code = Math.random().toString(36).substring(2, 10).toUpperCase();
    document.getElementById('activation-code-display').textContent = code;
    document.getElementById('premium-code-section').style.display = 'block';
    // Сохраняем код в БД
    supabase.from('subscription_codes').insert({
        code: code,
        user_id: currentUser.id,
        plan: plan,
        stars_amount: stars,
        used: false
    }).then();
}

function activatePremium() {
    var codeInput = document.getElementById('code-input').value.trim();
    if (!codeInput) {
        showToast('Введите код', 'error');
        return;
    }
    supabase.from('subscription_codes').select('*').eq('code', codeInput).eq('user_id', currentUser.id).eq('used', false).maybeSingle().then(function(res) {
        if (!res.data) {
            showToast('Неверный или использованный код', 'error');
            return;
        }
        var codeData = res.data;
        var months = codeData.plan === '1month' ? 1 : (codeData.plan === '3months' ? 3 : 12);
        var now = new Date();
        var endsAt = new Date(now.setMonth(now.getMonth() + months));
        supabase.from('subscriptions').insert({
            user_id: currentUser.id,
            plan: codeData.plan,
            starts_at: new Date().toISOString(),
            ends_at: endsAt.toISOString()
        }).then(function() {
            supabase.from('users').update({ is_premium: true, premium_until: endsAt.toISOString() }).eq('id', currentUser.id).then(function() {
                supabase.from('subscription_codes').update({ used: true }).eq('id', codeData.id).then(function() {
                    // Начисляем 1000 Gems
                    giveGems(1000, 'Premium бонус');
                    currentUser.is_premium = true;
                    currentUser.premium_until = endsAt.toISOString();
                    saveSession(currentUser);
                    closeModal();
                    showToast('Premium активирован! +1000 Gems 🎉', 'success');
                });
            });
        });
    });
}

// Админ-панель
function showAdminPanel() {
    if (!currentUser || !currentUser.is_admin) return;
    openModal('admin-modal');
    switchAdminTab('stats');
}

function switchAdminTab(tab) {
    var tabs = document.querySelectorAll('.admin-tab-btn');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'stats') tabs[0].classList.add('active');
    else if (tab === 'users') tabs[1].classList.add('active');
    else if (tab === 'gems') tabs[2].classList.add('active');
    else if (tab === 'posts') tabs[3].classList.add('active');
    var container = document.getElementById('admin-content');
    container.innerHTML = '';
    if (tab === 'stats') loadAdminStats();
    else if (tab === 'users') loadAdminUsers();
    else if (tab === 'gems') loadAdminGems();
    else if (tab === 'posts') loadAdminPosts();
}

function loadAdminStats() {
    document.getElementById('admin-content').innerHTML = '<p>Загрузка статистики...</p>';
    Promise.all([
        supabase.from('users').select('*', { count: 'exact' }),
        supabase.from('chirps').select('*', { count: 'exact' })
    ]).then(function(results) {
        var usersCount = results[0].count;
        var chirpsCount = results[1].count;
        document.getElementById('admin-content').innerHTML = '<p>Пользователей: ' + usersCount + '</p><p>Чирпов: ' + chirpsCount + '</p>';
    });
}

function loadAdminUsers() {
    supabase.from('users').select('*').then(function(res) {
        var html = '<div style="max-height:300px;overflow-y:auto;">';
        res.data.forEach(function(u) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #2a2a4a;">' +
                '<span>' + escapeHtml(u.handle) + '</span>' +
                '<div><button onclick="banUser(\'' + u.id + '\')" class="btn btn-admin btn-sm">Бан</button> ' +
                '<button onclick="giveGemsToUser(\'' + u.id + '\')" class="btn btn-primary btn-sm">Gems</button></div></div>';
        });
        html += '</div>';
        document.getElementById('admin-content').innerHTML = html;
    });
}

function banUser(userId) {
    var reason = prompt('Причина бана:');
    if (!reason) return;
    var duration = prompt('Длительность (часов, 0 = навсегда):', '0');
    var until = duration === '0' ? new Date('2099-01-01').toISOString() : new Date(Date.now() + duration * 3600000).toISOString();
    supabase.from('bans').insert({ user_id: userId, reason: reason, banned_until: until }).then(function() {
        showToast('Пользователь заблокирован', 'success');
    });
}

function giveGemsToUser(userId) {
    var amount = parseInt(prompt('Количество Gems:'), 10);
    if (!amount) return;
    supabase.from('users').select('gems').eq('id', userId).single().then(function(res) {
        var newGems = res.data.gems + amount;
        supabase.from('users').update({ gems: newGems }).eq('id', userId).then(function() {
            supabase.from('gem_transactions').insert({ user_id: userId, amount: amount, type: 'admin', description: 'Выдача администратором' }).then();
            showToast('Выдано ' + amount + ' Gems', 'success');
        });
    });
}

function loadAdminGems() {
    document.getElementById('admin-content').innerHTML = '<p>Выдача Gems пользователю: <input id="admin-gems-user" placeholder="User ID" class="input-field"><input id="admin-gems-amount" type="number" placeholder="Сумма" class="input-field"><button onclick="giveGemsToUser(document.getElementById(\'admin-gems-user\').value)" class="btn btn-primary">Выдать</button></p>';
}

function loadAdminPosts() {
    supabase.from('chirps').select('*, users(handle)').order('created_at', { ascending: false }).limit(50).then(function(res) {
        var html = '<div style="max-height:300px;overflow-y:auto;">';
        res.data.forEach(function(p) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #2a2a4a;">' +
                '<span>' + escapeHtml(p.content.substring(0, 50)) + '... (' + (p.users ? p.users.handle : '') + ')</span>' +
                '<button onclick="deletePost(\'' + p.id + '\')" class="btn btn-admin btn-sm">Удалить</button></div>';
        });
        html += '</div>';
        document.getElementById('admin-content').innerHTML = html;
    });
}

function deletePost(postId) {
    if (confirm('Удалить пост?')) {
        supabase.from('chirps').delete().eq('id', postId).then(function() {
            showToast('Пост удалён', 'success');
            loadAdminPosts();
        });
    }
}

// Realtime
function setupRealtime() {
    closeRealtimeChannels();
    var channel1 = supabase.channel('chirps-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chirps' }, function(payload) {
            if (currentFeed === 'latest' && document.getElementById('feed-container').style.display !== 'none') {
                var newPost = payload.new;
                supabase.from('users').select('*').eq('id', newPost.user_id).single().then(function(uRes) {
                    newPost.users = uRes.data;
                    var container = document.getElementById('feed-posts');
                    var tempDiv = document.createElement('div');
                    renderPostsToContainer([newPost], tempDiv);
                    container.insertBefore(tempDiv.firstChild, container.firstChild);
                });
            }
        })
        .subscribe();
    realtimeChannels.push(channel1);

    var channel2 = supabase.channel('chat-messages-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, function(payload) {
            if (currentChatId && payload.new.chat_id === currentChatId) {
                loadChatMessages(currentChatId);
            }
        })
        .subscribe();
    realtimeChannels.push(channel2);

    var channel3 = supabase.channel('group-messages-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, function(payload) {
            if (currentGroupId && payload.new.group_id === currentGroupId) {
                loadGroupMessages(currentGroupId);
            }
        })
        .subscribe();
    realtimeChannels.push(channel3);

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
    activeMobileTab = section;
    hideAllContainers();
    if (section === 'feed') {
        showFeed(currentFeed);
    } else if (section === 'search') {
        document.getElementById('search-container').style.display = 'block';
    } else if (section === 'chats') {
        showChatsList();
    } else if (section === 'profile') {
        viewProfile(currentUser.id);
    }
    var btns = document.querySelectorAll('.mobile-nav-btn');
    btns.forEach(function(b) { b.classList.remove('active'); });
    if (section === 'feed') btns[0].classList.add('active');
    else if (section === 'search') btns[1].classList.add('active');
    else if (section === 'chats') btns[3].classList.add('active');
    else if (section === 'profile') btns[4].classList.add('active');
}

// Запуск
window.onload = function() {
    if (loadSession()) {
        showScreen('main-screen');
        initMainScreen();
    } else {
        showScreen('auth-screen');
    }
};