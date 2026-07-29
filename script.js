// Supabase
var supabaseUrl = 'https://iljsednetiogjtowlexo.supabase.co';
var supabaseKey = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Глобальные переменные
var currentUser = null;
var currentFeed = 'latest';
var currentChatId = null;
var currentGroupId = null;
var feedPage = 0;
var feedLoading = false;
var hasMoreFeed = true;
var realtimeChannels = [];

// Утилиты
function sha256(pwd, salt) {
    return sha512_256(pwd + salt);
}

function showToast(msg, type) {
    var t = document.getElementById('global-toast');
    t.textContent = msg;
    t.className = 'toast ' + type + ' show';
    setTimeout(function() { t.className = 'toast ' + type; }, 3000);
}

function escapeHtml(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
}

function hideAll() {
    var ids = ['feed-container', 'profile-container', 'chats-container', 'chat-window', 'search-container'];
    ids.forEach(function(id) {
        document.getElementById(id).style.display = 'none';
    });
}

// Сессия
function saveSession(user) {
    currentUser = user;
    localStorage.setItem('nobu_session', JSON.stringify({
        user: user,
        expires_at: Date.now() + 86400000
    }));
}

function loadSession() {
    var data = localStorage.getItem('nobu_session');
    if (!data) return false;
    try {
        var session = JSON.parse(data);
        if (session.expires_at > Date.now() && session.user) {
            currentUser = session.user;
            return true;
        }
    } catch(e) {}
    localStorage.removeItem('nobu_session');
    return false;
}

function clearSession() {
    localStorage.removeItem('nobu_session');
    currentUser = null;
}

// Экраны
function showScreen(id) {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('main-screen').classList.remove('active');
    document.getElementById(id).classList.add('active');
}

