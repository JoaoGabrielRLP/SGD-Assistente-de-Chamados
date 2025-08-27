let currentMonth;
let currentYear;
let selectedDate = new Date();
let eventsForCurrentMonth = {}; // Guarda os eventos do mês para acesso rápido

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupCalendarControls();
  setupForm();
  setupSettings(); 
  
  const today = new Date();
  currentMonth = today.getMonth();
  currentYear = today.getFullYear();
  
  renderAllViews();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'lembretes_updated') {
        renderAllViews();
    }
});

// --- Função Central de Renderização ---
async function renderAllViews() {
    await renderCalendar(currentMonth, currentYear);
    // Encontra os eventos para o dia selecionado e renderiza a lista
    const day = selectedDate.getDate();
    const eventsForSelectedDay = eventsForCurrentMonth[day] || [];
    renderDayTasksList(eventsForSelectedDay, selectedDate);
}

// --- Configuração Inicial ---
function setupTabs() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      tabButtons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      tabContents.forEach(content => {
        content.classList.toggle("active", content.id === button.dataset.tab);
      });
    });
  });
}

function setupCalendarControls() {
    document.getElementById("prev-month").addEventListener("click", () => navigateMonth(-1));
    document.getElementById("next-month").addEventListener("click", () => navigateMonth(1));
}

function setupForm() {
    document.getElementById("adicionarLembrete").addEventListener("click", () => saveReminder());
    document.getElementById('diaLembrete').valueAsDate = new Date();
}

function setupSettings() {
    const volumeSlider = document.getElementById("volume");
    const soundPicker = document.getElementById("sound-picker");
    const currentSoundSpan = document.getElementById("current-sound-name");

    chrome.storage.local.get(["notificationVolume", "notificationSoundName"], (settings) => {
        if (settings.notificationVolume !== undefined) {
            volumeSlider.value = settings.notificationVolume;
        }
        currentSoundSpan.textContent = `Som atual: ${settings.notificationSoundName || "Padrão"}`;
    });

    volumeSlider.addEventListener("input", (event) => {
        chrome.storage.local.set({ notificationVolume: event.target.value });
    });

    soundPicker.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file && file.type === "audio/mpeg") {
            const reader = new FileReader();
            reader.onload = (e) => {
                chrome.storage.local.set({
                    notificationSound: e.target.result,
                    notificationSoundName: file.name
                }, () => {
                    currentSoundSpan.textContent = `Som atual: ${file.name}`;
                });
            };
            reader.readAsDataURL(file);
        }
    });
}

// --- Navegação e Renderização do Calendário ---
async function navigateMonth(direction) {
    currentMonth += direction;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    // Ao navegar, seleciona o dia 1 do novo mês como padrão
    selectedDate = new Date(currentYear, currentMonth, 1);
    await renderAllViews();
}

async function renderCalendar(month, year) {
    document.getElementById("month-year").textContent = `${new Date(year, month).toLocaleString('pt-BR', { month: 'long' })} ${year}`;
    const calendarBody = document.getElementById("calendar-body");
    calendarBody.innerHTML = "";
    
    // Busca e armazena os eventos do mês atual
    eventsForCurrentMonth = await chrome.runtime.sendMessage({ type: 'get_events_for_month', year, month });

    const diasSemana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    diasSemana.forEach(dia => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day-header';
        dayHeader.textContent = dia;
        calendarBody.appendChild(dayHeader);
    });

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarBody.appendChild(document.createElement("div"));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement("div");
        dayCell.className = "calendar-day";
        dayCell.textContent = day;
        dayCell.dataset.day = day;

        const today = new Date();
        if (day === today.getDate() && year === today.getFullYear() && month === today.getMonth()) {
            dayCell.classList.add("today");
        }
        
        // Adiciona a classe 'selected' se o dia for o dia selecionado
        if (day === selectedDate.getDate() && year === selectedDate.getFullYear() && month === selectedDate.getMonth()) {
            dayCell.classList.add("selected");
        }

        const events = eventsForCurrentMonth[day];
        if (events && events.length > 0) {
            dayCell.classList.add("has-events");
            dayCell.classList.add(`day-color-${getHighestPriority(events)}`);

            const eventCount = document.createElement('span');
            eventCount.className = 'event-count';
            eventCount.textContent = events.length;
            dayCell.appendChild(eventCount);

            dayCell.appendChild(createPopover(events));
        }

        // Adiciona o evento de clique para cada dia do calendário
        dayCell.addEventListener('click', (e) => {
            const clickedDay = parseInt(e.currentTarget.dataset.day, 10);
            selectedDate = new Date(year, month, clickedDay);

            document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
            e.currentTarget.classList.add('selected');

            // CORREÇÃO: Pega os eventos já carregados e passa para a função de renderizar a lista
            const eventsForDay = eventsForCurrentMonth[clickedDay] || [];
            renderDayTasksList(eventsForDay, selectedDate);
        });

        calendarBody.appendChild(dayCell);
    }
}

