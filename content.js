// Este script garante que a notificação visual na página
// esteja sempre sincronizada com o estado real da extensão,
// mesmo em sites complexos e dinâmicos como YouTube ou WhatsApp.

// ------------------- Lógica Principal -------------------

/**
 * Função central que pergunta ao background qual é o estado atual
 * e atualiza a página de acordo. É a "fonte da verdade".
 */
function syncNotificationStateWithBackground() {
    // Se a extensão foi desativada ou está sendo atualizada, não faz nada.
    if (!chrome.runtime?.id) return;

    chrome.runtime.sendMessage({ type: 'query_active_notification' }, (response) => {
        if (chrome.runtime.lastError) {
            // Ignora erros que podem ocorrer se o background script estiver temporariamente
            // indisponível (ex: ao acordar do modo de inatividade). A próxima verificação resolverá.
            return;
        }

        const div = document.getElementById('sgd-notification-div');

        if (response) {
            // O background informa que uma notificação DEVE estar ativa.
            // Se a div não existe, ou se a div existente é de uma notificação antiga,
            // então (re)criamos a div com os dados corretos.
            if (!div || div.dataset.notificationId !== response.id) {
                createNotificationDiv(response);
            }
        } else {
            // O background informa que NENHUMA notificação está ativa.
            // Se a div ainda existe na página, nós a removemos.
            if (div) {
                removeNotificationDiv();
            }
        }
    });
}


// ------------------- Gatilhos de Sincronização -------------------

// 1. **VIGIA PRINCIPAL (Fallback Robusto):**
// A cada 2 segundos, garante que a div esteja no estado correto.
// Isto é crucial para sites que manipulam o conteúdo dinamicamente (SPAs).
setInterval(syncNotificationStateWithBackground, 2000);

// 2. **VISIBILIDADE DA ABA:**
// Sincroniza imediatamente quando o usuário troca para esta aba.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        syncNotificationStateWithBackground();
    }
});

// 3. **CARREGAMENTO INICIAL:**
// Sincroniza assim que o script é injetado na página.
syncNotificationStateWithBackground();

// 4. **COMANDOS DIRETOS DO BACKGROUND:**
// Ouve por comandos diretos para uma resposta mais rápida.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (window.self !== window.top) return; // Ignora iframes

  if (request.type === 'show_sgd_notification') {
    createNotificationDiv(request.notification);
  } else if (request.type === 'dismiss_sgd_notification') {
    removeNotificationDiv();
  }
});


// ------------------- Funções de Manipulação do DOM -------------------

/**
 * Cria (ou recria) a div de notificação na página.
 * @param {object} notification - O objeto de notificação vindo do background.
 */
function createNotificationDiv(notification) {
  const { id: notificationId, message, type: notificationType } = notification;

  // Garante que não haja duplicatas.
  const oldDiv = document.getElementById('sgd-notification-div');
  if (oldDiv) oldDiv.remove();

  const div = document.createElement('div');
  div.id = 'sgd-notification-div';
  // Armazena o ID na div para verificar se ela está atualizada.
  div.dataset.notificationId = notificationId;

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
  
  // **A CORREÇÃO ESTÁ AQUI:**
  // Adiciona os botões ao container de botões.
  buttonContainer.appendChild(primaryButton);
  buttonContainer.appendChild(secondaryButton);
  
  // Adiciona o container de botões à div principal.
  div.appendChild(buttonContainer);
  
  document.body.appendChild(div);
}

/**
 * Remove a div de notificação da página.
 */
function removeNotificationDiv() {
    const div = document.getElementById('sgd-notification-div');
    if (div) {
        div.remove();
    }
}