// Аутентификация
function switchAuthTab(tab) {
    var loginForm = document.getElementById('login-form');
    var regForm = document.getElementById('register-form');
    var tabs = document.querySelectorAll('.auth-tab');
    if (tab === 'login') {
        loginForm.classList.add('active');
        regForm.classList.remove('active');
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        loginForm.classList.remove('active');
        regForm.classList.add('active');
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
}

function login() {
    var email = document.getElementById('login-email').value.trim();
    var pwd = document.getElementById('login-password').value;
    if (!email || !pwd) {
        showToast('Заполните поля', 'error');
        return;
    }
    supabase.from('users').select('*').eq('email', email).single().then(function(res) {
        if (res.error || !res.data) {
            showToast('Неверные данные', 'error');
            return;
        }
        var user = res.data;
        if (sha256(pwd, user.salt) !== user.password_hash) {
            showToast('Неверные данные', 'error');
            return;
        }
        supabase.from('bans').select('*').eq('user_id', user.id).gte('banned_until', new Date().toISOString()).maybeSingle().then(function(banRes) {
            if (banRes.data) {
                showToast('Аккаунт заблокирован', 'error');
                return;
            }
            saveSession(user);
            showScreen('main-screen');
            initMain();
            showToast('Добро пожаловать!', 'success');
        });
    });
}

function registerUser() {
    var email = document.getElementById('reg-email').value.trim();
    var username = document.getElementById('reg-username').value.trim();
    var handle = document.getElementById('reg-handle').value.trim();
    var pwd = document.getElementById('reg-password').value;
    var age = document.getElementById('age-confirm').checked;
    var terms = document.getElementById('terms-confirm').checked;

    if (!email || !username || !handle || !pwd) {
        showToast('Заполните все поля', 'error');
        return;
    }
    if (!age) {
        showToast('Подтвердите возраст', 'error');
        return;
    }
    if (!terms) {
        showToast('Примите правила', 'error');
        return;
    }
    if (handle.charAt(0) !== '@') handle = '@' + handle;

    supabase.from('users').select('id').or('email.eq.' + email + ',handle.eq.' + handle).limit(1).then(function(checkRes) {
        if (checkRes.data && checkRes.data.length > 0) {
            showToast('Email или handle занят', 'error');
            return;
        }
        var salt = Math.random().toString(36).substring(2, 15);
        var hash = sha256(pwd, salt);
        supabase.from('users').insert({
            email: email,
            username: username,
            handle: handle,
            password_hash: hash,
            salt: salt,
            is_admin: false,
            is_premium: false,
            gems: 0
        }).select().single().then(function(insRes) {
            if (insRes.error) {
                showToast('Ошибка регистрации: ' + insRes.error.message, 'error');
                return;
            }
            showToast('Успешно! Войдите.', 'success');
            switchAuthTab('login');
        });
    });
}

function logout() {
    clearSession();
    realtimeChannels.forEach(function(c) { supabase.removeChannel(c); });
    showScreen('auth-screen');
}

// Инициализация
function initMain() {
    if (!currentUser) return;
    document.getElementById('sidebar-username').textContent = currentUser.username;
    document.getElementById('sidebar-handle').textContent = currentUser.handle;
    document.getElementById('gems-display').textContent = currentUser.gems || 0;
    var ava = document.getElementById('sidebar-avatar');
    ava.style.backgroundImage = currentUser.avatar_url ? 'url(' + currentUser.avatar_url + ')' : '';
    if (currentUser.is_admin) document.getElementById('admin-btn').style.display = 'inline-block';
    setupRealtime();
    showFeed('latest');
    checkDailyBonus();
    if (!localStorage.getItem('cookies_accepted')) document.getElementById('cookie-banner').style.display = 'flex';
}

// Лента
function showFeed(type) {
    currentFeed = type;
    feedPage = 0;
    hasMoreFeed = true;
    document.getElementById('feed-posts').innerHTML = '';
    var tabs = document.querySelectorAll('.feed-tab');
    tabs.forEach(function(t, i) {
        t.classList.toggle('active', i === ['latest','popular','subscriptions'].indexOf(type));
    });
    hideAll();
    document.getElementById('feed-container').style.display = 'block';
    loadFeed();
}

function loadFeed() {
    if (feedLoading || !hasMoreFeed) return;
    feedLoading = true;
    document.getElementById('feed-loader').style.display = 'block';
    var query;
    if (currentFeed === 'subscriptions') {
        supabase.from('follows').select('followee_id').eq('follower_id', currentUser.id).then(function(followRes) {
            if (followRes.data && followRes.data.length > 0) {
                var ids = followRes.data.map(function(f) { return f.followee_id; });
                supabase.from('chirps').select('*, users!inner(username, handle, avatar_url, is_premium)').in('user_id', ids).order('created_at', false).range(feedPage*10, feedPage*10+9).then(handleFeedResponse);
            } else {
                document.getElementById('feed-posts').innerHTML = '<p style="color:#8888bb;text-align:center">Подпишитесь на кого-нибудь</p>';
                hasMoreFeed = false;
                document.getElementById('feed-loader').style.display = 'none';
                feedLoading = false;
            }
        });
        return;
    } else {
        query = supabase.from('chirps').select('*, users!inner(username, handle, avatar_url, is_premium)').order('created_at', false).range(feedPage*10, feedPage*10+9);
        query.then(handleFeedResponse);
    }
}

function handleFeedResponse(res) {
    if (res.error || !res.data || res.data.length === 0) {
        hasMoreFeed = false;
    } else {
        renderPosts(res.data);
        feedPage++;
    }
    document.getElementById('feed-loader').style.display = 'none';
    feedLoading = false;
}

function renderPosts(posts) {
    var container = document.getElementById('feed-posts');
    posts.forEach(function(p) {
        var u = p.users;
        var card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = '<div class="post-header">' +
            '<div class="post-avatar" style="background-image:url(' + (u.avatar_url || '') + ')"></div>' +
            '<div><span class="post-author">' + escapeHtml(u.username) + '</span> <span class="post-handle">' + escapeHtml(u.handle) + '</span>' + (u.is_premium ? ' ⭐' : '') + '</div>' +
            '</div>' +
            '<div class="post-content">' + escapeHtml(p.content) + '</div>' +
            (p.media_url ? '<img src="' + p.media_url + '" class="post-media">' : '') +
            '<div class="post-actions">' +
            '<button class="action-btn" onclick="likeChirp(\'' + p.id + '\', this)">❤️ 0</button>' +
            '<button class="action-btn" onclick="rechirp()">🔄</button>' +
            '</div>';
        container.appendChild(card);
    });
}

// Прокрутка
window.onscroll = function() {
    if (!feedLoading && hasMoreFeed && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
        loadFeed();
    }
};

// Поиск
function showSearch() { hideAll(); document.getElementById('search-container').style.display = 'block'; }

function performSearch() {
    var q = document.getElementById('search-input').value.trim();
    if (!q) return;
    var resDiv = document.getElementById('search-results');
    resDiv.innerHTML = 'Поиск...';
    if (q.startsWith('@')) {
        supabase.from('users').select('*').ilike('handle', '%' + q.substring(1) + '%').then(function(res) {
            resDiv.innerHTML = res.data && res.data.length ? res.data.map(function(u) { return '<div class="chat-item" onclick="viewProfile(\'' + u.id + '\')">' + escapeHtml(u.handle) + '</div>'; }).join('') : 'Ничего не найдено';
        });
    } else {
        supabase.from('chirps').select('*, users(*)').ilike('content', '%' + q + '%').order('created_at', false).then(function(res) {
            resDiv.innerHTML = '';
            if (res.data && res.data.length) renderPosts(res.data);
            else resDiv.innerHTML = 'Ничего не найдено';
        });
    }
}

function performSearchPC() {
    var q = document.getElementById('search-input-pc').value.trim();
    if (q) {
        document.getElementById('search-input').value = q;
        performSearch();
        showSearch();
    }
}

// Профиль
function viewProfile(uid) {
    hideAll();
    document.getElementById('profile-container').style.display = 'block';
    supabase.from('users').select('*').eq('id', uid).single().then(function(res) {
        var u = res.data;
        if (!u) return;
        document.getElementById('profile-name').textContent = u.username;
        document.getElementById('profile-handle-display').textContent = u.handle;
        document.getElementById('profile-bio').textContent = u.bio || '';
        document.getElementById('profile-avatar').style.backgroundImage = 'url(' + (u.avatar_url || '') + ')';
        document.getElementById('profile-banner').style.backgroundImage = 'url(' + (u.banner_url || '') + ')';
        document.getElementById('profile-premium-badge').style.display = u.is_premium ? 'inline' : 'none';
        document.getElementById('profile-verified').style.display = u.is_admin ? 'inline' : 'none';

        var isMe = currentUser && currentUser.id === uid;
        document.getElementById('follow-btn').style.display = isMe ? 'none' : 'inline-block';
        document.getElementById('edit-profile-btn').style.display = isMe ? 'inline-block' : 'none';
        document.getElementById('premium-btn').style.display = isMe ? 'inline-block' : 'none';
        document.getElementById('admin-btn').style.display = currentUser && currentUser.is_admin ? 'inline-block' : 'none';

        if (!isMe) {
            supabase.from('follows').select('*').eq('follower_id', currentUser.id).eq('followee_id', uid).maybeSingle().then(function(fRes) {
                var btn = document.getElementById('follow-btn');
                if (fRes.data) {
                    btn.textContent = 'Отписаться';
                    btn.onclick = function() { unfollow(uid); };
                } else {
                    btn.textContent = 'Подписаться';
                    btn.onclick = function() { follow(uid); };
                }
            });
        }

        // Статистика
        Promise.all([
            supabase.from('chirps').select('*', { count: 'exact', head: true }).eq('user_id', uid),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', uid),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid)
        ]).then(function(results) {
            document.getElementById('profile-chirps').innerHTML = '<strong>' + (results[0].count || 0) + '</strong> чирпов';
            document.getElementById('profile-followers').innerHTML = '<strong>' + (results[1].count || 0) + '</strong> подписчиков';
            document.getElementById('profile-following').innerHTML = '<strong>' + (results[2].count || 0) + '</strong> подписок';
        });

        // Посты профиля
        supabase.from('chirps').select('*, users(*)').eq('user_id', uid).order('created_at', false).then(function(pRes) {
            var container = document.getElementById('profile-posts');
            container.innerHTML = '';
            if (pRes.data) renderPostsToContainer(pRes.data, container);
        });
    });
}

function renderPostsToContainer(posts, container) {
    posts.forEach(function(p) {
        var u = p.users;
        var card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = '<div class="post-header">' +
            '<div class="post-avatar" style="background-image:url(' + (u.avatar_url || '') + ')"></div>' +
            '<div><span class="post-author">' + escapeHtml(u.username) + '</span></div>' +
            '</div>' +
            '<div class="post-content">' + escapeHtml(p.content) + '</div>' +
            (p.media_url ? '<img src="' + p.media_url + '" class="post-media">' : '');
        container.appendChild(card);
    });
}

function follow(uid) {
    supabase.from('follows').insert({ follower_id: currentUser.id, followee_id: uid }).then(function() {
        viewProfile(uid);
    });
}

function unfollow(uid) {
    supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('followee_id', uid).then(function() {
        viewProfile(uid);
    });
}

// Редактирование профиля
function showEditProfile() {
    document.getElementById('bio-input').value = currentUser.bio || '';
    document.getElementById('location-input').value = currentUser.location || '';
    document.getElementById('link-input').value = currentUser.link || '';
    openModal('edit-profile-modal');
}

async function updateProfile() {
    var bio = document.getElementById('bio-input').value;
    var location = document.getElementById('location-input').value;
    var link = document.getElementById('link-input').value;
    var updates = { bio: bio, location: location, link: link };
    var avatarFile = document.getElementById('avatar-upload').files[0];
    var bannerFile = document.getElementById('banner-upload').files[0];

    if (avatarFile) updates.avatar_url = await uploadFile(avatarFile, 'avatars');
    if (bannerFile) updates.banner_url = await uploadFile(bannerFile, 'banners');

    await supabase.from('users').update(updates).eq('id', currentUser.id);
    for (var key in updates) currentUser[key] = updates[key];
    saveSession(currentUser);
    closeModal();
    viewProfile(currentUser.id);
    showToast('Профиль обновлён', 'success');
}

async function uploadFile(file, bucket) {
    var name = Date.now() + '_' + file.name;
    await supabase.storage.from(bucket).upload(name, file);
    return supabase.storage.from(bucket).getPublicUrl(name).data.publicUrl;
}

// Публикация
function createPostFab() {
    openModal('create-post-modal');
}

async function createPost() {
    var content = document.getElementById('post-content').value.trim();
    if (!content || content.length > 280) {
        showToast('Чирп от 1 до 280 символов', 'error');
        return;
    }
    var mediaFile = document.getElementById('post-media').files[0];
    var mediaUrl = null;
    if (mediaFile) mediaUrl = await uploadFile(mediaFile, 'media');

    await supabase.from('chirps').insert({
        user_id: currentUser.id,
        content: content,
        media_url: mediaUrl
    });

    document.getElementById('post-content').value = '';
    document.getElementById('post-media').value = '';
    document.getElementById('char-count').textContent = '0';
    closeModal();
    if (currentFeed === 'latest') {
        feedPage = 0; hasMoreFeed = true;
        document.getElementById('feed-posts').innerHTML = '';
        loadFeed();
    }
    showToast('Опубликовано!', 'success');
    giveGems(1, 'За пост');
}

// Лайки
function likeChirp(cid, btn) {
    supabase.from('likes').select('*').eq('user_id', currentUser.id).eq('chirp_id', cid).maybeSingle().then(function(res) {
        if (res.data) {
            supabase.from('likes').delete().eq('id', res.data.id).then(function() {
                btn.classList.remove('liked');
            });
        } else {
            supabase.from('likes').insert({ user_id: currentUser.id, chirp_id: cid }).then(function() {
                btn.classList.add('liked');
            });
        }
    });
}

function rechirp() {
    showToast('Речирпнуто!', 'success');
}

// Чаты
function showChatsList() {
    hideAll();
    document.getElementById('chats-container').style.display = 'block';
    switchChatsTab('private');
}

function switchChatsTab(tab) {
    document.getElementById('private-chats-list').style.display = tab === 'private' ? 'block' : 'none';
    document.getElementById('group-chats-list').style.display = tab === 'groups' ? 'block' : 'none';
    document.querySelectorAll('.chat-tab').forEach(function(el, i) {
        el.classList.toggle('active', i === (tab === 'private' ? 0 : 1));
    });
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
                supabase.from('users').select('username, avatar_url').eq('id', otherId).single().then(function(uRes) {
                    var u = uRes.data;
                    var avatar = u && u.avatar_url ? 'style="background-image:url(' + u.avatar_url + ')"' : '';
                    container.innerHTML += '<div class="chat-item" onclick="openChat(\'' + chat.id + '\')"><div class="post-avatar" ' + avatar + '></div><div>' + (u ? u.username : 'Пользователь') + '</div></div>';
                });
            });
        }
    });
}

