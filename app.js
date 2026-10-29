"use strict";

const DATA_URL = "./api/data.php";
const SAVE_URL = "./api/save.php";
const UPLOAD_URL = "./api/upload.php";
const AUTH_STATUS_URL = "./api/auth-status.php";
const LOGIN_URL = "./api/login.php";
const LOGOUT_URL = "./api/logout.php";

const companies = [
  {
    id: "procomit",
    name: "Procomit",
    sites: ["Site 3 VHF", "Sitio Principal", "Site 1 (mina)", "Botadero norte"],
  },
  {
    id: "pascom",
    name: "Claro – Pascom",
    sites: ["Torre nueva (CGF)", "Sitio Campamento"],
  },
  {
    id: "goldfields",
    name: "GoldFields – NetSoluciones",
    sites: [
      "CGF",
      "CAP Site 4",
      "Site 3",
      "Geología",
      "Site 7",
      "Área Mina – Site 1",
    ],
  },
];

let visitData = { semana: null, inicio: {}, final: {} };
let currentVisit = "inicio";
let currentCompany = "procomit";
let saveQueue = Promise.resolve();
let pendingInitialSave = false;

let authState = {
  authenticated: false,
  canEdit: false,
};

const content = document.getElementById("content");
const companyTabs = document.getElementById("companyTabs");
const messageBox = document.getElementById("message");

function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function weekNumber(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;

  d.setUTCDate(d.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function formatToday() {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function showMessage(text, isError = false) {
  if (!messageBox) return;

  messageBox.textContent = text;
  messageBox.classList.toggle("error", isError);
  messageBox.classList.add("visible");

  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    messageBox.classList.remove("visible");
  }, 3500);
}

function normalizeData(data) {
  const result = {
    ...data,
    semana: Number(data?.semana) || weekNumber(new Date()),
    inicio: data?.inicio && typeof data.inicio === "object" ? data.inicio : {},
    final: data?.final && typeof data.final === "object" ? data.final : {},
  };

  for (const visitName of ["inicio", "final"]) {
    for (const company of companies) {
      const companyData = result[visitName][company.id];

      if (!companyData || typeof companyData !== "object") {
        result[visitName][company.id] = {};
      }

      const dataForCompany = result[visitName][company.id];

      if (
        !dataForCompany._siteStatus ||
        typeof dataForCompany._siteStatus !== "object"
      ) {
        dataForCompany._siteStatus = {};
      }

      for (const site of company.sites) {
        if (!Array.isArray(dataForCompany[site])) {
          dataForCompany[site] = [];
        }

        dataForCompany[site] = dataForCompany[site].map((item) => {
          if (typeof item === "string") {
            return {
              id: makeId(),
              text: item,
              status: "pending",
              photo: null,
              comment: "",
            };
          }

          return {
            id: item?.id || makeId(),
            text: String(item?.text || ""),
            status: item?.status === "solved" ? "solved" : "pending",
            photo: item?.photo || null,
            comment: String(item?.comment || ""),
          };
        });

        const savedStatus = dataForCompany._siteStatus[site];

        dataForCompany._siteStatus[site] = {
          notVisited: Boolean(savedStatus?.notVisited),
          reason: String(savedStatus?.reason || ""),
        };
      }
    }
  }

  return result;
}

function initializeFinalFromInicio() {
  if (visitData._finalSeededVersion >= 2) return false;

  let changed = false;

  for (const company of companies) {
    const start = visitData.inicio[company.id];
    const end = visitData.final[company.id];

    for (const site of company.sites) {
      if (end[site].length === 0 && start[site].length > 0) {
        end[site] = start[site].map((observation) => ({
          ...observation,
          id: makeId(),
        }));

        end._siteStatus[site] = { ...start._siteStatus[site] };
        changed = true;
      }
    }
  }

  visitData._finalSeeded = true;
  visitData._finalSeededVersion = 2;

  return changed;
}

async function loadAuthStatus() {
  try {
    const response = await fetch(AUTH_STATUS_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    authState = await response.json();

    const loginForm = document.getElementById("loginForm");
    const loggedInPanel = document.getElementById("loggedInPanel");
    const authInfo = document.getElementById("authInfo");
    const authMessage = document.getElementById("authMessage");

    if (loginForm) loginForm.hidden = Boolean(authState.authenticated);
    if (loggedInPanel) loggedInPanel.hidden = !authState.authenticated;

    if (authInfo) {
      authInfo.textContent = authState.authenticated
        ? `${authState.name || "Usuario"} · Turno ${authState.shift || ""}`
        : "";
    }

    if (authMessage) {
      authMessage.textContent = !authState.authenticated
        ? "Inicia sesión para editar."
        : authState.canEdit
          ? "Tu turno está habilitado para editar."
          : `Sesión iniciada. Solo lectura${
              authState.activeShift
                ? `; está activo el Turno ${authState.activeShift}`
                : " durante el cambio de turno"
            }.`;
    }

    applyEditAccess();

    if (pendingInitialSave && authState.canEdit) {
      pendingInitialSave = false;
      await saveData();
    }
  } catch (error) {
    console.error(error);

    authState = {
      authenticated: false,
      canEdit: false,
    };

    const authMessage = document.getElementById("authMessage");
    if (authMessage) {
      authMessage.textContent = "No se pudo comprobar la sesión.";
    }

    applyEditAccess();
  }
}

function applyEditAccess() {
  const allowed = Boolean(authState.canEdit);

  if (content) {
    content.inert = false;
    content.removeAttribute("inert");

    content.querySelectorAll("button, input").forEach((element) => {
      element.disabled = !allowed;
    });

    content.querySelectorAll("textarea.comment-box").forEach((element) => {
      element.readOnly = !allowed;
    });
  }

  const weekInput = document.getElementById("currentWeek");
  if (weekInput) weekInput.disabled = !allowed;
}

async function loadData() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    visitData = normalizeData(await response.json());
    const initializedFinal = initializeFinalFromInicio();

    const weekInput = document.getElementById("currentWeek");
    const dateLabel = document.getElementById("currentDate");

    if (weekInput) weekInput.value = visitData.semana;
    if (dateLabel) dateLabel.textContent = formatToday();

    render();

    if (initializedFinal) {
      if (authState.canEdit) {
        await saveData();
      } else {
        pendingInitialSave = true;
      }
    }
  } catch (error) {
    console.error(error);

    if (content) {
      content.innerHTML = `
        <p class="empty-state">
          No se pudieron cargar los datos. Revisa que el servidor PHP esté
          activo y que ${DATA_URL} entregue JSON.
        </p>
      `;
    }
  }
}

