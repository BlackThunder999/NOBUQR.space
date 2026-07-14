(function() {
    const SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

    const STORAGE_NICKNAME_KEY = 'nobu_nickname';
    const STORAGE_USER_ID_KEY = 'nobu_user_id';
    const STORAGE_VERIFIED_KEY = 'nobu_verified';
    const STORAGE_AVATAR_KEY = 'nobu_avatar';
    const STORAGE_LAST_POST_TIME = 'nobu_last_post_time';

    // DOM
    const nicknameDisplay = document.getElementById('nicknameDisplay');
    const nicknameText = document.getElementById('nicknameText');
    const avatarInitial = document.getElementById('avatarInitial');
    const avatarCircle = document.getElementById('avatarCircle');
    const editNicknameBtn = document.getElementById('editNicknameBtn');
    const nicknameEditor = document.getElementById('nicknameEditor');
    const nicknameInput = document.getElementById('nicknameInput');
    const saveNicknameBtn = document.getElementById('saveNicknameBtn');
    const cancelNicknameBtn = document.getElementById('cancelNicknameBtn');
    const composerAvatar = document.querySelector('.composer-avatar');
    const composerAvatarInitial = document.getElementById('composerAvatarInitial');
    const composerNickname = document.getElementById('composerNickname');
    const postTextarea = document.getElementById('postTextarea');
    const charCount = document.getElementById('charCount');
    const publishBtn = document.getElementById('publishBtn');
    const composerError = document.getElementById('composerError');
    const composerErrorText = document.getElementById('composerErrorText');
    const postsFeed = document.getElementById('postsFeed');
    const feedLoading = document.getElementById('feedLoading');
    const feedEmpty = document.getElementById('feedEmpty');
    const feedError = document.getElementById('feedError');
    const feedErrorText = document.getElementById('feedErrorText');
    const retryBtn = document.getElementById('retryBtn');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    let currentNickname = '';
    let currentUserId = '';
    let isPublishing = false;
    let realtimeSubscription = null;
    let postsRefreshInterval = null;
    let likedPostIds = new Set();
    let selectedImageFile = null;
    let isAdmin = false;
    let isVerified = false;
    let currentAvatarUrl = null;
    let bannedUserIds = new Set();

    // Динамические стили
    const styleTag = document.createElement('style');
    styleTag.textContent = `
        .delete-post-btn, .block-user-btn, .ban-all-btn {
            background: transparent;
            border: none;
            color: #a0a0b5;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            margin-left: 8px;
            font-size: 0.9rem;
            transition: 0.2s;
        }
        .delete-post-btn:hover, .block-user-btn:hover, .ban-all-btn:hover {
            color: #e74c3c;
            background: rgba(231,76,60,0.15);
        }
        .block-user-btn { margin-left: auto; }
        .ban-all-btn { background: rgba(231,76,60,0.1); color: #e74c3c; margin-top: 8px; display: block; width: 100%; text-align: center; padding: 8px; border-radius: 6px; }
        .avatar-upload-area {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }
        .current-avatar-preview {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6c5ce7, #a29bfe);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 20px;
            color: white;
            background-size: cover;
            background-position: center;
            cursor: pointer;
            border: 2px solid var(--border);
            flex-shrink: 0;
        }
        .current-avatar-preview.has-image { font-size: 0; }
        .avatar-upload-btn {
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            padding: 6px 14px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 0.8rem;
            transition: 0.2s;
        }
        .avatar-upload-btn:hover { background: var(--bg-hover); color: var(--accent-light); }
        .unblock-btn {
            background: #2ecc71;
            border: none;
            color: white;
            padding: 4px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .unblock-btn:hover { background: #27ae60; }
    `;
    document.head.appendChild(styleTag);

    // Композер фото
    const composerBody = document.querySelector('.composer-body');
    const toolbar = document.createElement('div');
    toolbar.className = 'composer-toolbar';
    const attachBtn = document.createElement('button');
    attachBtn.className = 'attach-btn';
    attachBtn.innerHTML = '<i class="fas fa-image"></i>';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    const imagePreviewContainer = document.createElement('div');
    imagePreviewContainer.className = 'image-preview-container';
    const imagePreview = document.createElement('img');
    imagePreview.className = 'image-preview';
    const removeImageBtn = document.createElement('button');
    removeImageBtn.className = 'remove-image-btn';
    removeImageBtn.innerHTML = '<i class="fas fa-times"></i>';
    imagePreviewContainer.appendChild(imagePreview);
    imagePreviewContainer.appendChild(removeImageBtn);
    toolbar.appendChild(attachBtn);
    composerBody.insertBefore(imagePreviewContainer, composerBody.querySelector('.composer-footer'));
    composerBody.insertBefore(toolbar, imagePreviewContainer);

    // Админка
    const ADMIN_PASSWORD = 'nobuadmin2024';
    let adminToggleBtn, adminModal;

    function createAdminUI() {
        adminToggleBtn = document.createElement('button');
        adminToggleBtn.className = 'admin-toggle-btn';
        adminToggleBtn.innerHTML = '<i class="fas fa-shield-haltered"></i>';
        document.body.appendChild(adminToggleBtn);

        adminModal = document.createElement('div');
        adminModal.className = 'admin-modal';
        adminModal.id = 'adminModal';
        adminModal.innerHTML = `
            <h3><i class="fas fa-crown"></i> Админ-панель</h3>
            <input type="password" class="admin-password-input" placeholder="Пароль..." id="adminPasswordInput">
            <button class="admin-login-btn" id="adminLoginBtn">Войти</button>
            <div class="admin-error" id="adminError">Неверный пароль</div>
            <button class="ban-all-btn" id="banAllBtn" style="display:none;"><i class="fas fa-gavel"></i> Забанить всех спамеров</button>
            <div id="bannedList" style="margin-top:12px; display:none; max-height:200px; overflow-y:auto;"></div>
        `;
        document.body.appendChild(adminModal);

        adminToggleBtn.addEventListener('click', () => {
            if (isAdmin) {
                isAdmin = false;
                adminToggleBtn.classList.remove('active');
                adminModal.classList.remove('active');
                removeAdminButtons();
                document.getElementById('banAllBtn').style.display = 'none';
                document.getElementById('bannedList').style.display = 'none';
            } else {
                adminModal.classList.toggle('active');
            }
        });

        document.getElementById('adminLoginBtn').addEventListener('click', async () => {
            if (document.getElementById('adminPasswordInput').value === ADMIN_PASSWORD) {
                isAdmin = true;
                adminToggleBtn.classList.add('active');
                adminModal.classList.remove('active');
                document.getElementById('adminPasswordInput').value = '';
                document.getElementById('adminError').style.display = 'none';
                document.getElementById('banAllBtn').style.display = 'block';
                addAdminButtons();
                await renderBannedList();
                document.getElementById('bannedList').style.display = 'block';
            } else {
                document.getElementById('adminError').style.display = 'block';
            }
        });

        document.getElementById('banAllBtn').addEventListener('click', async () => {
            if (!confirm('Забанить ВСЕХ пользователей, которые опубликовали спам-посты (более 70% одинаковых символов)?')) return;
            const { data } = await supabase.from('posts').select('user_id, nickname, content');
            if (!data) return;
            const spamUserIds = new Set();
            data.forEach(post => {
                if (isSpamText(post.content)) {
                    spamUserIds.add(post.user_id);
                    supabase.from('banned_users').upsert({ user_id: post.user_id, nickname: post.nickname });
                }
            });
            spamUserIds.forEach(id => bannedUserIds.add(id));
            await loadPosts();
            await renderBannedList();
            document.getElementById('bannedList').style.display = 'block';
            alert(`Заблокировано пользователей: ${spamUserIds.size}`);
        });

        document.addEventListener('click', e => {
            if (!adminModal.contains(e.target) && e.target !== adminToggleBtn) {
                adminModal.classList.remove('active');
            }
        });
    }

    function addAdminButtons() {
        document.querySelectorAll('.post-card').forEach(card => {
            const header = card.querySelector('.post-header');
            if (!card.querySelector('.delete-post-btn')) {
                const delBtn = document.createElement('button');
                delBtn.className = 'delete-post-btn';
                delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                delBtn.addEventListener('click', async () => {
                    if (confirm('Удалить пост?')) {
                        await supabase.from('posts').delete().match({ id: card.getAttribute('data-post-id') });
                        card.remove();
                    }
                });
                header.appendChild(delBtn);
            }
            if (!card.querySelector('.block-user-btn')) {
                const blockBtn = document.createElement('button');
                blockBtn.className = 'block-user-btn';
                blockBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
                blockBtn.title = 'Заблокировать';
                blockBtn.addEventListener('click', async () => {
                    const userId = card.getAttribute('data-user-id');
                    const nick = card.getAttribute('data-nickname');
                    if (confirm(`Заблокировать ${nick}?`)) {
                        await supabase.from('banned_users').upsert({ user_id: userId, nickname: nick });
                        bannedUserIds.add(userId);
                        document.querySelectorAll(`.post-card[data-user-id="${userId}"]`).forEach(c => c.remove());
                        await renderBannedList();
                        document.getElementById('bannedList').style.display = 'block';
                    }
                });
                header.appendChild(blockBtn);
            }
        });
    }

    function removeAdminButtons() {
        document.querySelectorAll('.delete-post-btn, .block-user-btn').forEach(b => b.remove());
    }

    async function renderBannedList() {
        const container = document.getElementById('bannedList');
        if (!container) return;
        container.innerHTML = '<h4 style="margin-bottom:8px;color:#f87171;">🚫 Заблокированные</h4>';
        const { data } = await supabase.from('banned_users').select('*');
        if (!data || data.length === 0) {
            container.innerHTML += '<p style="color:var(--text-muted);">Нет заблокированных</p>';
            return;
        }
        data.forEach(entry => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;color:white;border-bottom:1px solid rgba(255,255,255,0.1);';
            div.innerHTML = `<span style="font-size:0.85rem;">${escapeHtml(entry.nickname || 'Без ника')}</span>`;
            const unblockBtn = document.createElement('button');
            unblockBtn.className = 'unblock-btn';
            unblockBtn.textContent = 'Разблокировать';
            unblockBtn.addEventListener('click', async () => {
                await supabase.from('banned_users').delete().match({ user_id: entry.user_id });
                bannedUserIds.delete(entry.user_id);
                await loadPosts();
                await renderBannedList();
                document.getElementById('bannedList').style.display = 'block';
            });
            div.appendChild(unblockBtn);
            container.appendChild(div);
        });
    }

    function isSpamText(text) {
        if (!text || text.length < 5) return false;
        const charCounts = {};
        for (const c of text) charCounts[c] = (charCounts[c] || 0) + 1;
        const maxCount = Math.max(...Object.values(charCounts));
        const ratio = maxCount / text.length;
        const uniqueChars = Object.keys(charCounts).length;
        if (ratio > 0.7 && text.length > 5) return true;
        if (uniqueChars <= 2 && text.length > 10) return true;
        for (let len = 1; len <= 4; len++) {
            const sub = text.substring(0, len);
            let repeated = true;
            for (let i = 0; i < text.length; i += len) {
                if (text.substring(i, i + len) !== sub) { repeated = false; break; }
            }
            if (repeated && text.length > len * 3) return true;
        }
        return false;
    }

    function canPublish() {
        const lastTime = parseInt(localStorage.getItem(STORAGE_LAST_POST_TIME) || '0');
        return Date.now() - lastTime >= 5000;
    }

    function setLastPostTime() {
        localStorage.setItem(STORAGE_LAST_POST_TIME, Date.now().toString());
    }

    function escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    function generateUserId() {
        return crypto.randomUUID();
    }

    function getUserId() {
        let userId = localStorage.getItem(STORAGE_USER_ID_KEY);
        if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
            userId = generateUserId();
            localStorage.setItem(STORAGE_USER_ID_KEY, userId);
        }
        return userId;
    }

    function loadBannedUsers() {
        supabase.from('banned_users').select('user_id').then(({ data }) => {
            bannedUserIds = new Set(data ? data.map(r => r.user_id) : []);
            updatePublishButtonState();
        });
    }

    function updateVerifiedUI() {
        const badge = composerNickname.querySelector('.verified-badge');
        if (isVerified && !badge) {
            const span = document.createElement('span');
            span.className = 'verified-badge';
            span.innerHTML = '<i class="fas fa-check"></i>';
            composerNickname.appendChild(span);
        } else if (!isVerified && badge) {
            badge.remove();
        }
    }

    function saveAvatarUrl(url) {
        currentAvatarUrl = url;
        localStorage.setItem(STORAGE_AVATAR_KEY, url);
        applyAvatarToUI();
    }

    function loadAvatarUrl() {
        const saved = localStorage.getItem(STORAGE_AVATAR_KEY);
        if (saved) { currentAvatarUrl = saved; applyAvatarToUI(); }
    }

    function applyAvatarToUI() {
        if (currentAvatarUrl) {
            avatarCircle.style.backgroundImage = `url(${currentAvatarUrl})`;
            avatarCircle.classList.add('has-image');
            avatarInitial.textContent = '';
            composerAvatar.style.backgroundImage = `url(${currentAvatarUrl})`;
            composerAvatar.style.backgroundSize = 'cover';
            composerAvatarInitial.textContent = '';
        } else {
            avatarCircle.style.backgroundImage = '';
            avatarCircle.classList.remove('has-image');
            avatarInitial.textContent = currentNickname ? currentNickname.charAt(0).toUpperCase() : '?';
            composerAvatar.style.backgroundImage = '';
            composerAvatarInitial.textContent = currentNickname ? currentNickname.charAt(0).toUpperCase() : '?';
        }
        const preview = document.getElementById('avatarPreviewInEditor');
        if (preview) {
            if (currentAvatarUrl) {
                preview.style.backgroundImage = `url(${currentAvatarUrl})`;
                preview.classList.add('has-image');
                preview.textContent = '';
            } else {
                preview.style.backgroundImage = '';
                preview.classList.remove('has-image');
                preview.textContent = currentNickname ? currentNickname.charAt(0).toUpperCase() : '?';
            }
        }
    }

    async function uploadAvatar(file) {
        const path = `avatars/${currentUserId}_avatar.${file.name.split('.').pop()}`;
        await supabase.storage.from('post-images').upload(path, file, { upsert: true });
        const { data } = supabase.storage.from('post-images').getPublicUrl(path);
        return data.publicUrl;
    }

    function updateNicknameUI(nick) {
        nicknameText.textContent = nick || 'Гость';
        composerNickname.textContent = nick || 'Гость';
        updateVerifiedUI();
        applyAvatarToUI();
        updatePublishButtonState();
    }

    function enhanceNicknameEditor() {
        const editor = nicknameEditor;
        const avatarArea = document.createElement('div');
        avatarArea.className = 'avatar-upload-area';
        avatarArea.innerHTML = `
            <div class="current-avatar-preview" id="avatarPreviewInEditor"></div>
            <input type="file" id="avatarFileInput" accept="image/*" style="display:none">
            <button class="avatar-upload-btn" id="avatarUploadBtn"><i class="fas fa-camera"></i> Сменить аватар</button>
        `;
        editor.insertBefore(avatarArea, editor.querySelector('.save-nickname-btn').parentNode);
        document.getElementById('avatarUploadBtn').addEventListener('click', () => document.getElementById('avatarFileInput').click());
        document.getElementById('avatarFileInput').addEventListener('change', async (e) => {
            if (e.target.files[0]) {
                try {
                    const url = await uploadAvatar(e.target.files[0]);
                    saveAvatarUrl(url);
                } catch (err) { alert('Не удалось загрузить аватар'); }
            }
        });
    }

    function handleSaveNickname() {
        const newNick = nicknameInput.value.trim();
        if (!newNick) {
            nicknameInput.style.border = '1px solid var(--danger)';
            nicknameInput.focus();
            setTimeout(() => { nicknameInput.style.border = ''; }, 2000);
            return;
        }

        if (newNick === 'NobuSocial') {
            const password = prompt('Введите пароль для верификации NobuSocial:');
            if (password === 'NobuSocialAdmin2024') {
                isVerified = true;
                localStorage.setItem(STORAGE_VERIFIED_KEY, 'true');
            } else {
                isVerified = false;
                localStorage.setItem(STORAGE_VERIFIED_KEY, 'false');
                if (password !== null) alert('Неверный пароль! Галочка не поставлена.');
            }
        } else {
            isVerified = false;
            localStorage.setItem(STORAGE_VERIFIED_KEY, 'false');
        }

        currentNickname = newNick;
        localStorage.setItem(STORAGE_NICKNAME_KEY, newNick);
        updateNicknameUI(newNick);
        nicknameEditor.classList.add('hidden');
        nicknameDisplay.classList.remove('hidden');
        showComposerError('');
    }

    function updatePublishButtonState() {
        const blocked = bannedUserIds.has(currentUserId);
        const hasContent = postTextarea.value.trim().length > 0 || selectedImageFile;
        publishBtn.disabled = blocked || !hasContent || !currentNickname || isPublishing || !canPublish();
        if (blocked) showComposerError('Вы заблокированы');
        else if (!canPublish() && hasContent) showComposerError('Подождите 5 секунд');
    }

    function showComposerError(msg) {
        composerError.classList.toggle('hidden', !msg);
        if (msg) composerErrorText.textContent = msg;
    }

    function formatDate(d) {
        if (!d) return '';
        const date = new Date(d);
        if (isNaN(date)) return '';
        const diff = Math.floor((Date.now() - date) / 1000);
        if (diff < 60) return 'только что';
        if (diff < 3600) return `${Math.floor(diff/60)} мин. назад`;
        if (diff < 86400) return `${Math.floor(diff/3600)} ч. назад`;
        return date.toLocaleDateString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    }

    function createPostCard(post) {
        if (bannedUserIds.has(post.user_id)) return null;
        const card = document.createElement('div');
        card.className = 'post-card';
        card.setAttribute('data-post-id', post.id);
        card.setAttribute('data-user-id', post.user_id);
        card.setAttribute('data-nickname', post.nickname);
        const verifiedHtml = post.verified ? '<span class="verified-badge"><i class="fas fa-check"></i></span>' : '';
        const liked = likedPostIds.has(post.id);
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar">${escapeHtml(post.nickname?.charAt(0) || '?')}</div>
                <div class="post-author-info">
                    <span class="post-nickname">${escapeHtml(post.nickname||'Гость')}${verifiedHtml}</span>
                    <span class="post-time">${formatDate(post.created_at)}</span>
                </div>
            </div>
            ${post.content?`<div class="post-content">${escapeHtml(post.content)}</div>`:''}
            ${post.image_url?`<div class="post-image"><img src="${escapeHtml(post.image_url)}"></div>`:''}
            <div class="post-actions">
                <button class="like-btn ${liked?'liked':''}">
                    <i class="fas fa-heart"></i> <span class="like-count">${post.likes||0}</span>
                </button>
            </div>`;
        card.querySelector('.like-btn').addEventListener('click', () => toggleLike(post.id, card.querySelector('.like-btn')));
        return card;
    }

    async function toggleLike(postId, btn) {
        const liked = likedPostIds.has(postId);
        const countEl = btn.querySelector('.like-count');
        let count = parseInt(countEl.textContent) || 0;
        btn.classList.toggle('liked', !liked);
        countEl.textContent = liked ? Math.max(0, count-1) : count+1;
        likedPostIds[liked ? 'delete' : 'add'](postId);
        try {
            if (liked) await supabase.from('likes').delete().match({ post_id: postId, user_id: currentUserId });
            else await supabase.from('likes').insert({ post_id: postId, user_id: currentUserId });
        } catch (e) { console.error(e); }
    }

    async function loadPosts() {
        feedLoading.classList.remove('hidden');
        const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
        postsFeed.querySelectorAll('.post-card').forEach(c => c.remove());
        feedLoading.classList.add('hidden');
        if (!data || data.length === 0) { feedEmpty.classList.remove('hidden'); return; }
        feedEmpty.classList.add('hidden');
        data.forEach(post => {
            const card = createPostCard(post);
            if (card) postsFeed.appendChild(card);
        });
        if (isAdmin) addAdminButtons();
    }

    async function publishPost() {
        if (isPublishing || bannedUserIds.has(currentUserId)) return;
        const content = postTextarea.value.trim();
        if (!content && !selectedImageFile) return;
        if (content && isSpamText(content)) {
            showComposerError('Сообщение отклонено: спам');
            return;
        }
        if (!canPublish()) {
            showComposerError('Подождите 5 секунд');
            return;
        }
        isPublishing = true;
        try {
            let imageUrl = null;
            if (selectedImageFile) imageUrl = await uploadPostImage(selectedImageFile);
            await supabase.from('posts').insert({
                user_id: currentUserId, nickname: currentNickname,
                content: content, likes: 0,
                verified: isVerified, image_url: imageUrl
            });
            setLastPostTime();
            postTextarea.value = '';
            clearImagePreview();
            showComposerError('');
            loadPosts();
        } catch (e) { console.error(e); showComposerError('Ошибка публикации'); }
        isPublishing = false;
        updatePublishButtonState();
    }

    async function uploadPostImage(file) {
        const path = `post-images/${currentUserId}_${Date.now()}.${file.name.split('.').pop()}`;
        await supabase.storage.from('post-images').upload(path, file);
        const { data } = supabase.storage.from('post-images').getPublicUrl(path);
        return data.publicUrl;
    }

    function clearImagePreview() {
        selectedImageFile = null;
        imagePreviewContainer.classList.remove('active');
    }

    function setupRealtime() {
        if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
        realtimeSubscription = supabase.channel('posts-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
                const card = createPostCard(payload.new);
                if (card) {
                    postsFeed.insertBefore(card, postsFeed.firstChild);
                    feedEmpty.classList.add('hidden');
                    if (isAdmin) addAdminButtons();
                }
            })
            .subscribe();
    }

    function updateCharCounter() {
        const len = postTextarea.value.length;
        charCount.textContent = len;
        charCount.classList.remove('warning', 'danger');
        if (len >= 450 && len < 500) charCount.classList.add('warning');
        else if (len >= 500) charCount.classList.add('danger');
        updatePublishButtonState();
    }

    async function init() {
        currentUserId = getUserId();
        currentNickname = localStorage.getItem(STORAGE_NICKNAME_KEY) || '';
        isVerified = localStorage.getItem(STORAGE_VERIFIED_KEY) === 'true';
        loadAvatarUrl();
        loadBannedUsers();
        updateNicknameUI(currentNickname);
        if (!currentNickname) { nicknameDisplay.classList.add('hidden'); nicknameEditor.classList.remove('hidden'); }

        enhanceNicknameEditor();

        editNicknameBtn.addEventListener('click', () => {
            nicknameDisplay.classList.add('hidden');
            nicknameEditor.classList.remove('hidden');
            nicknameInput.value = currentNickname;
        });
        saveNicknameBtn.addEventListener('click', handleSaveNickname);
        cancelNicknameBtn.addEventListener('click', () => {
            nicknameEditor.classList.add('hidden');
            nicknameDisplay.classList.remove('hidden');
        });
        postTextarea.addEventListener('input', updateCharCounter);
        publishBtn.addEventListener('click', publishPost);
        attachBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => {
            if (e.target.files[0]) {
                selectedImageFile = e.target.files[0];
                const reader = new FileReader();
                reader.onload = ev => { imagePreview.src = ev.target.result; imagePreviewContainer.classList.add('active'); };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
        removeImageBtn.addEventListener('click', clearImagePreview);
        retryBtn.addEventListener('click', loadPosts);

        createAdminUI();
        await loadPosts();
        setupRealtime();
        setInterval(loadBannedUsers, 10000);
        setInterval(updatePublishButtonState, 1000);

        // Автообновление ленты (с очисткой при закрытии)
        postsRefreshInterval = setInterval(loadPosts, 5000);
        window.addEventListener('beforeunload', () => {
            clearInterval(postsRefreshInterval);
            if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();