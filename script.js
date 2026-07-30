// Supabase
var supabaseUrl = 'https://iljsednetiogjtowlexo.supabase.co';
var supabaseKey = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Глобальные переменные
var currentUser = null;
var currentFeed = 'latest';
var currentChatId = null;
var feedPage = 0, feedLoading = false, hasMoreFeed = true;
var realtimeChannels = [];
var profileCache = {};      // кеш профилей { id: { data, timestamp } }
var CACHE_DURATION = 30000; // 30 секунд

// Утилиты
function sha256(pwd, salt) { return sha512_256(pwd + salt); }
function showToast(msg, type) {
    var t = document.getElementById('global-toast');
    t.textContent = msg; t.className = 'toast ' + type + ' show';
    setTimeout(function() { t.className = 'toast ' + type; }, 3000);
}
function escapeHtml(s) { var d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }
function hideAll() {
    ['feed-container','profile-container','chats-container','chat-window','search-container'].forEach(function(id) {
        document.getElementById(id).style.display = 'none';
    });
}

// Сессия
function saveSession(user) { currentUser = user; localStorage.setItem('nobu_session', JSON.stringify({ user: user, expires_at: Date.now()+86400000 })); }
function loadSession() {
    var d = localStorage.getItem('nobu_session');
    if (!d) return false;
    try { var s = JSON.parse(d); if (s.expires_at > Date.now() && s.user) { currentUser = s.user; return true; } } catch(e) {}
    localStorage.removeItem('nobu_session'); return false;
}
function clearSession() { localStorage.removeItem('nobu_session'); currentUser = null; }
function showScreen(id) { document.getElementById('auth-screen').classList.remove('active'); document.getElementById('main-screen').classList.remove('active'); document.getElementById(id).classList.add('active'); }

// Аутентификация
function switchAuthTab(tab) {
    var login = document.getElementById('login-form'), reg = document.getElementById('register-form');
    var tabs = document.querySelectorAll('.auth-tab');
    if (tab === 'login') { login.classList.add('active'); reg.classList.remove('active'); tabs[0].classList.add('active'); tabs[1].classList.remove('active'); }
    else { login.classList.remove('active'); reg.classList.add('active'); tabs[0].classList.remove('active'); tabs[1].classList.add('active'); }
}

function login() {
    var email = document.getElementById('login-email').value.trim(), pwd = document.getElementById('login-password').value;
    if (!email || !pwd) return showToast('Заполните поля', 'error');
    supabase.from('users').select('*').eq('email', email).single().then(function(r) {
        if (r.error || !r.data) return showToast('Неверные данные', 'error');
        var u = r.data;
        if (sha256(pwd, u.salt) !== u.password_hash) return showToast('Неверные данные', 'error');
        supabase.from('bans').select('*').eq('user_id', u.id).gte('banned_until', new Date().toISOString()).maybeSingle().then(function(b) {
            if (b.data) return showToast('Аккаунт заблокирован', 'error');
            saveSession(u);
            showScreen('main-screen');
            initMain();
            showToast('Добро пожаловать!', 'success');
        });
    });
}

function registerUser() {
    var email = document.getElementById('reg-email').value.trim(), username = document.getElementById('reg-username').value.trim();
    var handle = document.getElementById('reg-handle').value.trim(), pwd = document.getElementById('reg-password').value;
    if (!email || !username || !handle || !pwd) return showToast('Заполните все поля', 'error');
    if (!document.getElementById('age-confirm').checked || !document.getElementById('terms-confirm').checked) return showToast('Подтвердите возраст и правила', 'error');
    if (handle[0] !== '@') handle = '@' + handle;

    supabase.from('users').select('id').or('email.eq.' + email + ',handle.eq.' + handle).limit(1).then(function(r) {
        if (r.data && r.data.length) return showToast('Email или handle занят', 'error');
        var salt = Math.random().toString(36).substring(2,15);
        var hash = sha256(pwd, salt);
        supabase.from('users').insert({ email: email, username: username, handle: handle, password_hash: hash, salt: salt, is_admin: false, is_premium: false, gems: 0 }).select().single().then(function(ins) {
            if (ins.error) return showToast('Ошибка регистрации: ' + ins.error.message, 'error');
            showToast('Успешно! Войдите.', 'success');
            switchAuthTab('login');
        });
    });
}

