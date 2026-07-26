// ======================== ПОКУПКА УСЛУГИ ========================
async function buyService(serviceId) {
    if (!currentUser) { showToast('Войдите в аккаунт', 'error'); return; }
    
    var { data: service } = await supabase.from('gaming_services')
        .select('*, seller:seller_id (*)')
        .eq('id', serviceId).single();
    
    if (!service) { showToast('Услуга не найдена', 'error'); return; }
    if (service.seller_id === currentUser.id) { showToast('Нельзя купить свою услугу', 'error'); return; }
    if (!service.is_active) { showToast('Услуга неактивна', 'error'); return; }
    
    var price = service.price;
    if (currentUser.gems < price) { showToast('Недостаточно Gems. Пополните баланс.', 'error'); renderScreen('balance'); return; }
    
    var commission = Math.floor(price * ORDER_COMMISSION);
    var sellerGets = price - commission;
    
    var confirmHTML = '<div style="text-align:center"><p style="font-size:18px;margin-bottom:8px"><strong>' + escapeHTML(service.title) + '</strong></p>' +
        '<p style="font-size:24px;font-weight:900;color:var(--accent)">' + price + ' 💎</p>' +
        '<p style="font-size:12px;color:var(--text-muted)">Продавец получит: ' + sellerGets + ' 💎</p>' +
        '<p style="font-size:12px;color:var(--text-muted)">Комиссия платформы: ' + commission + ' 💎 (20%)</p></div>';
    
    openModal('Подтверждение покупки', confirmHTML, true, async function() {
        await supabase.from('gems').update({
            balance: currentUser.gems - price,
            frozen: (currentUser.frozen || 0) + price
        }).eq('user_id', currentUser.id);
        currentUser.gems -= price;
        currentUser.frozen = (currentUser.frozen || 0) + price;
        
        var { data: order, error } = await supabase.from('service_orders').insert({
            buyer_id: currentUser.id, seller_id: service.seller_id, service_id: serviceId,
            amount: price, commission_platform: commission, seller_gets: sellerGets, status: 'pending'
        }).select().single();
        
        if (error) { showToast('Ошибка создания заказа', 'error'); return; }
        
        var { data: chat } = await supabase.from('chats').insert({
            order_id: order.id, buyer_id: currentUser.id, seller_id: service.seller_id
        }).select().single();
        
        await supabase.from('notifications').insert({
            user_id: service.seller_id, type: 'new_order',
            title: 'Новый заказ!', message: '@' + currentUser.handle + ' купил вашу услугу'
        });
        
        await supabase.from('gaming_services').update({ orders_count: (service.orders_count || 0) + 1 }).eq('id', serviceId);
        
        showToast('Заказ создан! Чат открыт.', 'success');
        closeModal();
        currentChatId = chat.id;
        currentOrderId = order.id;
        renderScreen('chat');
    });
}

// ======================== ЗАКАЗЫ ========================
function renderOrdersScreen() {
    if (!currentUser) { renderScreen('auth'); return; }
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">Мои заказы</h1></div></header>' +
        '<div class="tabs"><button class="tab active" onclick="window.switchOrderTab(\'buying\')">Покупаю</button><button class="tab" onclick="window.switchOrderTab(\'selling\')">Продаю</button></div>' +
        '<div style="flex:1;overflow-y:auto" id="ordersList"><div class="spinner"></div></div></div>';
    document.getElementById('app').innerHTML = html;
    loadOrders('buying');
}

function switchOrderTab(tab) {
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'buying') tabs[0].classList.add('active');
    else tabs[1].classList.add('active');
    loadOrders(tab);
}

async function loadOrders(type) {
    var query = supabase.from('service_orders')
        .select('*, service:service_id (title, game_name), buyer:buyer_id (username, handle), seller:seller_id (username, handle)')
        .order('created_at', { ascending: false });
    
    if (type === 'buying') query = query.eq('buyer_id', currentUser.id);
    else query = query.eq('seller_id', currentUser.id);
    
    var { data: orders } = await query;
    var container = document.getElementById('ordersList');
    if (!container) return;
    
    if (!orders || orders.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Нет заказов</div></div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < orders.length; i++) {
        var o = orders[i];
        var statusText = ''; var statusClass = '';
        switch(o.status) {
            case 'pending': statusText = 'Ожидает'; statusClass = 'pending'; break;
            case 'in_progress': statusText = 'В работе'; statusClass = 'in_progress'; break;
            case 'completed': statusText = 'Выполнен'; statusClass = 'completed'; break;
            case 'dispute': statusText = 'Спор'; statusClass = 'dispute'; break;
            case 'cancelled': statusText = 'Отменён'; statusClass = 'cancelled'; break;
        }
        
        html += '<div class="order-card"><div class="order-card-header"><div class="order-card-title">' + escapeHTML(o.service ? o.service.title : 'Услуга удалена') + '</div><span class="order-status ' + statusClass + '">' + statusText + '</span></div>' +
            '<div class="order-card-meta"><span>💎 ' + o.amount + '</span><span>' + (type === 'buying' ? 'Продавец: @' + (o.seller ? o.seller.handle : '?') : 'Покупатель: @' + (o.buyer ? o.buyer.handle : '?')) + '</span></div>' +
            '<div class="order-card-meta" style="margin-top:4px"><span>' + getTimeAgo(new Date(o.created_at)) + '</span></div>';
        
        if (o.status === 'pending' && type === 'selling') html += '<div class="order-card-actions"><button class="btn btn-small btn-success" onclick="window.acceptOrder(\'' + o.id + '\')">Принять</button><button class="btn btn-small btn-danger" onclick="window.cancelOrder(\'' + o.id + '\')">Отклонить</button></div>';
        if (o.status === 'in_progress' && type === 'selling') html += '<div class="order-card-actions"><button class="btn btn-small btn-success" onclick="window.completeOrder(\'' + o.id + '\')">Выполнено</button></div>';
        if (o.status === 'in_progress' && type === 'buying') html += '<div class="order-card-actions"><button class="btn btn-small btn-success" onclick="window.confirmOrder(\'' + o.id + '\')">Подтвердить</button><button class="btn btn-small btn-danger" onclick="window.disputeOrder(\'' + o.id + '\')">Проблема</button></div>';
        if (o.status === 'pending' || o.status === 'in_progress') html += '<div class="order-card-actions"><button class="btn btn-small btn-outline" onclick="window.openOrderChat(\'' + o.id + '\')">💬 Чат</button></div>';
        
        html += '</div>';
    }
    container.innerHTML = html;
}