function saveData() {
  if (!authState.canEdit) {
    showMessage("Inicia sesión con el turno habilitado para guardar.", true);
    return Promise.resolve();
  }

  const currentSave = saveQueue
    .catch(() => {})
    .then(async () => {
      const response = await fetch(SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(visitData),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success === false) {
        throw new Error(result.message || `Error HTTP ${response.status}`);
      }
    });

  saveQueue = currentSave;

  return currentSave
    .then(() => showMessage("Cambios guardados."))
    .catch((error) => {
      console.error(error);
      showMessage(`No se pudo guardar: ${error.message}`, true);
    });
}

function getCompanyData() {
  return visitData[currentVisit][currentCompany];
}

function render() {
  if (!content || !companyTabs) return;

  companyTabs.replaceChildren();

  for (const company of companies) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `company-tab${
      company.id === currentCompany ? " active" : ""
    }`;
    button.textContent = company.name;
    button.setAttribute("aria-selected", String(company.id === currentCompany));

    button.addEventListener("click", () => {
      currentCompany = company.id;
      render();
    });

    companyTabs.append(button);
  }

  const company =
    companies.find((item) => item.id === currentCompany) || companies[0];
  const companyData = getCompanyData();

  const panel = document.createElement("section");
  panel.className = "company-panel";

  const title = document.createElement("h2");
  title.className = "company-title";
  title.textContent = `${company.name} · ${
    currentVisit === "inicio" ? "Inicio de turno" : "Final de turno"
  }`;

  panel.append(title);

  if (currentVisit === "final") {
    const actions = document.createElement("div");
    actions.className = "turn-actions";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "button primary";
    loadButton.textContent = "Cargar observaciones de Inicio";
    loadButton.addEventListener("click", loadInicioIntoFinal);

    actions.append(loadButton);
    panel.append(actions);
  }

  for (const site of company.sites) {
    const card = document.createElement("article");
    const siteStatus = companyData._siteStatus[site];

    card.className = `site-card${siteStatus.notVisited ? " not-visited" : ""}`;

    const heading = document.createElement("div");
    heading.className = "site-heading";

    const siteTitle = document.createElement("h3");
    siteTitle.className = "site-title";
    siteTitle.textContent = site;

    const visitButton = document.createElement("button");
    visitButton.type = "button";
    visitButton.className = `button${siteStatus.notVisited ? "" : " success"}`;
    visitButton.textContent = siteStatus.notVisited
      ? "Marcar como visitado"
      : "Marcar como no visitado";

    visitButton.addEventListener("click", async () => {
      if (!authState.canEdit) return;

      siteStatus.notVisited = !siteStatus.notVisited;

      if (!siteStatus.notVisited) {
        siteStatus.reason = "";
      }

      render();
      await saveData();
    });

    heading.append(siteTitle, visitButton);
    card.append(heading);

    if (siteStatus.notVisited) {
      const statusText = document.createElement("p");
      statusText.className = "site-visit-status";
      statusText.textContent = "No visitado";

      const reasonForm = document.createElement("form");
      reasonForm.className = "reason-form";

      const reasonInput = document.createElement("input");
      reasonInput.type = "text";
      reasonInput.maxLength = 300;
      reasonInput.placeholder = "Motivo (por ejemplo: contingencia)";
      reasonInput.value = siteStatus.reason;
      reasonInput.setAttribute(
        "aria-label",
        `Motivo por el que no se visitó ${site}`,
      );

      const saveReasonButton = document.createElement("button");
      saveReasonButton.type = "submit";
      saveReasonButton.className = "button primary";
      saveReasonButton.textContent = "Guardar motivo";

      reasonForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!authState.canEdit) return;

        siteStatus.reason = reasonInput.value.trim();
        render();
        await saveData();
      });

      reasonForm.append(reasonInput, saveReasonButton);
      card.append(statusText, reasonForm);

      if (siteStatus.reason) {
        const reason = document.createElement("p");
        reason.className = "empty-state";
        reason.textContent = `Motivo: ${siteStatus.reason}`;
        card.append(reason);
      }
    } else {
      renderObservations(card, site, companyData[site]);
    }

    panel.append(card);
  }

  content.replaceChildren(panel);
  applyEditAccess();
}
function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function daysBetweenISO(start, end) {
  if (!start || !end) return null;

  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);

  return Math.max(
    0,
    Math.floor(
      (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000,
    ),
  );
}
function renderObservations(card, site, observations) {
  const list = document.createElement("div");
  list.className = "observation-list";

  if (observations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Sin observaciones.";
    list.append(empty);
  }

  for (const observation of observations) {
    const row = document.createElement("div");
    row.className = `observation${
      observation.status === "solved" ? " solved" : ""
    }`;

    const description = document.createElement("div");
    description.className = "observation-description";

    const text = document.createElement("p");
    text.className = "observation-text";
    text.textContent = observation.text;

    const status = document.createElement("span");
    status.className = "observation-status";
    status.textContent =
      observation.status === "solved" ? "Solucionado" : "Pendiente";
    const openedDateInput = document.createElement("input");
    openedDateInput.type = "date";
    openedDateInput.value = observation.openedAt || "";
    openedDateInput.max = todayISO();
    openedDateInput.disabled = !authState.canEdit;
    openedDateInput.setAttribute("aria-label", "Fecha de apertura");

    const tracking = document.createElement("div");
    tracking.className = "observation-tracking";

    const dateLabel = document.createElement("label");
    dateLabel.textContent = "Fecha de apertura: ";
    dateLabel.append(openedDateInput);

    const daysLabel = document.createElement("span");
    const endDate =
      observation.status === "solved" ? observation.closedAt : todayISO();
    const days = daysBetweenISO(observation.openedAt, endDate);

    daysLabel.textContent =
      days === null
        ? observation.status === "solved"
          ? "Cierre sin fecha registrada"
          : "Días abierta: registra la fecha"
        : observation.status === "solved"
          ? `Tiempo abierta: ${days} días`
          : `Días abierta: ${days}`;

    tracking.append(dateLabel, daysLabel);

    openedDateInput.addEventListener("change", async () => {
      if (!authState.canEdit) return;
      observation.openedAt = openedDateInput.value;
      await saveData();
      render();
    });
    const commentBox = document.createElement("textarea");
    commentBox.className = "comment-box";
    commentBox.rows = 2;
    commentBox.maxLength = 500;
    commentBox.placeholder = "Comentario...";
    commentBox.value = observation.comment || "";
    commentBox.readOnly = !authState.canEdit;
    commentBox.setAttribute("aria-label", `Comentario para ${site}`);

    commentBox.addEventListener("change", async () => {
      if (!authState.canEdit) return;
      observation.comment = commentBox.value.trim();
      await saveData();
    });

    description.append(text, status, tracking);

    const actions = document.createElement("div");
    actions.className = "observation-actions";

    if (observation.photo) {
      const image = document.createElement("img");
      image.className = "photo-thumb";
      image.src = observation.photo;
      image.alt = "Foto de la observación";
      image.addEventListener("click", () => openImage(observation.photo));
      actions.append(image);
    }

    const photoInput = document.createElement("input");
    photoInput.className = "photo-input";
    photoInput.type = "file";
    photoInput.accept = "image/*";
    photoInput.setAttribute("aria-label", "Seleccionar foto");

    photoInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) uploadPhoto(file, site, observation);
    });

    const photoButton = document.createElement("button");
    photoButton.type = "button";
    photoButton.className = "button";
    photoButton.textContent = observation.photo
      ? "Cambiar foto"
      : "Agregar foto";
    photoButton.addEventListener("click", () => photoInput.click());

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => {
      showEditForm(row, observation);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button danger";
    deleteButton.textContent = "Eliminar";

    deleteButton.addEventListener("click", async () => {
      if (!authState.canEdit) return;
      if (!confirm("¿Eliminar esta observación?")) return;

      const items = getCompanyData()[site];
      const index = items.findIndex((item) => item.id === observation.id);

      if (index !== -1) {
        items.splice(index, 1);
      }

      render();
      await saveData();
    });

    const statusButton = document.createElement("button");
    statusButton.type = "button";
    statusButton.className = `button${
      observation.status === "pending" ? " success" : ""
    }`;
    statusButton.textContent =
      observation.status === "pending"
        ? "Marcar solucionado"
        : "Marcar pendiente";

    statusButton.addEventListener("click", async () => {
      if (!authState.canEdit) return;

      if (observation.status === "pending") {
        observation.status = "solved";
        observation.closedAt = todayISO();
      } else {
        observation.status = "pending";
        observation.closedAt = null;
      }

      render();
      await saveData();
    });

    actions.append(
      photoInput,
      photoButton,
      editButton,
      deleteButton,
      statusButton,
    );

    row.append(description, actions, commentBox);
    list.append(row);
  }

  const addForm = document.createElement("form");
  addForm.className = "add-observation";

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 500;
  input.placeholder = "Escribe una observación...";
  input.setAttribute("aria-label", `Nueva observación para ${site}`);

  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.className = "button primary";
  addButton.textContent = "Agregar observación";

  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authState.canEdit) return;

    const value = input.value.trim();
    if (!value) return;

    getCompanyData()[site].push({
      id: makeId(),
      text: value,
      status: "pending",
      photo: null,
      comment: "",
    });

    render();
    await saveData();
  });

  addForm.append(input, addButton);
  card.append(list, addForm);
}

