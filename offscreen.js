// Escuta por mensagens do service worker (background.js)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'play_sound') {
    const audio = document.getElementById('audio');
    audio.src = msg.url;
    // Define o volume recebido na mensagem
    audio.volume = msg.volume !== undefined ? msg.volume : 1.0;
    audio.play().catch(error => console.error("Erro ao tocar áudio:", error));
  }
});