function openChat(cid) {
    currentChatId = cid;
    currentGroupId = null;
    hideAll();
    document.getElementById('chat-window').style.display = 'flex';
    supabase.from('chats').select('*').eq('id', cid).single().then(function(res) {
        var otherId = res.data.user1_id === currentUser.id ? res.data.user2_id : res.data.user1_id;
        supabase.from('users').select('handle').eq('id', otherId).single().then(function(uRes) {
            document.getElementById('chat-title').textContent = uRes.data ? uRes.data.handle : 'Чат';
        });
    });
    loadChatMessages(cid);
}

function loadChatMessages(cid) {
    supabase.from('chat_messages').select('*').eq('chat_id', cid).order('created_at', true).then(function(res) {
        var container = document.getElementById('chat-messages');
        container.innerHTML = '';
        if (res.data) {
            res.data.forEach(function(m) {
                var div = document.createElement('div');
                div.className = 'chat-message' + (m.sender_id === currentUser.id ? ' self' : '');
                div.textContent = m.content;
                container.appendChild(div);
            });
        }
        container.scrollTop = container.scrollHeight;
    });
}

function sendMessage() {
    var text = document.getElementById('chat-input').value.trim();
    if (!text || !currentChatId) return;
    supabase.from('chat_messages').insert({ chat_id: currentChatId, sender_id: currentUser.id, content: text }).then(function() {
        document.getElementById('chat-input').value = '';
        loadChatMessages(currentChatId);
    });
}