function showEditForm(row, observation) {
  if (row.querySelector(".edit-form")) return;

  const form = document.createElement("form");
  form.className = "edit-form";

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 500;
  input.required = true;
  input.value = observation.text;
  input.setAttribute("aria-label", "Editar observación");

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "button primary";
  saveButton.textContent = "Guardar";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button";
  cancelButton.textContent = "Cancelar";
  cancelButton.addEventListener("click", () => form.remove());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authState.canEdit) return;

    const correctedText = input.value.trim();
    if (!correctedText) return;

    observation.text = correctedText;
    render();
    await saveData();
  });

  form.append(input, saveButton, cancelButton);
  row.append(form);
  input.focus();
  input.select();
}

async function uploadPhoto(file, site, observation) {
  if (!authState.canEdit) {
    showMessage(
      "Inicia sesión con el turno habilitado para subir fotos.",
      true,
    );
    return;
  }

  if (!file.type.startsWith("image/")) {
    showMessage("Selecciona un archivo de imagen.", true);
    return;
  }

  const form = new FormData();
  form.append("photo", file);
  form.append("visit", currentVisit);
  form.append("company", currentCompany);
  form.append("site", site);
  form.append("observationId", observation.id);

  try {
    const response = await fetch(UPLOAD_URL, {
      method: "POST",
      body: form,
    });

    const responseText = await response.text();

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      const detail = responseText.trim()
        ? responseText.trim().slice(0, 300)
        : `El servidor respondió vacío (HTTP ${response.status}).`;

      throw new Error(detail);
    }

    if (!response.ok || result.success === false || !result.path) {
      throw new Error(result.message || `Error HTTP ${response.status}`);
    }

    observation.photo = result.path;
    render();
    await saveData();
  } catch (error) {
    console.error(error);
    showMessage(`No se pudo subir la foto: ${error.message}`, true);
  }
}

