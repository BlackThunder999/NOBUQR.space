(function() {
    const supabase = window.supabase.createClient(
        'https://iljsednetiogjtowlexo.supabase.co',
        'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O'
    );

    // ========== DOM ==========
    const $ = (id) => document.getElementById(id);
    const authOverlay = $('authOverlay');
    const appContainer = $('appContainer');
    const loginForm = $('loginForm');
    const registerForm = $('registerForm');
    const loginEmail = $('loginEmail');
    const loginPassword = $('loginPassword');
    const loginError = $('loginError');
    const regNickname = $('regNickname');
    const regEmail = $('regEmail');
    const regPassword = $('regPassword');
    const regError = $('regError');
    const userInitial = $('userInitial');
    const userAvatar = $('userAvatar');
    const userName = $('userName');
    const composerInitial = $('composerInitial');
    const composerAvatar = $('composerAvatar');
    const postTextarea = $('postTextarea');
    const charCounter = $('charCounter');
    const publishBtn = $('publishBtn');
    const composerError = $('composerError');
    const composerErrorText = $('composerErrorText');
    const postsFeed = $('postsFeed');
    const feedLoading = $('feedLoading');
    const feedEmpty = $('feedEmpty');
    const retryBtn = $('retryBtn');
    const profileContainer = $('profileContainer');
    const screenHome = $('screenHome');
    const screenProfile = $('screenProfile');
    const screenMyPosts = $('screenMyPosts');
    const screenFollowing = $('screenFollowing');
    const myPostsFeed = $('myPostsFeed');
    const myPostsLoading = $('myPostsLoading');
    const myPostsEmpty = $('myPostsEmpty');
    const followingFeed = $('followingFeed');
    const followingLoading = $('followingLoading');
    const followingEmpty = $('followingEmpty');
    const navItems = document.querySelectorAll('.nav-item');
    const profileModal = $('profileModal');
    const modalInitial = $('modalInitial');
    const modalAvatar = $('modalAvatar');
    const modalNickname = $('modalNickname');
    const modalBio = $('modalBio');
    const modalCancel = $('modalCancel');
    const modalSave = $('modalSave');
    const logoutBtn = $('logoutBtn');
    const userSettingsBtn = $('userSettingsBtn');
    const attachImageBtn = $('attachImageBtn');
    const imageInput = $('imageInput');
    const removeImagePreview = $('removeImagePreview');
    const imagePreview = $('imagePreview');
    const previewImg = $('previewImg');

    // ========== STATE ==========
    let currentUser = null;
    let profile = null;
    let isPublishing = false;
    let isAdmin = false;
    let likedPostIds = new Set();
    let bannedUserIds = new Set();
    let selectedImage = null;
    let currentScreen = 'home';
    let viewingUserId = null;

    const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
    const fmtDate = d => {
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
        const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
        if (!userId) profile = data || { nickname: 'Гость', bio: '', role: 'user', avatar_url: null };
        return data || { nickname: 'Гость', bio: '', role: 'user', avatar_url: null };
    }

    function updateAllUI() {
        if (!profile) return;
        const nick = profile.nickname || 'Гость';
        const initial = nick.charAt(0).toUpperCase();
        userName.textContent = nick;
        userInitial.textContent = initial;
        composerInitial.textContent = initial;
        modalInitial.textContent = initial;
        if (profile.avatar_url) {
            userAvatar.style.backgroundImage = `url(${profile.avatar_url})`;
            userAvatar.classList.add('has-image');
            userInitial.textContent = '';
            composerAvatar.style.backgroundImage = `url(${profile.avatar_url})`;
            composerAvatar.style.backgroundSize = 'cover';
            composerInitial.textContent = '';
            modalAvatar.style.backgroundImage = `url(${profile.avatar_url})`;
            modalAvatar.classList.add('has-image');
            modalInitial.textContent = '';
        } else {
            userAvatar.style.backgroundImage = '';
            userAvatar.classList.remove('has-image');
            userInitial.textContent = initial;
            composerAvatar.style.backgroundImage = '';
            composerInitial.textContent = initial;
            modalAvatar.style.backgroundImage = '';
            modalAvatar.classList.remove('has-image');
            modalInitial.textContent = initial;
        }
        updatePublishBtn();
    }

    function showApp() { authOverlay.classList.add('hidden'); appContainer.classList.remove('hidden'); initApp(); }
    function showAuth() { authOverlay.classList.remove('hidden'); appContainer.classList.add('hidden'); }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data, error } = await supabase.auth.signUp({ email: regEmail.value, password: regPassword.value });
        if (error) { regError.textContent = error.message; return; }
        if (data.user) {
            await supabase.from('profiles').insert({ id: data.user.id, nickname: regNickname.value || regEmail.value.split('@')[0], bio: '', role: 'user' });
            regError.style.color = '#0c0';
            regError.innerHTML = '✅ Готово!<br><small>Перейдите на вкладку <b>Вход</b> и войдите.</small>';
            registerForm.reset();
            setTimeout(() => {
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                document.querySelector('[data-tab="login"]').classList.add('active');
                loginForm.classList.remove('hidden');
                registerForm.classList.add('hidden');
                regError.innerHTML = '';
            }, 2000);
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.value, password: loginPassword.value });
        if (error) loginError.textContent = error.message === 'Email not confirmed' ? 'Подтвердите почту.' : error.message;
        else checkSession();
    });

    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loginForm.classList.toggle('hidden', tab.dataset.tab !== 'login');
            registerForm.classList.toggle('hidden', tab.dataset.tab !== 'register');
        });
    });

    logoutBtn.addEventListener('click', async () => { await supabase.auth.signOut(); currentUser = null; profile = null; showAuth(); });

    // ========== PROFILE EDITOR ==========
    userSettingsBtn.addEventListener('click', () => {
        profileModal.classList.remove('hidden');
        modalNickname.value = profile?.nickname || '';
        modalBio.value = profile?.bio || '';
        updateAllUI();
    });

    modalCancel.addEventListener('click', () => profileModal.classList.add('hidden'));

    modalSave.addEventListener('click', async () => {
        const nick = modalNickname.value.trim();
        const bio = modalBio.value.trim();
        if (!nick) return;
        profile.nickname = nick; profile.bio = bio;
        await supabase.from('profiles').upsert({ id: currentUser.id, nickname: nick, bio: bio });
        updateAllUI();
        profileModal.classList.add('hidden');
        if (viewingUserId === currentUser.id) openProfile(currentUser.id);
    });

    // ========== NAVIGATION ==========
    function switchScreen(screen) {
        [screenHome, screenProfile, screenMyPosts, screenFollowing].forEach(s => s.classList.remove('active'));
        const map = { home: screenHome, profile: screenProfile, myPosts: screenMyPosts, following: screenFollowing };
        if (map[screen]) map[screen].classList.add('active');
        currentScreen = screen;
        navItems.forEach(item => item.classList.toggle('active', item.dataset.screen === screen));
        if (screen === 'home') loadPosts();
        else if (screen === 'myPosts') loadMyPosts();
        else if (screen === 'following') loadFollowingPosts();
    }

    navItems.forEach(item => item.addEventListener('click', () => switchScreen(item.dataset.screen)));

    // ========== FOLLOW ==========
    async function isFollowing(userId) {
        if (!currentUser || userId === currentUser.id) return false;
        const { data } = await supabase.from('followers').select('*').eq('follower_id', currentUser.id).eq('following_id', userId).maybeSingle();
        return !!data;
    }

    async function toggleFollow(userId, btn) {
        if (!currentUser) return;
        const following = await isFollowing(userId);
        if (following) await supabase.from('followers').delete().match({ follower_id: currentUser.id, following_id: userId });
        else await supabase.from('followers').insert({ follower_id: currentUser.id, following_id: userId });
        const newState = !following;
        if (btn) { btn.textContent = newState ? 'Отписаться' : 'Подписаться'; btn.classList.toggle('is-following', newState); }
        if (viewingUserId === userId) {
            const [f, fg] = await Promise.all([getFollowersCount(userId), getFollowingCount(userId)]);
            const elF = document.getElementById('statFollowers');
            const elG = document.getElementById('statFollowing');
            if (elF) elF.innerHTML = `<span class="profile-stat-value">${f}</span> подписчиков`;
            if (elG) elG.innerHTML = `<span class="profile-stat-value">${fg}</span> подписок`;
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

    // ========== OPEN PROFILE ==========
    async function openProfile(userId) {
        viewingUserId = userId;
        switchScreen('profile');
        profileContainer.innerHTML = '<div class="feed-state"><i class="fa-solid fa-spinner fa-spin-pulse"></i> Загрузка...</div>';
        const prof = await loadProfile(userId);
        if (!prof) return;
        const [followers, followingCount] = await Promise.all([getFollowersCount(userId), getFollowingCount(userId)]);
        const { count: postsCount } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId);
        const { data: likesData } = await supabase.from('posts').select('likes').eq('user_id', userId);
        const totalLikes = likesData ? likesData.reduce((s, p) => s + (p.likes || 0), 0) : 0;
        const isOwn = currentUser && userId === currentUser.id;
        const followingStatus = await isFollowing(userId);
        const roleText = prof.role === 'admin' ? 'Администратор' : (prof.role === 'moderator' ? 'Модератор' : 'Пользователь');
        const joinDate = prof.created_at ? new Date(prof.created_at).toLocaleDateString('ru-RU') : '—';

        profileContainer.innerHTML = `
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
                    ${isOwn ? '<button class="profile-btn primary" id="openProfileEditor">Редактировать</button>' : `<button class="follow-btn ${followingStatus ? 'is-following' : ''}" id="followBtn">${followingStatus ? 'Отписаться' : 'Подписаться'}</button>`}
                </div>
            </div>
            <div class="profile-posts"><h3 class="profile-section-title">Посты</h3><div class="feed-list" id="profilePostsFeed"></div></div>`;

        if (isOwn) document.getElementById('openProfileEditor')?.addEventListener('click', () => {
            profileModal.classList.remove('hidden');
            modalNickname.value = prof.nickname || '';
            modalBio.value = prof.bio || '';
            updateAllUI();
        });
        const followBtn = document.getElementById('followBtn');
        if (followBtn) followBtn.addEventListener('click', () => toggleFollow(userId, followBtn));

        const { data: posts } = await supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        const feed = document.getElementById('profilePostsFeed');
        if (feed) {
            feed.innerHTML = posts?.length ? '' : '<p style="color:#555;">Нет постов</p>';
            posts?.forEach(post => { const c = createPostCard(post); if (c) feed.appendChild(c); });
        }
    }

    // ========== POST CARD ==========
    function createPostCard(post) {
        if (bannedUserIds.has(post.user_id)) return null;
        const card = document.createElement('div'); card.className = 'post-card';
        card.dataset.postId = post.id; card.dataset.userId = post.user_id;
        let mediaHtml = '';
        if (post.image_url) mediaHtml += `<div class="post-card-img"><img src="${esc(post.image_url)}"></div>`;
        card.innerHTML = `
            <div class="post-card-header">
                <div class="post-card-avatar">${esc(post.nickname?.charAt(0) || '?')}</div>
                <div><span class="post-card-nickname">${esc(post.nickname||'Гость')}</span><span class="post-card-time">${fmtDate(post.created_at)}</span></div>
            </div>
            ${post.content?`<div class="post-card-text">${esc(post.content)}</div>`:''}${mediaHtml}
            <div class="post-card-actions"><button class="like-btn ${likedPostIds.has(post.id)?'liked':''}"><i class="fa-solid fa-heart"></i> <span>${post.likes||0}</span></button></div>`;
        card.querySelector('.post-card-avatar').addEventListener('click', () => openProfile(post.user_id));
        card.querySelector('.post-card-nickname').addEventListener('click', () => openProfile(post.user_id));
        card.querySelector('.like-btn').addEventListener('click', () => toggleLike(post.id, card.querySelector('.like-btn')));
        return card;
    }

    async function toggleLike(pid, btn) {
        if (!currentUser) return;
        const liked = likedPostIds.has(pid);
        likedPostIds[liked?'delete':'add'](pid);
        btn.classList.toggle('liked', !liked);
        btn.querySelector('span').textContent = parseInt(btn.querySelector('span').textContent) + (liked?-1:1);
        if (liked) await supabase.from('likes').delete().match({post_id:pid,user_id:currentUser.id});
        else await supabase.from('likes').insert({post_id:pid,user_id:currentUser.id});
    }

    // ========== LOADERS ==========
    async function loadPosts() {
        feedLoading.classList.remove('hidden');
        feedEmpty.classList.add('hidden');
        const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
        postsFeed.querySelectorAll('.post-card').forEach(c => c.remove());
        feedLoading.classList.add('hidden');
        if (!data || !data.length) { feedEmpty.classList.remove('hidden'); return; }
        data.forEach(p => { const c = createPostCard(p); if (c) postsFeed.appendChild(c); });
    }

    async function loadMyPosts() {
        if (!currentUser) return;
        myPostsLoading.classList.remove('hidden');
        myPostsEmpty.classList.add('hidden');
        const { data } = await supabase.from('posts').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
        myPostsFeed.querySelectorAll('.post-card').forEach(c => c.remove());
        myPostsLoading.classList.add('hidden');
        if (!data || !data.length) { myPostsEmpty.classList.remove('hidden'); return; }
        data.forEach(p => { const c = createPostCard(p); if (c) myPostsFeed.appendChild(c); });
    }

    async function loadFollowingPosts() {
        if (!currentUser) return;
        followingLoading.classList.remove('hidden');
        followingEmpty.classList.add('hidden');
        const { data: follows } = await supabase.from('followers').select('following_id').eq('follower_id', currentUser.id);
        const ids = follows?.map(f => f.following_id) || [];
        if (!ids.length) { followingEmpty.classList.remove('hidden'); followingLoading.classList.add('hidden'); return; }
        const { data } = await supabase.from('posts').select('*').in('user_id', ids).order('created_at', { ascending: false });
        followingFeed.querySelectorAll('.post-card').forEach(c => c.remove());
        followingLoading.classList.add('hidden');
        if (!data || !data.length) { followingEmpty.classList.remove('hidden'); return; }
        data.forEach(p => { const c = createPostCard(p); if (c) followingFeed.appendChild(c); });
    }

    // ========== PUBLISH ==========
    async function publish() {
        if (isPublishing || !currentUser) return;
        const txt = postTextarea.value.trim();
        if (!txt && !selectedImage) return;
        isPublishing = true;
        publishBtn.disabled = true;
        try {
            let imageUrl = null;
            if (selectedImage) {
                const path = `posts/${currentUser.id}_${Date.now()}.${selectedImage.name.split('.').pop()}`;
                await supabase.storage.from('post-images').upload(path, selectedImage);
                const { data } = supabase.storage.from('post-images').getPublicUrl(path);
                imageUrl = data.publicUrl;
            }
            await supabase.from('posts').insert({
                user_id: currentUser.id,
                nickname: profile?.nickname || currentUser.email?.split('@')[0],
                content: txt,
                likes: 0,
                image_url: imageUrl
            });
            postTextarea.value = '';
            selectedImage = null;
            imagePreview.classList.add('hidden');
            charCounter.textContent = '0 / 500';
            loadPosts();
        } catch (e) {
            console.error(e);
        } finally {
            isPublishing = false;
            updatePublishBtn();
        }
    }

    function updatePublishBtn() {
        const canPost = (postTextarea.value.trim().length > 0) || selectedImage;
        publishBtn.disabled = !canPost || isPublishing;
    }

    attachImageBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            selectedImage = e.target.files[0];
            const r = new FileReader();
            r.onload = ev => { previewImg.src = ev.target.result; imagePreview.classList.remove('hidden'); };
            r.readAsDataURL(e.target.files[0]);
            updatePublishBtn();
        }
    });
    removeImagePreview.addEventListener('click', () => { selectedImage = null; imagePreview.classList.add('hidden'); updatePublishBtn(); });

    async function loadBans() { const { data } = await supabase.from('banned_users').select('user_id'); bannedUserIds = new Set(data ? data.map(r => r.user_id) : []); }
    async function loadLikes() { if (!currentUser) return; const { data } = await supabase.from('likes').select('post_id').eq('user_id', currentUser.id); likedPostIds = new Set(data ? data.map(r => r.post_id) : []); }

    function setupAdmin() {
        const fab = document.createElement('button'); fab.className = 'admin-fab'; fab.innerHTML = '<i class="fa-solid fa-shield-halved"></i>'; document.body.appendChild(fab);
        const panel = document.createElement('div'); panel.className = 'admin-panel';
        panel.innerHTML = `<h3>Админ</h3><input type="password" id="adminPw" placeholder="Пароль"><button class="admin-login-btn" id="adminLogin">Войти</button><div id="adminErr" style="color:red;display:none;">Неверный</div><div id="bannedList" style="margin-top:10px;"></div>`;
        document.body.appendChild(panel);
        fab.addEventListener('click', () => panel.classList.toggle('active'));
        document.getElementById('adminLogin').addEventListener('click', async () => { if (document.getElementById('adminPw').value === 'nobuadmin2024') { isAdmin = true; panel.classList.remove('active'); await renderBanned(); addAdminButtons(); } });
        async function renderBanned() {
            const { data } = await supabase.from('banned_users').select('*');
            const list = document.getElementById('bannedList'); list.innerHTML = '<h4>Заблокированные</h4>';
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
            const h = card.querySelector('.post-card-header');
            const d = document.createElement('button'); d.className = 'admin-delete-btn'; d.innerHTML = '<i class="fa-solid fa-trash"></i>'; d.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;margin-left:auto;';
            d.addEventListener('click', async () => { if(confirm('Удалить?')){ await supabase.from('posts').delete().match({id:card.dataset.postId}); card.remove(); } });
            h.appendChild(d);
            const b = document.createElement('button'); b.className = 'admin-block-btn'; b.innerHTML = '<i class="fa-solid fa-ban"></i>'; b.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;';
            b.addEventListener('click', async () => {
                if(confirm(`Заблокировать ${card.querySelector('.post-card-nickname').textContent}?`)){
                    await supabase.from('banned_users').upsert({user_id:card.dataset.userId,nickname:card.querySelector('.post-card-nickname').textContent});
                    bannedUserIds.add(card.dataset.userId);
                    document.querySelectorAll(`.post-card[data-user-id="${card.dataset.userId}"]`).forEach(c=>c.remove());
                    renderBanned();
                }
            });
            h.appendChild(b);
        });
    }

    function initApp() {
        loadBans(); loadLikes(); loadPosts(); setupAdmin();
        postTextarea.addEventListener('input', () => { charCounter.textContent = postTextarea.value.length + ' / 500'; updatePublishBtn(); });
        publishBtn.addEventListener('click', publish);
        retryBtn.addEventListener('click', loadPosts);
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