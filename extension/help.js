// Scroll spy
const sections = document.querySelectorAll('.section[id]');
const tocLinks = document.querySelectorAll('.sidebar-nav a');

function updateActiveLink() {
  let current = '';
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= 80) current = section.id;
  }
  tocLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === '#' + current);
  });
}

window.addEventListener('scroll', updateActiveLink, { passive: true });
updateActiveLink();
