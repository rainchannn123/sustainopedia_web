// welcome.js — minimal interactivity for Sustainopedia welcome page

document.addEventListener('DOMContentLoaded', () => {
    // Smooth scroll for nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    });

    // Optionally, highlight nav on scroll (simple version)
    const sections = ['about', 'features', 'how', 'contact'];
    const navLinks = Array.from(document.querySelectorAll('.nav-link'));
    window.addEventListener('scroll', () => {
        let found = false;
        for (let i = sections.length - 1; i >= 0; i--) {
            const sec = document.getElementById(sections[i]);
            if (sec && window.scrollY + 80 >= sec.offsetTop) {
                navLinks.forEach(l => l.classList.remove('active'));
                if (navLinks[i]) navLinks[i].classList.add('active');
                found = true;
                break;
            }
        }
        if (!found) navLinks.forEach(l => l.classList.remove('active'));
    });
});
