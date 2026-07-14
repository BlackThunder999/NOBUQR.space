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
    const videoFeed = $('videoFeed');
    const uploadOverlay = $('uploadOverlay');
    const uploadBtn = $('uploadBtn');
    const uploadCancel = $('uploadCancel');
    const uploadProgress = $('uploadProgress');
    const videoFile = $('videoFile');
    const videoCaption = $('videoCaption');
    const profileOverlay = $('profileOverlay');
    const profileNickname = $('profileNickname');
    const profileAvatar = $('profileAvatar');
    const profileVideoCount = $('profileVideoCount');
    const logoutBtn = $('logoutBtn');
    const navItems = document.querySelectorAll('.nav-item');

    let currentUser = null;
    let profile = null;

    async function checkSession() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { currentUser = user; await loadProfile(); showApp(); }
        else showAuth();
    }

    async function loadProfile() {
        const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        profile = data || { nickname: currentUser.email?.split('@')[0] || 'Гость' };
        profileNickname.textContent = profile.nickname;
        profileAvatar.textContent = profile.nickname.charAt(0).toUpperCase();
    }

    function showApp() { authOverlay.classList.add('hidden'); appContainer.classList.remove('hidden'); loadFeed(); }
    function showAuth() { authOverlay.classList.remove('hidden'); appContainer.classList.add('hidden'); }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data, error } = await supabase.auth.signUp({ email: regEmail.value, password: regPassword.value });
        if (error) { regError.textContent = error.message; return; }
        if (data.user) {
            await supabase.from('profiles').insert({ id: data.user.id, nickname: regNickname.value || regEmail.value.split('@')[0] });
            regError.style.color = '#22c55e';
            regError.textContent = '✅ Готово! Теперь войдите.';
            registerForm.reset();
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.value, password: loginPassword.value });
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

    logoutBtn.addEventListener('click', async () => { await supabase.auth.signOut(); showAuth(); profileOverlay.classList.add('hidden'); });

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const screen = item.dataset.screen;
            uploadOverlay.classList.add('hidden');
            profileOverlay.classList.add('hidden');
            if (screen === 'upload') uploadOverlay.classList.remove('hidden');
            else if (screen === 'profile') { loadProfileVideos(); profileOverlay.classList.remove('hidden'); }
        });
    });

    uploadCancel.addEventListener('click', () => uploadOverlay.classList.add('hidden'));

    async function loadFeed() {
        const { data } = await supabase.from('videos').select('*').order('created_at', { ascending: false });
        videoFeed.innerHTML = '';
        data?.forEach(video => {
            const card = document.createElement('div');
            card.className = 'video-card';
            card.innerHTML = `
                <video src="${video.video_url}" loop muted playsinline></video>
                <div class="video-info">
                    <div class="video-nickname">${esc(video.nickname)}</div>
                    <div class="video-caption">${esc(video.caption || '')}</div>
                </div>
                <div class="video-actions">
                    <div class="video-action" id="like-${video.id}">
                        <i class="fa-regular fa-heart"></i>
                        <span>${video.likes || 0}</span>
                    </div>
                </div>`;
            card.querySelector('.video-action').addEventListener('click', () => likeVideo(video.id));
            videoFeed.appendChild(card);
        });
        const firstVideo = videoFeed.querySelector('video');
        if (firstVideo) firstVideo.play();
        videoFeed.addEventListener('scroll', () => {
            const videos = videoFeed.querySelectorAll('video');
            videos.forEach(v => v.pause());
            const mid = videoFeed.scrollTop + videoFeed.clientHeight / 2;
            let closest = videos[0];
            let minDist = Infinity;
            videos.forEach(v => {
                const dist = Math.abs(v.getBoundingClientRect().top - window.innerHeight/2);
                if (dist < minDist) { minDist = dist; closest = v; }
            });
            if (closest) closest.play();
        });
    }

    async function likeVideo(videoId) {
        const { data } = await supabase.from('videos').select('likes').eq('id', videoId).single();
        await supabase.from('videos').update({ likes: (data.likes || 0) + 1 }).eq('id', videoId);
        const btn = document.getElementById(`like-${videoId}`);
        if (btn) {
            btn.querySelector('i').className = 'fa-solid fa-heart';
            btn.querySelector('span').textContent = (data.likes || 0) + 1;
            btn.style.color = '#ef4444';
        }
    }

    uploadBtn.addEventListener('click', async () => {
        const file = videoFile.files[0];
        if (!file) return;
        uploadProgress.classList.remove('hidden');
        const path = `tok/${currentUser.id}_${Date.now()}.${file.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('post-images').upload(path, file);
        if (error) { uploadProgress.textContent = 'Ошибка'; return; }
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
        await supabase.from('videos').insert({
            user_id: currentUser.id,
            nickname: profile.nickname,
            video_url: urlData.publicUrl,
            caption: videoCaption.value
        });
        uploadProgress.classList.add('hidden');
        videoCaption.value = '';
        videoFile.value = '';
        uploadOverlay.classList.add('hidden');
        loadFeed();
    });

    async function loadProfileVideos() {
        if (!currentUser) return;
        const { data } = await supabase.from('videos').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
        profileVideoCount.textContent = `${data?.length || 0} видео`;
    }

    const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
    checkSession();
})();