async function acceptOrder(orderId) {
    await supabase.from('service_orders').update({ status: 'in_progress' }).eq('id', orderId).eq('seller_id', currentUser.id);
    showToast('Заказ принят!', 'success'); loadOrders('selling');
}
async function cancelOrder(orderId) {
    var { data: order } = await supabase.from('service_orders').select('*').eq('id', orderId).single();
    if (!order) return;
    var { data: buyerGems } = await supabase.from('gems').select('*').eq('user_id', order.buyer_id).single();
    await supabase.from('gems').update({ balance: (buyerGems.balance || 0) + order.amount, frozen: Math.max((buyerGems.frozen || 0) - order.amount, 0) }).eq('user_id', order.buyer_id);
    await supabase.from('service_orders').update({ status: 'cancelled' }).eq('id', orderId);
    showToast('Заказ отклонён', 'info'); loadOrders('selling');
}
async function completeOrder(orderId) {
    await supabase.from('service_orders').update({ status: 'completed', seller_confirmed: true }).eq('id', orderId).eq('seller_id', currentUser.id);
    showToast('Ожидайте подтверждения', 'info'); loadOrders('selling');
}
async function confirmOrder(orderId) {
    var { data: order } = await supabase.from('service_orders').select('*').eq('id', orderId).single();
    if (!order) return;
    var { data: sellerGems } = await supabase.from('gems').select('*').eq('user_id', order.seller_id).single();
    await supabase.from('gems').update({ balance: (sellerGems.balance || 0) + order.seller_gets, total_earned: (sellerGems.total_earned || 0) + order.seller_gets }).eq('user_id', order.seller_id);
    await supabase.from('gems').update({ frozen: Math.max((currentUser.frozen || 0) - order.amount, 0) }).eq('user_id', currentUser.id);
    currentUser.frozen = Math.max((currentUser.frozen || 0) - order.amount, 0);
    await supabase.from('service_orders').update({ status: 'completed', buyer_confirmed: true, completed_at: new Date().toISOString() }).eq('id', orderId);
    
    var { data: sp } = await supabase.from('sellers').select('*').eq('user_id', order.seller_id).single();
    if (sp) await supabase.from('sellers').update({ completed_orders: (sp.completed_orders || 0) + 1, total_orders: (sp.total_orders || 0) + 1 }).eq('user_id', order.seller_id);
    
    showToast('Заказ подтверждён!', 'success'); loadOrders('buying');
}
async function disputeOrder(orderId) {
    var reason = prompt('Опишите проблему:');
    if (!reason) return;
    await supabase.from('disputes').insert({ order_id: orderId, raised_by: currentUser.id, reason: reason });
    await supabase.from('service_orders').update({ status: 'dispute' }).eq('id', orderId);
    showToast('Спор открыт', 'warning'); loadOrders('buying');
}
async function openOrderChat(orderId) {
    var { data: chat } = await supabase.from('chats').select('id').eq('order_id', orderId).single();
    if (chat) { currentChatId = chat.id; currentOrderId = orderId; renderScreen('chat'); }
    else showToast('Чат не найден', 'error');
}

