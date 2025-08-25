// --- Constantes e Inicialização ---
const PEAK_START_TIME = "13:30";
const PEAK_END_TIME = "15:00";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extensão SGD Notifier instalada/atualizada.");
  chrome.alarms.create("verificarNotificacoes", { delayInMinutes: 1, periodInMinutes: 1 });
  updateHolidays();
});

// --- Listeners de Eventos do Navegador ---
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "verificarNotificacoes") {
    verificarHorarios();
  } else if (alarm.name.startsWith("reschedule_")) {
    const notificationData = JSON.parse(alarm.name.substring(11));
    exibirNotificacao(notificationData.message, notificationData.type, notificationData.reminderIndex);
  }
});

// **CORREÇÃO:** Listener para quando o usuário troca de aba.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const { activeSgdNotification } = await chrome.storage.session.get('activeSgdNotification');
    // Se houver uma notificação ativa, mostra a div na nova aba.
    if (activeSgdNotification) {
        showDivInTab(activeInfo.tabId, activeSgdNotification);
    }
});

// --- Comunicação com Content Scripts ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'get_peak_days') {
    getPeakDays(request.year, request.month).then(days => sendResponse(days.map(d => d.getDate())));
    return true;
  } else if (request.type === 'notification_action') {
    // Ação unificada para botões (da div ou da notificação nativa).
    handleNotificationAction(request.notificationId, request.buttonIndex);
  } else if (request.type === 'query_active_notification') {
    // O content script pergunta se há uma notificação ativa.
    chrome.storage.session.get('activeSgdNotification').then(({ activeSgdNotification }) => {
        if (activeSgdNotification) {
            sendResponse(activeSgdNotification);
        }
    });
    return true;
  }
});

// --- Lógica de Feriados (Inalterada) ---
async function updateHolidays() {
  const currentYear = new Date().getFullYear();
  const yearsToFetch = Array.from({ length: 5 }, (_, i) => currentYear + i);
  let allHolidays = {};
  for (const year of yearsToFetch) {
    try {
      const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      if (response.ok) {
        const holidays = await response.json();
        allHolidays[year] = holidays.map(h => h.date);
      }
    } catch (error) { console.error(`Erro ao buscar feriados para ${year}:`, error); }
  }
  chrome.storage.local.set({ holidays: allHolidays });
}
async function isBusinessDay(date, holidaysByYear) {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const year = date.getFullYear();
  const dateString = date.toISOString().split('T')[0];
  return !(holidaysByYear[year] && holidaysByYear[year].includes(dateString));
}
async function getPeakDays(year, month) {
  let { holidays } = await chrome.storage.local.get('holidays');
  if (!holidays || !holidays[year]) {
    await updateHolidays();
    const storage = await chrome.storage.local.get('holidays');
    holidays = storage.holidays;
  }
  const first5 = [];
  let currentDate = new Date(year, month, 1);
  while (first5.length < 5 && currentDate.getMonth() === month) {
    if (await isBusinessDay(currentDate, holidays)) { first5.push(new Date(currentDate)); }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  const last5 = [];
  currentDate = new Date(year, month + 1, 0);
  while (last5.length < 5 && currentDate.getMonth() === month) {
    if (await isBusinessDay(currentDate, holidays)) { last5.unshift(new Date(currentDate)); }
    currentDate.setDate(currentDate.getDate() - 1);
  }
  return [...first5, ...last5];
}


// --- Lógica Central de Notificação (Refatorada) ---
async function exibirNotificacao(message, type, reminderIndex = null) {
  // **CORREÇÃO:** Verifica se já existe uma notificação ativa para evitar duplicatas.
  const { activeSgdNotification } = await chrome.storage.session.get('activeSgdNotification');
  if (activeSgdNotification) return;

  const notificationId = `sgd_notification_${Date.now()}`;
  const notificationData = { id: notificationId, message, type, reminderIndex };

  await chrome.storage.session.set({ activeSgdNotification: notificationData });
  
  playSound();
  
  const buttons = type === 'lembrete'
    ? [{ title: 'Desativar por hoje' }, { title: 'Notificar em 5 min' }]
    : [{ title: 'Fechar' }, { title: 'Notificar em 5 min' }];

  chrome.notifications.create(notificationId, {
    type: 'basic', iconUrl: 'icon128.png', title: 'Alerta SGD',
    message: message, priority: 2, buttons: buttons, requireInteraction: true
  });

  const alarmName = `reschedule_${JSON.stringify({ message, type, reminderIndex })}`;
  chrome.alarms.create(alarmName, { delayInMinutes: 5 });

  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    showDivInTab(tab.id, notificationData);
  }
}

