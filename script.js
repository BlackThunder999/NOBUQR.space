(function() {
    const supabase = window.supabase.createClient(
        'https://iljsednetiogjtowlexo.supabase.co',
        'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O'
    );

    // ========== DOM ==========
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

    let currentNickname = '';
    let currentUserId = '';
    let isPublishing = false;
    let isAdmin = false;
    let likedPostIds = new Set();
    let bannedUserIds = new Set();
    let selectedImage = null;
    let refreshInterval = null;

    // ========== UTILS ==========
    function esc(s) {
        return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
    }
    function uid() {
        let id = localStorage.getItem('nobu_user_id');
        if (!id) { id = crypto.randomUUID(); localStorage.setItem('nobu_user_id', id); }
        return id;
    }
    function formatDate(d) {
        if (!d) return '';
        const date = new Date(d);
        if (isNaN(date)) return '';
        const diff = Math.floor((Date.now() - date) / 1000);
        if (diff < 60) return 'только что';
        if (diff < 3600) return Math.floor(diff/60) + ' мин. назад';
        if (diff < 86400) return Math.floor(diff/3600) + ' ч. назад';
        return new Date(d).toLocaleDateString('ru-RU');
    }

    // ========== UI ==========
    function updateUI() {
        const nick = currentNickname || 'Гость';
        nicknameText.textContent = nick;
        composerNickname.textContent = nick;
        avatarInitial.textContent = nick.charAt(0).toUpperCase();
        composerAvatarInitial.textContent = nick.charAt(0).toUpperCase();
        const hasContent = postTextarea.value.trim().length > 0 || selectedImage;
        const blocked = bannedUserIds.has(currentUserId);
        publishBtn.disabled = blocked || !hasContent || !currentNickname || isPublishing;
        if (blocked) {
            composerError.classList.remove('hidden');
            composerErrorText.textContent = 'Вы заблокированы';
        } else {
            composerError.classList.add('hidden');
        }
    }

    // ========== BANS ==========
    async function loadBans() {
        const { data } = await supabase.from('banned_users').select('user_id');
        bannedUserIds = new Set(data ? data.map(r => r.user_id) : []);
        updateUI();
    }
    async function banUser(userId, nickname) {
        await supabase.from('banned_users').upsert({ user_id: userId, nickname: nickname });
        bannedUserIds.add(userId);
        document.querySelectorAll(`.post-card[data-user-id="${userId}"]`).forEach(c => c.remove());
    }

    // ========== LIKES ==========
    async function loadLikes() {
        if (!currentUserId) return;
        const { data } = await supabase.from('likes').select('post_id').eq('user_id', currentUserId);
        likedPostIds = new Set(data ? data.map(r => r.post_id) : []);
    }
    async function toggleLike(postId, btn) {
        const liked = likedPostIds.has(postId);
        likedPostIds[liked ? 'delete' : 'add'](postId);
        btn.classList.toggle('liked', !liked);
        const countEl = btn.querySelector('span');
        countEl.textContent = parseInt(countEl.textContent) + (liked ? -1 : 1);
        if (liked) await supabase.from('likes').delete().match({ post_id: postId, user_id: currentUserId });
        else await supabase.from('likes').insert({ post_id: postId, user_id: currentUserId });
    }

    // ========== POSTS ==========
    function createCard(post) {
        if (bannedUserIds.has(post.user_id)) return null;
        const card = document.createElement('div');
        card.className = 'post-card';
        card.dataset.postId = post.id;
        card.dataset.userId = post.user_id;
        card.dataset.nickname = post.nickname;
        const liked = likedPostIds.has(post.id);
        let imageHtml = '';
        if (post.image_url) {
            imageHtml = `<div class="post-image"><img src="${esc(post.image_url)}" alt="post image" loading="lazy"></div>`;
        }
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar">${esc(post.nickname?.charAt(0) || '?')}</div>
                <div class="post-author-info">
                    <span class="post-nickname">${esc(post.nickname || 'Гость')}</span>
                    <span class="post-time">${formatDate(post.created_at)}</span>
                </div>
            </div>
            ${post.content ? `<div class="post-content">${esc(post.content)}</div>` : ''}
            ${imageHtml}
            <div class="post-actions">
                <button class="like-btn ${liked ? 'liked' : ''}">
                    <i class="fas fa-heart"></i> <span>${post.likes || 0}</span>
                </button>
            </div>`;
        card.querySelector('.like-btn').addEventListener('click', () => toggleLike(post.id, card.querySelector('.like-btn')));
        return card;
    }

    async function loadPosts() {
        feedLoading.classList.remove('hidden');
        feedError.classList.add('hidden');
        feedEmpty.classList.add('hidden');
        const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
        postsFeed.querySelectorAll('.post-card').forEach(c => c.remove());
        feedLoading.classList.add('hidden');
        if (!data || data.length === 0) { feedEmpty.classList.remove('hidden'); return; }
        data.forEach(post => {
            const card = createCard(post);
            if (card) {
                postsFeed.appendChild(card);
                if (isAdmin) addAdminButtons(card);
            }
        });
    }

    async function publish() {
        if (isPublishing || bannedUserIds.has(currentUserId)) return;
        const content = postTextarea.value.trim();
        if (!content && !selectedImage) return;
        isPublishing = true;
        publishBtn.disabled = true;
        composerError.classList.add('hidden');
        try {
            let imageUrl = null;
            if (selectedImage) {
                const path = `post-images/${currentUserId}_${Date.now()}.${selectedImage.name.split('.').pop()}`;
                const { error: upErr } = await supabase.storage.from('post-images').upload(path, selectedImage);
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
                imageUrl = urlData.publicUrl;
            }
            const { error: insErr } = await supabase.from('posts').insert({
                user_id: currentUserId,
                nickname: currentNickname,
                content: content,
                likes: 0,
                image_url: imageUrl
            });
            if (insErr) throw insErr;
            postTextarea.value = '';
            selectedImage = null;
            charCount.textContent = '0';
            const previewContainer = document.querySelector('.image-preview-container');
            if (previewContainer) previewContainer.classList.remove('active');
            loadPosts();
        } catch (e) {
            console.error(e);
            composerError.classList.remove('hidden');
            composerErrorText.textContent = 'Ошибка: ' + (e.message || 'неизвестная');
        }
        isPublishing = false;
        updateUI();
    }

    // ========== IMAGE UPLOAD UI (фикс для телефона) ==========
    function setupImageUpload() {
        const composerBody = document.querySelector('.composer-body');
        
        // Создаём контейнер для кнопок
        const toolbar = document.createElement('div');
        toolbar.className = 'composer-toolbar';
        toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
        
        // Кнопка выбора фото
        const attachBtn = document.createElement('button');
        attachBtn.className = 'attach-btn';
        attachBtn.innerHTML = '<i class="fas fa-image"></i>';
        attachBtn.title = 'Прикрепить фото';
        attachBtn.style.cssText = 'width:40px;height:40px;border-radius:50%;background:#1a1a1a;border:1px solid #333;color:#999;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;-webkit-tap-highlight-color:transparent;';
        
        // Скрытый input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        
        // Контейнер превью
        const previewContainer = document.createElement('div');
        previewContainer.className = 'image-preview-container';
        previewContainer.style.cssText = 'display:none;position:relative;margin-bottom:8px;';
        
        const previewImg = document.createElement('img');
        previewImg.className = 'image-preview';
        previewImg.style.cssText = 'width:100%;max-height:200px;object-fit:cover;border-radius:12px;';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-image-btn';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.style.cssText = 'position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:50%;background:rgba(0,0,0,0.7);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;';
        
        previewContainer.appendChild(previewImg);
        previewContainer.appendChild(removeBtn);
        toolbar.appendChild(attachBtn);
        toolbar.appendChild(fileInput);
        
        // Вставляем в композер
        composerBody.insertBefore(previewContainer, composerBody.querySelector('.composer-footer'));
        composerBody.insertBefore(toolbar, previewContainer);

        // Обработчики
        attachBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                selectedImage = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (ev) => {
                    previewImg.src = ev.target.result;
                    previewContainer.style.display = 'block';
                };
                reader.readAsDataURL(e.target.files[0]);
                updateUI();
            }
        });
        
        removeBtn.addEventListener('click', () => {
            selectedImage = null;
            fileInput.value = '';
            previewContainer.style.display = 'none';
            updateUI();
        });
    }

    // ========== ADMIN ==========
    function addAdminButtons(card) {
        const header = card.querySelector('.post-header');
        if (!card.querySelector('.delete-post-btn')) {
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-post-btn';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;margin-left:auto;padding:4px 8px;';
            delBtn.addEventListener('click', async () => {
                if (confirm('Удалить пост?')) {
                    await supabase.from('posts').delete().match({ id: card.dataset.postId });
                    card.remove();
                }
            });
            header.appendChild(delBtn);
        }
        if (!card.querySelector('.block-user-btn')) {
            const blockBtn = document.createElement('button');
            blockBtn.className = 'block-user-btn';
            blockBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
            blockBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;padding:4px 8px;';
            blockBtn.addEventListener('click', async () => {
                if (confirm(`Заблокировать ${card.dataset.nickname}?`)) {
                    await banUser(card.dataset.userId, card.dataset.nickname);
                }
            });
            header.appendChild(blockBtn);
        }
    }

    function setupAdmin() {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'admin-toggle-btn';
        toggleBtn.innerHTML = '<i class="fas fa-shield-haltered"></i>';
        toggleBtn.style.cssText = 'position:fixed;bottom:20px;right:20px;width:44px;height:44px;border-radius:50%;background:#1a1a1a;border:1px solid #333;color:#666;cursor:pointer;z-index:200;display:flex;align-items:center;justify-content:center;font-size:1.1rem;';
        document.body.appendChild(toggleBtn);

        const modal = document.createElement('div');
        modal.className = 'admin-modal';
        modal.style.cssText = 'position:fixed;bottom:75px;right:20px;background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:18px;z-index:200;width:260px;display:none;';
        modal.innerHTML = `
            <h3 style="color:#fff;margin-bottom:10px;">Админ-панель</h3>
            <input type="password" id="adminPasswordInput" placeholder="Пароль" style="width:100%;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;outline:none;margin-bottom:8px;">
            <button id="adminLoginBtn" style="width:100%;padding:10px;background:#fff;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Войти</button>
            <div id="adminError" style="color:#f87171;font-size:0.8rem;margin-top:6px;display:none;">Неверный пароль</div>
        `;
        document.body.appendChild(modal);

        toggleBtn.addEventListener('click', () => {
            modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('adminLoginBtn').addEventListener('click', () => {
            if (document.getElementById('adminPasswordInput').value === 'nobuadmin2024') {
                isAdmin = true;
                modal.style.display = 'none';
                toggleBtn.classList.add('active');
                toggleBtn.style.background = '#fff';
                toggleBtn.style.color = '#000';
                document.querySelectorAll('.post-card').forEach(c => addAdminButtons(c));
            } else {
                document.getElementById('adminError').style.display = 'block';
            }
        });
    }

    // ========== INIT ==========
    async function init() {
        currentUserId = uid();
        currentNickname = localStorage.getItem('nobu_nickname') || '';
        await loadBans();
        await loadLikes();
        updateUI();
        if (!currentNickname) { nicknameDisplay.classList.add('hidden'); nicknameEditor.classList.remove('hidden'); }

        setupImageUpload();
        setupAdmin();

        editNicknameBtn.addEventListener('click', () => {
            nicknameDisplay.classList.add('hidden');
            nicknameEditor.classList.remove('hidden');
            nicknameInput.value = currentNickname;
        });
        saveNicknameBtn.addEventListener('click', () => {
            const nick = nicknameInput.value.trim();
            if (!nick) return;
            currentNickname = nick;
            localStorage.setItem('nobu_nickname', nick);
            updateUI();
            nicknameEditor.classList.add('hidden');
            nicknameDisplay.classList.remove('hidden');
        });
        cancelNicknameBtn.addEventListener('click', () => {
            if (!currentNickname) return;
            nicknameEditor.classList.add('hidden');
            nicknameDisplay.classList.remove('hidden');
        });
        postTextarea.addEventListener('input', () => {
            charCount.textContent = postTextarea.value.length;
            updateUI();
        });
        publishBtn.addEventListener('click', publish);
        retryBtn.addEventListener('click', loadPosts);

        await loadPosts();

        supabase.channel('posts-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => loadPosts())
            .subscribe();

        refreshInterval = setInterval(loadPosts, 5000);
        setInterval(loadBans, 10000);

        window.addEventListener('beforeunload', () => clearInterval(refreshInterval));
    }

    document.addEventListener('DOMContentLoaded', init);
})();