// --- Renderização da Lista de Tarefas do Dia Selecionado ---
function renderDayTasksList(events, date) {
    const listContainer = document.getElementById('today-todo-list');
    const titleElement = document.querySelector('#today-list-container h4');
    listContainer.innerHTML = ''; 

    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
        titleElement.textContent = 'Tarefas de Hoje';
    } else {
        titleElement.textContent = `Tarefas para ${date.toLocaleDateString('pt-BR')}`;
    }

    if (!events || events.length === 0) {
        listContainer.innerHTML = '<li class="no-tasks">Nenhuma tarefa para este dia.</li>';
        return;
    }

    events.sort((a,b) => (a.hora > b.hora) ? 1 : -1).forEach(event => {
        const taskElement = createTaskElement(event);
        listContainer.appendChild(taskElement);
    });
}


// --- Lógica do Popover e Prioridades ---
function getHighestPriority(events) {
    if (events.some(e => e.prioridade === 'urgente')) return 'urgente';
    if (events.some(e => e.prioridade === 'importante')) return 'importante';
    return 'lembrete';
}

function createPopover(events) {
    const popover = document.createElement('div');
    popover.className = 'day-popover';
    const list = document.createElement('ul');
    list.className = 'popover-list todo-list';

    events.sort((a,b) => (a.hora > b.hora) ? 1 : -1).forEach(event => {
        const taskElement = createTaskElement(event);
        list.appendChild(taskElement);
    });
    popover.appendChild(list);

    popover.addEventListener('mouseover', (e) => {
        const dayCell = e.currentTarget.parentElement;
        const dayIndex = Array.from(dayCell.parentElement.children).indexOf(dayCell) % 7;
        popover.classList.remove('align-right', 'align-left');
        if (dayIndex < 2) popover.classList.add('align-left');
        else if (dayIndex > 4) popover.classList.add('align-right');
    });

    return popover;
}

function createTaskElement(event) {
    const item = document.createElement('li');
    item.className = 'popover-item';

    if (event.type === 'pico') {
        item.classList.add('pico-item');
        item.innerHTML = `
            <div class="popover-item-details">
                <div class="popover-item-color prio-${event.prioridade}"></div>
                <span><strong>${event.hora}</strong> - ${event.mensagem}</span>
            </div>
        `;
    } 
    else if (event.type === 'lembrete') {
        item.classList.toggle('completed', event.completed);
        
        const taskContent = document.createElement('div');
        taskContent.className = 'popover-item-details';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = event.completed;
        checkbox.dataset.id = event.id;
        checkbox.addEventListener('change', toggleReminderCompletion);

        const textSpan = document.createElement('span');
        textSpan.innerHTML = `<strong>${event.hora}</strong> - ${event.mensagem}`;
        
        taskContent.appendChild(checkbox);
        taskContent.appendChild(textSpan);

        const actions = document.createElement('div');
        actions.className = 'popover-item-actions';
        
        const editButton = document.createElement('button');
        editButton.dataset.id = event.id;
        editButton.title = "Editar";
        editButton.innerHTML = '&#9998;';
        editButton.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(e.target.dataset.id); });

        const deleteButton = document.createElement('button');
        deleteButton.dataset.id = event.id;
        deleteButton.title = "Excluir";
        deleteButton.innerHTML = '&#128465;';
        deleteButton.addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(e.target.dataset.id); });

        actions.appendChild(editButton);
        actions.appendChild(deleteButton);

        item.appendChild(taskContent);
        item.appendChild(actions);
    }
    return item;
}

async function toggleReminderCompletion(event) {
    const reminderId = event.target.dataset.id;
    const isCompleted = event.target.checked;

    const { lembretes = [] } = await chrome.storage.local.get('lembretes');
    const reminderIndex = lembretes.findIndex(r => r.id === reminderId);

    if (reminderIndex > -1) {
        lembretes[reminderIndex].completed = isCompleted;
        await chrome.storage.local.set({ lembretes });
        await renderAllViews();
    }
}


// --- Lógica de CRUD (Create, Read, Update, Delete) ---
async function saveReminder(event, reminderId = null) {
    const isEditing = !!reminderId;
    const prefix = isEditing ? 'edit-' : '';
    
    const reminder = {
        id: reminderId || `lembrete-${Date.now()}`,
        mensagem: document.getElementById(`${prefix}mensagemLembrete`).value,
        startDate: document.getElementById(`${prefix}diaLembrete`).value,
        hora: document.getElementById(`${prefix}horarioLembrete`).value,
        frequencia: document.querySelector(`input[name="${prefix}frequencia"]:checked`).value,
        prioridade: document.querySelector(`input[name="${prefix}prioridade"]:checked`).value,
        completed: false
    };

    if (!reminder.mensagem || !reminder.startDate || !reminder.hora) {
        alert("Por favor, preencha todos os campos.");
        return;
    }

    const { lembretes = [] } = await chrome.storage.local.get('lembretes');
    if (isEditing) {
        const index = lembretes.findIndex(r => r.id === reminderId);
        if (index > -1) {
            reminder.completed = lembretes[index].completed || false; 
            lembretes[index] = reminder;
        }
    } else {
        lembretes.push(reminder);
    }
    
    await chrome.storage.local.set({ lembretes });
    
    if (isEditing) closeModal();
    else document.getElementById('mensagemLembrete').value = '';

    await renderAllViews();
}

