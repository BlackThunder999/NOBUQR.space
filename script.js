(function() {
    'use strict';

    const supabase = window.supabase.createClient(
        'https://iljsednetiogjtowlexo.supabase.co',
        'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O'
    );

    const $ = (id) => document.getElementById(id);
    const DOM = {
        authOverlay: $('authOverlay'), appContainer: $('appContainer'),
        loginForm: $('loginForm'), registerForm: $('registerForm'),
        loginEmail: $('loginEmail'), loginPassword: $('loginPassword'), loginError: $('loginError'),
        regNickname: $('regNickname'), regEmail: $('regEmail'), regPassword: $('regPassword'), regError: $('regError'),
        userAvatar: $('userAvatar'), userInitial: $('userInitial'), userName: $('userName'),
        composerAvatar: $('composerAvatar'), composerInitial: $('composerInitial'),
        postTextarea: $('postTextarea'), charCounter: $('charCounter'), publishBtn: $('publishBtn'),
        composerError: $('composerError'), composerErrorText: $('composerErrorText'),
        postsFeed: $('postsFeed'), feedLoading: $('feedLoading'), feedEmpty: $('feedEmpty'), feedError: $('feedError'),
        retryBtn: $('retryBtn'), profileModal: $('profileModal'),
        modalAvatar: $('modalAvatar'), modalInitial: $('modalInitial'), modalNickname: $('modalNickname'),
        modalBio: $('modalBio'), imagePreview: $('imagePreview'), previewImg: $('previewImg'),
        screenHome: $('screenHome'), screenProfile: $('screenProfile'), screenMyPosts: $('screenMyPosts'),
        screenFollowing: $('screenFollowing'), profileContainer: $('profileContainer'),
        myPostsFeed: $('myPostsFeed'), myPostsLoading: $('myPostsLoading'), myPostsEmpty: $('myPostsEmpty'),
        followingFeed: $('followingFeed'), followingLoading: $('followingLoading'), followingEmpty: $('followingEmpty'),
        listModal: $('listModal'), listModalTitle: $('listModalTitle'), listModalContent: $('listModalContent'),
        navItems: document.querySelectorAll('.nav-item')
    };

    let currentUser = null, profile = null, isPublishing = false, isAdmin = false;
    let likedPostIds = new Set(), bannedUserIds = new Set(), selectedImage = null;
    let currentScreen = 'home';

    const esc = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
    const fmtDate = (d) => {
        if (!d) return '';
        const diff = Math.floor((Date.now() - new Date(d)) / 1000);
        if (diff < 60) return 'сейчас';
        if (diff < 3600) return Math.floor(diff/60) + 'м';
        if (diff < 86400) return Math.floor(diff/3600) + 'ч';
        return new Date(d).toLocaleDateString('ru-RU', {day:'numeric',month:'short'});
    };

    // ========== AUTH ==========
    async function checkSession() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { currentUser = user; await loadProfile(); showApp(); }
        else showAuth();
    }
    async function loadProfile(userId = null) {
        const id = userId || currentUser.id;
        const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
        if (error) console.error('Ошибка загрузки профиля:', error);
        const loaded = data || { nickname: (currentUser?.email?.split('@')[0]) || 'Гость', avatar_url: null, bio: '', role: 'user', created_at: new Date().toISOString() };
        if (!userId) profile = loaded;
        return loaded;
    }
    function updateAllUI() {
        if (!profile) return;
        const nick = profile.nickname || 'Гость';
        DOM.userName.textContent = nick;
        const initial = nick.charAt(0).toUpperCase();
        DOM.userInitial.textContent = initial;
        DOM.composerInitial.textContent = initial;
        DOM.modalInitial.textContent = initial;
        if (profile.avatar_url) {
            DOM.userAvatar.style.backgroundImage = `url(${profile.avatar_url})`;
            DOM.userAvatar.classList.add('has-image'); DOM.userInitial.textContent = '';
            DOM.composerAvatar.style.backgroundImage = `url(${profile.avatar_url})`;
            DOM.composerAvatar.style.backgroundSize = 'cover'; DOM.composerInitial.textContent = '';
            DOM.modalAvatar.style.backgroundImage = `url(${profile.avatar_url})`;
            DOM.modalAvatar.classList.add('has-image'); DOM.modalInitial.textContent = '';
        } else {
            DOM.userAvatar.style.backgroundImage = ''; DOM.userAvatar.classList.remove('has-image'); DOM.userInitial.textContent = initial;
            DOM.composerAvatar.style.backgroundImage = ''; DOM.composerInitial.textContent = initial;
            DOM.modalAvatar.style.backgroundImage = ''; DOM.modalAvatar.classList.remove('has-image'); DOM.modalInitial.textContent = initial;
        }
        updatePublishBtn();
    }
    function showApp() { DOM.authOverlay.classList.add('hidden'); DOM.appContainer.classList.remove('hidden'); initApp(); }
    function showAuth() { DOM.authOverlay.classList.remove('hidden'); DOM.appContainer.classList.add('hidden'); }

    DOM.registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data, error } = await supabase.auth.signUp({
            email: DOM.regEmail.value,
            password: DOM.regPassword.value
        });
        if (error) { DOM.regError.textContent = error.message; return; }
        if (data.user) {
            await supabase.from('profiles').insert({
                id: data.user.id,
                nickname: DOM.regNickname.value || DOM.regEmail.value.split('@')[0],
                bio: '',
                role: 'user'
            });
            DOM.regError.style.color = '#0c0';
            DOM.regError.textContent = '✅ Аккаунт создан! Проверьте почту.';
            DOM.registerForm.reset();
        }
    });
    DOM.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.signInWithPassword({ email: DOM.loginEmail.value, password: DOM.loginPassword.value });
        if (error) {
            DOM.loginError.textContent = error.message === 'Email not confirmed' ? '❌ Почта не подтверждена.' : error.message;
        } else checkSession();
    });
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const isLogin = tab.dataset.tab === 'login';
            DOM.loginForm.classList.toggle('hidden', !isLogin);
            DOM.registerForm.classList.toggle('hidden', isLogin);
        });
    });
    $('logoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); currentUser = null; profile = null; showAuth(); });

    // ========== PROFILE EDITOR ==========
    $('userSettingsBtn').addEventListener('click', () => {
        DOM.profileModal.classList.remove('hidden');
        DOM.modalNickname.value = profile?.nickname || '';
        DOM.modalBio.value = profile?.bio || '';
        updateAllUI();
    });
    $('modalCancel').addEventListener('click', () => DOM.profileModal.classList.add('hidden'));
    $('modalAvatarInput').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const path = `avatars/${currentUser.id}.${file.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('post-images').upload(path, file, { upsert: true });
        if (error) { console.error('Ошибка загрузки аватара:', error); return; }
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
        profile.avatar_url = urlData.publicUrl;
        await supabase.from('profiles').upsert({ id: currentUser.id, avatar_url: profile.avatar_url });
        updateAllUI();
    });
    $('modalSave').addEventListener('click', async () => {
        const nick = DOM.modalNickname.value.trim();
        const bio = DOM.modalBio.value.trim();
        if (!nick) return;
        profile.nickname = nick;
        profile.bio = bio;
        const { error } = await supabase.from('profiles').upsert({ id: currentUser.id, nickname: nick, bio: bio });
        if (!error) updateAllUI();
        DOM.profileModal.classList.add('hidden');
    });

    // ========== NAVIGATION ==========
    function switchScreen(screen) {
        [DOM.screenHome, DOM.screenProfile, DOM.screenMyPosts, DOM.screenFollowing].forEach(s => s.classList.remove('active'));
        const map = { home: DOM.screenHome, profile: DOM.screenProfile, myPosts: DOM.screenMyPosts, following: DOM.screenFollowing };
        if (map[screen]) map[screen].classList.add('active');
        currentScreen = screen;
        DOM.navItems.forEach(item => item.classList.toggle('active', item.dataset.screen === screen));
        if (screen === 'home') loadPosts();
        else if (screen === 'myPosts') loadMyPosts();
        else if (screen === 'following') loadFollowingPosts();
        else if (screen === 'profile' && currentUser) openProfile(currentUser.id); // Автоматически загружаем свой профиль
    }
    DOM.navItems.forEach(item => item.addEventListener('click', () => switchScreen(item.dataset.screen)));

    // ========== FOLLOW SYSTEM ==========
    async function isFollowing(userId) {
        if (!currentUser || userId === currentUser.id) return false;
        const { data, error } = await supabase.from('followers').select('*').eq('follower_id', currentUser.id).eq('following_id', userId).maybeSingle();
        if (error) console.error('Ошибка проверки подписки:', error);
        return !!data;
    }
    async function toggleFollow(userId, btn) {
        const following = await isFollowing(userId);
        if (following) {
            await supabase.from('followers').delete().match({ follower_id: currentUser.id, following_id: userId });
        } else {
            await supabase.from('followers').insert({ follower_id: currentUser.id, following_id: userId });
        }
        // Обновляем кнопку и счётчики
        const newState = !following;
        if (btn) {
            btn.textContent = newState ? 'Отписаться' : 'Подписаться';
            btn.classList.toggle('is-following', newState);
        }
        // Обновляем счётчики в открытом профиле
        if (currentScreen === 'profile') {
            const userIdInProfile = document.querySelector('.profile-header-card')?.dataset.userId;
            if (userIdInProfile === userId) {
                const followers = await getFollowersCount(userId);
                const followingCount = await getFollowingCount(userId);
                const statFollowers = document.getElementById('statFollowers');
                const statFollowing = document.getElementById('statFollowing');
                if (statFollowers) statFollowers.innerHTML = `<span class="profile-stat-value">${followers}</span> подписчиков`;
                if (statFollowing) statFollowing.innerHTML = `<span class="profile-stat-value">${followingCount}</span> подписок`;
            }
        }
    }
    async function getFollowersCount(userId) {
        const { count } = await supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId);
        return count || 0;
    }
    async function getFollowingCount(userId) {
        const { count } = await supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
        return count || 0;
    }
    async function showList(title, queryField, queryValue) {
        DOM.listModalTitle.textContent = title;
        DOM.listModalContent.innerHTML = '';
        DOM.listModal.classList.remove('hidden');
        const { data } = await supabase.from('followers').select(queryField).eq(queryField, queryValue);
        const ids = data ? data.map(r => queryField === 'following_id' ? r.follower_id : r.following_id) : [];
        if (ids.length === 0) { DOM.listModalContent.innerHTML = '<p style="color:#555;">Пусто</p>'; return; }
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids);
        if (profiles) {
            profiles.forEach(p => {
                const div = document.createElement('div'); div.className = 'modal-list-item';
                div.innerHTML = `<div class="modal-list-avatar" style="background-image: ${p.avatar_url ? `url(${p.avatar_url})` : 'none'}">${!p.avatar_url ? (p.nickname?.charAt(0)||'?') : ''}</div><span class="modal-list-name">${esc(p.nickname||'Без ника')}</span>`;
                div.addEventListener('click', () => { DOM.listModal.classList.add('hidden'); openProfile(p.id); });
                DOM.listModalContent.appendChild(div);
            });
        }
    }
    $('listModalClose').addEventListener('click', () => DOM.listModal.classList.add('hidden'));

    // ========== OPEN PROFILE ==========
    async function openProfile(userId) {
        switchScreen('profile');
        const prof = await loadProfile(userId);
        if (!prof) return;
        const followers = await getFollowersCount(userId);
        const followingCount = await getFollowingCount(userId);
        const { count: postsCount } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId);
        const { data: likesData } = await supabase.from('posts').select('likes').eq('user_id', userId);
        const totalLikes = likesData ? likesData.reduce((s, p) => s + (p.likes || 0), 0) : 0;
        const isOwn = currentUser && userId === currentUser.id;
        const followingStatus = await isFollowing(userId);
        const roleText = prof.role === 'admin' ? 'Администратор' : (prof.role === 'moderator' ? 'Модератор' : 'Пользователь');
        const joinDate = prof.created_at ? new Date(prof.created_at).toLocaleDateString('ru-RU') : '—';

        DOM.profileContainer.innerHTML = `
            <div class="profile-header-card" data-user-id="${userId}">
                <div class="profile-avatar-large ${prof.avatar_url ? 'has-image' : ''}" style="background-image: ${prof.avatar_url ? `url(${prof.avatar_url})` : 'none'}">
                    ${!prof.avatar_url ? (prof.nickname || '?').charAt(0).toUpperCase() : ''}
                </div>
                <div class="profile-nickname-large">${esc(prof.nickname)}</div>
                <div class="profile-bio">${esc(prof.bio || '')}</div>
                <div class="profile-stats">
                    <div class="profile-stat"><span class="profile-stat-value">${postsCount||0}</span> постов</div>
                    <div class="profile-stat" id="statFollowers"><span class="profile-stat-value">${followers}</span> подписчиков</div>
                    <div class="profile-stat" id="statFollowing"><span class="profile-stat-value">${followingCount}</span> подписок</div>
                    <div class="profile-stat"><span class="profile-stat-value">${totalLikes}</span> лайков</div>
                </div>
                <div class="profile-role">${roleText} · ${joinDate}</div>
                <div class="profile-actions">
                    ${isOwn ? '<button class="profile-btn primary" id="openProfileEditor">Редактировать</button>' : ''}
                    ${!isOwn ? `<button class="follow-btn ${followingStatus ? 'is-following' : ''}" id="followBtn">${followingStatus ? 'Отписаться' : 'Подписаться'}</button>` : ''}
                </div>
            </div>
            <div class="profile-posts">
                <h3 class="profile-section-title">Посты</h3>
                <div class="feed-list" id="profilePostsFeed"></div>
            </div>`;

        // Обработчики для списков подписчиков/подписок
        document.getElementById('statFollowers')?.addEventListener('click', () => showList('Подписчики', 'following_id', userId));
        document.getElementById('statFollowing')?.addEventListener('click', () => showList('Подписки', 'follower_id', userId));

        if (isOwn) {
            document.getElementById('openProfileEditor')?.addEventListener('click', () => {
                DOM.profileModal.classList.remove('hidden');
                DOM.modalNickname.value = prof.nickname || '';
                DOM.modalBio.value = prof.bio || '';
                updateAllUI();
            });
        }

        const followBtn = document.getElementById('followBtn');
        if (followBtn) {
            followBtn.addEventListener('click', () => toggleFollow(userId, followBtn));
        }

        // Загружаем посты пользователя
        const { data: posts } = await supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        const feed = document.getElementById('profilePostsFeed');
        if (feed) {
            feed.innerHTML = '';
            if (posts && posts.length > 0) {
                posts.forEach(post => {
                    const card = createPostCard(post);
                    if (card) feed.appendChild(card);
                });
            } else {
                feed.innerHTML = '<p style="color:#555;">Нет постов</p>';
            }
        }
    }

    // ========== POSTS ==========
    function createPostCard(post) {
        if (bannedUserIds.has(post.user_id)) return null;
        const card = document.createElement('div'); card.className = 'post-card';
        card.dataset.postId = post.id; card.dataset.userId = post.user_id;
        // Загружаем аватар автора (если ещё не загружен) — но для оптимизации будем хранить avatar_url в посте? Нет, в посте нет avatar_url. Нужно получать профиль автора. Для ленты это слишком много запросов. Лучше денормализовать: добавить avatar_url в таблицу posts, но это изменение схемы. Пока сделаем запрос при создании карточки или будем хранить кэш профилей.
        // Быстрое решение: добавим в карточку функцию загрузки аватара.
        const avatarUrl = post.avatar_url || null; // если мы добавим avatar_url в посты, но его пока нет.
        // Временно показываем инициалы.
        card.innerHTML = `
            <div class="post-card-header">
                <div class="post-card-avatar" data-user-id="${post.user_id}">${esc(post.nickname?.charAt(0)||'?')}</div>
                <div>
                    <span class="post-card-nickname" data-user-id="${post.user_id}">${esc(post.nickname||'Гость')}</span>
                    <span class="post-card-time">${fmtDate(post.created_at)}</span>
                </div>
            </div>
            ${post.content?`<div class="post-card-text">${esc(post.content)}</div>`:''}
            ${post.image_url?`<div class="post-card-img"><img src="${esc(post.image_url)}"></div>`:''}
            <div class="post-card-actions">
                <button class="like-btn ${likedPostIds.has(post.id)?'liked':''}"><i class="fa-solid fa-heart"></i> <span>${post.likes||0}</span></button>
            </div>`;
        card.querySelector('.like-btn').addEventListener('click', () => toggleLike(post.id, card.querySelector('.like-btn')));
        card.querySelector('.post-card-avatar').addEventListener('click', () => openProfile(post.user_id));
        card.querySelector('.post-card-nickname').addEventListener('click', () => openProfile(post.user_id));
        // Загружаем аватар асинхронно
        loadAvatarForCard(card, post.user_id);
        return card;
    }
    async function loadAvatarForCard(card, userId) {
        const { data } = await supabase.from('profiles').select('avatar_url').eq('id', userId).single();
        if (data?.avatar_url) {
            const avatarDiv = card.querySelector('.post-card-avatar');
            avatarDiv.style.backgroundImage = `url(${data.avatar_url})`;
            avatarDiv.classList.add('has-image');
            avatarDiv.textContent = '';
        }
    }

    async function toggleLike(pid, btn) {
        const liked = likedPostIds.has(pid);
        likedPostIds[liked?'delete':'add'](pid);
        btn.classList.toggle('liked', !liked);
        const span = btn.querySelector('span');
        span.textContent = parseInt(span.textContent) + (liked?-1:1);
        if (liked) await supabase.from('likes').delete().match({post_id:pid,user_id:currentUser.id});
        else await supabase.from('likes').insert({post_id:pid,user_id:currentUser.id});
    }

    async function loadPosts() {
        DOM.feedLoading.classList.remove('hidden'); DOM.feedEmpty.classList.add('hidden');
        const { data } = await supabase.from('posts').select('*').order('created_at',{ascending:false});
        DOM.postsFeed.querySelectorAll('.post-card').forEach(c=>c.remove());
        DOM.feedLoading.classList.add('hidden');
        if (!data||!data.length) { DOM.feedEmpty.classList.remove('hidden'); return; }
        data.forEach(p => { const c = createPostCard(p); if(c) DOM.postsFeed.appendChild(c); });
    }
    async function loadMyPosts() {
        if (!currentUser) return;
        DOM.myPostsLoading.classList.remove('hidden'); DOM.myPostsEmpty.classList.add('hidden');
        const { data } = await supabase.from('posts').select('*').eq('user_id', currentUser.id).order('created_at',{ascending:false});
        DOM.myPostsFeed.querySelectorAll('.post-card').forEach(c=>c.remove());
        DOM.myPostsLoading.classList.add('hidden');
        if (!data||!data.length) { DOM.myPostsEmpty.classList.remove('hidden'); return; }
        data.forEach(p => { const c = createPostCard(p); if(c) DOM.myPostsFeed.appendChild(c); });
    }
    async function loadFollowingPosts() {
        if (!currentUser) return;
        DOM.followingLoading.classList.remove('hidden'); DOM.followingEmpty.classList.add('hidden');
        const { data: follows } = await supabase.from('followers').select('following_id').eq('follower_id', currentUser.id);
        const ids = [currentUser.id, ...(follows ? follows.map(f => f.following_id) : [])];
        const { data } = await supabase.from('posts').select('*').in('user_id', ids).order('created_at', { ascending: false });
        DOM.followingFeed.querySelectorAll('.post-card').forEach(c=>c.remove());
        DOM.followingLoading.classList.add('hidden');
        if (!data||!data.length) { DOM.followingEmpty.classList.remove('hidden'); return; }
        data.forEach(p => { const c = createPostCard(p); if(c) DOM.followingFeed.appendChild(c); });
    }

    async function publish() {
        if (isPublishing || !currentUser) return;
        const txt = DOM.postTextarea.value.trim();
        if (!txt && !selectedImage) return;
        isPublishing = true; DOM.publishBtn.disabled = true;
        try {
            let img = null;
            if (selectedImage) {
                const path = `posts/${currentUser.id}_${Date.now()}.${selectedImage.name.split('.').pop()}`;
                await supabase.storage.from('post-images').upload(path, selectedImage);
                const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
                img = urlData.publicUrl;
            }
            await supabase.from('posts').insert({
                user_id: currentUser.id,
                nickname: profile?.nickname || currentUser.email?.split('@')[0],
                content: txt,
                likes: 0,
                image_url: img
            });
            DOM.postTextarea.value = ''; selectedImage = null; DOM.imagePreview.classList.add('hidden');
            DOM.charCounter.textContent = '0 / 500';
            loadPosts();
        } catch(e) { console.error(e); }
        isPublishing = false; updatePublishBtn();
    }
    function updatePublishBtn() {
        DOM.publishBtn.disabled = (!DOM.postTextarea.value.trim() && !selectedImage) || isPublishing || bannedUserIds.has(currentUser?.id);
    }

    $('attachBtn').addEventListener('click', () => $('imageInput').click());
    $('imageInput').addEventListener('change', (e) => {
        if (e.target.files[0]) { selectedImage = e.target.files[0]; const r = new FileReader(); r.onload = ev => { DOM.previewImg.src = ev.target.result; DOM.imagePreview.classList.remove('hidden'); }; r.readAsDataURL(e.target.files[0]); updatePublishBtn(); }
    });
    $('removePreviewBtn').addEventListener('click', () => { selectedImage = null; DOM.imagePreview.classList.add('hidden'); updatePublishBtn(); });

    async function loadBans() {
        const { data } = await supabase.from('banned_users').select('user_id');
        bannedUserIds = new Set(data ? data.map(r => r.user_id) : []);
    }
    async function loadLikes() {
        if (!currentUser) return;
        const { data } = await supabase.from('likes').select('post_id').eq('user_id', currentUser.id);
        likedPostIds = new Set(data ? data.map(r => r.post_id) : []);
    }

    function setupAdmin() {
        const fab = document.createElement('button'); fab.className = 'admin-fab'; fab.innerHTML = '<i class="fa-solid fa-shield-halved"></i>'; document.body.appendChild(fab);
        const panel = document.createElement('div'); panel.className = 'admin-panel';
        panel.innerHTML = `<h3>Админ</h3><input type="password" id="adminPw" placeholder="Пароль"><button class="admin-login-btn" id="adminLogin">Войти</button><div id="adminErr" style="color:red;display:none;">Неверный</div><div id="bannedList" style="margin-top:10px;"></div>`;
        document.body.appendChild(panel);
        fab.addEventListener('click', () => panel.classList.toggle('active'));
        $('adminLogin').addEventListener('click', async () => {
            if ($('adminPw').value === 'nobuadmin2024') { isAdmin = true; panel.classList.remove('active'); await renderBanned(); addAdminButtons(); }
        });
        async function renderBanned() {
            const { data } = await supabase.from('banned_users').select('*');
            const list = $('bannedList'); list.innerHTML = '<h4>Заблокированные</h4>';
            if (!data||!data.length) { list.innerHTML += '<p>Нет</p>'; return; }
            data.forEach(e => {
                const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0;';
                row.innerHTML = `<span>${esc(e.nickname||'?')}</span><button class="unban-btn">Разбанить</button>`;
                row.querySelector('.unban-btn').addEventListener('click', async () => { await supabase.from('banned_users').delete().match({user_id:e.user_id}); bannedUserIds.delete(e.user_id); loadPosts(); loadMyPosts(); renderBanned(); });
                list.appendChild(row);
            });
        }
    }
    function addAdminButtons() {
        document.querySelectorAll('.post-card').forEach(card => {
            if (card.querySelector('.admin-delete-btn')) return;
            const header = card.querySelector('.post-card-header');
            const delBtn = document.createElement('button'); delBtn.className = 'admin-delete-btn'; delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            delBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;margin-left:auto;';
            delBtn.addEventListener('click', async () => { if (confirm('Удалить пост?')) { await supabase.from('posts').delete().match({ id: card.dataset.postId }); card.remove(); } });
            header.appendChild(delBtn);
            const banBtn = document.createElement('button'); banBtn.className = 'admin-block-btn'; banBtn.innerHTML = '<i class="fa-solid fa-ban"></i>';
            banBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;';
            banBtn.addEventListener('click', async () => {
                const userId = card.dataset.userId;
                const nickname = card.querySelector('.post-card-nickname').textContent;
                if (confirm(`Заблокировать ${nickname}?`)) {
                    await supabase.from('banned_users').upsert({ user_id: userId, nickname: nickname });
                    bannedUserIds.add(userId);
                    document.querySelectorAll(`.post-card[data-user-id="${userId}"]`).forEach(c => c.remove());
                    renderBanned();
                }
            });
            header.appendChild(banBtn);
        });
    }

    function initApp() {
        loadBans(); loadLikes(); loadPosts(); setupAdmin();
        DOM.postTextarea.addEventListener('input', () => { DOM.charCounter.textContent = DOM.postTextarea.value.length + ' / 500'; updatePublishBtn(); });
        DOM.publishBtn.addEventListener('click', publish);
        $('retryBtn').addEventListener('click', loadPosts);
        setInterval(() => { if (currentScreen === 'home') loadPosts(); }, 5000);
        setInterval(loadBans, 10000);
        supabase.channel('posts').on('postgres_changes',{event:'INSERT',schema:'public',table:'posts'}, () => {
            if (currentScreen === 'home') loadPosts();
            else if (currentScreen === 'myPosts') loadMyPosts();
            else if (currentScreen === 'following') loadFollowingPosts();
        }).subscribe();
        switchScreen('home');
    }

    checkSession();
})();