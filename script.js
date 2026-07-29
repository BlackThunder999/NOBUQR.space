// Supabase
const supabaseUrl = 'https://iljsednetiogjtowlexo.supabase.co';
const supabaseKey = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let currentFeed = 'latest';
let currentChatId = null;
let currentGroupId = null;
let feedPage = 0, feedLoading = false, hasMoreFeed = true;
let realtimeChannels = [];

// Утилиты
function sha256(pwd, salt) { return sha512_256(pwd + salt); }
function showToast(msg, type) {
    const t = document.getElementById('global-toast');
    t.textContent = msg; t.className = `toast ${type} show`;
    setTimeout(() => t.className = `toast ${type}`, 3000);
}
function escapeHtml(s) { const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }
function hideAll() {
    ['feed-container','profile-container','chats-container','chat-window','search-container'].forEach(id => document.getElementById(id).style.display = 'none');
}

// Сессия
function saveSession(user) {
    currentUser = user;
    localStorage.setItem('nobu_session', JSON.stringify({user, expires_at: Date.now()+86400000}));
}
function loadSession() {
    const data = localStorage.getItem('nobu_session');
    if (!data) return false;
    try {
        const session = JSON.parse(data);
        if (session.expires_at > Date.now() && session.user) {
            currentUser = session.user;
            return true;
        }
    } catch(e) {}
    localStorage.removeItem('nobu_session');
    return false;
}
function clearSession() { localStorage.removeItem('nobu_session'); currentUser = null; }

// Экран
function showScreen(id) {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('main-screen').classList.remove('active');
    document.getElementById(id).classList.add('active');
}

// Аутентификация
function switchAuthTab(tab) {
    const login = document.getElementById('login-form');
    const reg = document.getElementById('register-form');
    const tabs = document.querySelectorAll('.auth-tab');
    if (tab === 'login') {
        login.classList.add('active'); reg.classList.remove('active');
        tabs[0].classList.add('active'); tabs[1].classList.remove('active');
    } else {
        login.classList.remove('active'); reg.classList.add('active');
        tabs[0].classList.remove('active'); tabs[1].classList.add('active');
    }
}

async function login() {
    const email = document.getElementById('login-email').value.trim();
    const pwd = document.getElementById('login-password').value;
    if (!email || !pwd) return showToast('Заполните поля', 'error');
    const {data: user, error} = await supabase.from('users').select('*').eq('email', email).single();
    if (error || !user) return showToast('Неверные данные', 'error');
    if (sha256(pwd, user.salt) !== user.password_hash) return showToast('Неверные данные', 'error');
    const {data: ban} = await supabase.from('bans').select('*').eq('user_id', user.id).gte('banned_until', new Date().toISOString()).maybeSingle();
    if (ban) return showToast('Аккаунт заблокирован', 'error');
    saveSession(user);
    showScreen('main-screen');
    initMain();
}

async function registerUser() {
    const email = document.getElementById('reg-email').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    let handle = document.getElementById('reg-handle').value.trim();
    const pwd = document.getElementById('reg-password').value;
    if (!email || !username || !handle || !pwd) return showToast('Заполните все поля', 'error');
    if (!document.getElementById('age-confirm').checked || !document.getElementById('terms-confirm').checked)
        return showToast('Подтвердите возраст и правила', 'error');
    if (!handle.startsWith('@')) handle = '@' + handle;
    const {data: exist} = await supabase.from('users').select('id').or(`email.eq.${email},handle.eq.${handle}`).limit(1);
    if (exist?.length) return showToast('Email или handle занят', 'error');
    const salt = Math.random().toString(36).slice(2);
    const hash = sha256(pwd, salt);
    const {error} = await supabase.from('users').insert({email, username, handle, password_hash: hash, salt});
    if (error) return showToast('Ошибка регистрации', 'error');
    showToast('Успешно! Войдите.', 'success');
    switchAuthTab('login');
}

function logout() {
    clearSession();
    realtimeChannels.forEach(c => supabase.removeChannel(c));
    showScreen('auth-screen');
}