function logout() { clearSession(); realtimeChannels.forEach(function(c) { supabase.removeChannel(c); }); showScreen('auth-screen'); }

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

// Лента (оптимизация: кеширование последней загрузки)
var feedCache = { latest: null, popular: null, subscriptions: null };

function showFeed(type) {
    currentFeed = type;
    feedPage = 0; hasMoreFeed = true;
    document.getElementById('feed-posts').innerHTML = '';
    var tabs = document.querySelectorAll('.feed-tab');
    tabs.forEach(function(t,i) { t.classList.toggle('active', i === ['latest','popular','subscriptions'].indexOf(type)); });
    hideAll();
    document.getElementById('feed-container').style.display = 'block';
    if (feedCache[type]) { renderPosts(feedCache[type]); hasMoreFeed = feedCache[type].length >= 10; }
    else loadFeed();
}

function loadFeed() {
    if (feedLoading || !hasMoreFeed) return;
    feedLoading = true;
    document.getElementById('feed-loader').style.display = 'block';
    var q;
    if (currentFeed === 'subscriptions') {
        supabase.from('follows').select('followee_id').eq('follower_id', currentUser.id).then(function(fr) {
            if (fr.data && fr.data.length) {
                var ids = fr.data.map(function(f) { return f.followee_id; });
                supabase.from('chirps').select('*, users!inner(username, handle, avatar_url)').in('user_id', ids).order('created_at', false).range(feedPage*10, feedPage*10+9).then(handleFeed);
            } else {
                document.getElementById('feed-posts').innerHTML = '<p style="color:#888">Подпишитесь на кого-нибудь</p>';
                hasMoreFeed = false; document.getElementById('feed-loader').style.display = 'none'; feedLoading = false;
            }
        });
        return;
    } else {
        q = supabase.from('chirps').select('*, users!inner(username, handle, avatar_url)').order('created_at', false).range(feedPage*10, feedPage*10+9);
        q.then(handleFeed);
    }
}

function handleFeed(res) {
    if (res.error || !res.data || res.data.length === 0) { hasMoreFeed = false; if (feedPage === 0 && !feedCache[currentFeed]) document.getElementById('feed-posts').innerHTML = '<p>Нет постов</p>'; }
    else {
        renderPosts(res.data);
        if (feedPage === 0) feedCache[currentFeed] = res.data;
        feedPage++;
    }
    document.getElementById('feed-loader').style.display = 'none';
    feedLoading = false;
}

function renderPosts(posts) {
    var c = document.getElementById('feed-posts');
    posts.forEach(function(p) {
        var u = p.users;
        var card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = '<div class="post-header"><div class="post-avatar" style="background-image:url(' + (u.avatar_url||'') + ')"></div><div><span class="post-author">' + escapeHtml(u.username) + '</span> <span class="post-handle">' + escapeHtml(u.handle) + '</span></div></div>' +
            '<div class="post-content">' + escapeHtml(p.content) + '</div>' +
            (p.media_url ? '<img src="' + p.media_url + '" class="post-media">' : '') +
            '<div class="post-actions"><button class="action-btn" onclick="likeChirp(\'' + p.id + '\',this)">❤️ 0</button><button class="action-btn" onclick="rechirp()">🔄</button></div>';
        c.appendChild(card);
    });
}

window.onscroll = function() {
    if (!feedLoading && hasMoreFeed && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) loadFeed();
};

// Поиск
function showSearch() { hideAll(); document.getElementById('search-container').style.display = 'block'; }
function performSearch() {
    var q = document.getElementById('search-input').value.trim();
    if (!q) return;
    var resDiv = document.getElementById('search-results'); resDiv.innerHTML = 'Поиск...';
    if (q.startsWith('@')) {
        supabase.from('users').select('*').ilike('handle', '%' + q.substring(1) + '%').then(function(r) {
            resDiv.innerHTML = r.data && r.data.length ? r.data.map(function(u) { return '<div class="chat-item" onclick="viewProfile(\'' + u.id + '\')">' + escapeHtml(u.handle) + '</div>'; }).join('') : 'Ничего не найдено';
        });
    } else {
        supabase.from('chirps').select('*, users(*)').ilike('content', '%' + q + '%').order('created_at', false).then(function(r) {
            resDiv.innerHTML = ''; if (r.data) renderPosts(r.data); else resDiv.innerHTML = 'Ничего не найдено';
        });
    }
}
function performSearchPC() { var q = document.getElementById('search-input-pc').value.trim(); if (q) { document.getElementById('search-input').value = q; performSearch(); showSearch(); } }