// ======================== ЧАТ С REALTIME ========================
async function renderChatScreen() {
    if (!currentChatId || !currentOrderId) { renderScreen('orders'); return; }
    var { data: chat } = await supabase.from('chats').select('*, order:order_id (*, service:service_id (title))').eq('id', currentChatId).single();
    if (!chat) { renderScreen('orders'); return; }
    var otherUserId = chat.buyer_id === currentUser.id ? chat.seller_id : chat.buyer_id;
    var { data: otherUser } = await supabase.from('users').select('username, handle').eq('id', otherUserId).single();
    
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'orders\')">←</button><div><h1 class="topbar-title">@' + (otherUser ? otherUser.handle : 'user') + '</h1><div style="font-size:10px;color:var(--text-muted)">' + (chat.order && chat.order.service ? chat.order.service.title : 'Заказ') + '</div></div></div></header>' +
        '<div class="chat-warning"><span class="chat-warning-icon">⚠️</span><p><strong>Не выходите за пределы платформы!</strong> Все переговоры только здесь. Мы не несём ответственности за сделки вне NobuSumer. При нарушении — блокировка.</p></div>' +
        '<div class="chat-messages" id="chatMessages"><div class="spinner"></div></div>' +
        '<div class="chat-input-area"><input type="text" id="chatInput" placeholder="Сообщение..." onkeypress="if(event.key===\'Enter\')window.sendMessage()"><button class="chat-send-btn" onclick="window.sendMessage()">➤</button></div></div>';
    document.getElementById('app').innerHTML = html;
    loadMessages();
    subscribeToChat();
}

async function loadMessages() {
    var { data: messages } = await supabase.from('chat_messages').select('*').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    var container = document.getElementById('chatMessages');
    if (!container) return;
    if (!messages || messages.length === 0) { container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">Напишите первое сообщение</div>'; return; }
    var html = '';
    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        html += '<div class="chat-msg ' + (msg.sender_id === currentUser.id ? 'mine' : 'theirs') + '">' + escapeHTML(msg.content) + '<div class="chat-msg-time">' + getTimeAgo(new Date(msg.created_at)) + '</div></div>';
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function subscribeToChat() {
    if (chatSubscription) supabase.removeChannel(chatSubscription);
    chatSubscription = supabase
        .channel('chat_' + currentChatId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'chat_id=eq.' + currentChatId }, function() { loadMessages(); })
        .subscribe();
}

async function sendMessage() {
    var input = document.getElementById('chatInput');
    var content = input.value.trim();
    if (!content) return;
    await supabase.from('chat_messages').insert({ chat_id: currentChatId, sender_id: currentUser.id, content: content });
    input.value = '';
    loadMessages();
}

// ======================== ПРОФИЛЬ С РЕДАКТИРОВАНИЕМ ========================
function renderProfileScreen() {
    if (!currentUser) { renderScreen('auth'); return; }
    var sp = currentUser.sellerData;
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">Профиль</h1><button class="btn-icon" onclick="window.showEditProfile()">✏️</button></div></header><div style="flex:1;overflow-y:auto">' +
        '<div class="profile-header-section"><div class="profile-avatar-wrap"><div class="profile-avatar-large" onclick="window.showEditProfile()">' + (currentUser.avatar_url ? '<img src="' + currentUser.avatar_url + '">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:36px;background:var(--bg-input)">👤</div>') + '</div></div>' +
        '<div class="profile-name">' + currentUser.username + (currentUser.isSeller ? ' <span style="color:var(--accent)">✓</span>' : '') + '</div>' +
        '<div class="profile-role">@' + currentUser.handle + ' · ' + (currentUser.isSeller ? 'Продавец ⭐ ' + (sp ? sp.rating.toFixed(1) : '0.0') : 'Покупатель') + '</div>' +
        (currentUser.bio ? '<div class="profile-bio">' + escapeHTML(currentUser.bio) + '</div>' : '') +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Telegram: ' + (currentUser.telegram || 'не указан') + '</div></div>' +
        '<div class="profile-stats-grid"><div class="profile-stat-item"><div class="profile-stat-value">' + (currentUser.gems || 0) + '</div><div class="profile-stat-label">Баланс</div></div><div class="profile-stat-item"><div class="profile-stat-value">' + (sp ? sp.completed_orders || 0 : 0) + '</div><div class="profile-stat-label">Продаж</div></div><div class="profile-stat-item"><div class="profile-stat-value">' + (sp ? sp.reviews_count || 0 : 0) + '</div><div class="profile-stat-label">Отзывов</div></div><div class="profile-stat-item"><div class="profile-stat-value">' + (sp ? sp.rating.toFixed(1) : '0') + '</div><div class="profile-stat-label">Рейтинг</div></div></div>' +
        '<div class="tabs"><button class="tab active" onclick="window.switchProfileTab(\'services\')">Услуги</button><button class="tab" onclick="window.switchProfileTab(\'reviews\')">Отзывы</button></div><div id="profileContent" style="padding:16px"><div class="spinner"></div></div></div></div>';
    document.getElementById('app').innerHTML = html;
    loadProfileServices();
}

function switchProfileTab(tab) {
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'services') { tabs[0].classList.add('active'); loadProfileServices(); }
    else { tabs[1].classList.add('active'); loadProfileReviews(); }
}