// Главный экран
function initMain() {
    if (!currentUser) return;
    document.getElementById('sidebar-username').textContent = currentUser.username;
    document.getElementById('sidebar-handle').textContent = currentUser.handle;
    document.getElementById('gems-display').textContent = currentUser.gems || 0;
    const avatar = document.getElementById('sidebar-avatar');
    if (currentUser.avatar_url) avatar.style.backgroundImage = `url(${currentUser.avatar_url})`;
    else avatar.style.backgroundImage = '';
    if (currentUser.is_admin) document.getElementById('admin-btn').style.display = 'inline-block';
    setupRealtime();
    showFeed('latest');
    checkDailyBonus();
    if (!localStorage.getItem('cookies_accepted')) document.getElementById('cookie-banner').style.display = 'flex';
}

// Лента
function showFeed(type) {
    currentFeed = type;
    feedPage = 0; hasMoreFeed = true;
    document.getElementById('feed-posts').innerHTML = '';
    document.querySelectorAll('.feed-tab').forEach((t,i) => t.classList.toggle('active', i === ['latest','popular','subscriptions'].indexOf(type)));
    hideAll();
    document.getElementById('feed-container').style.display = 'block';
    loadFeed();
}

async function loadFeed() {
    if (feedLoading || !hasMoreFeed) return;
    feedLoading = true;
    document.getElementById('feed-loader').style.display = 'block';
    let query;
    if (currentFeed === 'subscriptions') {
        const {data: follows} = await supabase.from('follows').select('followee_id').eq('follower_id', currentUser.id);
        if (follows?.length) {
            const ids = follows.map(f => f.followee_id);
            query = supabase.from('chirps').select('*, users!inner(username, handle, avatar_url, is_premium)').in('user_id', ids).order('created_at', false).range(feedPage*10, feedPage*10+9);
        } else {
            document.getElementById('feed-posts').innerHTML = '<p style="color:var(--text2);text-align:center">Подпишитесь на кого-нибудь</p>';
            hasMoreFeed = false;
            document.getElementById('feed-loader').style.display = 'none';
            feedLoading = false;
            return;
        }
    } else {
        query = supabase.from('chirps').select('*, users!inner(username, handle, avatar_url, is_premium)').order('created_at', false).range(feedPage*10, feedPage*10+9);
    }
    const {data, error} = await query;
    if (!error && data?.length) {
        renderPosts(data);
        feedPage++;
    } else hasMoreFeed = false;
    document.getElementById('feed-loader').style.display = 'none';
    feedLoading = false;
}

function renderPosts(posts) {
    const container = document.getElementById('feed-posts');
    posts.forEach(p => {
        const u = p.users;
        const card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = `<div class="post-header">
            <div class="post-avatar" style="background-image:url(${u.avatar_url||''})"></div>
            <div><span class="post-author">${escapeHtml(u.username)}</span> <span class="post-handle">${escapeHtml(u.handle)}</span>${u.is_premium?' ⭐':''}</div>
        </div>
        <div class="post-content">${escapeHtml(p.content)}</div>
        ${p.media_url?`<img src="${p.media_url}" class="post-media">`:''}
        <div class="post-actions">
            <button class="action-btn" onclick="likeChirp('${p.id}',this)">❤️ 0</button>
            <button class="action-btn" onclick="rechirp()">🔄</button>
        </div>`;
        container.appendChild(card);
    });
}

// Прокрутка
window.onscroll = () => {
    if (!feedLoading && hasMoreFeed && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) loadFeed();
};

// Поиск
function showSearch() { hideAll(); document.getElementById('search-container').style.display = 'block'; }
async function performSearch() {
    const q = document.getElementById('search-input').value.trim();
    if (!q) return;
    const res = document.getElementById('search-results');
    res.innerHTML = 'Поиск...';
    if (q.startsWith('@')) {
        const {data} = await supabase.from('users').select('*').ilike('handle', `%${q.slice(1)}%`);
        res.innerHTML = data?.length ? data.map(u => `<div class="chat-item" onclick="viewProfile('${u.id}')">${escapeHtml(u.handle)}</div>`).join('') : 'Ничего не найдено';
    } else {
        const {data} = await supabase.from('chirps').select('*, users(*)').ilike('content', `%${q}%`);
        res.innerHTML = '';
        if (data?.length) renderPosts(data);
        else res.innerHTML = 'Ничего не найдено';
    }
}
function performSearchPC() {
    const q = document.getElementById('search-input-pc').value.trim();
    if (q) { document.getElementById('search-input').value = q; performSearch(); showSearch(); }
}