// --- Lógica dos Modais ---
const modalBackdrop = document.getElementById('modal-backdrop');
const modalContent = document.getElementById('modal-content');

function openEditModal(reminderId) {
    chrome.storage.local.get('lembretes').then(({lembretes = []}) => {
        const reminder = lembretes.find(r => r.id === reminderId);
        if (!reminder) return;

        modalContent.innerHTML = `
            <h3>Editar Lembrete</h3>
            <div class="form-section">
                <input type="text" id="edit-mensagemLembrete" value="${reminder.mensagem}">
                <div class="form-group">
                    <input type="date" id="edit-diaLembrete" value="${reminder.startDate}">
                    <input type="time" id="edit-horarioLembrete" value="${reminder.hora}">
                </div>
                <div class="form-group options-group">
                  <div>
                    <label>Frequência:</label>
                    <div class="radio-group">
                      <input type="radio" id="edit-freq-hoje" name="edit-frequencia" value="hoje"><label for="edit-freq-hoje">Hoje</label>
                      <input type="radio" id="edit-freq-diariamente" name="edit-frequencia" value="diariamente"><label for="edit-freq-diariamente">Diário</label>
                      <input type="radio" id="edit-freq-semanal" name="edit-frequencia" value="semanalmente"><label for="edit-freq-semanal">Semanal</label>
                      <input type="radio" id="edit-freq-quinzenal" name="edit-frequencia" value="quinzenalmente"><label for="edit-freq-quinzenal">15 dias</label>
                      <input type="radio" id="edit-freq-mensal" name="edit-frequencia" value="mensalmente"><label for="edit-freq-mensal">Mensal</label>
                    </div>
                  </div>
                  <div>
                    <label>Prioridade:</label>
                    <div class="radio-group">
                      <input type="radio" id="edit-prio-lembrete" name="edit-prioridade" value="lembrete"><label for="edit-prio-lembrete" class="prio-lembrete">Lembrete</label>
                      <input type="radio" id="edit-prio-importante" name="edit-prioridade" value="importante"><label for="edit-prio-importante" class="prio-importante">Importante</label>
                      <input type="radio" id="edit-prio-urgente" name="edit-prioridade" value="urgente"><label for="edit-prio-urgente" class="prio-urgente">Urgente</label>
                    </div>
                  </div>
                </div>
                <div class="modal-actions">
                    <button id="cancel-edit" class="btn-secondary">Cancelar</button>
                    <button id="save-edit" class="btn-primary">Salvar</button>
                </div>
            </div>
        `;
        
        document.querySelector(`input[name="edit-frequencia"][value="${reminder.frequencia}"]`).checked = true;
        document.querySelector(`input[name="edit-prioridade"][value="${reminder.prioridade}"]`).checked = true;

        modalBackdrop.classList.remove('hidden');

        document.getElementById('save-edit').addEventListener('click', (e) => saveReminder(e, reminderId));
        document.getElementById('cancel-edit').addEventListener('click', closeModal);
    });
}

function openDeleteModal(reminderId) {
    chrome.storage.local.get('lembretes').then(({lembretes = []}) => {
        const reminder = lembretes.find(r => r.id === reminderId);
        if (!reminder) return;
        const isRecurring = reminder.frequencia !== 'hoje';
        
        modalContent.innerHTML = `
            <h3>Confirmar Exclusão</h3>
            <p>Você tem certeza que deseja excluir o lembrete "${reminder.mensagem}"?</p>
            ${isRecurring ? '<p><strong>Atenção:</strong> Este é um lembrete recorrente. Todas as futuras ocorrências também serão excluídas.</p>' : ''}
            <div class="modal-actions">
                <button id="cancel-delete" class="btn-secondary">Cancelar</button>
                <button id="confirm-delete" class="btn-danger">Excluir</button>
            </div>
        `;
        modalBackdrop.classList.remove('hidden');

        document.getElementById('confirm-delete').addEventListener('click', async () => {
            const index = lembretes.findIndex(r => r.id === reminderId);
            if (index > -1) lembretes.splice(index, 1);
            await chrome.storage.local.set({ lembretes });
            closeModal();
            await renderAllViews();
        });
        document.getElementById('cancel-delete').addEventListener('click', closeModal);
    });
}

function closeModal() {
    modalBackdrop.classList.add('hidden');
}