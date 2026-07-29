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

// Хэширование
function hashPassword(password, salt) {
    return sha512_256(password + salt);
}

// Toast
function showToast(message, type) {
    var toast = document.getElementById('global-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(function() { toast.className = 'toast ' + type; }, 3000);
}

// Escape
function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// Фильтр мата
function filterBadWords(text) {
    var badWords = ['badword1', 'badword2'];
    var filtered = text;
    for (var i = 0; i < badWords.length; i++) {
        var regex = new RegExp(badWords[i], 'gi');
        filtered = filtered.replace(regex, '***');
    }
    return filtered;
}

// Сессия
function saveSession(user) {
    var session = { user: user, expires_at: new Date().getTime() + 86400000 };
    localStorage.setItem('nobu_session', JSON.stringify(session));
    currentSession = session;
    currentUser = user;
}

function loadSession() {
    var data = localStorage.getItem('nobu_session');
    if (data) {
        try {
            var session = JSON.parse(data);
            if (session.expires_at > Date.now() && session.user) {
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

// Экраны
function showScreen(id) {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('main-screen').classList.remove('active');
    document.getElementById(id).classList.add('active');
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
    if (!email || !password) { showToast('Заполните все поля', 'error'); return; }
    
    supabase.from('users').select('*').eq('email', email).single().then(function(res) {
        if (res.error || !res.data) { showToast('Неверный email или пароль', 'error'); return; }
        var user = res.data;
        if (hashPassword(password, user.salt || '') !== user.password_hash) {
            showToast('Неверный email или пароль', 'error'); return;
        }
        supabase.from('bans').select('*').eq('user_id', user.id).gte('banned_until', new Date().toISOString()).maybeSingle().then(function(b) {
            if (b.data) { showToast('Аккаунт заблокирован', 'error'); return; }
            saveSession(user);
            showScreen('main-screen');
            initMainScreen();
            showToast('Добро пожаловать!', 'success');
        });
    });
}

function registerUser() {
    var email = document.getElementById('reg-email').value.trim();
    var username = document.getElementById('reg-username').value.trim();
    var handle = document.getElementById('reg-handle').value.trim();
    var password = document.getElementById('reg-password').value;
    var age = document.getElementById('age-confirm').checked;
    var terms = document.getElementById('terms-confirm').checked;
    
    if (!email || !username || !handle || !password) { showToast('Заполните все поля', 'error'); return; }
    if (!age) { showToast('Подтвердите возраст 13+', 'error'); return; }
    if (!terms) { showToast('Примите правила', 'error'); return; }
    if (handle.charAt(0) !== '@') handle = '@' + handle;
    
    supabase.from('users').select('id').or('email.eq.' + email + ',handle.eq.' + handle).limit(1).then(function(r) {
        if (r.data && r.data.length > 0) { showToast('Email или handle занят', 'error'); return; }
        var salt = Math.random().toString(36).substring(2, 15);
        var hash = hashPassword(password, salt);
        supabase.from('users').insert({
            email: email, username: username, handle: handle,
            password_hash: hash, salt: salt, is_admin: false, is_premium: false, gems: 0
        }).select().single().then(function(ins) {
            if (ins.error) { showToast('Ошибка: ' + ins.error.message, 'error'); return; }
            showToast('Успешно! Войдите.', 'success');
            switchAuthTab('login');
        });
    });
}

function logout() {
    clearSession();
    closeRealtimeChannels();
    showScreen('auth-screen');
}

// Инициализация
function initMainScreen() {
    if (!currentUser) return;
    document.getElementById('sidebar-username').textContent = currentUser.username;
    document.getElementById('sidebar-handle').textContent = currentUser.handle;
    document.getElementById('gems-display').textContent = currentUser.gems || 0;
    if (currentUser.is_admin) document.getElementById('admin-btn').style.display = 'inline-block';
    setupRealtime();
    showFeed('latest');
    loadNotifications();
    checkDailyBonus();
    if (!localStorage.getItem('cookies_accepted')) document.getElementById('cookie-banner').style.display = 'block';
}

// Лента
function showFeed(type) {
    currentFeed = type;
    feedPage = 0;
    hasMoreFeed = true;
    document.getElementById('feed-posts').innerHTML = '';
    var tabs = document.querySelectorAll('.feed-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    if (type === 'latest') tabs[0].classList.add('active');
    else if (type === 'popular') tabs[1].classList.add('active');
    else tabs[2].classList.add('active');
    hideAll();
    document.getElementById('feed-container').style.display = 'block';
    loadFeed();
}

function hideAll() {
    var ids = ['feed-container', 'profile-container', 'chats-container', 'chat-window', 'search-container'];
    for (var i = 0; i < ids.length; i++) document.getElementById(ids[i]).style.display = 'none';
}

function loadFeed() {
    if (feedLoading || !hasMoreFeed) return;
    feedLoading = true;
    document.getElementById('feed-loader').style.display = 'block';
    
    var query;
    if (currentFeed === 'subscriptions') {
        supabase.from('follows').select('followee_id').eq('follower_id', currentUser.id).then(function(r) {
            if (r.data && r.data.length > 0) {
                var ids = r.data.map(function(f) { return f.followee_id; });
                supabase.from('chirps').select('*, users(id, handle, username, avatar_url, is_premium)').in('user_id', ids).order('created_at', false).range(feedPage*10, feedPage*10+9).then(handleFeed);
            } else {
                document.getElementById('feed-posts').innerHTML = '<p style="color:#8888bb;">Подпишитесь на кого-нибудь</p>';
                hasMoreFeed = false;
                document.getElementById('feed-loader').style.display = 'none';
                feedLoading = false;
            }
        });
        return;
    } else {
        query = supabase.from('chirps').select('*, users(id, handle, username, avatar_url, is_premium)').order('created_at', false).range(feedPage*10, feedPage*10+9);
        query.then(handleFeed);
    }
}

function handleFeed(res) {
    if (res.error || !res.data || res.data.length === 0) { hasMoreFeed = false; }
    else { renderPosts(res.data); feedPage++; }
    document.getElementById('feed-loader').style.display = 'none';
    feedLoading = false;
}

function renderPosts(posts) {
    var c = document.getElementById('feed-posts');
    for (var i = 0; i < posts.length; i++) {
        var p = posts[i], u = p.users;
        var av = u.avatar_url ? 'background-image:url(' + u.avatar_url + ')' : '';
        var pr = u.is_premium ? ' ⭐' : '';
        var card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = '<div class="post-header"><div class="post-avatar" style="' + av + '"></div><div><span class="post-author">' + escapeHtml(u.username) + '</span> <span class="post-handle">' + escapeHtml(u.handle) + '</span>' + pr + '</div></div>' +
            '<div class="post-content">' + escapeHtml(filterBadWords(p.content)) + '</div>' +
            (p.media_url ? '<img src="' + p.media_url + '" class="post-media">' : '') +
            '<div class="post-actions"><button class="action-btn" onclick="likeChirp(\'' + p.id + '\', this)">❤️ 0</button><button class="action-btn" onclick="rechirp()">🔄</button></div>';
        c.appendChild(card);
    }
}

// Прокрутка
window.onscroll = function() {
    if (!feedLoading && hasMoreFeed && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) loadFeed();
};

// Поиск
function showSearch() { hideAll(); document.getElementById('search-container').style.display = 'block'; }

function performSearch() {
    var q = document.getElementById('search-input').value.trim();
    if (!q) return;
    var r = document.getElementById('search-results');
    r.innerHTML = 'Поиск...';
    if (q.startsWith('@')) {
        supabase.from('users').select('*').ilike('handle', '%' + q.substring(1) + '%').then(function(res) {
            var h = '';
            if (res.data) for (var i = 0; i < res.data.length; i++) h += '<div class="chat-item" onclick="viewProfile(\'' + res.data[i].id + '\')">' + escapeHtml(res.data[i].handle) + '</div>';
            r.innerHTML = h || 'Ничего не найдено';
        });
    } else if (q.startsWith('#')) {
        supabase.from('chirps').select('*, users(*)').ilike('content', '%' + q + '%').then(function(res) {
            r.innerHTML = ''; if (res.data) renderPosts(res.data); else r.innerHTML = 'Ничего не найдено';
        });
    } else {
        supabase.from('chirps').select('*, users(*)').ilike('content', '%' + q + '%').then(function(res) {
            r.innerHTML = ''; if (res.data) renderPosts(res.data); else r.innerHTML = 'Ничего не найдено';
        });
    }
}

function performSearchPC() {
    var q = document.getElementById('search-input-pc').value.trim();
    if (q) { document.getElementById('search-input').value = q; performSearch(); showSearch(); }
}

// Профиль
function viewProfile(uid) {
    currentProfileId = uid;
    hideAll();
    document.getElementById('profile-container').style.display = 'block';
    supabase.from('users').select('*').eq('id', uid).single().then(function(r) {
        if (!r.data) return;
        var u = r.data;
        document.getElementById('profile-name').textContent = u.username;
        document.getElementById('profile-handle-display').textContent = u.handle;
        document.getElementById('profile-bio').textContent = u.bio || '';
        document.getElementById('profile-premium-badge').style.display = u.is_premium ? 'inline' : 'none';
        document.getElementById('profile-verified').style.display = u.is_admin ? 'inline' : 'none';
        var isMe = currentUser && currentUser.id === uid;
        document.getElementById('follow-btn').style.display = isMe ? 'none' : 'inline-block';
        document.getElementById('edit-profile-btn').style.display = isMe ? 'inline-block' : 'none';
        document.getElementById('premium-btn').style.display = isMe ? 'inline-block' : 'none';
        if (!isMe) checkFollow(uid);
        supabase.from('chirps').select('id', { count: 'exact' }).eq('user_id', uid).then(function(c) { document.getElementById('profile-chirps').innerHTML = '<strong>' + c.count + '</strong> чирпов'; });
        supabase.from('follows').select('id', { count: 'exact' }).eq('followee_id', uid).then(function(f) { document.getElementById('profile-followers').innerHTML = '<strong>' + f.count + '</strong> подписчиков'; });
        supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', uid).then(function(f) { document.getElementById('profile-following').innerHTML = '<strong>' + f.count + '</strong> подписок'; });
    });
}

function checkFollow(uid) {
    supabase.from('follows').select('*').eq('follower_id', currentUser.id).eq('followee_id', uid).maybeSingle().then(function(r) {
        var b = document.getElementById('follow-btn');
        if (r.data) { b.textContent = 'Отписаться'; b.onclick = function() { unfollow(uid); }; }
        else { b.textContent = 'Подписаться'; b.onclick = function() { follow(uid); }; }
    });
}

function follow(uid) { supabase.from('follows').insert({ follower_id: currentUser.id, followee_id: uid }).then(function() { checkFollow(uid); }); }
function unfollow(uid) { supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('followee_id', uid).then(function() { checkFollow(uid); }); }

function showEditProfile() { openModal('edit-profile-modal'); }
function updateProfile() {
    var bio = document.getElementById('bio-input').value;
    supabase.from('users').update({ bio: bio }).eq('id', currentUser.id).then(function() {
        currentUser.bio = bio; saveSession(currentUser); closeModal(); showToast('Профиль обновлён', 'success');
    });
}

// Чирпы
function createPostFab() { openModal('create-post-modal'); }
function createPost() {
    var c = document.getElementById('post-content').value.trim();
    if (!c || c.length > 280) return;
    supabase.from('chirps').insert({ user_id: currentUser.id, content: filterBadWords(c) }).then(function() {
        document.getElementById('post-content').value = '';
        closeModal();
        showToast('Опубликовано!', 'success');
        giveGems(1, 'За пост');
        if (currentFeed === 'latest') { feedPage = 0; hasMoreFeed = true; document.getElementById('feed-posts').innerHTML = ''; loadFeed(); }
    });
}

// Лайки
function likeChirp(cid, btn) {
    supabase.from('likes').select('*').eq('user_id', currentUser.id).eq('chirp_id', cid).maybeSingle().then(function(r) {
        if (r.data) { supabase.from('likes').delete().eq('id', r.data.id).then(function() { btn.classList.remove('liked'); }); }
        else { supabase.from('likes').insert({ user_id: currentUser.id, chirp_id: cid }).then(function() { btn.classList.add('liked'); }); }
    });
}

function rechirp() { showToast('Речирпнуто!', 'success'); }

// Чаты
function showChatsList() { hideAll(); document.getElementById('chats-container').style.display = 'block'; switchChatsTab('private'); }

function switchChatsTab(tab) {
    document.getElementById('private-chats-list').style.display = tab === 'private' ? 'block' : 'none';
    document.getElementById('group-chats-list').style.display = tab === 'groups' ? 'block' : 'none';
    if (tab === 'private') loadPrivateChats(); else loadGroupChats();
}

function loadPrivateChats() {
    supabase.from('chats').select('*').or('user1_id.eq.' + currentUser.id + ',user2_id.eq.' + currentUser.id).then(function(r) {
        var c = document.getElementById('private-chats-list'); c.innerHTML = '';
        if (r.data) r.data.forEach(function(chat) {
            var oid = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
            supabase.from('users').select('username').eq('id', oid).single().then(function(u) {
                c.innerHTML += '<div class="chat-item" onclick="openChat(\'' + chat.id + '\')">' + (u.data ? u.data.username : 'Юзер') + '</div>';
            });
        });
    });
}

function openChat(cid) {
    currentChatId = cid; currentGroupId = null;
    hideAll(); document.getElementById('chat-window').style.display = 'flex';
    supabase.from('chats').select('*').eq('id', cid).single().then(function(r) {
        var oid = r.data.user1_id === currentUser.id ? r.data.user2_id : r.data.user1_id;
        supabase.from('users').select('handle').eq('id', oid).single().then(function(u) {
            document.getElementById('chat-title').textContent = u.data ? u.data.handle : 'Чат';
        });
    });
    loadChatMessages(cid);
}

function loadChatMessages(cid) {
    supabase.from('chat_messages').select('*').eq('chat_id', cid).order('created_at', true).then(function(r) {
        var c = document.getElementById('chat-messages'); c.innerHTML = '';
        if (r.data) r.data.forEach(function(m) {
            var d = document.createElement('div');
            d.className = 'chat-message' + (m.sender_id === currentUser.id ? ' self' : '');
            d.textContent = m.content;
            c.appendChild(d);
        });
    });
}

function sendMessage() {
    var t = document.getElementById('chat-input').value.trim();
    if (!t || (!currentChatId && !currentGroupId)) return;
    if (currentChatId) {
        supabase.from('chat_messages').insert({ chat_id: currentChatId, sender_id: currentUser.id, content: t }).then(function() {
            document.getElementById('chat-input').value = ''; loadChatMessages(currentChatId);
        });
    }
}

function closeChat() { currentChatId = null; document.getElementById('chat-window').style.display = 'none'; showFeed('latest'); }

function loadGroupChats() { document.getElementById('group-chats-list').innerHTML = '<p>Нет групп</p>'; }
function showCreateGroup() { var n = prompt('Название:'); if (n) supabase.from('groups_chats').insert({ name: n, creator_id: currentUser.id }).then(function() { showToast('Создана', 'success'); }); }

// Уведомления
function loadNotifications() {
    supabase.from('notifications').select('*').eq('user_id', currentUser.id).order('created_at', false).limit(10).then(function(r) {
        var c = document.getElementById('notifications-list'); if (!c) return; c.innerHTML = '';
        if (r.data) r.data.forEach(function(n) { c.innerHTML += '<div class="notification-item">' + n.type + '</div>'; });
    });
}

function showNotifications() { openModal('notifications-modal'); loadNotifications(); }

// Модалки
function openModal(id) { document.getElementById('modal-overlay').style.display = 'block'; document.getElementById(id).style.display = 'block'; }
function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    var modals = document.querySelectorAll('.modal');
    for (var i = 0; i < modals.length; i++) modals[i].style.display = 'none';
}

// Gems и магазин
function giveGems(amount, reason) {
    supabase.from('users').select('gems').eq('id', currentUser.id).single().then(function(r) {
        var ng = (r.data.gems || 0) + amount;
        supabase.from('users').update({ gems: ng }).eq('id', currentUser.id).then(function() {
            currentUser.gems = ng;
            document.getElementById('gems-display').textContent = ng;
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
    document.getElementById('shop-gems-count').textContent = currentUser.gems || 0;
    supabase.from('shop_items').select('*').then(function(r) {
        var c = document.getElementById('shop-items'); c.innerHTML = '';
        if (r.data) r.data.forEach(function(item) {
            c.innerHTML += '<div class="shop-item"><span>' + item.name + '</span><span>' + item.price + ' 💎</span><button class="btn btn-primary btn-sm" onclick="buyItem(\'' + item.id + '\',' + item.price + ')">Купить</button></div>';
        });
    });
    openModal('shop-modal');
}

function buyItem(iid, price) {
    if ((currentUser.gems || 0) < price) { showToast('Мало Gems', 'error'); return; }
    supabase.from('users').update({ gems: currentUser.gems - price }).eq('id', currentUser.id).then(function() {
        currentUser.gems -= price;
        supabase.from('user_inventory').insert({ user_id: currentUser.id, item_id: iid }).then();
        showToast('Куплено!', 'success');
    });
}

// Premium
function showPremiumModal() { openModal('premium-modal'); }
function selectPremium(plan) {
    var stars = plan === '1month' ? 15 : (plan === '3months' ? 40 : 140);
    document.getElementById('stars-amount').textContent = stars;
    document.getElementById('premium-code-section').style.display = 'block';
    var code = Math.random().toString(36).substring(2, 10).toUpperCase();
    document.getElementById('activation-code-display').textContent = code;
    supabase.from('subscription_codes').insert({ code: code, user_id: currentUser.id, plan: plan, stars_amount: stars, used: false }).then();
}

function activatePremium() {
    var code = document.getElementById('code-input').value.trim();
    if (!code) return;
    supabase.from('subscription_codes').select('*').eq('code', code).eq('used', false).maybeSingle().then(function(r) {
        if (!r.data) { showToast('Неверный код', 'error'); return; }
        var months = r.data.plan === '1month' ? 1 : (r.data.plan === '3months' ? 3 : 12);
        var end = new Date(); end.setMonth(end.getMonth() + months);
        supabase.from('users').update({ is_premium: true, premium_until: end.toISOString() }).eq('id', currentUser.id).then(function() {
            supabase.from('subscription_codes').update({ used: true }).eq('id', r.data.id).then();
            supabase.from('subscriptions').insert({ user_id: currentUser.id, plan: r.data.plan, ends_at: end.toISOString() }).then();
            giveGems(1000, 'Premium бонус');
            currentUser.is_premium = true;
            saveSession(currentUser);
            closeModal();
            showToast('Premium активен! +1000 Gems', 'success');
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
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    if (tab === 'stats') { tabs[0].classList.add('active'); loadAdminStats(); }
    else if (tab === 'users') { tabs[1].classList.add('active'); loadAdminUsers(); }
    else if (tab === 'gems') { tabs[2].classList.add('active'); loadAdminGems(); }
    else { tabs[3].classList.add('active'); loadAdminPosts(); }
}

function loadAdminStats() {
    Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('chirps').select('*', { count: 'exact', head: true })
    ]).then(function(r) {
        document.getElementById('admin-content').innerHTML = 'Юзеров: ' + r[0].count + ' | Чирпов: ' + r[1].count;
    });
}

function loadAdminUsers() {
    supabase.from('users').select('*').then(function(r) {
        var h = '';
        r.data.forEach(function(u) { h += '<div>' + u.handle + ' <button onclick="banUser(\'' + u.id + '\')" class="btn btn-admin btn-sm">Бан</button></div>'; });
        document.getElementById('admin-content').innerHTML = h;
    });
}

function banUser(uid) {
    var reason = prompt('Причина:');
    if (!reason) return;
    supabase.from('bans').insert({ user_id: uid, reason: reason, banned_until: new Date('2099-01-01').toISOString() }).then(function() { showToast('Забанен', 'success'); });
}

function giveGemsToUser(uid) {
    var amount = parseInt(prompt('Сколько Gems?'), 10);
    if (!amount) return;
    supabase.from('users').select('gems').eq('id', uid).single().then(function(r) {
        supabase.from('users').update({ gems: (r.data.gems||0) + amount }).eq('id', uid).then(function() { showToast('Выдано ' + amount, 'success'); });
    });
}

function loadAdminGems() {
    document.getElementById('admin-content').innerHTML = '<input id="admin-uid" placeholder="User ID" class="input-field"><input id="admin-amount" type="number" placeholder="Gems" class="input-field"><button class="btn btn-primary" onclick="giveGemsToUser(document.getElementById(\'admin-uid\').value)">Выдать</button>';
}

function loadAdminPosts() {
    supabase.from('chirps').select('*, users(handle)').order('created_at', false).limit(20).then(function(r) {
        var h = '';
        r.data.forEach(function(p) { h += '<div>' + p.content.substring(0,30) + '... <button onclick="deletePost(\'' + p.id + '\')" class="btn btn-admin btn-sm">X</button></div>'; });
        document.getElementById('admin-content').innerHTML = h;
    });
}

function deletePost(pid) { if (confirm('Удалить?')) supabase.from('chirps').delete().eq('id', pid).then(function() { showToast('Удалён', 'success'); }); }

// Realtime
function setupRealtime() {
    closeRealtimeChannels();
    var ch1 = supabase.channel('chirps').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chirps' }, function() { if (currentFeed === 'latest') loadFeed(); }).subscribe();
    var ch2 = supabase.channel('chat').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, function(p) { if (currentChatId && p.new.chat_id === currentChatId) loadChatMessages(currentChatId); }).subscribe();
    var ch3 = supabase.channel('notif').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, function(p) { if (p.new.user_id === currentUser.id) { showToast('Новое уведомление', 'success'); loadNotifications(); } }).subscribe();
    realtimeChannels = [ch1, ch2, ch3];
}

function closeRealtimeChannels() { for (var i = 0; i < realtimeChannels.length; i++) supabase.removeChannel(realtimeChannels[i]); realtimeChannels = []; }

// Мобильное меню
function mobileNav(section) {
    hideAll();
    if (section === 'feed') showFeed('latest');
    else if (section === 'search') document.getElementById('search-container').style.display = 'block';
    else if (section === 'chats') showChatsList();
    else if (section === 'profile') viewProfile(currentUser.id);
}

// Политики
function showPolicy(type) {
    var title = type === 'terms' ? 'Правила' : (type === 'privacy' ? 'Конфиденциальность' : 'Cookie');
    document.getElementById('policy-title').textContent = title;
    document.getElementById('policy-content').innerHTML = '<p>Документ</p>';
    openModal('policy-modal');
}
function acceptCookies() { localStorage.setItem('cookies_accepted', 'true'); document.getElementById('cookie-banner').style.display = 'none'; }

// Старт
window.onload = function() {
    if (loadSession()) { showScreen('main-screen'); initMainScreen(); }
    else showScreen('auth-screen');
};