// Профиль
async function viewProfile(uid) {
    hideAll();
    document.getElementById('profile-container').style.display = 'block';
    const {data: u} = await supabase.from('users').select('*').eq('id', uid).single();
    if (!u) return;
    document.getElementById('profile-name').textContent = u.username;
    document.getElementById('profile-handle-display').textContent = u.handle;
    document.getElementById('profile-bio').textContent = u.bio || '';
    document.getElementById('profile-avatar').style.backgroundImage = `url(${u.avatar_url||''})`;
    document.getElementById('profile-banner').style.backgroundImage = `url(${u.banner_url||''})`;
    document.getElementById('profile-premium-badge').style.display = u.is_premium ? 'inline' : 'none';
    document.getElementById('profile-verified').style.display = u.is_admin ? 'inline' : 'none';
    const isMe = currentUser?.id === uid;
    document.getElementById('follow-btn').style.display = isMe ? 'none' : 'inline-block';
    document.getElementById('edit-profile-btn').style.display = isMe ? 'inline-block' : 'none';
    document.getElementById('premium-btn').style.display = isMe ? 'inline-block' : 'none';
    document.getElementById('admin-btn').style.display = currentUser?.is_admin ? 'inline-block' : 'none';
    if (!isMe) {
        const {data: f} = await supabase.from('follows').select('*').eq('follower_id', currentUser.id).eq('followee_id', uid).maybeSingle();
        const btn = document.getElementById('follow-btn');
        btn.textContent = f ? 'Отписаться' : 'Подписаться';
        btn.onclick = f ? () => unfollow(uid) : () => follow(uid);
    }
    const [{count: chirps}, {count: followers}, {count: following}] = await Promise.all([
        supabase.from('chirps').select('*', {count:'exact', head:true}).eq('user_id', uid),
        supabase.from('follows').select('*', {count:'exact', head:true}).eq('followee_id', uid),
        supabase.from('follows').select('*', {count:'exact', head:true}).eq('follower_id', uid)
    ]);
    document.getElementById('profile-chirps').innerHTML = `<strong>${chirps||0}</strong> чирпов`;
    document.getElementById('profile-followers').innerHTML = `<strong>${followers||0}</strong> подписчиков`;
    document.getElementById('profile-following').innerHTML = `<strong>${following||0}</strong> подписок`;
    const {data: posts} = await supabase.from('chirps').select('*, users(*)').eq('user_id', uid).order('created_at', false);
    const container = document.getElementById('profile-posts');
    container.innerHTML = '';
    if (posts) renderPostsToContainer(posts, container);
}

function renderPostsToContainer(posts, container) {
    posts.forEach(p => {
        const u = p.users;
        const card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = `<div class="post-header">
            <div class="post-avatar" style="background-image:url(${u.avatar_url||''})"></div>
            <div><span class="post-author">${escapeHtml(u.username)}</span></div>
        </div>
        <div class="post-content">${escapeHtml(p.content)}</div>
        ${p.media_url?`<img src="${p.media_url}" class="post-media">`:''}`;
        container.appendChild(card);
    });
}

async function follow(uid) {
    await supabase.from('follows').insert({follower_id: currentUser.id, followee_id: uid});
    viewProfile(uid);
}
async function unfollow(uid) {
    await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('followee_id', uid);
    viewProfile(uid);
}

// Редактирование профиля
function showEditProfile() {
    document.getElementById('bio-input').value = currentUser.bio || '';
    document.getElementById('location-input').value = currentUser.location || '';
    document.getElementById('link-input').value = currentUser.link || '';
    openModal('edit-profile-modal');
}