async function loadProfileServices() {
    var { data: services } = await supabase.from('gaming_services').select('*').eq('seller_id', currentUser.id).order('created_at', { ascending: false });
    var container = document.getElementById('profileContent');
    if (!container) return;
    if (!services || services.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет услуг</div><button class="btn btn-small btn-primary" onclick="window.renderScreen(\'create-service\')">Создать</button></div>'; return; }
    var html = '';
    for (var i = 0; i < services.length; i++) {
        var s = services[i];
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)"><div><strong>' + escapeHTML(s.title) + '</strong><br><span style="font-size:11px;color:var(--text-muted)">💎 ' + s.price + ' · ' + (s.is_active ? '✅' : '❌') + '</span></div><button class="btn btn-small btn-ghost" onclick="window.toggleService(\'' + s.id + '\')">' + (s.is_active ? 'Скрыть' : 'Показать') + '</button></div>';
    }
    container.innerHTML = html;
}

async function toggleService(serviceId) {
    var { data: service } = await supabase.from('gaming_services').select('is_active').eq('id', serviceId).single();
    await supabase.from('gaming_services').update({ is_active: !service.is_active }).eq('id', serviceId);
    loadProfileServices();
}

async function loadProfileReviews() {
    var { data: reviews } = await supabase.from('service_reviews').select('*, reviewer:reviewer_id (username, avatar_url)').eq('seller_id', currentUser.id).order('created_at', { ascending: false });
    var container = document.getElementById('profileContent');
    if (!container) return;
    if (!reviews || reviews.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет отзывов</div></div>'; return; }
    var html = '';
    for (var i = 0; i < reviews.length; i++) {
        var r = reviews[i];
        var stars = '';
        for (var j = 1; j <= 5; j++) stars += j <= r.rating ? '⭐' : '☆';
        html += '<div style="padding:10px 0;border-bottom:1px solid var(--border)"><strong>' + (r.reviewer ? r.reviewer.username : '?') + '</strong> <span>' + stars + '</span><p style="font-size:14px;color:var(--text-secondary)">' + escapeHTML(r.comment || '') + '</p><div style="font-size:10px;color:var(--text-muted)">' + getTimeAgo(new Date(r.created_at)) + '</div></div>';
    }
    container.innerHTML = html;
}

function showEditProfile() {
    if (!currentUser) return;
    var content = '<div class="form-group"><label class="form-label">Био</label><textarea id="editBio" class="form-textarea" placeholder="О себе" maxlength="200">' + (currentUser.bio || '') + '</textarea></div>' +
        '<div class="form-group"><label class="form-label">Telegram @username</label><input type="text" id="editTelegram" class="form-input" value="' + (currentUser.telegram || '') + '" placeholder="@username"></div>' +
        '<div class="form-group"><label class="form-label">Аватарка</label><div class="image-upload" id="avatarUpload" onclick="document.getElementById(\'avatarFile\').click()">' + (currentUser.avatar_url ? '<img src="' + currentUser.avatar_url + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">' : '<div class="image-upload-icon">📸</div><div class="image-upload-text">Нажмите для загрузки</div>') + '</div><input type="file" id="avatarFile" accept="image/*" style="display:none" onchange="window.previewAvatar(event)"></div>';
    
    openModal('Редактировать профиль', content, true, async function() {
        var bio = document.getElementById('editBio').value.trim();
        var telegram = document.getElementById('editTelegram').value.trim();
        
        var updateData = {};
        if (bio !== currentUser.bio) updateData.bio = bio;
        if (telegram !== currentUser.telegram) updateData.telegram = telegram;
        
        if (selectedAvatarFile) {
            var fileName = 'avatars/' + currentUser.id + '_' + Date.now();
            var { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, selectedAvatarFile);
            if (!uploadError) {
                var { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
                updateData.avatar_url = publicUrl;
            }
        }
        
        if (Object.keys(updateData).length > 0) {
            await supabase.from('users').update(updateData).eq('id', currentUser.id);
            if (updateData.bio !== undefined) currentUser.bio = updateData.bio;
            if (updateData.telegram !== undefined) currentUser.telegram = updateData.telegram;
            if (updateData.avatar_url) currentUser.avatar_url = updateData.avatar_url;
        }
        
        selectedAvatarFile = null;
        showToast('Профиль обновлён!', 'success');
        closeModal();
        renderScreen('profile');
    });
}

function previewAvatar(event) {
    var file = event.target.files[0];
    if (!file) return;
    selectedAvatarFile = file;
    var reader = new FileReader();
    reader.onload = function(e) {
        var upload = document.getElementById('avatarUpload');
        upload.innerHTML = '<img src="' + e.target.result + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">';
        upload.classList.add('has-image');
    };
    reader.readAsDataURL(file);
}

// ======================== БАЛАНС ========================
function renderBalanceScreen() {
    if (!currentUser) { renderScreen('auth'); return; }
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">Баланс</h1></div></header><div style="flex:1;overflow-y:auto">' +
        '<div class="balance-card"><div class="balance-label">ДОСТУПНО</div><div class="balance-amount">' + (currentUser.gems || 0) + ' 💎</div><div style="font-size:12px;color:var(--text-muted)">Заморожено: ' + (currentUser.frozen || 0) + ' 💎</div>' +
        '<div class="balance-actions"><button class="balance-btn deposit" onclick="window.showDepositModal()">💎 Пополнить</button><button class="balance-btn withdraw" onclick="window.showWithdrawModal()">💸 Вывести</button></div></div>' +
        '<div class="section-title">📊 История</div><div id="txList" style="padding:0 16px"><div class="spinner"></div></div></div></div>';
    document.getElementById('app').innerHTML = html;
    loadTransactions();
}

function showDepositModal() {
    var code = generateDepositCode();
    var content = '<div style="text-align:center"><p style="font-size:16px;margin-bottom:12px">Пополнение баланса</p><p style="font-size:14px;color:var(--text-secondary)">1 ⭐ = 1 💎</p>' +
        '<div style="background:var(--bg-input);border-radius:16px;padding:20px;margin:12px 0"><p style="font-size:12px;color:var(--text-muted)">1. Отправьте Telegram Stars:</p><p style="font-size:18px;font-weight:900;color:var(--accent)">' + ADMIN_USERNAME + '</p><p style="font-size:12px;color:var(--text-muted);margin-top:8px">2. В комментарии укажите код:</p><p style="font-size:20px;font-weight:900;color:var(--accent);letter-spacing:2px">' + code + '</p></div>' +
        '<p style="font-size:12px;color:var(--warning)">⏱ Обработка до 24 часов</p></div>';
    openModal('Пополнение', content, false, null);
    supabase.from('deposits').insert({ user_id: currentUser.id, code: code, status: 'pending' }).then(function() {});
}

function showWithdrawModal() {
    var content = '<div style="text-align:center"><p style="font-size:16px;margin-bottom:12px">Вывод Gems</p><p style="font-size:14px;color:var(--text-muted)">Доступно: ' + (currentUser.gems || 0) + ' 💎</p><p style="font-size:12px;color:var(--text-muted)">Минимум: ' + MIN_WITHDRAW + ' 💎</p>' +
        '<div class="form-group"><input type="number" id="withdrawAmount" class="form-input" placeholder="Сумма" min="' + MIN_WITHDRAW + '" max="' + (currentUser.gems || 0) + '"></div>' +
        '<div id="withdrawCalc" style="font-size:14px;color:var(--text-secondary);margin:8px 0"></div>' +
        '<p style="font-size:11px;color:var(--text-muted)">Комиссия: 5%</p><p style="font-size:11px;color:var(--text-muted)">Telegram: ' + (currentUser.telegram || 'не указан') + '</p><p style="font-size:12px;color:var(--warning);margin-top:8px">⏱ Обработка до 24 часов</p></div>';
    
    openModal('Вывод средств', content, true, async function() {
        var amount = parseInt(document.getElementById('withdrawAmount').value);
        if (!amount || amount < MIN_WITHDRAW) { showToast('Мин. сумма: ' + MIN_WITHDRAW + ' 💎', 'error'); return; }
        if (amount > (currentUser.gems || 0)) { showToast('Недостаточно средств', 'error'); return; }
        var commission = Math.floor(amount * WITHDRAW_COMMISSION);
        var toUser = amount - commission;
        await supabase.from('gems').update({ balance: (currentUser.gems || 0) - amount }).eq('user_id', currentUser.id);
        currentUser.gems -= amount;
        await supabase.from('withdrawals').insert({ user_id: currentUser.id, amount: amount, commission: commission, to_user: toUser, status: 'pending' });
        showToast('Заявка создана!', 'success');
        closeModal();
        renderScreen('balance');
    });
    
    setTimeout(function() {
        var input = document.getElementById('withdrawAmount');
        if (input) input.oninput = function() {
            var val = parseInt(this.value) || 0;
            var comm = Math.floor(val * WITHDRAW_COMMISSION);
            var calc = document.getElementById('withdrawCalc');
            if (calc) calc.innerHTML = 'Вы получите: <strong>' + (val - comm) + ' ⭐</strong> (комиссия: ' + comm + ' 💎)';
        };
    }, 100);
}

async function loadTransactions() {
    var { data: transactions } = await supabase.from('gem_transactions').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(30);
    var container = document.getElementById('txList');
    if (!container) return;
    if (!transactions || transactions.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет транзакций</div></div>'; return; }
    var html = '';
    for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        var iconClass = tx.type === 'deposit' || tx.type === 'sale' ? 'deposit' : 'withdraw';
        var amountClass = tx.type === 'deposit' || tx.type === 'sale' ? 'positive' : 'negative';
        var prefix = amountClass === 'positive' ? '+' : '-';
        html += '<div class="tx-item"><div class="tx-icon ' + iconClass + '">' + (amountClass === 'positive' ? '↓' : '↑') + '</div><div class="tx-info"><div class="tx-type">' + tx.reason + '</div><div class="tx-date">' + getTimeAgo(new Date(tx.created_at)) + '</div></div><div class="tx-amount ' + amountClass + '">' + prefix + tx.amount + ' 💎</div></div>';
    }
    container.innerHTML = html;
}

// ======================== СОЗДАНИЕ УСЛУГИ ========================
function renderCreateService() {
    if (!currentUser) { renderScreen('auth'); return; }
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">Создать услугу</h1></div></header><div style="flex:1;overflow-y:auto"><div class="create-service-form">' +
        '<div class="form-group"><label class="form-label">Название</label><input type="text" id="svcTitle" class="form-input" placeholder="Буст в Valorant до Diamond" maxlength="150"></div>' +
        '<div class="form-group"><label class="form-label">Категория</label><select id="svcCategory" class="form-select"></select></div>' +
        '<div class="form-group"><label class="form-label">Игра</label><select id="svcGame" class="form-select"></select></div>' +
        '<div class="form-group"><label class="form-label">Цена (Gems)</label><div style="display:flex;gap:8px"><input type="number" id="svcPrice" class="form-input" placeholder="100" min="1"><span style="font-weight:700;color:var(--accent);align-self:center">💎</span></div><p style="font-size:10px;color:var(--text-muted)">Вы получите 80% (комиссия 20%)</p></div>' +
        '<div class="form-group"><label class="form-label">Время выполнения</label><select id="svcDelivery" class="form-select"><option value="1 час">1 час</option><option value="3 часа">3 часа</option><option value="12 часов">12 часов</option><option value="24 часа">24 часа</option><option value="По договорённости">По договорённости</option></select></div>' +
        '<div class="form-group"><label class="form-label">Описание</label><textarea id="svcDesc" class="form-textarea" placeholder="Опишите услугу..."></textarea></div>' +
        '<div class="form-group"><label class="form-label">Обложка</label><div class="image-upload" id="serviceImageUpload" onclick="document.getElementById(\'svcImage\').click()"><div class="image-upload-icon">🖼️</div><div class="image-upload-text">Нажмите для загрузки</div></div><input type="file" id="svcImage" accept="image/*" style="display:none" onchange="window.previewServiceImage(event)"></div>' +
        '<button class="btn btn-primary btn-large" onclick="window.createService()">✅ Опубликовать</button></div></div></div>';
    document.getElementById('app').innerHTML = html;
    
    supabase.from('game_categories').select('*').then(function(r) {
        var sel = document.getElementById('svcCategory');
        if (sel && r.data) for (var i = 0; i < r.data.length; i++) sel.innerHTML += '<option value="' + r.data[i].slug + '">' + r.data[i].icon + ' ' + r.data[i].name + '</option>';
    });
    supabase.from('games').select('*').order('name').then(function(r) {
        var sel = document.getElementById('svcGame');
        if (sel && r.data) for (var i = 0; i < r.data.length; i++) sel.innerHTML += '<option value="' + r.data[i].id + '">' + r.data[i].name + '</option>';
    });
}

function previewServiceImage(event) {
    var file = event.target.files[0];
    if (!file) return;
    selectedMediaFile = file;
    var reader = new FileReader();
    reader.onload = function(e) {
        var upload = document.getElementById('serviceImageUpload');
        upload.innerHTML = '<img src="' + e.target.result + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">';
        upload.classList.add('has-image');
    };
    reader.readAsDataURL(file);
}

async function createService() {
    if (!currentUser) return;
    if (!currentUser.isSeller) {
        await supabase.from('sellers').insert({ user_id: currentUser.id, display_name: currentUser.username, rating: 0, reviews_count: 0, total_orders: 0, completed_orders: 0 });
        currentUser.isSeller = true;
        currentUser.sellerData = { rating: 0, reviews_count: 0, completed_orders: 0 };
        await supabase.from('users').update({ role: 'seller' }).eq('id', currentUser.id);
    }
    
    var title = document.getElementById('svcTitle').value.trim();
    var category = document.getElementById('svcCategory').value;
    var gameId = document.getElementById('svcGame').value;
    var price = parseInt(document.getElementById('svcPrice').value);
    var delivery = document.getElementById('svcDelivery').value;
    var desc = document.getElementById('svcDesc').value.trim();
    
    if (!title || !price) { showToast('Заполните название и цену', 'error'); return; }
    if (containsProfanity(title) || containsProfanity(desc)) { showToast('Запрещённые слова', 'error'); return; }
    
    var gameName = '';
    if (gameId) {
        var { data: game } = await supabase.from('games').select('name').eq('id', gameId).single();
        if (game) gameName = game.name;
    }
    
    var imageUrl = null;
    if (selectedMediaFile) {
        var fileName = 'services/' + currentUser.id + '/' + Date.now() + '_' + selectedMediaFile.name;
        var { error: uploadError } = await supabase.storage.from('images').upload(fileName, selectedMediaFile);
        if (!uploadError) {
            var { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName);
            imageUrl = publicUrl;
        }
    }
    
    var { error } = await supabase.from('gaming_services').insert({
        seller_id: currentUser.id, title: filterContent(title), description: filterContent(desc),
        price: price, category: category, game_id: gameId || null, game_name: gameName,
        image_url: imageUrl, delivery_time: delivery
    });
    
    if (error) { showToast('Ошибка создания', 'error'); return; }
    
    // Обновляем счётчик услуг в игре
    if (gameId) await supabase.from('games').update({ services_count: supabase.raw('services_count + 1') }).eq('id', gameId);
    
    showToast('Услуга опубликована!', 'success');
    selectedMediaFile = null;
    renderScreen('main');
}

// ======================== АДМИН-ПАНЕЛЬ ========================
function renderAdminScreen() {
    if (!isAdmin) { showToast('Нет доступа', 'error'); renderScreen('main'); return; }
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'main\')">←</button><h1 class="topbar-title">Админ-панель</h1></div></header><div style="flex:1;overflow-y:auto">' +
        '<div class="tabs"><button class="tab active" onclick="window.switchAdminTab(\'deposits\')">Пополнения</button><button class="tab" onclick="window.switchAdminTab(\'withdrawals\')">Выводы</button><button class="tab" onclick="window.switchAdminTab(\'disputes\')">Споры</button></div>' +
        '<div id="adminContent" style="padding:16px"><div class="spinner"></div></div></div></div>';
    document.getElementById('app').innerHTML = html;
    loadAdminDeposits();
}

function switchAdminTab(tab) {
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'deposits') { tabs[0].classList.add('active'); loadAdminDeposits(); }
    else if (tab === 'withdrawals') { tabs[1].classList.add('active'); loadAdminWithdrawals(); }
    else { tabs[2].classList.add('active'); loadAdminDisputes(); }
}

async function loadAdminDeposits() {
    var { data: deposits } = await supabase.from('deposits').select('*, user:user_id (username, handle)').order('created_at', { ascending: false }).limit(50);
    var container = document.getElementById('adminContent');
    if (!container) return;
    if (!deposits || deposits.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет заявок</div></div>'; return; }
    var html = '<h3>Заявки на пополнение</h3>';
    for (var i = 0; i < deposits.length; i++) {
        var d = deposits[i];
        html += '<div style="padding:10px;background:var(--bg-card);border-radius:12px;margin-bottom:8px"><div style="display:flex;justify-content:space-between"><strong>@' + (d.user ? d.user.handle : '?') + '</strong><span style="font-size:11px">' + getTimeAgo(new Date(d.created_at)) + '</span></div><div style="font-size:11px;color:var(--text-muted)">Код: ' + (d.code || '—') + '</div>' +
            '<div style="display:flex;gap:8px;margin-top:8px;align-items:center"><input type="number" id="depAmount_' + d.id + '" placeholder="Сумма ⭐" style="width:80px;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">' +
            '<button class="btn btn-small btn-success" onclick="window.confirmDeposit(\'' + d.id + '\', \'' + d.user_id + '\')">✓</button><button class="btn btn-small btn-danger" onclick="window.rejectDeposit(\'' + d.id + '\')">✕</button></div></div>';
    }
    container.innerHTML = html;
}

async function confirmDeposit(depositId, userId) {
    var amountInput = document.getElementById('depAmount_' + depositId);
    var amount = parseInt(amountInput ? amountInput.value : 0);
    if (!amount || amount <= 0) { showToast('Введите сумму', 'error'); return; }
    var { data: userGems } = await supabase.from('gems').select('*').eq('user_id', userId).single();
    await supabase.from('gems').update({ balance: (userGems.balance || 0) + amount, total_earned: (userGems.total_earned || 0) + amount }).eq('user_id', userId);
    await supabase.from('deposits').update({ status: 'completed', amount: amount }).eq('id', depositId);
    await supabase.from('gem_transactions').insert({ user_id: userId, amount: amount, type: 'deposit', reason: 'Пополнение' });
    await supabase.from('notifications').insert({ user_id: userId, type: 'deposit', title: 'Баланс пополнен!', message: 'Зачислено ' + amount + ' 💎' });
    showToast('Подтверждено!', 'success');
    loadAdminDeposits();
}

async function rejectDeposit(depositId) {
    await supabase.from('deposits').update({ status: 'rejected' }).eq('id', depositId);
    showToast('Отклонено', 'info');
    loadAdminDeposits();
}

async function loadAdminWithdrawals() {
    var { data: withdrawals } = await supabase.from('withdrawals').select('*, user:user_id (username, handle, telegram)').order('created_at', { ascending: false }).limit(50);
    var container = document.getElementById('adminContent');
    if (!container) return;
    if (!withdrawals || withdrawals.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет заявок</div></div>'; return; }
    var html = '<h3>Заявки на вывод</h3>';
    for (var i = 0; i < withdrawals.length; i++) {
        var w = withdrawals[i];
        html += '<div style="padding:10px;background:var(--bg-card);border-radius:12px;margin-bottom:8px"><strong>@' + (w.user ? w.user.handle : '?') + '</strong><br><span style="font-size:11px">Сумма: ' + w.amount + ' 💎 → Получит: ' + w.to_user + ' ⭐</span><br><span style="font-size:11px;color:var(--text-muted)">Telegram: ' + (w.user ? w.user.telegram : '?') + '</span>' +
            '<div style="margin-top:8px"><button class="btn btn-small btn-success" onclick="window.confirmWithdrawal(\'' + w.id + '\')">✅ Отправлено</button><button class="btn btn-small btn-danger" onclick="window.rejectWithdrawal(\'' + w.id + '\', \'' + w.user_id + '\', ' + w.amount + ')">❌ Отклонить</button></div></div>';
    }
    container.innerHTML = html;
}

async function confirmWithdrawal(withdrawalId) {
    await supabase.from('withdrawals').update({ status: 'completed' }).eq('id', withdrawalId);
    showToast('Подтверждено!', 'success');
    loadAdminWithdrawals();
}

async function rejectWithdrawal(withdrawalId, userId, amount) {
    var { data: userGems } = await supabase.from('gems').select('*').eq('user_id', userId).single();
    await supabase.from('gems').update({ balance: (userGems.balance || 0) + amount }).eq('user_id', userId);
    await supabase.from('withdrawals').update({ status: 'rejected' }).eq('id', withdrawalId);
    showToast('Отклонено. Gems возвращены.', 'info');
    loadAdminWithdrawals();
}

async function loadAdminDisputes() {
    var { data: disputes } = await supabase.from('disputes').select('*, order:order_id (*, buyer:buyer_id (username), seller:seller_id (username)), raised_by_user:raised_by (username)').order('created_at', { ascending: false });
    var container = document.getElementById('adminContent');
    if (!container) return;
    if (!disputes || disputes.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-text">Нет споров</div></div>'; return; }
    var html = '<h3>Споры</h3>';
    for (var i = 0; i < disputes.length; i++) {
        var d = disputes[i];
        html += '<div style="padding:10px;background:var(--bg-card);border-radius:12px;margin-bottom:8px"><strong>Заказ #' + d.order_id + '</strong><br><span style="font-size:12px">От: @' + (d.raised_by_user ? d.raised_by_user.username : '?') + '</span><br><span style="font-size:12px">Причина: ' + escapeHTML(d.reason) + '</span>' +
            '<div style="margin-top:8px"><button class="btn btn-small btn-success" onclick="window.resolveDispute(\'' + d.id + '\', \'buyer\')">Вернуть покупателю</button><button class="btn btn-small btn-primary" onclick="window.resolveDispute(\'' + d.id + '\', \'seller\')">Продавцу</button></div></div>';
    }
    container.innerHTML = html;
}

async function resolveDispute(disputeId, side) {
    var { data: dispute } = await supabase.from('disputes').select('*').eq('id', disputeId).single();
    if (!dispute) return;
    var { data: order } = await supabase.from('service_orders').select('*').eq('id', dispute.order_id).single();
    if (!order) return;
    
    if (side === 'buyer') {
        var { data: buyerGems } = await supabase.from('gems').select('*').eq('user_id', order.buyer_id).single();
        await supabase.from('gems').update({ balance: (buyerGems.balance || 0) + order.amount, frozen: Math.max((buyerGems.frozen || 0) - order.amount, 0) }).eq('user_id', order.buyer_id);
        await supabase.from('service_orders').update({ status: 'cancelled' }).eq('id', order.id);
    } else {
        var { data: sellerGems } = await supabase.from('gems').select('*').eq('user_id', order.seller_id).single();
        await supabase.from('gems').update({ balance: (sellerGems.balance || 0) + order.seller_gets }).eq('user_id', order.seller_id);
        await supabase.from('service_orders').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', order.id);
    }
    
    await supabase.from('disputes').update({ status: 'resolved', resolved_by: currentUser.id, resolution: side, resolved_at: new Date().toISOString() }).eq('id', disputeId);
    showToast('Спор разрешён', 'success');
    loadAdminDisputes();
}

// ======================== ПРАВИЛА И ПРИВАТНОСТЬ ========================
function renderRulesScreen() {
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'auth\')">←</button><h1 class="topbar-title">Правила</h1></div></header><div style="flex:1;overflow-y:auto"><div class="legal-page">' +
        '<h1>Условия использования</h1><p style="font-size:10px;color:var(--text-muted)">Обновлено: 26.07.2026</p>' +
        '<h2>1. Общие положения</h2><p>NobuSumer — платформа для заказа игровых услуг. Платформа является посредником.</p>' +
        '<h2>2. Возраст</h2><p>Минимум ' + MIN_AGE + ' лет. Администрация не проверяет возраст и не несёт ответственности за ложные данные.</p>' +
        '<h2>3. Сделки</h2><p>Все переговоры только через чат платформы. Сделки за пределами NobuSumer запрещены — блокировка.</p>' +
        '<h2>4. Комиссии</h2><p>20% с заказа + 5% с вывода. Буст: ' + BOOST_PRICE + ' ⭐ (от ' + MIN_REVIEWS_FOR_BOOST + ' отзывов).</p>' +
        '<h2>5. Ответственность</h2><p>Платформа не отвечает за качество услуг и блокировку аккаунтов в играх. Споры решает администрация.</p>' +
        '</div></div></div>';
    document.getElementById('app').innerHTML = html;
}

function renderPrivacyScreen() {
    var html = '<div class="app" style="min-height:100vh;display:flex;flex-direction:column;"><header class="topbar"><div class="topbar-content"><button class="btn-icon" onclick="window.renderScreen(\'auth\')">←</button><h1 class="topbar-title">Конфиденциальность</h1></div></header><div style="flex:1;overflow-y:auto"><div class="legal-page">' +
        '<h1>Политика конфиденциальности</h1><p style="font-size:10px;color:var(--text-muted)">Обновлено: 26.07.2026</p>' +
        '<h2>1. Сбор данных</h2><p>Email, имя, handle, Telegram, хешированный пароль (SHA-256 + соль).</p>' +
        '<h2>2. Использование</h2><p>Только для работы платформы. Данные не передаются третьим лицам.</p>' +
        '<h2>3. Защита</h2><p>Пароли хешированы. Данные передаются по HTTPS.</p>' +
        '<h2>4. Права</h2><p>Вы можете запросить удаление аккаунта — все данные удаляются безвозвратно.</p>' +
        '</div></div></div>';
    document.getElementById('app').innerHTML = html;
}

// ======================== ЗАПУСК ========================
renderScreen('loading');