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
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function filterBadWords(text) {
    var badWords = ['badword1', 'badword2', 'spam'];
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
        try {
            var session = JSON.parse(sessionData);
            var now = new Date().getTime();
            if (session.expires_at && now < session.expires_at && session.user) {
                currentSession = session;
                currentUser = session.user;
                return true;
            }
        } catch(e) {}
        localStorage.removeItem('nobu_session');
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
        var hash = sha256(password, user.salt || '');
        if (hash !== user.password_hash) {
            showToast('Неверный email или пароль', 'error');
            return;
        }
        
        // Проверка бана
        supabase.from('bans').select('*').eq('user_id', user.id).gte('banned_until', new Date().toISOString()).maybeSingle().then(function(banRes) {
            if (banRes.data) {
                showToast('Аккаунт заблокирован', 'error');
                return;
            }
            saveSession(user);
            showScreen('main-screen');
            initMainScreen();
            showToast('Добро пожаловать!', 'success');
        });
    }).catch(function(err) {
        showToast('Ошибка входа: ' + err.message, 'error');
    });
}

function registerUser() {
    var email = document.getElementById('reg-email').value.trim();
    var username = document.getElementById('reg-username').value.trim();
    var handle = document.getElementById('reg-handle').value.trim();
    var password = document.getElementById('reg-password').value;
    var ageConfirm = document.getElementById('age-confirm').checked;
    var termsConfirm = document.getElementById('terms-confirm').checked;
    
    if (!email || !username || !handle || !password) {
        showToast('Заполните все поля', 'error');
        return;
    }
    
    if (!ageConfirm) {
        showToast('Подтвердите, что вам 13+ лет', 'error');
        return;
    }
    
    if (!termsConfirm) {
        showToast('Примите правила и политику конфиденциальности', 'error');
        return;
    }
    
    if (handle.charAt(0) !== '@') {
        handle = '@' + handle;
    }
    
    // Проверка существующего пользователя
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
            // Очистка полей
            document.getElementById('reg-email').value = '';
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-handle').value = '';
            document.getElementById('reg-password').value = '';
            document.getElementById('age-confirm').checked = false;
            document.getElementById('terms-confirm').checked = false;
        }).catch(function(err) {
            showToast('Ошибка: ' + err.message, 'error');
        });
    }).catch(function(err) {
        showToast('Ошибка проверки: ' + err.message, 'error');
    });
}

function logout() {
    clearSession();
    closeRealtimeChannels();
    showScreen('auth-screen');
    // Сброс интерфейса
    document.getElementById('feed-posts').innerHTML = '';
    document.getElementById('sidebar-username').textContent = 'Пользователь';
    document.getElementById('sidebar-handle').textContent = '@handle';
    document.getElementById('sidebar-avatar').style.backgroundImage = '';
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
    } else {
        document.getElementById('admin-btn').style.display = 'none';
    }
    setupRealtime();
    showFeed('latest');
    loadNotifications();
    checkDailyBonus();
    // Показать cookie баннер, если не принято
    if (!localStorage.getItem('cookies_accepted')) {
        document.getElementById('cookie-banner').style.display = 'block';
    }
}

