// --- Constantes e Inicialização ---
const PEAK_START_TIME = "13:30";
const PEAK_END_TIME = "15:00";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extensão SGD Notifier instalada/atualizada.");
  chrome.alarms.create("verificarNotificacoes", { delayInMinutes: 1, periodInMinutes: 1 });
  updateHolidays();
});

// --- Listeners de Alarmes e Mensagens ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "verificarNotificacoes") {
    verificarHorarios();
  } else if (alarm.name.startsWith("reschedule_")) {
    const notificationData = JSON.parse(alarm.name.substring(11));

    if (notificationData.type === 'lembrete' && notificationData.reminderId) {
        const { lembretes = [] } = await chrome.storage.local.get('lembretes');
        const reminderExists = lembretes.some(lembrete => lembrete.id === notificationData.reminderId);
        if (!reminderExists) {
            console.log(`Lembrete ${notificationData.reminderId} foi excluído. A re-notificação foi cancelada.`);
            return; 
        }
    }

    if (notificationData.type === 'pico') {
        const hojeString = new Date().toISOString().split('T')[0];
        const { peakNotificationStatus } = await chrome.storage.local.get('peakNotificationStatus');
        if (peakNotificationStatus && peakNotificationStatus.date === hojeString) {
            if (notificationData.message.includes("iniciado") && peakNotificationStatus.notifiedStart) {
                console.log("Re-notificação de início de pico cancelada (já notificado).");
                return;
            }
            if (notificationData.message.includes("finalizado") && peakNotificationStatus.notifiedEnd) {
                console.log("Re-notificação de fim de pico cancelada (já notificado).");
                return;
            }
        }
    }

    exibirNotificacao(notificationData.message, notificationData.type, notificationData.reminderId, notificationData.prioridade);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'get_events_for_month') {
    getScheduledEvents(request.year, request.month).then(sendResponse);
    return true;
  } else if (request.type === 'notification_action') {
    handleNotificationAction(request.notificationId, request.buttonIndex);
  } else if (request.type === 'query_active_notification') {
    chrome.storage.session.get('activeSgdNotification').then(({ activeSgdNotification }) => {
        if (activeSgdNotification) {
            sendResponse(activeSgdNotification);
        }
    });
    return true;
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const { activeSgdNotification } = await chrome.storage.session.get('activeSgdNotification');
    if (activeSgdNotification) {
        showDivInTab(activeInfo.tabId, activeSgdNotification);
    }
});


// --- Lógica de Cálculo de Eventos ---
async function getScheduledEvents(year, month) {
    const { lembretes = [] } = await chrome.storage.local.get('lembretes');
    const peakDays = await getPeakDays(year, month);
    const eventsByDay = {};

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    for (const peakDay of peakDays) {
        const day = peakDay.getDate();
        if (!eventsByDay[day]) eventsByDay[day] = [];
        eventsByDay[day].push({
            id: `pico-${year}-${month}-${day}`,
            mensagem: "Horário de Pico",
            hora: "13:30 - 15:00",
            prioridade: "urgente",
            type: 'pico'
        });
    }

    for (const lembrete of lembretes) {
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            if (isOcurringOn(d, lembrete)) {
                const day = d.getDate();
                if (!eventsByDay[day]) eventsByDay[day] = [];
                eventsByDay[day].push({ ...lembrete, type: 'lembrete' });
            }
        }
    }
    return eventsByDay;
}