function openImage(src) {
  const modal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  if (!modal || !modalImage) return;

  modalImage.src = src;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeImage() {
  const modal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  if (!modal || !modalImage) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  modalImage.src = "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

async function imageAsDataUrl(path, maxWidth = 1600, maxHeight = 1200) {
  if (!path) return "";

  try {
    const response = await fetch(path);
    if (!response.ok) return "";

    const blob = await response.blob();
    const image = await createImageBitmap(blob);

    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();

    return canvas.toDataURL("image/jpeg", 0.9);
  } catch (error) {
    console.error("No se pudo preparar la imagen:", path, error);
    return "";
  }
}

async function photoAsDataUrl(path) {
  return imageAsDataUrl(path, 1600, 1200);
}
async function buildReportHtml() {
  const visitName =
    currentVisit === "inicio" ? "Inicio de turno" : "Final de turno";
  const reportDate = formatToday();
  const authorName = authState.authenticated
    ? authState.name || "Usuario"
    : "Usuario sin sesión";

  let writtenSections = "";
  const evidence = [];

  for (const company of companies) {
    const companyData = visitData[currentVisit][company.id];
    let sitesHtml = "";

    for (const site of company.sites) {
      const siteStatus = companyData._siteStatus[site];

      if (siteStatus.notVisited) {
        sitesHtml += `
          <section class="site">
            <h3>${escapeHtml(site)}</h3>
            <p><strong>No visitado.</strong> Motivo: ${escapeHtml(
              siteStatus.reason || "No indicado",
            )}</p>
          </section>`;
        continue;
      }

      const observations = companyData[site];
      let observationsHtml = "";

      for (const observation of observations) {
        const status =
          observation.status === "solved" ? "Solucionado" : "Pendiente";

        observationsHtml += `
          <div class="observation">
            <p>${escapeHtml(observation.text)}</p>
            <p class="status">Estado: ${status}</p>
            ${
              observation.comment
                ? `<p class="comment-report">Comentario: ${escapeHtml(
                    observation.comment,
                  )}</p>`
                : ""
            }
          </div>`;

        // Solo se agregan como evidencia las fotos asociadas a observaciones.
        if (
          observation.photo &&
          !/goldfields\.png|netsoluciones\.png/i.test(observation.photo)
        ) {
          const photo = await photoAsDataUrl(observation.photo);

          if (photo) {
            evidence.push({
              company: company.name,
              site,
              text: observation.text,
              photo,
            });
          }
        }
      }

      if (!observationsHtml) {
        observationsHtml = "<p>Sin observaciones.</p>";
      }

      sitesHtml += `
        <section class="site">
          <h3>${escapeHtml(site)}</h3>
          ${observationsHtml}
        </section>`;
    }

    writtenSections += `
      <section class="company">
        <h2>${escapeHtml(company.name)}</h2>
        ${sitesHtml}
      </section>`;
  }

  const goldFieldsLogo = await imageAsDataUrl("./goldfields.png", 600, 300);
  const netSolucionesLogo = await imageAsDataUrl(
    "./netsoluciones.png",
    600,
    300,
  );

  function photoPageHeader(showTitle) {
    return `
      <table class="brand-header">
        <tbody>
          <tr>
            <td class="brand-left">
              ${
                goldFieldsLogo
                  ? `<img src="${goldFieldsLogo}" width="180" height="90" alt="GoldFields">`
                  : ""
              }
            </td>
            <td class="brand-right">
              ${
                netSolucionesLogo
                  ? `<img src="${netSolucionesLogo}" width="180" height="90" alt="NetSoluciones">`
                  : ""
              }
            </td>
          </tr>
        </tbody>
      </table>
      ${
        showTitle
          ? '<h2 class="photo-section-title">4. Evidencia fotográfica</h2>'
          : ""
      }`;
  }

  let photoPages = "";

  for (let start = 0; start < evidence.length; start += 4) {
    const pageItems = evidence.slice(start, start + 4);

    const cells = pageItems.map(
      (item) => `
        <td>
          <div class="photo-card">
            <img src="${item.photo}" alt="Evidencia fotográfica">
            <p class="photo-caption">
              <strong>${escapeHtml(item.company)}</strong><br>
              ${escapeHtml(item.site)}<br>
              ${escapeHtml(item.text)}
            </p>
          </div>
        </td>
      `,
    );

    while (cells.length < 4) {
      cells.push("<td></td>");
    }

    photoPages += `
      <section class="photo-page">
        ${photoPageHeader(start === 0)}
        <table class="photo-grid">
          <tbody>
            <tr>${cells[0]}${cells[1]}</tr>
            <tr>${cells[2]}${cells[3]}</tr>
          </tbody>
        </table>
      </section>`;
  }

  if (evidence.length === 0) {
    photoPages = `
      <section class="photo-page">
        ${photoPageHeader(true)}
        <p>Este turno no tiene fotos adjuntas.</p>
      </section>`;
  }

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Registro de visitas - ${escapeHtml(visitName)}</title>
  <style>
    @page {
      size: letter portrait;
      margin: 1.3cm;
    }

    body {
      font-family: Arial, sans-serif;
      color: #233142;
      margin: 0;
      font-size: 10.5pt;
      line-height: 1.35;
    }

    h1 {
      margin: 0 0 6px;
      color: #173d5d;
      font-size: 20pt;
    }

    h2 {
      margin: 22px 0 12px;
      color: #24577f;
      font-size: 15pt;
      page-break-after: avoid;
    }

    h3 {
      margin: 14px 0 6px;
      color: #31536e;
      font-size: 11.5pt;
      page-break-after: avoid;
    }

    .report-meta {
      margin: 0 0 20px;
      color: #52697b;
    }

    .company,
    .site,
    .observation {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .site {
      margin: 0 0 12px;
    }

    .observation {
      margin: 4px 0 7px 12px;
      padding-left: 9px;
      border-left: 2px solid #cbd6df;
    }

    .observation p {
      margin: 3px 0;
    }

    .status {
      color: #52697b;
      font-size: 9pt;
    }

    .comment-report {
      margin-top: 6px !important;
      padding: 6px 8px;
      color: #626b73;
      background: #f1f3f5;
      font-size: 9pt;
    }

    .general-observations li {
      margin-bottom: 7px;
    }

    .photo-page {
      page-break-before: always;
      break-before: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .brand-header {
      width: 100%;
      height: 1.7cm;
      table-layout: fixed;
      border-collapse: collapse;
      margin: 0 0 0.2cm;
    }

    .brand-header td {
      width: 50%;
      height: 1.7cm;
      vertical-align: middle;
    }

    .brand-left {
      text-align: left;
    }

    .brand-right {
      text-align: right;
    }

    .brand-header img {
      width: 4.8cm;
      height: 1.45cm;
      max-width: 4.8cm;
      max-height: 1.45cm;
      object-fit: contain;
    }

    .photo-section-title {
      margin: 0 0 0.2cm;
      font-size: 14pt;
    }

    .photo-grid {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }

    .photo-grid tr {
      height: 10.8cm;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .photo-grid td {
      width: 50%;
      padding: 0.12cm;
      vertical-align: middle;
      text-align: center;
    }

    .photo-card {
      min-height: 10.4cm;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .photo-card img {
    display: block;
    width: 8.8cm;
    height: auto;
    max-width: 100%;
    object-fit: contain;
    margin: 0 auto 0.15cm;
    }

    .photo-caption {
      margin: 0;
      font-size: 8pt;
      line-height: 1.15;
      overflow-wrap: anywhere;
    }

    .cover {
      height: 22cm;
      position: relative;
      page-break-after: always;
      break-after: page;
      text-align: center;
    }

    .cover-center {
      padding-top: 6cm;
    }

    .cover-title {
      margin: 0 0 16px;
      color: #5b91d5;
      font-size: 24pt;
      font-weight: normal;
    }

    .cover-meta {
      position: absolute;
      right: 0;
      bottom: 0;
      text-align: right;
      font-size: 9pt;
    }
  </style>
</head>
<body>
  <section class="cover">
    <div class="cover-center">
      <h1 class="cover-title">Informe de Visita a Sitios</h1>
      <p>NetSoluciones</p>
      <p>GoldFields</p>
    </div>

    <div class="cover-meta">
      <p>Nombre: ${escapeHtml(authorName)}</p>
      <p>Fecha de ejecución: ${escapeHtml(reportDate)}</p>
    </div>
  </section>

  <h1>Registro de Visitas</h1>

  <p class="report-meta">
    <strong>${escapeHtml(visitName)}</strong>
    · Semana ${escapeHtml(visitData.semana)}
    · ${escapeHtml(reportDate)}<br>
    Elaborado por: ${escapeHtml(authorName)}
  </p>

  <h2>1. Objetivo de la visita</h2>
  <p>
    Realizar, junto con personal de Claro, la inspección de diversos sitios para
    verificar que las instalaciones se encuentren en norma, ordenadas y en
    correcto funcionamiento, e identificar observaciones y puntos de mejora.
    Queda pendiente la participación del personal de Procomit.
  </p>

  <h2>2. Observaciones por empresa</h2>
  ${writtenSections}

  <h2>3. Observaciones generales</h2>
  <ul class="general-observations">
    <li>
      En varios sitios se identificaron elementos fuera de norma que requieren
      regularización inmediata.
    </li>
    <li>
      Es prioritario atender temas de seguridad como extintores vencidos o
      ausentes, conexiones eléctricas deficientes y elementos sueltos que se
      encuentran en constante y directo contacto con las ráfagas de viento.
    </li>
    <li>
      Se recomienda agendar visitas de mantenimiento correctivo para abordar
      las observaciones señaladas.
    </li>
  </ul>

  ${photoPages}
</body>
</html>`;
}

async function exportWord() {
  try {
    const response = await fetch("./api/export-word.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentVisit,
        visitData,
        author: authState.authenticated ? authState.name : "Usuario sin sesión",
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Error HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `Visita ${currentVisit} - Semana ${visitData.semana}.docx`;

    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    showMessage(`No se pudo descargar el Word: ${error.message}`, true);
  }
}

async function exportPdf() {
  const reportWindow = window.open("", "_blank");

  if (!reportWindow) {
    showMessage(
      "Permite las ventanas emergentes para imprimir o guardar el PDF.",
      true,
    );
    return;
  }

  try {
    const html = await buildReportHtml();

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();

    setTimeout(() => {
      reportWindow.focus();
      reportWindow.print();
    }, 700);
  } catch (error) {
    reportWindow.close();
    console.error(error);
    showMessage("No se pudo preparar el informe PDF.", true);
  }
}

function exportChecklist() {
  const visitName =
    currentVisit === "inicio" ? "Inicio de turno" : "Final de turno";
  let sections = "";

  for (const company of companies) {
    const companyData = visitData[currentVisit][company.id];
    let sites = "";

    for (const site of company.sites) {
      const siteStatus = companyData._siteStatus[site];
      const items = companyData[site];

      const lines = siteStatus.notVisited
        ? `<p class="not-visited">☐ ${escapeHtml(site)} — Sin acceso</p>`
        : `
          <p class="site-name">${escapeHtml(site)}</p>
          ${
            items.length
              ? items
                  .map(
                    (item) =>
                      `<p class="check-item">☐ ${escapeHtml(item.text)}</p>`,
                  )
                  .join("")
              : '<p class="check-item">☐ ______________________________</p>'
          }`;

      sites += `<div class="site-block">${lines}</div>`;
    }

    sections += `
      <section>
        <p class="company-name">${escapeHtml(company.name)}</p>
        ${sites}
      </section>`;
  }

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Visita a sitios</title>
<style>
  @page { size: A4 portrait; margin: 1.5cm; }
  body { font-family: Arial, sans-serif; color: #222; font-size: 12pt; }
  h1 { font-size: 16pt; font-weight: normal; }
  .company-name { margin: 18px 0 8px; text-transform: lowercase; }
  .site-block { margin: 0 0 18px; }
  .site-name, .not-visited { margin: 4px 0; }
  .check-item { margin: 5px 0 5px 14px; }
</style>
</head>
<body>
<h1>Visita a sitios</h1>
${sections}
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], {
    type: "application/msword",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Checklist visita ${currentVisit} - Semana ${visitData.semana}.doc`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function addChecklistButton() {
  const existing = document.getElementById("exportChecklist");

  if (existing) {
    existing.addEventListener("click", exportChecklist);
    return;
  }

  const anchor =
    document.getElementById("exportPdf") ||
    document.getElementById("exportWord");

  if (!anchor) return;

  const button = document.createElement("button");
  button.id = "exportChecklist";
  button.type = "button";
  button.className = "button";
  button.textContent = "Checklist";
  button.title = "Descargar checklist para terreno";
  button.addEventListener("click", exportChecklist);

  anchor.after(button);
}

async function loadInicioIntoFinal() {
  if (!authState.canEdit) {
    showMessage("Inicia sesión con el turno habilitado para editar.", true);
    return;
  }

  const confirmed = confirm(
    "Esto reemplazará las observaciones actuales de Final con las de Inicio. ¿Continuar?",
  );

  if (!confirmed) return;

  for (const company of companies) {
    const start = visitData.inicio[company.id];
    const end = visitData.final[company.id];

    for (const site of company.sites) {
      end[site] = start[site].map((observation) => ({
        ...observation,
        id: makeId(),
      }));

      end._siteStatus[site] = { ...start._siteStatus[site] };
    }
  }

  visitData._finalSeeded = true;
  visitData._finalSeededVersion = 2;

  render();
  await saveData();
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("loginUsername")?.value || "";
    const password = document.getElementById("loginPassword")?.value || "";

    try {
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo iniciar sesión.");
      }

      const passwordInput = document.getElementById("loginPassword");
      if (passwordInput) passwordInput.value = "";

      await loadAuthStatus();
      render();
    } catch (error) {
      const authMessage = document.getElementById("authMessage");
      if (authMessage) authMessage.textContent = error.message;
    }
  });
}

const logoutButton = document.getElementById("logoutButton");
if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await fetch(LOGOUT_URL, { method: "POST" });
    } catch (error) {
      console.error(error);
    }

    authState = {
      authenticated: false,
      canEdit: false,
    };

    await loadAuthStatus();
    render();
  });
}