// Переключение вкладок ленты
function showFeed(type) {
    currentFeed = type;
    feedPage = 0;
    hasMoreFeed = true;
    var feedPosts = document.getElementById('feed-posts');
    feedPosts.innerHTML = '';
    var tabs = document.querySelectorAll('.feed-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }
    if (type === 'latest') tabs[0].classList.add('active');
    else if (type === 'popular') tabs[1].classList.add('active');
    else if (type === 'subscriptions') tabs[2].classList.add('active');
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

function loadFeed() {
    if (feedLoading || !hasMoreFeed) return;
    feedLoading = true;
    document.getElementById('feed-loader').style.display = 'block';
    
    var query;
    if (currentFeed === 'popular') {
        query = supabase.from('chirps').select('*, users!inner(id, handle, username, avatar_url, is_premium, is_admin)').order('created_at', { ascending: false }).range(feedPage * 10, feedPage * 10 + 9);
    } else if (currentFeed === 'subscriptions') {
        supabase.from('follows').select('followee_id').eq('follower_id', currentUser.id).then(function(followRes) {
            if (followRes.data && followRes.data.length > 0) {
                var ids = followRes.data.map(function(f) { return f.followee_id; });
                supabase.from('chirps').select('*, users!inner(id, handle, username, avatar_url, is_premium, is_admin)').in('user_id', ids).order('created_at', { ascending: false }).range(feedPage * 10, feedPage * 10 + 9).then(function(res) {
                    handleFeedResponse(res);
                });
            } else {
                document.getElementById('feed-posts').innerHTML = '<p style="color:#8888bb;text-align:center;">Подпишитесь на кого-нибудь, чтобы видеть чирпы.</p>';
                hasMoreFeed = false;
                document.getElementById('feed-loader').style.display = 'none';
                feedLoading = false;
            }
        });
        return;
    } else {
        query = supabase.from('chirps').select('*, users!inner(id, handle, username, avatar_url, is_premium, is_admin)').order('created_at', { ascending: false }).range(feedPage * 10, feedPage * 10 + 9);
    }
    
    if (query) {
        query.then(function(res) {
            handleFeedResponse(res);
        });
    }
}

function handleFeedResponse(res) {
    if (res.error || !res.data || res.data.length === 0) {
        hasMoreFeed = false;
        document.getElementById('feed-loader').style.display = 'none';
        feedLoading = false;
        return;
    }
    renderPosts(res.data);
    feedPage++;
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
        var mediaHtml = post.media_url ? '<img src="' + post.media_url + '" class="post-media" alt="media">' : '';
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
        if (res.data && res.data.length > 0) {
            for (var i = 0; i < res.data.length; i++) {
                var u = res.data[i];
                html += '<div class="chat-item" onclick="viewProfile(\'' + u.id + '\')">' + escapeHtml(u.handle) + ' - ' + escapeHtml(u.username) + '</div>';
            }
        } else {
            html = '<p>Ничего не найдено</p>';
        }
        document.getElementById('search-results').innerHTML = html;
    });
}

