(function () {
"use strict";

const $ = id => document.getElementById(id);

/* ───────────────── ELEMENTS ───────────────── */
const els = {
  prevBtn: $("prevBtn"),
  nextBtn: $("nextBtn"),
  todayBtn: $("todayBtn"),
  monthSelect: $("monthSelect"),
  yearSelect: $("yearSelect"),

  grid: $("grid"),
  searchInput: $("searchInput"),
  dayLabel: $("dayLabel"),
  selectedEvents: $("selectedEvents"),
  upcomingEvents: $("upcomingEvents"),

  addBtn: $("addBtn"),
  editBtn: $("editBtn"),
  deleteSideBtn: $("deleteSideBtn"),
  exportBtn: $("exportBtn"),
  clearAllBtn: $("clearAllBtn"),

  modal: $("eventModal"),
  backdrop: $("backdrop"),
  eventForm: $("eventForm"),
  closeBtn: $("closeBtn"),
  cancelBtn: $("cancelBtn"),
  deleteBtn: $("deleteBtn"),

  modalTitle: $("modalTitle"),
  modalSub: $("modalSub"),

  idInput: $("idInput"),
  titleInput: $("titleInput"),
  dateInput: $("dateInput"),
  endDateInput: $("endDateInput"),
  startInput: $("startInput"),
  endInput: $("endInput"),
  descInput: $("descInput"),
  remindInput: $("remindInput"),
  colorInput: $("colorInput"),
  conflictBox: $("conflictBox"),

  notifBanner: $("notifBanner"),
  notifAllowBtn: $("notifAllowBtn"),
  notifDismissBtn: $("notifDismissBtn")
};

/* ───────────────── STORAGE ───────────────── */
const STORAGE_KEY = "calendra_lite_events_v2";
const POPUP_SEEN_KEY = "calendra_lite_popup_seen_v1";
const NOTIF_SENT_KEY = "calendra_notif_sent_v1";
const BANNER_DISMISSED_KEY = "calendra_notif_banner_dismissed";

/* ───────────────── STATE ───────────────── */
let events = loadEvents();
let viewDate = new Date();
let selectedDate = toDateKey(new Date());
let editingId = null;
let selectedEventId = null;

/* ───────────────── INIT ───────────────── */
init();

function init() {
  bind();
  initTheme();
  initYearDropdown();
  initMonthDropdown();
  render();
  renderDayPanel();
  registerServiceWorker();
  initNotificationBanner();
  checkPopupReminders();
  checkPassiveReminders();
  setInterval(checkPassiveReminders, 60000);
}

/* ───────────────── BINDINGS ───────────────── */
function bind() {
  els.prevBtn.onclick = () => { viewDate = addMonths(viewDate,-1); render(); };
  els.nextBtn.onclick = () => { viewDate = addMonths(viewDate,1); render(); };

  els.todayBtn.onclick = () => {
    viewDate = new Date();
    selectedDate = toDateKey(new Date());
    selectedEventId = null;
    render();
    renderDayPanel();
  };

  els.searchInput.oninput = () => { render(); renderDayPanel(); };
  els.addBtn.onclick = () => openModalForDate(selectedDate);

  els.editBtn.onclick = () => {
    if(!selectedEventId) return toast("Select an event first");
    openModalForEdit(selectedEventId);
  };

  els.deleteSideBtn.onclick = () => {
    if(!selectedEventId) return toast("Select an event first");
    editingId = selectedEventId;
    onDelete();
  };

  els.exportBtn.onclick = exportEvents;

  els.clearAllBtn.onclick = () => {
    if(!confirm("Delete ALL events?")) return;
    events = [];
    saveEvents(events);
    selectedEventId = null;
    render();
    renderDayPanel();
  };

  els.closeBtn.onclick = closeModal;
  els.cancelBtn.onclick = closeModal;
  els.backdrop.onclick = closeModal;

  els.eventForm.onsubmit = e => { e.preventDefault(); onSave(); };
  els.deleteBtn.onclick = onDelete;
}

/* ───────────────── RENDER CALENDAR ───────────────── */
function render() {
  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  els.yearSelect.value = y;
  els.monthSelect.value = m;

  const first = new Date(y,m,1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();

  const cells = [];
  for(let i=0;i<startDay;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(new Date(y,m,d));
  while(cells.length < 42) cells.push(null);

  els.grid.innerHTML = "";

  const q = (els.searchInput.value || "").toLowerCase();

  cells.forEach(date=>{
    const cell = document.createElement("div");

    if(!date){
      cell.className="cell empty";
      els.grid.appendChild(cell);
      return;
    }

    const key = toDateKey(date);
    const dayEvents = getEventsOnDate(key)
      .filter(ev => !q || (ev.title + ev.description).toLowerCase().includes(q));

    cell.className="cell";
    if(key===toDateKey(new Date())) cell.classList.add("today");
    if(key===selectedDate) cell.classList.add("selected");

    cell.onclick=()=>{
      selectedDate=key;
      selectedEventId=null;
      render();
      renderDayPanel();
    };

    cell.innerHTML=`<div class="date"><span>${date.getDate()}</span></div>`;

    if(dayEvents.length){
      const pill=document.createElement("span");
      pill.className="pill";
      pill.textContent=dayEvents.length;
      cell.querySelector(".date").appendChild(pill);
    }

    els.grid.appendChild(cell);
  });
}

/* ───────────────── DAY PANEL ───────────────── */
function renderDayPanel(){
  els.selectedEvents.innerHTML="";
  els.upcomingEvents.innerHTML="";

  const selected = new Date(selectedDate+"T00:00:00");
  els.dayLabel.textContent = selected.toLocaleDateString(undefined,{
    weekday:"long",year:"numeric",month:"long",day:"numeric"
  });

  const q = (els.searchInput.value || "").toLowerCase();

  const dayEvents = getEventsOnDate(selectedDate)
    .filter(ev => !q || (ev.title + ev.description).toLowerCase().includes(q))
    .sort((a,b)=>(a.start||"").localeCompare(b.start||""));

  if(!dayEvents.length){
    els.selectedEvents.innerHTML=`<div class="day-item">No events for this day.</div>`;
  } else {
    dayEvents.forEach(ev=>{
      const item = createEventCard(ev,false);
      if(ev.id===selectedEventId) item.classList.add("selected");
      item.onclick=()=>{selectedEventId=ev.id; renderDayPanel();};
      els.selectedEvents.appendChild(item);
    });
  }

  const upcoming = events
    .filter(ev=>ev.date>selectedDate)
    .sort((a,b)=>a.date.localeCompare(b.date))
    .slice(0,5);

  if(!upcoming.length){
    els.upcomingEvents.innerHTML=`<div class="day-item">No upcoming events.</div>`;
  } else {
    upcoming.forEach(ev=>{
      els.upcomingEvents.appendChild(createEventCard(ev,true));
    });
  }
}

function createEventCard(ev,showDate){
  const item=document.createElement("div");
  item.className="day-item";

  let tag="All day";
  if(ev.start && ev.end) tag=`${ev.start} – ${ev.end}`;

  item.innerHTML=`
  <div class="event-row">
    <div class="event-info">
      <div class="title">${escapeHtml(ev.title)}</div>
      ${showDate?`<div class="meta">${ev.date}</div>`:""}
      <div class="tag">${tag}</div>
    </div>
  </div>`;
  return item;
}

/* ───────────────── SAVE / DELETE ───────────────── */
function onSave(){
  const ev={
    id: editingId || safeUUID(),
    title: els.titleInput.value.trim(),
    date: els.dateInput.value,
    endDate: els.endDateInput.value,
    start: els.startInput.value || null,
    end: els.endInput.value || null,
    description: els.descInput.value.trim(),
    remindMode: els.remindInput.value,
    color: els.colorInput.value
  };

  if(!ev.title||!ev.date) return toast("Fill required fields");

  const idx=events.findIndex(e=>e.id===ev.id);
  if(idx>=0) events[idx]=ev;
  else events.push(ev);

  saveEvents(events);

  selectedDate=ev.date;
  selectedEventId=ev.id;
  viewDate=new Date(ev.date);

  render();
  renderDayPanel();
  closeModal();
}

function onDelete(){
  if(!editingId) return;
  if(!confirm("Delete this event?")) return;

  events=events.filter(e=>e.id!==editingId);
  saveEvents(events);
  selectedEventId=null;

  render();
  renderDayPanel();
  closeModal();
}

/* ───────────────── HELPERS ───────────────── */
function loadEvents(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); }
  catch{ return []; }
}

function saveEvents(list){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(list));
  syncEventsToSW();
}

function getEventsOnDate(key){
  return events.filter(ev=>key>=ev.date && key<=(ev.endDate||ev.date));
}

function toDateKey(d){
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

function addMonths(d,n){
  return new Date(d.getFullYear(),d.getMonth()+n,1);
}

function safeUUID(){
  return crypto.randomUUID?crypto.randomUUID():Date.now()+"_"+Math.random();
}

function escapeHtml(s=""){
  return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function closeModal(){
  els.modal.close();
  els.backdrop.hidden=true;
}

/* ───────────────── NOTIFICATIONS ───────────────── */
function registerServiceWorker(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js");
  }
}

function initNotificationBanner(){
  if(!("Notification" in window)) return;
  if(Notification.permission==="default"){
    els.notifBanner.hidden=false;
    els.notifAllowBtn.onclick=()=>Notification.requestPermission();
    els.notifDismissBtn.onclick=()=>els.notifBanner.hidden=true;
  }
}

function syncEventsToSW(){}
function checkPassiveReminders(){}
function checkPopupReminders(){}

/* ───────────────── THEME ───────────────── */
function initTheme(){
  const btn=document.getElementById("themeToggle");
  const saved=localStorage.getItem("calendar_theme");
  if(saved==="dark"){ document.body.classList.add("dark"); }
  btn.onclick=()=>document.body.classList.toggle("dark");
}

function toast(msg){ alert(msg); }

})();