document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupCalendar();
  setupReminderForm();
  setupSettings();
  listarLembretes();
});

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

function setupReminderForm() {
  document.getElementById("adicionarLembrete").addEventListener("click", () => {
    const data = document.getElementById("diaLembrete").value;
    const hora = document.getElementById("horarioLembrete").value;
    const mensagem = document.getElementById("mensagemLembrete").value;

    if (!data || !hora) {
      alert("Por favor, preencha a data e a hora do lembrete.");
      return;
    }
    salvarLembrete({ data, hora, mensagem: mensagem || "Lembrete diário do SGD" });
    document.getElementById("mensagemLembrete").value = "";
  });
}

function salvarLembrete(valor) {
  chrome.storage.local.get(["lembretes"], (dados) => {
    const lista = dados.lembretes || [];
    lista.push(valor);
    chrome.storage.local.set({ lembretes: lista }, listarLembretes);
  });
}

function excluirLembrete(indice) {
  chrome.storage.local.get(["lembretes"], (dados) => {
    const lista = dados.lembretes || [];
    lista.splice(indice, 1);
    chrome.storage.local.set({ lembretes: lista }, listarLembretes);
  });
}

function listarLembretes() {
  const ul = document.getElementById("listaLembretes");
  ul.innerHTML = "";
  chrome.storage.local.get(["lembretes"], (dados) => {
    const lista = dados.lembretes || [];
    if (lista.length === 0) {
      ul.innerHTML = "<li>Nenhum lembrete configurado.</li>";
      return;
    }
    lista.forEach((item, index) => {
      const li = document.createElement("li");
      const [ano, mes, dia] = item.data.split('-');
      const dataFormatada = `${dia}/${mes}/${ano}`;
      let texto = `<span>${dataFormatada} às ${item.hora} - "${item.mensagem}"</span>`;

      const btnExcluir = document.createElement("button");
      btnExcluir.textContent = "Excluir";
      btnExcluir.onclick = () => excluirLembrete(index);

      li.innerHTML = texto;
      li.appendChild(btnExcluir);
      ul.appendChild(li);
    });
  });
}

// --- Lógica do Calendário ---
let currentMonth;
let currentYear;

function setupCalendar() {
  const today = new Date();
  currentMonth = today.getMonth();
  currentYear = today.getFullYear();
  renderCalendar(currentMonth, currentYear);

  document.getElementById("prev-month").addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar(currentMonth, currentYear);
  });

  document.getElementById("next-month").addEventListener("click", () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar(currentMonth, currentYear);
  });
}

async function renderCalendar(month, year) {
  const calendarBody = document.getElementById("calendar-body");
  const monthYear = document.getElementById("month-year");
  calendarBody.innerHTML = "";
  monthYear.textContent = `${new Date(year, month).toLocaleString('pt-BR', { month: 'long' })} ${year}`;

  const diasSemana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  diasSemana.forEach(dia => {
    const dayCell = document.createElement('div');
    dayCell.textContent = dia;
    dayCell.className = 'calendar-day-header';
    calendarBody.appendChild(dayCell);
  });

  const peakDays = await getPeakDaysForMonth(year, month);
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarBody.appendChild(document.createElement("div"));
  }

  for (let date = 1; date <= daysInMonth; date++) {
    const dayCell = document.createElement("div");
    dayCell.textContent = date;
    dayCell.className = "calendar-day";
    if (peakDays.includes(date)) {
      dayCell.classList.add("peak-day");
    }
    const today = new Date();
    if (date === today.getDate() && year === today.getFullYear() && month === today.getMonth()) {
      dayCell.classList.add("today");
    }
    calendarBody.appendChild(dayCell);
  }
}

async function getPeakDaysForMonth(year, month) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'get_peak_days', year, month }, (response) => {
      resolve(response || []);
    });
  });
}

// --- Lógica das Configurações ---
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
    } else if (file) {
      alert("Por favor, selecione um arquivo no formato MP3.");
    }
  });
}
