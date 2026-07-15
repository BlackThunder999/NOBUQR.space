(function() {
    const supabase = window.supabase.createClient(
        'https://iljsednetiogjtowlexo.supabase.co',
        'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O'
    );

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
    
    const screenFeed = $('screenFeed');
    const screenFollowing = $('screenFollowing');
    const videoFeed = $('videoFeed');
    const followingFeed = $('followingFeed');
    
    const uploadOverlay = $('uploadOverlay');
    const uploadBtn = $('uploadBtn');
    const uploadCancel = $('uploadCancel');
    const uploadProgress = $('uploadProgress');
    const videoFile = $('videoFile');
    const videoCaption = $('videoCaption');
    
    const profileOverlay = $('profileOverlay');
    const profileNickname = $('profileNickname');
    const profileAvatar = $('profileAvatar');
    const profileFollowers = $('profileFollowers');
    const profileFollowing = $('profileFollowing');
    const profileVideoCount = $('profileVideoCount');
    const logoutBtn = $('logoutBtn');
    
    const userProfileOverlay = $('userProfileOverlay');
    const userProfileAvatar = $('userProfileAvatar');
    const userProfileNickname = $('userProfileNickname');
    const userProfileFollowers = $('userProfileFollowers');
    const userProfileVideoCount = $('userProfileVideoCount');
    const userFollowBtn = $('userFollowBtn');
    const closeUserProfile = $('closeUserProfile');
    
    const commentsOverlay = $('commentsOverlay');
    const commentsList = $('commentsList');
    const commentInput = $('commentInput');
    const sendCommentBtn = $('sendCommentBtn');
    const closeComments = $('closeComments');
    
    const navItems = document.querySelectorAll('.nav-item');

    let currentUser = null;
    let profile = null;
    let currentVideoId = null;

    // ========== AUTH (БЕЗ ПОДТВЕРЖДЕНИЯ EMAIL) ==========
    async function checkSession() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { currentUser = user; await loadProfile(); showApp(); }
        else showAuth();
    }

    async function loadProfile() {
        const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        profile = data || { nickname: currentUser.email?.split('@')[0] || 'User' };
        profileNickname.textContent = profile.nickname;
        profileAvatar.textContent = profile.nickname.charAt(0).toUpperCase();
    }

    function showApp() { authOverlay.classList.add('hidden'); appContainer.classList.remove('hidden'); switchScreen('feed'); }
    function showAuth() { authOverlay.classList.remove('hidden'); appContainer.classList.add('hidden'); }

    // Регистрация — сразу входит
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data, error } = await supabase.auth.signUp({ 
            email: regEmail.value, 
            password: regPassword.value 
        });
        if (error) { regError.textContent = error.message; return; }
        if (data.user) {
            await supabase.from('profiles').insert({ 
                id: data.user.id, 
                nickname: regNickname.value || regEmail.value.split('@')[0] 
            });
            currentUser = data.user;
            await loadProfile();
            showApp();
            registerForm.reset();
        }
    });

    // Вход
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.signInWithPassword({ 
            email: loginEmail.value, 
            password: loginPassword.value 
        });
        if (error) loginError.textContent = error.message;
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

    logoutBtn.addEventListener('click', async () => { 
        await supabase.auth.signOut(); 
        currentUser = null; 
        profile = null; 
        profileOverlay.classList.add('hidden'); 
        showAuth(); 
    });

    // ========== NAVIGATION ==========
    function switchScreen(screen) {
        [screenFeed, screenFollowing].forEach(s => s.classList.remove('active'));
        if (screen === 'feed') screenFeed.classList.add('active');
        else if (screen === 'following') screenFollowing.classList.add('active');
        
        uploadOverlay.classList.add('hidden');
        profileOverlay.classList.add('hidden');
        userProfileOverlay.classList.add('hidden');
        commentsOverlay.classList.add('hidden');
        
        navItems.forEach(n => n.classList.remove('active'));
        const activeNav = document.querySelector(`.nav-item[data-screen="${screen}"]`);
        if (activeNav) activeNav.classList.add('active');
        
        if (screen === 'feed') loadMainFeed();
        else if (screen === 'following') loadFollowingFeed();
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const screen = item.dataset.screen;
            if (screen === 'upload') { uploadOverlay.classList.remove('hidden'); return; }
            if (screen === 'profile') { updateOwnProfileStats(); profileOverlay.classList.remove('hidden'); return; }
            switchScreen(screen);
        });
    });

    // ========== FEED ==========
    async function loadMainFeed() {
        videoFeed.innerHTML = '<div style="color:#888;text-align:center;padding:40px;">Загрузка...</div>';
        const { data } = await supabase.from('videos').select('*').order('created_at', { ascending: false });
        renderVideoCards(videoFeed, data);
    }

    async function loadFollowingFeed() {
        if (!currentUser) return;
        followingFeed.innerHTML = '<div style="color:#888;text-align:center;padding:40px;">Загрузка...</div>';
        const { data: follows } = await supabase.from('followers').select('following_id').eq('follower_id', currentUser.id);
        const ids = follows?.map(f => f.following_id) || [];
        if (ids.length === 0) {
            followingFeed.innerHTML = '<div style="color:#888;text-align:center;padding:40px;">Вы ни на кого не подписаны</div>';
            return;
        }
        const { data } = await supabase.from('videos').select('*').in('user_id', ids).order('created_at', { ascending: false });
        renderVideoCards(followingFeed, data);
    }

    function renderVideoCards(container, videos) {
        container.innerHTML = '';
        if (!videos || videos.length === 0) {
            container.innerHTML = '<div style="color:#888;text-align:center;padding:40px;">Нет видео</div>';
            return;
        }
        videos.forEach(video => {
            const card = document.createElement('div');
            card.className = 'video-card';
            card.innerHTML = `
                <video src="${video.video_url}" loop muted playsinline></video>
                <div class="video-info">
                    <div class="video-nickname" data-user-id="${video.user_id}">${esc(video.nickname)}</div>
                    <div class="video-caption">${esc(video.caption || '')}</div>
                </div>
                <div class="video-actions">
                    <div class="video-action like-action" data-video-id="${video.id}">
                        <i class="fa-regular fa-heart"></i>
                        <span>${video.likes || 0}</span>
                    </div>
                    <div class="video-action comment-action" data-video-id="${video.id}">
                        <i class="fa-regular fa-comment"></i>
                    </div>
                </div>`;
            
            card.querySelector('.video-nickname').addEventListener('click', () => openUserProfile(video.user_id));
            card.querySelector('.like-action').addEventListener('click', (e) => { e.stopPropagation(); likeVideo(video.id, card.querySelector('.like-action')); });
            card.querySelector('.comment-action').addEventListener('click', (e) => { e.stopPropagation(); openComments(video.id); });
            
            container.appendChild(card);
        });
        
        const firstVideo = container.querySelector('video');
        if (firstVideo) firstVideo.play().catch(() => {});
        
        container.addEventListener('scroll', () => {
            const videos = container.querySelectorAll('video');
            let closest = null;
            let minDist = Infinity;
            const cr = container.getBoundingClientRect();
            videos.forEach(v => {
                const r = v.getBoundingClientRect();
                const d = Math.abs(r.top + r.height/2 - cr.top - cr.height/2);
                if (d < minDist) { minDist = d; closest = v; }
            });
            videos.forEach(v => v.pause());
            if (closest) closest.play().catch(() => {});
        });
    }

    // ========== LIKES ==========
    async function likeVideo(videoId, btn) {
        if (!currentUser) return;
        const { data } = await supabase.from('videos').select('likes').eq('id', videoId).single();
        const newLikes = (data?.likes || 0) + 1;
        await supabase.from('videos').update({ likes: newLikes }).eq('id', videoId);
        btn.querySelector('i').className = 'fa-solid fa-heart';
        btn.querySelector('span').textContent = newLikes;
        btn.style.color = '#ef4444';
    }

    // ========== COMMENTS ==========
    async function openComments(videoId) {
        currentVideoId = videoId;
        commentsOverlay.classList.remove('hidden');
        await loadComments();
    }

    async function loadComments() {
        const { data } = await supabase.from('comments').select('*').eq('video_id', currentVideoId).order('created_at', { ascending: true });
        commentsList.innerHTML = data?.length ? data.map(c => `
            <div class="comment-item">
                <div class="comment-nickname">${esc(c.nickname)}</div>
                <div class="comment-text">${esc(c.content)}</div>
            </div>
        `).join('') : '<p style="color:#888;">Нет комментариев</p>';
    }

    sendCommentBtn.addEventListener('click', async () => {
        const content = commentInput.value.trim();
        if (!content || !currentUser) return;
        await supabase.from('comments').insert({ video_id: currentVideoId, user_id: currentUser.id, nickname: profile.nickname, content });
        commentInput.value = '';
        loadComments();
    });

    closeComments.addEventListener('click', () => commentsOverlay.classList.add('hidden'));

    // ========== UPLOAD ==========
    uploadCancel.addEventListener('click', () => uploadOverlay.classList.add('hidden'));
    
    uploadBtn.addEventListener('click', async () => {
        const file = videoFile.files[0];
        if (!file) return;
        
        if (file.size > 50 * 1024 * 1024) {
            uploadProgress.textContent = 'Видео слишком большое (макс. 50 МБ)';
            uploadProgress.classList.remove('hidden');
            return;
        }
        
        uploadProgress.classList.remove('hidden');
        uploadProgress.textContent = 'Загрузка...';
        uploadBtn.disabled = true;
        
        try {
            const ext = file.name.split('.').pop();
            const path = `${currentUser.id}_${Date.now()}.${ext}`;
            
            const { error: upErr } = await supabase.storage.from('videos').upload(path, file);
            if (upErr) throw upErr;
            
            const { data: urlData } = supabase.storage.from('videos').getPublicUrl(path);
            
            await supabase.from('videos').insert({
                user_id: currentUser.id,
                nickname: profile.nickname,
                video_url: urlData.publicUrl,
                caption: videoCaption.value || ''
            });
            
            uploadProgress.textContent = '✅ Опубликовано!';
            videoCaption.value = '';
            videoFile.value = '';
            
            setTimeout(() => {
                uploadOverlay.classList.add('hidden');
                uploadProgress.classList.add('hidden');
                uploadProgress.textContent = 'Загрузка...';
            }, 1500);
            
            loadMainFeed();
        } catch (err) {
            uploadProgress.textContent = `Ошибка: ${err.message || 'неизвестная'}`;
        } finally {
            uploadBtn.disabled = false;
        }
    });

    // ========== PROFILE ==========
    async function updateOwnProfileStats() {
        if (!currentUser) return;
        const { count: vc } = await supabase.from('videos').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id);
        const { count: fc } = await supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', currentUser.id);
        const { count: fg } = await supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', currentUser.id);
        profileVideoCount.textContent = `${vc || 0} видео`;
        profileFollowers.textContent = `${fc || 0} подписчиков`;
        profileFollowing.textContent = `${fg || 0} подписок`;
    }

    // ========== USER PROFILE ==========
    async function openUserProfile(userId) {
        if (userId === currentUser.id) { updateOwnProfileStats(); profileOverlay.classList.remove('hidden'); return; }
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (!prof) return;
        userProfileNickname.textContent = prof.nickname || 'User';
        userProfileAvatar.textContent = (prof.nickname || '?').charAt(0).toUpperCase();
        
        const { count: fc } = await supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId);
        const { count: vc } = await supabase.from('videos').select('*', { count: 'exact', head: true }).eq('user_id', userId);
        userProfileFollowers.textContent = `${fc || 0} подписчиков`;
        userProfileVideoCount.textContent = `${vc || 0} видео`;
        
        const { data: follow } = await supabase.from('followers').select('*').eq('follower_id', currentUser.id).eq('following_id', userId).maybeSingle();
        const isFollowing = !!follow;
        userFollowBtn.textContent = isFollowing ? 'Отписаться' : 'Подписаться';
        userFollowBtn.classList.toggle('is-following', isFollowing);
        
        userFollowBtn.onclick = async () => {
            if (isFollowing) {
                await supabase.from('followers').delete().match({ follower_id: currentUser.id, following_id: userId });
            } else {
                await supabase.from('followers').insert({ follower_id: currentUser.id, following_id: userId });
            }
            const { count: updated } = await supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId);
            userProfileFollowers.textContent = `${updated || 0} подписчиков`;
            const newState = !isFollowing;
            userFollowBtn.textContent = newState ? 'Отписаться' : 'Подписаться';
            userFollowBtn.classList.toggle('is-following', newState);
        };
        
        userProfileOverlay.classList.remove('hidden');
    }

    closeUserProfile.addEventListener('click', () => userProfileOverlay.classList.add('hidden'));

    const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);

    checkSession();
})();