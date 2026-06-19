document.getElementById('closeWelcome').addEventListener('click', (e) => {
  e.preventDefault();
  try {
    chrome.tabs.getCurrent((tab) => {
      if (tab) {
        chrome.tabs.remove(tab.id);
      } else {
        window.close();
      }
    });
  } catch (err) {
    window.close();
  }
  setTimeout(() => { location.href = 'about:blank'; }, 200);
});