function closeChat() {
    currentChatId = null;
    document.getElementById('chat-window').style.display = 'none';
    showFeed('latest');
}

// Группы (заглушка)
function loadGroupChats() {
    document.getElementById('group-chats-list').innerHTML = '<p style="color:var(--text2)">Нет групп</p>';
}

function showCreateGroup() {
    var name = prompt('Название группы:');
    if (name) {
        supabase.from('groups_chats').insert({ name: name, creator_id: currentUser.id }).then(function() {
            showToast('Группа создана', 'success');
        });
    }
}

// Gems и магазин
function giveGems(amount, reason) {
    supabase.from('users').select('gems').eq('id', currentUser.id).single().then(function(res) {
        var newGems = (res.data.gems || 0) + amount;
        supabase.from('users').update({ gems: newGems }).eq('id', currentUser.id).then(function() {
            currentUser.gems = newGems;
            document.getElementById('gems-display').textContent = newGems;
            supabase.from('gem_transactions').insert({ user_id: currentUser.id, amount: amount, type: 'bonus', description: reason }).then();
        });
    });
}

function checkDailyBonus() {
    var today = new Date().toDateString();
    if (localStorage.getItem('daily_bonus_date') !== today) {
        giveGems(5, 'Ежедневный бонус');
        localStorage.setItem('daily_bonus_date', today);
        showToast('+5 Gems!', 'success');
    }
}