async function showDivInTab(tabId, notificationData) {
    try {
        await chrome.tabs.sendMessage(tabId, {
            type: 'show_sgd_notification',
            notification: notificationData
        });
    } catch (error) {
        // Ignora erros (ex: content script não injetado ainda).
    }
}

async function handleNotificationAction(notificationId, buttonIndex) {
  const { activeSgdNotification } = await chrome.storage.session.get('activeSgdNotification');
  if (!activeSgdNotification || activeSgdNotification.id !== notificationId) return;

  const { message, type, reminderIndex } = activeSgdNotification;
  const alarmName = `reschedule_${JSON.stringify({ message, type, reminderIndex })}`;
  chrome.alarms.clear(alarmName);

  if (buttonIndex === 0) { // Botão "Desativar por hoje" ou "Fechar"
    if (type === 'lembrete' && reminderIndex !== null) {
      const { lembretes } = await chrome.storage.local.get('lembretes');
      let lista = lembretes || [];
      if (lista[reminderIndex]) {
        lista.splice(reminderIndex, 1);
        await chrome.storage.local.set({ lembretes: lista });
      }
    }
  } else if (buttonIndex === 1) { // Botão "Notificar em 5 min"
    chrome.alarms.create(alarmName, { delayInMinutes: 5 });
  }

  await dismissAllNotifications(notificationId);
}

async function dismissAllNotifications(notificationId) {
    await chrome.storage.session.remove('activeSgdNotification');
    chrome.notifications.clear(notificationId);
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'dismiss_sgd_notification' }).catch(() => {});
    }
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    handleNotificationAction(notificationId, buttonIndex);
});
chrome.notifications.onClosed.addListener((notificationId, byUser) => {
    if (byUser) {
        handleNotificationAction(notificationId, -1); // -1 indica que foi fechada sem clicar em botão.
    }
});


// --- Verificador Principal (Inalterado) ---
async function verificarHorarios() {
  const agora = new Date();
  const hojeString = agora.toISOString().split('T')[0];
  const horaAtual = agora.toTimeString().substring(0, 5);
  
  // Verifica Lembretes
  const { lembretes } = await chrome.storage.local.get('lembretes');
  if (lembretes) {
    const dataAtualFmt = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    lembretes.forEach((item, index) => {
      if (item.data === dataAtualFmt && item.hora === horaAtual) {
        exibirNotificacao(item.mensagem || "Lembrete diário do SGD", 'lembrete', index);
      }
    });
  }
  
  // Verifica Horário de Pico
  const peakDays = await getPeakDays(agora.getFullYear(), agora.getMonth());
  const isPeakDay = peakDays.some(d => d.toISOString().split('T')[0] === hojeString);
  if (isPeakDay) {
    let { peakNotificationStatus } = await chrome.storage.local.get('peakNotificationStatus');
    if (!peakNotificationStatus || peakNotificationStatus.date !== hojeString) {
      peakNotificationStatus = { date: hojeString, notifiedStart: false, notifiedEnd: false };
    }
    if (horaAtual === PEAK_START_TIME && !peakNotificationStatus.notifiedStart) {
      exibirNotificacao("Horário de pico iniciado!", 'pico');
      peakNotificationStatus.notifiedStart = true;
      chrome.storage.local.set({ peakNotificationStatus });
    }
    if (horaAtual === PEAK_END_TIME && !peakNotificationStatus.notifiedEnd) {
      exibirNotificacao("Horário de pico finalizado.", 'pico');
      peakNotificationStatus.notifiedEnd = true;
      chrome.storage.local.set({ peakNotificationStatus });
    }
  }
}

// --- Funções de Suporte (Som) ---
async function playSound() {
  const { notificationSound, notificationVolume } = await chrome.storage.local.get(['notificationSound', 'notificationVolume']);
  const soundUrl = notificationSound || chrome.runtime.getURL("alert.mp3");
  const volume = notificationVolume !== undefined ? parseFloat(notificationVolume) : 1.0;
  if (await chrome.offscreen.hasDocument()) {
    chrome.runtime.sendMessage({ type: 'play_sound', url: soundUrl, volume: volume });
    return;
  }
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Tocar som de notificação',
  });
  chrome.runtime.sendMessage({ type: 'play_sound', url: soundUrl, volume: volume });
}