// Профиль с кешированием
function viewProfile(uid) {
    hideAll(); document.getElementById('profile-container').style.display = 'block';
    var now = Date.now();
    if (profileCache[uid] && (now - profileCache[uid].timestamp) < CACHE_DURATION) {
        renderProfileData(profileCache[uid].data);
        return;
    }
    supabase.from('users').select('*').eq('id', uid).single().then(function(r) {
        if (!r.data) return;
        profileCache[uid] = { data: r.data, timestamp: now };
        renderProfileData(r.data);
    });
}

function renderProfileData(u) {
    document.getElementById('profile-name').textContent = u.username;
    document.getElementById('profile-handle-display').textContent = u.handle;
    document.getElementById('profile-bio').textContent = u.bio || '';
    document.getElementById('profile-avatar').style.backgroundImage = 'url(' + (u.avatar_url||'') + ')';
    document.getElementById('profile-banner').style.backgroundImage = 'url(' + (u.banner_url||'') + ')';
    document.getElementById('profile-premium-badge').style.display = u.is_premium ? 'inline' : 'none';
    document.getElementById('profile-verified').style.display = u.is_admin ? 'inline' : 'none';

    var isMe = currentUser && currentUser.id === u.id;
    document.getElementById('follow-btn').style.display = isMe ? 'none' : 'inline-block';
    document.getElementById('edit-profile-btn').style.display = isMe ? 'inline-block' : 'none';
    document.getElementById('premium-btn').style.display = isMe ? 'inline-block' : 'none';
    document.getElementById('admin-btn').style.display = (currentUser && currentUser.is_admin) ? 'inline-block' : 'none';

    if (!isMe) {
        supabase.from('follows').select('*').eq('follower_id', currentUser.id).eq('followee_id', u.id).maybeSingle().then(function(f) {
            var btn = document.getElementById('follow-btn');
            btn.textContent = f.data ? 'Отписаться' : 'Подписаться';
            btn.onclick = f.data ? function() { unfollow(u.id); } : function() { follow(u.id); };
        });
    }

    Promise.all([
        supabase.from('chirps').select('*', { count: 'exact', head: true }).eq('user_id', u.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', u.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', u.id)
    ]).then(function(r) {
        document.getElementById('profile-chirps').innerHTML = '<strong>' + (r[0].count||0) + '</strong> чирпов';
        document.getElementById('profile-followers').innerHTML = '<strong>' + (r[1].count||0) + '</strong> подписчиков';
        document.getElementById('profile-following').innerHTML = '<strong>' + (r[2].count||0) + '</strong> подписок';
    });

    supabase.from('chirps').select('*, users(*)').eq('user_id', u.id).order('created_at', false).then(function(p) {
        var c = document.getElementById('profile-posts'); c.innerHTML = '';
        if (p.data) p.data.forEach(function(post) {
            var card = document.createElement('div'); card.className = 'post-card';
            card.innerHTML = '<div class="post-header"><div class="post-avatar" style="background-image:url(' + (post.users.avatar_url||'') + ')"></div><div><span class="post-author">' + escapeHtml(post.users.username) + '</span></div></div><div class="post-content">' + escapeHtml(post.content) + '</div>' + (post.media_url?'<img src="'+post.media_url+'" class="post-media">':'');
            c.appendChild(card);
        });
    });
}

function follow(uid) { supabase.from('follows').insert({ follower_id: currentUser.id, followee_id: uid }).then(function() { delete profileCache[uid]; viewProfile(uid); }); }
function unfollow(uid) { supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('followee_id', uid).then(function() { delete profileCache[uid]; viewProfile(uid); }); }