function openShop() {
    supabase.from('shop_items').select('*').then(function(res) {
        var container = document.getElementById('shop-items');
        container.innerHTML = '';
        document.getElementById('shop-gems-count').textContent = currentUser.gems || 0;
        if (res.data) {
            res.data.forEach(function(item) {
                container.innerHTML += '<div class="shop-item"><span>' + item.name + '</span><span>' + item.price + ' 💎</span><button class="btn btn-primary btn-sm" onclick="buyItem(\'' + item.id + '\', ' + item.price + ')">Купить</button></div>';
            });
        }
    });
    openModal('shop-modal');
}

function buyItem(id, price) {
    if ((currentUser.gems || 0) < price) {
        showToast('Недостаточно Gems', 'error');
        return;
    }
    supabase.from('users').update({ gems: currentUser.gems - price }).eq('id', currentUser.id).then(function() {
        supabase.from('user_inventory').insert({ user_id: currentUser.id, item_id: id }).then();
        currentUser.gems -= price;
        showToast('Куплено!', 'success');
        openShop();
    });
}

// Premium
function showPremiumModal() { openModal('premium-modal'); }

function selectPremium(plan) {
    var stars = { '1month': 15, '3months': 40, '1year': 140 }[plan];
    document.getElementById('stars-amount').textContent = stars;
    var code = Math.random().toString(36).substring(2, 10).toUpperCase();
    document.getElementById('activation-code-display').textContent = code;
    document.getElementById('premium-code-section').style.display = 'block';
    supabase.from('subscription_codes').insert({ code: code, user_id: currentUser.id, plan: plan, stars_amount: stars }).then();
}