function isOcurringOn(date, lembrete) {
    const startDate = new Date(lembrete.startDate + 'T00:00:00');
    if (date < startDate) return false;

    const diffTime = Math.abs(date - startDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    switch (lembrete.frequencia) {
        case 'hoje':
            return diffDays === 0;
        case 'diariamente':
            return true;
        case 'semanalmente':
            return date.getDay() === startDate.getDay();
        case 'quinzenalmente':
            return diffDays % 14 === 0;
        case 'mensalmente':
            return date.getDate() === startDate.getDate();
        default:
            return false;
    }
}

// --- Verificador Principal ---
async function verificarHorarios() {
    const agora = new Date();
    const { lembretes = [] } = await chrome.storage.local.get('lembretes');
    const horaAtual = agora.toTimeString().substring(0, 5);

    for (let i = 0; i < lembretes.length; i++) {
        const lembrete = lembretes[i];
        
        // AJUSTE PRINCIPAL AQUI: Adicionada a verificação "!lembrete.completed"
        // Agora, a notificação só é disparada se a tarefa NÃO estiver concluída.
        if (lembrete.hora === horaAtual && isOcurringOn(agora, lembrete) && !lembrete.completed) {
            exibirNotificacao(lembrete.mensagem, 'lembrete', lembrete.id, lembrete.prioridade);
        }
    }

    const hojeString = agora.toISOString().split('T')[0];
    const peakDays = await getPeakDays(agora.getFullYear(), agora.getMonth());
    const isPeakDay = peakDays.some(d => d.toISOString().split('T')[0] === hojeString);
    
    if (isPeakDay) {
        let { peakNotificationStatus } = await chrome.storage.local.get('peakNotificationStatus');
        if (!peakNotificationStatus || peakNotificationStatus.date !== hojeString) {
            peakNotificationStatus = { date: hojeString, notifiedStart: false, notifiedEnd: false };
        }
        if (horaAtual === PEAK_START_TIME && !peakNotificationStatus.notifiedStart) {
            exibirNotificacao("Horário de pico iniciado!", 'pico', null, 'urgente');
            peakNotificationStatus.notifiedStart = true;
            await chrome.storage.local.set({ peakNotificationStatus });
        }
        if (horaAtual === PEAK_END_TIME && !peakNotificationStatus.notifiedEnd) {
            exibirNotificacao("Horário de pico finalizado.", 'pico', null, 'urgente');
            peakNotificationStatus.notifiedEnd = true;
            await chrome.storage.local.set({ peakNotificationStatus });
        }
    }
}


// --- Lógica Central de Notificação ---
async function exibirNotificacao(message, type, reminderId = null, prioridade = 'lembrete') {
  const { activeSgdNotification } = await chrome.storage.session.get('activeSgdNotification');
  if (activeSgdNotification) return;

  const notificationId = `sgd_notification_${Date.now()}`;
  const notificationData = { id: notificationId, message, type, reminderId, prioridade };

  await chrome.storage.session.set({ activeSgdNotification: notificationData });
  
  playSound();
  
  const buttons = type === 'lembrete'
    ? [{ title: 'Concluir' }, { title: 'Desativar por hoje' }, { title: 'Notificar em 5 min' }]
    : [{ title: 'Fechar' }, { title: 'Notificar em 5 min' }];

  chrome.notifications.create(notificationId, {
    type: 'basic', iconUrl: 'icon128.png', title: 'Alerta SGD',
    message: message, priority: 2, buttons: buttons, requireInteraction: true
  });

  const alarmName = `reschedule_${JSON.stringify(notificationData)}`;
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
    } catch (error) {}
}

async function handleNotificationAction(notificationId, buttonIndex) {
  const { activeSgdNotification } = await chrome.storage.session.get('activeSgdNotification');
  if (!activeSgdNotification || activeSgdNotification.id !== notificationId) return;

  const alarmName = `reschedule_${JSON.stringify(activeSgdNotification)}`;
  chrome.alarms.clear(alarmName);
  
  const { type, reminderId } = activeSgdNotification;
  
  if (type === 'lembrete') {
      if (buttonIndex === 0) { // Botão "Concluir"
          const { lembretes = [] } = await chrome.storage.local.get('lembretes');
          const lembreteIndex = lembretes.findIndex(r => r.id === reminderId);
          if (lembreteIndex > -1) {
              lembretes[lembreteIndex].completed = true;
              await chrome.storage.local.set({ lembretes });
              chrome.runtime.sendMessage({ type: 'lembretes_updated' });
              console.log(`Lembrete ${reminderId} foi marcado como concluído.`);
          }
      } else if (buttonIndex === 1) { // Botão "Desativar por hoje"
          const { lembretes = [] } = await chrome.storage.local.get('lembretes');
          const lembretesAtualizados = lembretes.filter(r => r.id !== reminderId);
          await chrome.storage.local.set({ lembretes: lembretesAtualizados });
          console.log(`Lembrete ${reminderId} foi removido permanentemente.`);
          chrome.runtime.sendMessage({ type: 'lembretes_updated' });
      } else if (buttonIndex === 2) { // Botão "Notificar em 5 min"
          chrome.alarms.create(alarmName, { delayInMinutes: 5 });
      }
  } else if (type === 'pico') {
      if (buttonIndex === 1) { // "Notificar em 5 min" para picos
          chrome.alarms.create(alarmName, { delayInMinutes: 5 });
      }
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
        handleNotificationAction(notificationId, -1);
    }
});


// --- Funções de Feriados e Dias de Pico ---
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