document.addEventListener('DOMContentLoaded', () => {    
    // Load Lottie animation
    const animationContainer = document.getElementById('lottie-animation');

    lottie.loadAnimation({
        container: animationContainer, // The container element
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/animations/404.json' // Path to your Lottie JSON file
    });
});