document.querySelectorAll(".visit-tab").forEach((button) => {
  button.addEventListener("click", () => {
    currentVisit = button.dataset.visit;

    document.querySelectorAll(".visit-tab").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
    });

    render();
  });
});

const closeModalButton = document.getElementById("closeModal");
if (closeModalButton) {
  closeModalButton.addEventListener("click", closeImage);
}

const imageModal = document.getElementById("imageModal");
if (imageModal) {
  imageModal.addEventListener("click", (event) => {
    if (event.target.id === "imageModal") {
      closeImage();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeImage();
});

const weekInput = document.getElementById("currentWeek");
if (weekInput) {
  weekInput.addEventListener("change", async (event) => {
    if (!authState.canEdit) return;

    const input = event.target;
    const week = Number(input.value);

    if (!Number.isInteger(week) || week < 1 || week > 53) {
      input.value = visitData.semana;
      showMessage("Ingresa un número de semana entre 1 y 53.", true);
      return;
    }

    visitData.semana = week;
    input.value = week;
    await saveData();
  });
}

const wordButton = document.getElementById("exportWord");
if (wordButton) wordButton.addEventListener("click", exportWord);

const pdfButton = document.getElementById("exportPdf");
if (pdfButton) pdfButton.addEventListener("click", exportPdf);

addChecklistButton();
loadAuthStatus();
loadData();
setInterval(loadAuthStatus, 60000);