function activatePremium() {
    var code = document.getElementById('code-input').value.trim();
    supabase.from('subscription_codes').select('*').eq('code', code).eq('user_id', currentUser.id).eq('used', false).maybeSingle().then(function(res) {
        if (!res.data) {
            showToast('Неверный код', 'error');
            return;
        }
        var months = { '1month': 1, '3months': 3, '1year': 12 }[res.data.plan];
        var end = new Date();
        end.setMonth(end.getMonth() + months);
        supabase.from('users').update({ is_premium: true, premium_until: end.toISOString() }).eq('id', currentUser.id).then(function() {
            supabase.from('subscription_codes').update({ used: true }).eq('id', res.data.id).then();
            supabase.from('subscriptions').insert({ user_id: currentUser.id, plan: res.data.plan, ends_at: end.toISOString() }).then();
            giveGems(1000, 'Premium бонус');
            currentUser.is_premium = true;
            saveSession(currentUser);
            closeModal();
            showToast('Premium активирован! +1000 Gems', 'success');
        });
    });
}

// Админка
function showAdminPanel() {
    if (!currentUser || !currentUser.is_admin) return;
    openModal('admin-modal');
    switchAdminTab('stats');
}

function switchAdminTab(tab) {
    var tabs = document.querySelectorAll('.admin-tab-btn');
    tabs.forEach(function(t, i) {
        t.classList.toggle('active', i === ['stats', 'users', 'gems', 'posts'].indexOf(tab));
    });
    if (tab === 'stats') loadAdminStats();
    else if (tab === 'users') loadAdminUsers();
    else if (tab === 'gems') loadAdminGems();
    else if (tab === 'posts') loadAdminPosts();
}

function loadAdminStats() {
    Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('chirps').select('*', { count: 'exact', head: true })
    ]).then(function(results) {
        document.getElementById('admin-content').innerHTML = '<p>Пользователей: ' + results[0].count + '</p><p>Чирпов: ' + results[1].count + '</p>';
    });
}

function loadAdminUsers() {
    supabase.from('users').select('*').then(function(res) {
        var html = '';
        res.data.forEach(function(u) {
            html += '<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid var(--border)">' +
                '<span>' + u.handle + '</span>' +
                '<button class="btn btn-admin btn-sm" onclick="banUser(\'' + u.id + '\')">Бан</button>' +
                '</div>';
        });
        document.getElementById('admin-content').innerHTML = html;
    });
}

function banUser(uid) {
    var reason = prompt('Причина:');
    if (reason) {
        supabase.from('bans').insert({ user_id: uid, reason: reason, banned_until: '2099-01-01T00:00:00Z' }).then(function() {
            showToast('Забанен', 'success');
        });
    }
}

