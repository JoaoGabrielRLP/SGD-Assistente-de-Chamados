// Este script garante que a notificação visual na página
// esteja sempre sincronizada com o estado real da extensão.

// ------------------- Lógica Principal -------------------
function syncNotificationStateWithBackground() {
    if (!chrome.runtime?.id) return;

    chrome.runtime.sendMessage({ type: 'query_active_notification' }, (response) => {
        if (chrome.runtime.lastError) { return; }

        const div = document.getElementById('sgd-notification-div');
        if (response) {
            if (!div || div.dataset.notificationId !== response.id) {
                createNotificationDiv(response);
            }
        } else if (div) {
            removeNotificationDiv();
        }
    });
}

// ------------------- Gatilhos de Sincronização -------------------
setInterval(syncNotificationStateWithBackground, 2000);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        syncNotificationStateWithBackground();
    }
});
syncNotificationStateWithBackground();

// ------------------- Listener de Comandos -------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (window.self !== window.top) return;

  if (request.type === 'show_sgd_notification') {
    createNotificationDiv(request.notification);
  } else if (request.type === 'dismiss_sgd_notification') {
    removeNotificationDiv();
  }
});

// ------------------- Funções de Manipulação do DOM -------------------
function createNotificationDiv(notification) {
  const { id: notificationId, message, type: notificationType, prioridade } = notification;

  const oldDiv = document.getElementById('sgd-notification-div');
  if (oldDiv) oldDiv.remove();

  const div = document.createElement('div');
  div.id = 'sgd-notification-div';
  div.dataset.notificationId = notificationId;
  // **MELHORIA:** Adiciona a classe de prioridade para a cor da borda.
  if (prioridade) {
    div.classList.add(`prio-${prioridade}`);
  }

  const text = document.createElement('p');
  text.innerText = message;

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'sgd-button-container';

  const primaryButton = document.createElement('button');
  const secondaryButton = document.createElement('button');
  
  const buttons = notificationType === 'lembrete'
    ? ['Desativar por hoje', 'Notificar em 5 min']
    : ['Fechar', 'Notificar em 5 min'];
  primaryButton.innerText = buttons[0];
  secondaryButton.innerText = buttons[1];

  primaryButton.className = 'sgd-notification-button';
  secondaryButton.className = 'sgd-notification-button sgd-secondary';
  
  primaryButton.onclick = () => {
    chrome.runtime.sendMessage({ type: 'notification_action', notificationId, buttonIndex: 0 });
  };
  secondaryButton.onclick = () => {
    chrome.runtime.sendMessage({ type: 'notification_action', notificationId, buttonIndex: 1 });
  };
  
  div.appendChild(text);
  buttonContainer.appendChild(primaryButton);
  buttonContainer.appendChild(secondaryButton);
  div.appendChild(buttonContainer);
  
  document.body.appendChild(div);
}

function removeNotificationDiv() {
    const div = document.getElementById('sgd-notification-div');
    if (div) {
        div.remove();
    }
}