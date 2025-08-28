// content.js (versão com 2 botões para lembretes)

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

setInterval(syncNotificationStateWithBackground, 2000);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        syncNotificationStateWithBackground();
    }
});
syncNotificationStateWithBackground();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (window.self !== window.top) return;
  if (request.type === 'show_sgd_notification') {
    createNotificationDiv(request.notification);
  } else if (request.type === 'dismiss_sgd_notification') {
    removeNotificationDiv();
  }
});

function createNotificationDiv(notification) {
  const { id: notificationId, message, type: notificationType, prioridade } = notification;

  const oldDiv = document.getElementById('sgd-notification-div');
  if (oldDiv) oldDiv.remove();

  const div = document.createElement('div');
  div.id = 'sgd-notification-div';
  div.dataset.notificationId = notificationId;
  if (prioridade) {
    div.classList.add(`prio-${prioridade}`);
  }

  const text = document.createElement('p');
  text.innerText = message;
  div.appendChild(text);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'sgd-button-container';

  // AJUSTE: Lógica de criação de botões simplificada
  if (notificationType === 'lembrete') {
    const btnConcluir = document.createElement('button');
    btnConcluir.innerText = 'Concluir';
    btnConcluir.className = 'sgd-notification-button';
    btnConcluir.onclick = () => {
      chrome.runtime.sendMessage({ type: 'notification_action', notificationId, buttonIndex: 0 }); // Concluir é 0
    };

    const btnSnooze = document.createElement('button');
    btnSnooze.innerText = 'Notificar em 5 min';
    btnSnooze.className = 'sgd-notification-button sgd-secondary';
    btnSnooze.onclick = () => {
      chrome.runtime.sendMessage({ type: 'notification_action', notificationId, buttonIndex: 1 }); // Snooze é 1
    };

    buttonContainer.appendChild(btnConcluir);
    buttonContainer.appendChild(btnSnooze);

  } else { // Para 'pico' ou outros tipos
    const btnFechar = document.createElement('button');
    btnFechar.innerText = 'Fechar';
    btnFechar.className = 'sgd-notification-button';
    btnFechar.onclick = () => {
      chrome.runtime.sendMessage({ type: 'notification_action', notificationId, buttonIndex: 0 });
    };

    const btnSnooze = document.createElement('button');
    btnSnooze.innerText = 'Notificar em 5 min';
    btnSnooze.className = 'sgd-notification-button sgd-secondary';
    btnSnooze.onclick = () => {
      chrome.runtime.sendMessage({ type: 'notification_action', notificationId, buttonIndex: 1 });
    };

    buttonContainer.appendChild(btnFechar);
    buttonContainer.appendChild(btnSnooze);
  }
  
  div.appendChild(buttonContainer);
  document.body.appendChild(div);
}

function removeNotificationDiv() {
    const div = document.getElementById('sgd-notification-div');
    if (div) {
        div.remove();
    }
}