function searchByHashtag(tag) {
    supabase.from('chirps').select('*, users(*)').ilike('content', '%#' + tag + '%').order('created_at', { ascending: false }).then(function(res) {
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
    supabase.from('chirps').select('*, users(*)').ilike('content', '%' + query + '%').order('created_at', { ascending: false }).then(function(res) {
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
    if (query) {
        document.getElementById('search-input').value = query;
        performSearch();
        showSearch();
    }
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
        if (res.error || !res.data) return;
        var user = res.data;
        document.getElementById('profile-banner').style.backgroundImage = user.banner_url ? 'url(' + user.banner_url + ')' : '';
        var avatarEl = document.getElementById('profile-avatar');
        avatarEl.style.backgroundImage = user.avatar_url ? 'url(' + user.avatar_url + ')' : '';
        document.getElementById('profile-name').textContent = user.username || 'Пользователь';
        document.getElementById('profile-handle-display').textContent = user.handle || '';
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
        // Premium badge
        document.getElementById('profile-premium-badge').style.display = user.is_premium ? 'inline' : 'none';
        // Verified badge
        document.getElementById('profile-verified').style.display = user.is_admin ? 'inline' : 'none';
        
        // Статистика
        supabase.from('chirps').select('id', { count: 'exact' }).eq('user_id', userId).then(function(cRes) {
            document.getElementById('profile-chirps').innerHTML = '<strong>' + (cRes.count || 0) + '</strong> чирпов';
        });
        supabase.from('follows').select('id', { count: 'exact' }).eq('followee_id', userId).then(function(fRes) {
            document.getElementById('profile-followers').innerHTML = '<strong>' + (fRes.count || 0) + '</strong> подписчиков';
        });
        supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', userId).then(function(fRes) {
            document.getElementById('profile-following').innerHTML = '<strong>' + (fRes.count || 0) + '</strong> подписок';
        });
        
        var isOwner = currentUser && currentUser.id === userId;
        document.getElementById('follow-btn').style.display = isOwner ? 'none' : 'inline-block';
        document.getElementById('edit-profile-btn').style.display = isOwner ? 'inline-block' : 'none';
        document.getElementById('premium-btn').style.display = isOwner ? 'inline-block' : 'none';
        document.getElementById('admin-btn').style.display = (currentUser && currentUser.is_admin) ? 'inline-block' : 'none';
        
        if (!isOwner) {
            checkFollowStatus(userId);
        }
        
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
    // Ничего не делаем, кнопка переопределена в checkFollowStatus
}

function followUser(userId) {
    supabase.from('follows').insert({ follower_id: currentUser.id, followee_id: userId }).then(function() {
        createNotification(userId, 'follow', null);
        checkFollowStatus(userId);
        loadProfile(userId);
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
        if (res.data && res.data.length > 0) {
            renderPostsToContainer(res.data, container);
        }
    });
}

function renderPostsToContainer(posts, container) {
    for (var i = 0; i < posts.length; i++) {
        var post = posts[i];
        var user = post.users;
        var avatarBg = user.avatar_url ? 'background-image:url(' + user.avatar_url + ')' : '';
        var mediaHtml = post.media_url ? '<img src="' + post.media_url + '" class="post-media" alt="media">' : '';
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
    var bio = document.getElementById('bio-input').value.trim();
    var location = document.getElementById('location-input').value.trim();
    var link = document.getElementById('link-input').value.trim();
    var avatarFile = document.getElementById('avatar-upload').files[0];
    var bannerFile = document.getElementById('banner-upload').files[0];
    var updates = { bio: bio, location: location, link: link };
    var uploads = [];
    
    if (avatarFile) {
        uploads.push(uploadFile(avatarFile, 'avatars').then(function(url) {
            if (url) updates.avatar_url = url;
        }));
    }
    if (bannerFile) {
        uploads.push(uploadFile(bannerFile, 'banners').then(function(url) {
            if (url) updates.banner_url = url;
        }));
    }
    
    if (uploads.length > 0) {
        Promise.all(uploads).then(function() {
            saveProfileUpdates(updates);
        });
    } else {
        saveProfileUpdates(updates);
    }
}

function saveProfileUpdates(updates) {
    supabase.from('users').update(updates).eq('id', currentUser.id).then(function(res) {
        if (res.error) {
            showToast('Ошибка обновления профиля', 'error');
            return;
        }
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                currentUser[key] = updates[key];
            }
        }
        saveSession(currentUser);
        closeModal();
        loadProfile(currentUser.id);
        showToast('Профиль обновлён', 'success');
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
        span.textContent = Math.max(0, count + delta);
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
                div.className = 'notification-item';
                div.textContent = n.type === 'follow' ? 'Новый подписчик!' : (n.type === 'like' ? 'Ваш чирп понравился!' : 'Упоминание');
                container.appendChild(div);
            }
        } else {
            container.innerHTML = '<p style="color:#8888bb;text-align:center;">Нет уведомлений</p>';
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
            document.getElementById('group-chats-list').innerHTML = '<p style="color:#8888bb;text-align:center;">Нет групп</p>';
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
    if (name && name.trim()) {
        supabase.from('groups_chats').insert({ name: name.trim(), creator_id: currentUser.id }).select().single().then(function(res) {
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
        if (res.data && res.data.length > 0) {
            res.data.forEach(function(item) {
                var div = document.createElement('div');
                div.className = 'shop-item';
                div.innerHTML = '<span>' + escapeHtml(item.name) + ' (' + escapeHtml(item.type) + ')</span><span>' + item.price + ' 💎</span><button class="btn btn-primary btn-sm" onclick="buyItem(\'' + item.id + '\', ' + item.price + ')">Купить</button>';
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<p style="color:#8888bb;">Товаров пока нет</p>';
        }
    });
}

function buyItem(itemId, price) {
    if ((currentUser.gems || 0) < price) {
        showToast('Недостаточно Gems', 'error');
        return;
    }
    supabase.from('users').update({ gems: (currentUser.gems || 0) - price }).eq('id', currentUser.id).then(function() {
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
        var newGems = (res.data.gems || 0) + amount;
        supabase.from('users').update({ gems: newGems }).eq('id', currentUser.id).then(function() {
            supabase.from('gem_transactions').insert({ user_id: currentUser.id, amount: amount, type: 'bonus', description: reason }).then();
            currentUser.gems = newGems;
            var gemsDisplay = document.getElementById('gems-display');
            if (gemsDisplay) gemsDisplay.textContent = newGems;
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
    var code = Math.random().toString(36).substring(2, 10).toUpperCase();
    document.getElementById('activation-code-display').textContent = code;
    document.getElementById('premium-code-section').style.display = 'block';
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
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    if (tab === 'stats') { tabs[0].classList.add('active'); loadAdminStats(); }
    else if (tab === 'users') { tabs[1].classList.add('active'); loadAdminUsers(); }
    else if (tab === 'gems') { tabs[2].classList.add('active'); loadAdminGems(); }
    else if (tab === 'posts') { tabs[3].classList.add('active'); loadAdminPosts(); }
}

function loadAdminStats() {
    var html = '<p>Загрузка...</p>';
    document.getElementById('admin-content').innerHTML = html;
    Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('chirps').select('*', { count: 'exact', head: true })
    ]).then(function(results) {
        document.getElementById('admin-content').innerHTML = '<p>Пользователей: ' + results[0].count + '</p><p>Чирпов: ' + results[1].count + '</p>';
    });
}

function loadAdminUsers() {
    supabase.from('users').select('*').order('created_at', { ascending: false }).then(function(res) {
        var html = '<div style="max-height:300px;overflow-y:auto;">';
        res.data.forEach(function(u) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border-color);">' +
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
    if (!amount || isNaN(amount)) return;
    supabase.from('users').select('gems').eq('id', userId).single().then(function(res) {
        var newGems = (res.data.gems || 0) + amount;
        supabase.from('users').update({ gems: newGems }).eq('id', userId).then(function() {
            supabase.from('gem_transactions').insert({ user_id: userId, amount: amount, type: 'admin', description: 'Выдача администратором' }).then();
            showToast('Выдано ' + amount + ' Gems', 'success');
        });
    });
}

function loadAdminGems() {
    document.getElementById('admin-content').innerHTML = '<p>Выдача Gems пользователю:</p>' +
        '<input id="admin-gems-user" placeholder="User ID" class="input-field">' +
        '<input id="admin-gems-amount" type="number" placeholder="Сумма" class="input-field">' +
        '<button onclick="giveGemsToUser(document.getElementById(\'admin-gems-user\').value)" class="btn btn-primary">Выдать</button>';
}

function loadAdminPosts() {
    supabase.from('chirps').select('*, users(handle)').order('created_at', { ascending: false }).limit(50).then(function(res) {
        var html = '<div style="max-height:300px;overflow-y:auto;">';
        res.data.forEach(function(p) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border-color);">' +
                '<span>' + escapeHtml(p.content.substring(0, 50)) + '... (' + (p.users ? escapeHtml(p.users.handle) : '') + ')</span>' +
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
    // Лента
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
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
    }
    if (section === 'feed') btns[0].classList.add('active');
    else if (section === 'search') btns[1].classList.add('active');
    // Кнопка создания поста отдельно
    else if (section === 'chats') btns[3].classList.add('active');
    else if (section === 'profile') btns[4].classList.add('active');
}

// Политики и юридические документы
function showPolicy(type) {
    var title = '';
    var content = '';
    if (type === 'terms') {
        title = 'Правила использования';
        content = getTermsContent();
    } else if (type === 'privacy') {
        title = 'Политика конфиденциальности';
        content = getPrivacyContent();
    } else if (type === 'cookies') {
        title = 'Политика Cookie';
        content = getCookiesContent();
    }
    document.getElementById('policy-title').textContent = title;
    document.getElementById('policy-content').innerHTML = content;
    openModal('policy-modal');
}

function acceptCookies() {
    localStorage.setItem('cookies_accepted', 'true');
    document.getElementById('cookie-banner').style.display = 'none';
}

function getTermsContent() {
    return '<h2>Правила использования NobuSocial</h2>' +
        '<p>Дата вступления в силу: 1 января 2024 г.</p>' +
        '<p>Используя NobuSocial, вы соглашаетесь с настоящими правилами. Если вы не согласны, пожалуйста, не используйте сервис.</p>' +
        '<h3>1. Приемлемое использование</h3>' +
        '<p>Вы обязуетесь не:</p>' +
        '<ul><li>Публиковать незаконный, оскорбительный, дискриминационный, порнографический или вредоносный контент.</li>' +
        '<li>Осуществлять спам, фишинг, мошенничество или вводить в заблуждение других пользователей.</li>' +
        '<li>Нарушать права интеллектуальной собственности третьих лиц.</li>' +
        '<li>Взламывать, тестировать на проникновение или иным образом нарушать безопасность платформы.</li></ul>' +
        '<h3>2. Возрастные ограничения</h3>' +
        '<p>Сервис предназначен для лиц старше 13 лет. Регистрируясь, вы подтверждаете, что вам 13+ лет. Мы соблюдаем законы о защите детей (COPPA) и не собираем намеренно данные лиц младше 13 лет.</p>' +
        '<h3>3. Ответственность за контент</h3>' +
        '<p>Вы несете полную ответственность за публикуемый контент. Администрация оставляет за собой право удалять любой контент без объяснения причин и блокировать учетные записи нарушителей.</p>' +
        '<h3>4. Интеллектуальная собственность</h3>' +
        '<p>Вы сохраняете права на свой контент, но предоставляете NobuSocial неисключительную лицензию на его отображение и распространение в рамках платформы. Логотип, название и дизайн NobuSocial защищены авторским правом.</p>' +
        '<h3>5. Отказ от гарантий</h3>' +
        '<p>Сервис предоставляется "как есть". Мы не гарантируем бесперебойную работу, точность информации или безопасность от внешних угроз.</p>' +
        '<h3>6. Ограничение ответственности</h3>' +
        '<p>NobuSocial не несет ответственности за любой ущерб (прямой, косвенный, случайный), возникший в результате использования или невозможности использования сервиса, включая потерю данных или репутационный ущерб.</p>' +
        '<h3>7. Прекращение действия</h3>' +
        '<p>Мы можем заблокировать вашу учетную запись в любое время без предварительного уведомления при нарушении правил.</p>';
}

function getPrivacyContent() {
    return '<h2>Политика конфиденциальности</h2>' +
        '<p>Дата вступления в силу: 1 января 2024 г.</p>' +
        '<p>Мы уважаем вашу конфиденциальность. В этом документе объясняется, какие данные мы собираем и как их используем.</p>' +
        '<h3>1. Собираемые данные</h3>' +
        '<ul><li><strong>Личная информация:</strong> email, имя пользователя, @handle — предоставляются при регистрации.</li>' +
        '<li><strong>Контент:</strong> чирпы, изображения, видео, аудио, которые вы публикуете.</li>' +
        '<li><strong>Данные об активности:</strong> лайки, подписки, репосты, история чатов.</li>' +
        '<li><strong>Технические данные:</strong> IP-адрес, User-Agent, временные метки, файлы cookie для аутентификации и безопасности.</li></ul>' +
        '<h3>2. Использование данных</h3>' +
        '<p>Мы используем ваши данные исключительно для:</p>' +
        '<ul><li>Предоставления и персонализации сервиса.</li><li>Обеспечения безопасности, предотвращения мошенничества и спама.</li><li>Отправки уведомлений (с вашего согласия).</li><li>Улучшения платформы.</li></ul>' +
        '<h3>3. Хранение и защита</h3>' +
        '<p>Ваши данные хранятся в зашифрованном виде на серверах Supabase. Мы применяем технические и организационные меры для защиты от несанкционированного доступа, изменения или удаления.</p>' +
        '<h3>4. Раскрытие данных</h3>' +
        '<p>Мы не продаем ваши данные третьим лицам. Данные могут быть раскрыты только:</p>' +
        '<ul><li>По требованию государственных органов в соответствии с законом.</li><li>Для защиты прав и безопасности NobuSocial и пользователей.</li></ul>' +
        '<h3>5. Удаление данных</h3>' +
        '<p>Вы можете удалить свою учетную запись в настройках профиля, после чего ваши личные данные будут удалены. Публичный контент может быть сохранен в анонимизированном виде.</p>' +
        '<h3>6. Международная передача</h3>' +
        '<p>Ваши данные могут храниться и обрабатываться в странах, отличных от вашей, с соблюдением применимых законов о защите данных.</p>';
}

function getCookiesContent() {
    return '<h2>Политика Cookie</h2>' +
        '<p>Мы используем файлы cookie для улучшения вашего опыта. Cookie — это небольшие текстовые файлы, сохраняемые в вашем браузере.</p>' +
        '<h3>Какие cookie мы используем:</h3>' +
        '<ul><li><strong>Необходимые:</strong> для аутентификации (сессия), предотвращения мошенничества.</li>' +
        '<li><strong>Функциональные:</strong> сохранение настроек интерфейса, ежедневный бонус.</li></ul>' +
        '<p>Вы можете отключить cookie в настройках браузера, но это может повлиять на работу сервиса. Продолжая использовать NobuSocial, вы соглашаетесь на использование cookie.</p>';
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