async function updateProfile() {
    const bio = document.getElementById('bio-input').value;
    const location = document.getElementById('location-input').value;
    const link = document.getElementById('link-input').value;
    const updates = {bio, location, link};
    const avatarFile = document.getElementById('avatar-upload').files[0];
    const bannerFile = document.getElementById('banner-upload').files[0];
    if (avatarFile) updates.avatar_url = await uploadFile(avatarFile, 'avatars');
    if (bannerFile) updates.banner_url = await uploadFile(bannerFile, 'banners');
    await supabase.from('users').update(updates).eq('id', currentUser.id);
    Object.assign(currentUser, updates);
    saveSession(currentUser);
    closeModal();
    viewProfile(currentUser.id);
    showToast('Профиль обновлён', 'success');
}

async function uploadFile(file, bucket) {
    const name = Date.now() + '_' + file.name;
    await supabase.storage.from(bucket).upload(name, file);
    return supabase.storage.from(bucket).getPublicUrl(name).data.publicUrl;
}

// Публикация
function createPostFab() { openModal('create-post-modal'); }
async function createPost() {
    const content = document.getElementById('post-content').value.trim();
    if (!content || content.length > 280) return showToast('Чирп от 1 до 280 символов', 'error');
    const mediaFile = document.getElementById('post-media').files[0];
    let media_url = null;
    if (mediaFile) media_url = await uploadFile(mediaFile, 'media');
    await supabase.from('chirps').insert({user_id: currentUser.id, content, media_url});
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
async function likeChirp(cid, btn) {
    const {data: like} = await supabase.from('likes').select('*').eq('user_id', currentUser.id).eq('chirp_id', cid).maybeSingle();
    if (like) {
        await supabase.from('likes').delete().eq('id', like.id);
        btn.classList.remove('liked');
    } else {
        await supabase.from('likes').insert({user_id: currentUser.id, chirp_id: cid});
        btn.classList.add('liked');
    }
}
function rechirp() { showToast('Речирпнуто!', 'success'); }

// Чаты
function showChatsList() { hideAll(); document.getElementById('chats-container').style.display = 'block'; switchChatsTab('private'); }
function switchChatsTab(tab) {
    document.getElementById('private-chats-list').style.display = tab === 'private' ? 'block' : 'none';
    document.getElementById('group-chats-list').style.display = tab === 'groups' ? 'block' : 'none';
    if (tab === 'private') loadPrivateChats(); else loadGroupChats();
}
async function loadPrivateChats() {
    const {data: chats} = await supabase.from('chats').select('*').or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);
    const container = document.getElementById('private-chats-list');
    container.innerHTML = '';
    if (chats) for (const c of chats) {
        const other = c.user1_id === currentUser.id ? c.user2_id : c.user1_id;
        const {data: u} = await supabase.from('users').select('username, avatar_url').eq('id', other).single();
        const avatar = u?.avatar_url ? `style="background-image:url(${u.avatar_url})"` : '';
        container.innerHTML += `<div class="chat-item" onclick="openChat('${c.id}')"><div class="post-avatar" ${avatar}></div><div>${u?.username||'Пользователь'}</div></div>`;
    }
}
async function openChat(cid) {
    currentChatId = cid; currentGroupId = null;
    hideAll(); document.getElementById('chat-window').style.display = 'flex';
    const {data: chat} = await supabase.from('chats').select('*').eq('id', cid).single();
    const other = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
    const {data: u} = await supabase.from('users').select('handle').eq('id', other).single();
    document.getElementById('chat-title').textContent = u?.handle || 'Чат';
    loadChatMessages(cid);
}
async function loadChatMessages(cid) {
    const {data} = await supabase.from('chat_messages').select('*').eq('chat_id', cid).order('created_at', true);
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    if (data) data.forEach(m => {
        const div = document.createElement('div');
        div.className = `chat-message${m.sender_id === currentUser.id ? ' self' : ''}`;
        div.textContent = m.content;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}
async function sendMessage() {
    const text = document.getElementById('chat-input').value.trim();
    if (!text || !currentChatId) return;
    await supabase.from('chat_messages').insert({chat_id: currentChatId, sender_id: currentUser.id, content: text});
    document.getElementById('chat-input').value = '';
    loadChatMessages(currentChatId);
}
function closeChat() { currentChatId = null; document.getElementById('chat-window').style.display = 'none'; showFeed('latest'); }

// Группы (базово)
async function loadGroupChats() { document.getElementById('group-chats-list').innerHTML = '<p style="color:var(--text2)">Нет групп</p>'; }
function showCreateGroup() {
    const name = prompt('Название группы:');
    if (name) supabase.from('groups_chats').insert({name, creator_id: currentUser.id}).then(() => showToast('Группа создана','success'));
}

// Gems и магазин
async function giveGems(amount, reason) {
    const {data: u} = await supabase.from('users').select('gems').eq('id', currentUser.id).single();
    const newGems = (u.gems || 0) + amount;
    await supabase.from('users').update({gems: newGems}).eq('id', currentUser.id);
    await supabase.from('gem_transactions').insert({user_id: currentUser.id, amount, type:'bonus', description:reason});
    currentUser.gems = newGems;
    document.getElementById('gems-display').textContent = newGems;
}
function checkDailyBonus() {
    const today = new Date().toDateString();
    if (localStorage.getItem('daily_bonus_date') !== today) {
        giveGems(5, 'Ежедневный бонус');
        localStorage.setItem('daily_bonus_date', today);
        showToast('+5 Gems!', 'success');
    }
}
async function openShop() {
    const {data: items} = await supabase.from('shop_items').select('*');
    const container = document.getElementById('shop-items');
    container.innerHTML = '';
    document.getElementById('shop-gems-count').textContent = currentUser.gems || 0;
    if (items) items.forEach(i => {
        container.innerHTML += `<div class="shop-item"><span>${i.name}</span><span>${i.price} 💎</span><button class="btn btn-primary btn-sm" onclick="buyItem('${i.id}',${i.price})">Купить</button></div>`;
    });
    openModal('shop-modal');
}
async function buyItem(id, price) {
    if ((currentUser.gems||0) < price) return showToast('Недостаточно Gems', 'error');
    await supabase.from('users').update({gems: currentUser.gems - price}).eq('id', currentUser.id);
    await supabase.from('user_inventory').insert({user_id: currentUser.id, item_id: id});
    currentUser.gems -= price;
    showToast('Куплено!', 'success');
    openShop();
}

// Premium
function showPremiumModal() { openModal('premium-modal'); }
function selectPremium(plan) {
    const stars = { '1month':15, '3months':40, '1year':140 }[plan];
    document.getElementById('stars-amount').textContent = stars;
    const code = Math.random().toString(36).substring(2,10).toUpperCase();
    document.getElementById('activation-code-display').textContent = code;
    document.getElementById('premium-code-section').style.display = 'block';
    supabase.from('subscription_codes').insert({code, user_id: currentUser.id, plan, stars_amount: stars});
}
async function activatePremium() {
    const code = document.getElementById('code-input').value.trim();
    const {data: sc} = await supabase.from('subscription_codes').select('*').eq('code', code).eq('user_id', currentUser.id).eq('used', false).maybeSingle();
    if (!sc) return showToast('Неверный код', 'error');
    const months = { '1month':1, '3months':3, '1year':12 }[sc.plan];
    const end = new Date(); end.setMonth(end.getMonth() + months);
    await supabase.from('users').update({is_premium: true, premium_until: end.toISOString()}).eq('id', currentUser.id);
    await supabase.from('subscription_codes').update({used: true}).eq('id', sc.id);
    await supabase.from('subscriptions').insert({user_id: currentUser.id, plan: sc.plan, ends_at: end.toISOString()});
    giveGems(1000, 'Premium бонус');
    currentUser.is_premium = true;
    saveSession(currentUser);
    closeModal();
    showToast('Premium активирован! +1000 Gems', 'success');
}

// Админка
function showAdminPanel() { if (currentUser?.is_admin) { openModal('admin-modal'); switchAdminTab('stats'); } }
async function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab-btn').forEach((b,i) => b.classList.toggle('active', i === ['stats','users','gems','posts'].indexOf(tab)));
    const content = document.getElementById('admin-content');
    if (tab === 'stats') {
        const [{count: users}, {count: chirps}] = await Promise.all([
            supabase.from('users').select('*', {count:'exact', head:true}),
            supabase.from('chirps').select('*', {count:'exact', head:true})
        ]);
        content.innerHTML = `<p>Пользователей: ${users}</p><p>Чирпов: ${chirps}</p>`;
    } else if (tab === 'users') {
        const {data} = await supabase.from('users').select('*');
        content.innerHTML = data.map(u => `<div>${u.handle} <button onclick="banUser('${u.id}')" class="btn btn-admin btn-sm">Бан</button></div>`).join('');
    } else if (tab === 'gems') {
        content.innerHTML = `<input id="admin-uid" placeholder="User ID" class="input-field"><input id="admin-amount" type="number" placeholder="Gems" class="input-field"><button class="btn btn-primary" onclick="giveGemsToUser(document.getElementById('admin-uid').value)">Выдать</button>`;
    } else if (tab === 'posts') {
        const {data} = await supabase.from('chirps').select('*, users(handle)').limit(50);
        content.innerHTML = data.map(p => `<div>${p.content?.slice(0,30)}... <button onclick="deletePost('${p.id}')" class="btn btn-admin btn-sm">X</button></div>`).join('');
    }
}
function banUser(uid) {
    const reason = prompt('Причина:');
    if (reason) supabase.from('bans').insert({user_id: uid, reason, banned_until: '2099-01-01'}).then(() => showToast('Забанен','success'));
}
function giveGemsToUser(uid) {
    const amount = parseInt(prompt('Сколько Gems?'),10);
    if (amount) supabase.from('users').select('gems').eq('id', uid).single().then(({data}) => {
        supabase.from('users').update({gems: (data.gems||0)+amount}).eq('id', uid).then(() => showToast(`Выдано ${amount}`,'success'));
    });
}
function deletePost(pid) {
    if (confirm('Удалить?')) supabase.from('chirps').delete().eq('id', pid).then(() => showToast('Удалён','success'));
}

// Realtime
function setupRealtime() {
    realtimeChannels.forEach(c => supabase.removeChannel(c));
    realtimeChannels = [
        supabase.channel('chirps').on('postgres_changes', {event:'INSERT', schema:'public', table:'chirps'}, () => {
            if (currentFeed === 'latest') { feedPage=0; hasMoreFeed=true; document.getElementById('feed-posts').innerHTML=''; loadFeed(); }
        }).subscribe(),
        supabase.channel('chat').on('postgres_changes', {event:'INSERT', schema:'public', table:'chat_messages'}, (p) => {
            if (currentChatId && p.new.chat_id === currentChatId) loadChatMessages(currentChatId);
        }).subscribe(),
        supabase.channel('notif').on('postgres_changes', {event:'INSERT', schema:'public', table:'notifications'}, (p) => {
            if (p.new.user_id === currentUser?.id) showToast('Новое уведомление','success');
        }).subscribe()
    ];
}

// Модалки
function openModal(id) { document.getElementById('modal-overlay').style.display = 'block'; document.getElementById(id).style.display = 'block'; }
function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

// Политики
function showPolicy(type) {
    const titles = {terms:'Правила', privacy:'Конфиденциальность', cookies:'Cookie'};
    document.getElementById('policy-title').textContent = titles[type];
    document.getElementById('policy-content').innerHTML = type === 'terms' ? '<p>Правила использования...</p>' : type === 'privacy' ? '<p>Политика конфиденциальности...</p>' : '<p>Cookie...</p>';
    openModal('policy-modal');
}
function acceptCookies() { localStorage.setItem('cookies_accepted','true'); document.getElementById('cookie-banner').style.display = 'none'; }

// Мобильная навигация
function mobileNav(section) {
    hideAll();
    if (section === 'feed') showFeed('latest');
    else if (section === 'search') document.getElementById('search-container').style.display = 'block';
    else if (section === 'chats') showChatsList();
    else if (section === 'profile') viewProfile(currentUser.id);
}

// Старт
window.onload = () => {
    if (loadSession()) { showScreen('main-screen'); initMain(); }
    else showScreen('auth-screen');
};