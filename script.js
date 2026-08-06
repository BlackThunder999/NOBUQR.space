document.addEventListener('DOMContentLoaded', function() {
    // Обратный отсчёт (7 дней)
    var launchDate = new Date();
    launchDate.setDate(launchDate.getDate() + 7);
    
    function updateCountdown() {
        var now = new Date();
        var diff = launchDate - now;
        
        if (diff <= 0) {
            document.getElementById('countdown').textContent = 'Запуск: уже скоро!';
            return;
        }
        
        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        document.getElementById('countdown').textContent = 
            'Запуск через: ' + days + ' дн ' + hours + ' ч ' + minutes + ' мин';
    }
    
    updateCountdown();
    setInterval(updateCountdown, 60000);
    
    // Анимация появления фич
    setTimeout(function() {
        var features = document.querySelectorAll('.feature');
        features.forEach(function(el, index) {
            setTimeout(function() {
                el.classList.add('visible');
            }, index * 200);
        });
    }, 500);
});