function giveGemsToUser(uid) {
    var amount = parseInt(prompt('Сколько Gems?'), 10);
    if (amount) {
        supabase.from('users').select('gems').eq('id', uid).single().then(function(res) {
            supabase.from('users').update({ gems: (res.data.gems || 0) + amount }).eq('id', uid).then(function() {
                showToast('Выдано ' + amount + ' Gems', 'success');
            });
        });
    }
}

function loadAdminGems() {
    document.getElementById('admin-content').innerHTML =
        '<input id="admin-uid" placeholder="User ID" class="input-field">' +
        '<input id="admin-amount" type="number" placeholder="Gems" class="input-field">' +
        '<button class="btn btn-primary" onclick="giveGemsToUser(document.getElementById(\'admin-uid\').value)">Выдать</button>';
}

function loadAdminPosts() {
    supabase.from('chirps').select('*, users(handle)').order('created_at', false).limit(50).then(function(res) {
        var html = '';
        res.data.forEach(function(p) {
            html += '<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid var(--border)">' +
                '<span>' + p.content.substring(0, 30) + '... (' + (p.users ? p.users.handle : '') + ')</span>' +
                '<button class="btn btn-admin btn-sm" onclick="deletePost(\'' + p.id + '\')">X</button>' +
                '</div>';
        });
        document.getElementById('admin-content').innerHTML = html;
    });
}

function deletePost(pid) {
    if (confirm('Удалить?')) {
        supabase.from('chirps').delete().eq('id', pid).then(function() {
            showToast('Удалён', 'success');
            loadAdminPosts();
        });
    }
}

// Realtime
function setupRealtime() {
    realtimeChannels.forEach(function(c) { supabase.removeChannel(c); });
    realtimeChannels = [
        supabase.channel('chirps-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chirps' }, function() {
                if (currentFeed === 'latest') {
                    feedPage = 0; hasMoreFeed = true;
                    document.getElementById('feed-posts').innerHTML = '';
                    loadFeed();
                }
            })
            .subscribe(),
        supabase.channel('chat-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, function(payload) {
                if (currentChatId && payload.new.chat_id === currentChatId) {
                    loadChatMessages(currentChatId);
                }
            })
            .subscribe(),
        supabase.channel('notif-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, function(payload) {
                if (payload.new.user_id === currentUser.id) {
                    showToast('Новое уведомление', 'success');
                }
            })
            .subscribe()
    ];
}

// Модалки
function openModal(id) {
    document.getElementById('modal-overlay').style.display = 'block';
    document.getElementById(id).style.display = 'block';
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.querySelectorAll('.modal').forEach(function(m) { m.style.display = 'none'; });
}

// Политики
function showPolicy(type) {
    var titles = { terms: 'Правила', privacy: 'Конфиденциальность', cookies: 'Cookie' };
    document.getElementById('policy-title').textContent = titles[type];
    document.getElementById('policy-content').innerHTML = type === 'terms' ? '<p>Правила использования...</p>' : type === 'privacy' ? '<p>Политика конфиденциальности...</p>' : '<p>Cookie...</p>';
    openModal('policy-modal');
}

function acceptCookies() {
    localStorage.setItem('cookies_accepted', 'true');
    document.getElementById('cookie-banner').style.display = 'none';
}

// Мобильная навигация
function mobileNav(section) {
    hideAll();
    if (section === 'feed') showFeed('latest');
    else if (section === 'search') showSearch();
    else if (section === 'chats') showChatsList();
    else if (section === 'profile') viewProfile(currentUser.id);
    var btns = document.querySelectorAll('.mobile-nav-btn');
    btns.forEach(function(b, i) {
        b.classList.toggle('active', i === ['feed','search',null,'chats','profile'].indexOf(section));
    });
}

// Запуск
window.onload = function() {
    if (loadSession()) {
        showScreen('main-screen');
        initMain();
    } else {
        showScreen('auth-screen');
    }
};