// Редактирование профиля
function showEditProfile() { document.getElementById('bio-input').value = currentUser.bio||''; document.getElementById('location-input').value = currentUser.location||''; document.getElementById('link-input').value = currentUser.link||''; openModal('edit-profile-modal'); }
async function updateProfile() {
    var bio = document.getElementById('bio-input').value, loc = document.getElementById('location-input').value, link = document.getElementById('link-input').value;
    var upd = { bio: bio, location: loc, link: link };
    var af = document.getElementById('avatar-upload').files[0], bf = document.getElementById('banner-upload').files[0];
    if (af) upd.avatar_url = await uploadFile(af, 'avatars');
    if (bf) upd.banner_url = await uploadFile(bf, 'banners');
    await supabase.from('users').update(upd).eq('id', currentUser.id);
    for (var k in upd) currentUser[k] = upd[k];
    saveSession(currentUser);
    delete profileCache[currentUser.id];
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
function createPostFab() { openModal('create-post-modal'); }
async function createPost() {
    var content = document.getElementById('post-content').value.trim();
    if (!content || content.length > 280) return showToast('Чирп от 1 до 280 символов', 'error');
    var mf = document.getElementById('post-media').files[0], mediaUrl = null;
    if (mf) mediaUrl = await uploadFile(mf, 'media');
    await supabase.from('chirps').insert({ user_id: currentUser.id, content: content, media_url: mediaUrl });
    document.getElementById('post-content').value = ''; document.getElementById('post-media').value = ''; document.getElementById('char-count').textContent = '0';
    closeModal();
    feedCache[currentFeed] = null; // инвалидируем кеш ленты
    if (currentFeed === 'latest') { feedPage = 0; hasMoreFeed = true; document.getElementById('feed-posts').innerHTML = ''; loadFeed(); }
    showToast('Опубликовано!', 'success');
    giveGems(1, 'За пост');
}

// Лайки
function likeChirp(cid, btn) {
    supabase.from('likes').select('*').eq('user_id', currentUser.id).eq('chirp_id', cid).maybeSingle().then(function(r) {
        if (r.data) { supabase.from('likes').delete().eq('id', r.data.id).then(function() { btn.classList.remove('liked'); }); }
        else { supabase.from('likes').insert({ user_id: currentUser.id, chirp_id: cid }).then(function() { btn.classList.add('liked'); }); }
    });
}
function rechirp() { showToast('Речирпнуто!', 'success'); }

// Чаты (оптимизация не требуется)
function showChatsList() { hideAll(); document.getElementById('chats-container').style.display = 'block'; switchChatsTab('private'); }
function switchChatsTab(tab) {
    document.getElementById('private-chats-list').style.display = tab==='private'?'block':'none';
    document.getElementById('group-chats-list').style.display = tab==='groups'?'block':'none';
    if (tab==='private') loadPrivateChats(); else loadGroupChats();
}
function loadPrivateChats() {
    supabase.from('chats').select('*').or('user1_id.eq.'+currentUser.id+',user2_id.eq.'+currentUser.id).then(function(r) {
        var c = document.getElementById('private-chats-list'); c.innerHTML = '';
        if (r.data) r.data.forEach(function(chat) {
            var oid = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
            supabase.from('users').select('username,avatar_url').eq('id', oid).single().then(function(u) {
                var av = u.data && u.data.avatar_url ? 'style="background-image:url('+u.data.avatar_url+')"' : '';
                c.innerHTML += '<div class="chat-item" onclick="openChat(\''+chat.id+'\')"><div class="post-avatar" '+av+'></div><div>'+(u.data?u.data.username:'Пользователь')+'</div></div>';
            });
        });
    });
}
function openChat(cid) { currentChatId = cid; hideAll(); document.getElementById('chat-window').style.display = 'flex'; supabase.from('chats').select('*').eq('id', cid).single().then(function(r) { var oid = r.data.user1_id===currentUser.id?r.data.user2_id:r.data.user1_id; supabase.from('users').select('handle').eq('id', oid).single().then(function(u) { document.getElementById('chat-title').textContent = u.data?u.data.handle:'Чат'; }); }); loadChatMessages(cid); }
function loadChatMessages(cid) { supabase.from('chat_messages').select('*').eq('chat_id', cid).order('created_at', true).then(function(r) { var c = document.getElementById('chat-messages'); c.innerHTML = ''; if (r.data) r.data.forEach(function(m) { var d = document.createElement('div'); d.className = 'chat-message'+(m.sender_id===currentUser.id?' self':''); d.textContent = m.content; c.appendChild(d); }); c.scrollTop = c.scrollHeight; }); }
function sendMessage() { var t = document.getElementById('chat-input').value.trim(); if (!t || !currentChatId) return; supabase.from('chat_messages').insert({ chat_id: currentChatId, sender_id: currentUser.id, content: t }).then(function() { document.getElementById('chat-input').value = ''; loadChatMessages(currentChatId); }); }
function closeChat() { currentChatId = null; document.getElementById('chat-window').style.display = 'none'; showFeed('latest'); }
function loadGroupChats() { document.getElementById('group-chats-list').innerHTML = '<p>Нет групп</p>'; }
function showCreateGroup() { var n = prompt('Название:'); if (n) supabase.from('groups_chats').insert({ name: n, creator_id: currentUser.id }).then(function() { showToast('Создана', 'success'); }); }

// Gems и магазин
function giveGems(amount, reason) { supabase.from('users').select('gems').eq('id', currentUser.id).single().then(function(r) { var ng = (r.data.gems||0)+amount; supabase.from('users').update({ gems: ng }).eq('id', currentUser.id).then(function() { currentUser.gems = ng; document.getElementById('gems-display').textContent = ng; supabase.from('gem_transactions').insert({ user_id: currentUser.id, amount: amount, type:'bonus', description: reason }).then(); }); }); }
function checkDailyBonus() { var today = new Date().toDateString(); if (localStorage.getItem('daily_bonus_date') !== today) { giveGems(5, 'Ежедневный бонус'); localStorage.setItem('daily_bonus_date', today); showToast('+5 Gems!', 'success'); } }
function openShop() { supabase.from('shop_items').select('*').then(function(r) { var c = document.getElementById('shop-items'); c.innerHTML = ''; document.getElementById('shop-gems-count').textContent = currentUser.gems||0; if (r.data) r.data.forEach(function(i) { c.innerHTML += '<div class="shop-item"><span>'+i.name+'</span><span>'+i.price+' 💎</span><button class="btn btn-sm" onclick="buyItem(\''+i.id+'\','+i.price+')">Купить</button></div>'; }); }); openModal('shop-modal'); }
function buyItem(id, price) { if ((currentUser.gems||0) < price) return showToast('Недостаточно Gems', 'error'); supabase.from('users').update({ gems: currentUser.gems-price }).eq('id', currentUser.id).then(function() { supabase.from('user_inventory').insert({ user_id: currentUser.id, item_id: id }).then(); currentUser.gems -= price; showToast('Куплено!', 'success'); openShop(); }); }

// Premium (без изменений)
function showPremiumModal() { openModal('premium-modal'); }
function selectPremium(plan) { var stars = { '1month':15, '3months':40, '1year':140 }[plan]; document.getElementById('stars-amount').textContent = stars; var code = Math.random().toString(36).substring(2,10).toUpperCase(); document.getElementById('activation-code-display').textContent = code; document.getElementById('premium-code-section').style.display = 'block'; supabase.from('subscription_codes').insert({ code:code, user_id:currentUser.id, plan:plan, stars_amount:stars }).then(); }
function activatePremium() { var code = document.getElementById('code-input').value.trim(); supabase.from('subscription_codes').select('*').eq('code',code).eq('user_id',currentUser.id).eq('used',false).maybeSingle().then(function(r) { if (!r.data) return showToast('Неверный код', 'error'); var months = { '1month':1, '3months':3, '1year':12 }[r.data.plan]; var end = new Date(); end.setMonth(end.getMonth()+months); supabase.from('users').update({ is_premium:true, premium_until:end.toISOString() }).eq('id',currentUser.id).then(function() { supabase.from('subscription_codes').update({ used:true }).eq('id',r.data.id).then(); supabase.from('subscriptions').insert({ user_id:currentUser.id, plan:r.data.plan, ends_at:end.toISOString() }).then(); giveGems(1000, 'Premium бонус'); currentUser.is_premium = true; saveSession(currentUser); closeModal(); showToast('Premium активирован! +1000 Gems', 'success'); }); }); }

// Админка
function showAdminPanel() { if (!currentUser || !currentUser.is_admin) return; openModal('admin-modal'); switchAdminTab('stats'); }
function switchAdminTab(tab) { var tabs = document.querySelectorAll('.admin-tab-btn'); tabs.forEach(function(t,i) { t.classList.toggle('active', i===['stats','users','gems','posts'].indexOf(tab)); }); if (tab==='stats') loadAdminStats(); else if (tab==='users') loadAdminUsers(); else if (tab==='gems') loadAdminGems(); else loadAdminPosts(); }
function loadAdminStats() { Promise.all([ supabase.from('users').select('*',{count:'exact',head:true}), supabase.from('chirps').select('*',{count:'exact',head:true}) ]).then(function(r) { document.getElementById('admin-content').innerHTML = 'Пользователей: '+r[0].count+' | Постов: '+r[1].count; }); }
function loadAdminUsers() { supabase.from('users').select('*').then(function(r) { var h = ''; r.data.forEach(function(u) { h += '<div>'+u.handle+' <button onclick="banUser(\''+u.id+'\')" class="btn btn-admin btn-sm">Бан</button></div>'; }); document.getElementById('admin-content').innerHTML = h; }); }
function banUser(uid) { var reason = prompt('Причина:'); if (reason) supabase.from('bans').insert({ user_id:uid, reason:reason, banned_until:'2099-01-01' }).then(function() { showToast('Забанен','success'); }); }
function giveGemsToUser(uid) { var amt = parseInt(prompt('Gems:'),10); if (amt) supabase.from('users').select('gems').eq('id',uid).single().then(function(r) { supabase.from('users').update({ gems:(r.data.gems||0)+amt }).eq('id',uid).then(function() { showToast('Выдано '+amt,'success'); }); }); }
function loadAdminGems() { document.getElementById('admin-content').innerHTML = '<input id="admin-uid" placeholder="User ID" class="input-field"><input id="admin-amount" type="number" placeholder="Gems" class="input-field"><button onclick="giveGemsToUser(document.getElementById(\'admin-uid\').value)" class="btn">Выдать</button>'; }
function loadAdminPosts() { supabase.from('chirps').select('*, users(handle)').order('created_at',false).limit(50).then(function(r) { var h = ''; r.data.forEach(function(p) { h += '<div>'+p.content.substring(0,30)+'... <button onclick="deletePost(\''+p.id+'\')" class="btn btn-admin btn-sm">X</button></div>'; }); document.getElementById('admin-content').innerHTML = h; }); }
function deletePost(pid) { if (confirm('Удалить?')) supabase.from('chirps').delete().eq('id',pid).then(function() { showToast('Удалён','success'); loadAdminPosts(); }); }

// Realtime
function setupRealtime() {
    realtimeChannels.forEach(function(c) { supabase.removeChannel(c); });
    realtimeChannels = [
        supabase.channel('chirps').on('postgres_changes', {event:'INSERT', schema:'public', table:'chirps'}, function() { if (currentFeed==='latest') { feedCache.latest = null; feedPage=0; hasMoreFeed=true; document.getElementById('feed-posts').innerHTML=''; loadFeed(); } }).subscribe(),
        supabase.channel('chat').on('postgres_changes', {event:'INSERT', schema:'public', table:'chat_messages'}, function(p) { if (currentChatId && p.new.chat_id===currentChatId) loadChatMessages(currentChatId); }).subscribe(),
        supabase.channel('notif').on('postgres_changes', {event:'INSERT', schema:'public', table:'notifications'}, function(p) { if (p.new.user_id===currentUser.id) showToast('Новое уведомление','success'); }).subscribe()
    ];
}

// Модалки
function openModal(id) { document.getElementById('modal-overlay').style.display = 'block'; document.getElementById(id).style.display = 'block'; }
function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; document.querySelectorAll('.modal').forEach(function(m) { m.style.display = 'none'; }); }

// Политики
function showPolicy(type) {
    var t = { terms:'Правила', privacy:'Конфиденциальность', cookies:'Cookie' }[type];
    document.getElementById('policy-title').textContent = t;
    document.getElementById('policy-content').innerHTML = '<p>Документ</p>';
    openModal('policy-modal');
}
function acceptCookies() { localStorage.setItem('cookies_accepted','true'); document.getElementById('cookie-banner').style.display = 'none'; }

// Мобильная навигация
function mobileNav(s) { hideAll(); if (s==='feed') showFeed('latest'); else if (s==='search') showSearch(); else if (s==='chats') showChatsList(); else if (s==='profile') viewProfile(currentUser.id); }

// Старт
window.onload = function() {
    if (loadSession()) { showScreen('main-screen'); initMain(); }
    else showScreen('auth-screen');
};