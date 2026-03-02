(function () {
    const $ = (id) => document.getElementById(id);

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
    };

    const STORAGE_KEY = "calendra_lite_events_v2";
    const POPUP_SEEN_KEY = "calendra_lite_popup_seen_v1";

    let events = loadEvents();
    let viewDate = new Date();
    let selectedDate = toDateKey(new Date());

    let editingId = null;
    let selectedEventId = null;

    init();

    function init() {
        bind();
        initTheme();
        initYearDropdown();
        initMonthDropdown();
        render();
        renderDayPanel();
        checkPopupReminders();
    }

    function initYearDropdown() {
        const currentYear = new Date().getFullYear();
        const start = currentYear - 50;
        const end = currentYear + 50;

        for (let y = start; y <= end; y++) {
            const option = document.createElement("option");
            option.value = y;
            option.textContent = y;
            els.yearSelect.appendChild(option);
        }

        els.yearSelect.value = viewDate.getFullYear();

        els.yearSelect.addEventListener("change", function () {
            const selectedYear = parseInt(this.value);
            viewDate = new Date(selectedYear, viewDate.getMonth(), 1);
            render();
        });
    }

    function initMonthDropdown() {
        const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        els.monthSelect.innerHTML = "";

        months.forEach((month, index) => {
            const option = document.createElement("option");
            option.value = index;
            option.textContent = month;
            els.monthSelect.appendChild(option);
        });

        els.monthSelect.value = viewDate.getMonth();

        els.monthSelect.addEventListener("change", function () {
            const selectedMonth = parseInt(this.value);
            viewDate = new Date(viewDate.getFullYear(), selectedMonth, 1);
            render();
        });
    }

    function bind() {
        els.prevBtn.addEventListener("click", () => {
            viewDate = addMonths(viewDate, -1);
            render();
        });
        els.nextBtn.addEventListener("click", () => {
            viewDate = addMonths(viewDate, 1);
            render();
        });
        els.todayBtn.addEventListener("click", () => {
            viewDate = new Date();
            selectedDate = toDateKey(new Date());
            selectedEventId = null;
            render();
            renderDayPanel();
        });

        els.searchInput.addEventListener("input", () => {
            render();
            renderDayPanel();
        });

        els.addBtn.addEventListener("click", () => openModalForDate(selectedDate));

        els.editBtn.addEventListener("click", () => {
            if (!selectedEventId) return toast("Select an event first");
            openModalForEdit(selectedEventId);
        });

        els.deleteSideBtn.addEventListener("click", () => {
            if (!selectedEventId) return toast("Select an event first");
            editingId = selectedEventId;
            onDelete();
        });

        els.exportBtn.addEventListener("click", exportEvents);

        els.clearAllBtn.addEventListener("click", () => {
            if (!confirm("Are you sure you want to delete ALL events?")) return;
            events = [];
            saveEvents(events);
            selectedEventId = null;
            render();
            renderDayPanel();
            toast("All events cleared");
        });

        els.closeBtn.addEventListener("click", closeModal);
        els.cancelBtn.addEventListener("click", closeModal);
        els.backdrop.addEventListener("click", closeModal);

        // Auto-suggest titles while typing
        els.titleInput.addEventListener("input", () => {
            const { titleFrequency } = analyzeEventPatterns();
            const input = els.titleInput.value.toLowerCase();

            const suggestions = Object.keys(titleFrequency)
                .filter(title => title.toLowerCase().startsWith(input))
                .sort((a, b) => titleFrequency[b] - titleFrequency[a]);

            if (suggestions.length > 0 && input.length > 0) {
                els.titleInput.setAttribute("placeholder", `Suggested: ${suggestions[0]}`);
            }
        });

        els.eventForm.addEventListener("submit", (e) => {
            e.preventDefault();
            onSave();
        });

        els.deleteBtn.addEventListener("click", onDelete);

        ["dateInput", "endDateInput", "startInput", "endInput"].forEach(id =>
            $(id).addEventListener("input", () => updateConflictWarning(editingId))
        );

        // Smart time suggestion based on weekday
        els.dateInput.addEventListener("change", () => {
            const { weekdayTimePatterns } = analyzeEventPatterns();
            const selectedDateVal = new Date(els.dateInput.value + "T00:00:00");
            const weekday = selectedDateVal.getDay();

            if (weekdayTimePatterns[weekday]) {
                const sortedTimes = Object.entries(weekdayTimePatterns[weekday])
                    .sort((a, b) => b[1] - a[1]);

                if (sortedTimes.length > 0) {
                    const [timeRange] = sortedTimes[0];
                    const [start, end] = timeRange.split("-");

                    // Only autofill if empty
                    if (!els.startInput.value && !els.endInput.value) {
                        els.startInput.value = start;
                        els.endInput.value = end;
                    }
                }
            }
        });
    }

    // ---------- RENDER CALENDAR ----------
    function render() {
        let anyMatch = false;
        const y = viewDate.getFullYear();
        els.yearSelect.value = y;
        const m = viewDate.getMonth();
        els.monthSelect.value = m;

        const first = new Date(y, m, 1);
        const startDay = first.getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();

        const cells = [];
        for (let i = 0; i < startDay; i++) cells.push({ empty: true });

        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({ empty: false, date: new Date(y, m, d) });
        }

        while (cells.length % 7 !== 0) cells.push({ empty: true });
        while (cells.length < 42) cells.push({ empty: true });

        const q = (els.searchInput.value || "").trim().toLowerCase();

        els.grid.innerHTML = "";
        cells.forEach(cellData => {
            const cell = document.createElement("div");

            if (cellData.empty) {
                cell.className = "cell empty";
                cell.innerHTML = `<div class="date"><span></span><span></span></div>`;
                els.grid.appendChild(cell);
                return;
            }

            const date = cellData.date;
            const key = toDateKey(date);

            const dayEvents = getEventsOnDate(key)
                .filter(ev => !q || formatSearch(ev).includes(q))
                .sort((a, b) => (a.start || "").localeCompare(b.start || ""));

            if (dayEvents.length > 0) {
                anyMatch = true;
            }

            if (q && dayEvents.length === 0) {
                cell.style.display = "none";
            }

            cell.className = "cell";
            if (key === toDateKey(new Date())) cell.classList.add("today");
            if (key === selectedDate) cell.classList.add("selected");

            cell.addEventListener("click", () => {
                selectedDate = key;
                selectedEventId = null;
                render();
                renderDayPanel();
            });

            const head = document.createElement("div");
            head.className = "date";

            const left = document.createElement("span");
            left.textContent = String(date.getDate());
            head.appendChild(left);

            const right = document.createElement("span");
            if (dayEvents.length) {
                const pill = document.createElement("span");
                pill.className = "pill";
                pill.textContent = String(dayEvents.length);
                right.appendChild(pill);
            }
            head.appendChild(right);

            const list = document.createElement("div");
            list.className = "events";

            dayEvents.slice(0, 3).forEach(ev => {
                const item = document.createElement("div");
                item.className = "event-chip";
                if (ev.color && ev.color !== "default") {
                    item.dataset.color = ev.color;
                }

                const timeText = (ev.start && ev.end) ? ` ${ev.start}` : "";
                const bell = (ev.remindMode === "popup") ? " ⏰" : "";

                item.innerHTML = `<div><b>${escapeHtml(ev.title)}</b><span class="t">${timeText}${bell}</span></div><div class="t"></div>`;

                item.addEventListener("click", (e) => {
                    e.stopPropagation();
                    selectedEventId = ev.id;
                    openModalForEdit(ev.id);
                });

                list.appendChild(item);
            });

            cell.appendChild(head);
            cell.appendChild(list);
            els.grid.appendChild(cell);
        });

        // "No results" message for search
        let noResultEl = document.getElementById("noResults");
        if (!noResultEl) {
            noResultEl = document.createElement("div");
            noResultEl.id = "noResults";
            noResultEl.style.textAlign = "center";
            noResultEl.style.padding = "10px";
            noResultEl.style.fontWeight = "bold";
            noResultEl.style.color = "red";
            els.grid.parentNode.appendChild(noResultEl);
        }
        if (q && !anyMatch) {
            noResultEl.textContent = "No events found";
            noResultEl.style.display = "block";
        } else {
            noResultEl.style.display = "none";
        }
    }

    function renderDayPanel() {

    const selectedContainer = els.selectedEvents;
    const upcomingContainer = els.upcomingEvents;

    selectedContainer.innerHTML = "";
    upcomingContainer.innerHTML = "";

    const selected = new Date(selectedDate + "T00:00:00");

    els.dayLabel.textContent = selected.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    const q = (els.searchInput.value || "").trim().toLowerCase();

    // ===== SELECTED DAY EVENTS =====
    const dayEvents = getEventsOnDate(selectedDate)
        .filter(ev => !q || formatSearch(ev).includes(q))
        .sort((a, b) => (a.start || "").localeCompare(b.start || ""));

    if (!dayEvents.length) {
        selectedContainer.innerHTML = `<div class="day-item">No events for this day.</div>`;
    } else {
        dayEvents.forEach(ev => {
            const item = createEventCard(ev);
            selectedContainer.appendChild(item);
        });
    }

    // ===== UPCOMING EVENTS =====
    const upcoming = events
    .filter(ev => ev.date > selectedDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

    if (!upcoming.length) {
        upcomingContainer.innerHTML = `<div class="day-item">No upcoming events.</div>`;
    } else {
        upcoming.forEach(ev => {
            const item = createEventCard(ev, true);
            upcomingContainer.appendChild(item);
        });
    }
}
function createEventCard(ev, showDate = false) {

    const item = document.createElement("div");
    item.className = "day-item";

    if (ev.color && ev.color !== "default") {
        item.dataset.color = ev.color;
    }

    let tag = "All day";
    if (ev.start && ev.end) {
        tag = `${ev.start} – ${ev.end}`;
    }

    const dateText = showDate ? `<div class="meta">${ev.date}</div>` : "";

    item.innerHTML = `
        <div class="event-row">
            <div class="event-info">
                <div class="title">${escapeHtml(ev.title)}</div>
                ${dateText}
                <div class="tag">${escapeHtml(tag)}</div>
            </div>

            <div class="event-actions">
                <button class="pill-btn edit-btn">Edit</button>
                <button class="pill-btn delete-btn">Delete</button>
            </div>
        </div>
    `;

    item.querySelector(".edit-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        openModalForEdit(ev.id);
    });

    item.querySelector(".delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        editingId = ev.id;
        onDelete();
    });

    return item;
}
    // ---------- MODAL ----------
    function openModalForDate(dateKey) {
        editingId = null;
        els.deleteBtn.hidden = true;

        els.modalTitle.textContent = "New event";
        els.modalSub.textContent = "Fill details and click Save.";

        els.idInput.value = "";
        els.titleInput.value = "";
        els.dateInput.value = dateKey;
        els.endDateInput.value = dateKey;

        els.startInput.value = "";
        els.endInput.value = "";

        els.descInput.value = "";
        els.remindInput.value = "off";
        els.colorInput.value = "default";

        els.conflictBox.hidden = true;
        showModal();
    }

    function openModalForEdit(id) {
        const ev = events.find(e => e.id === id);
        if (!ev) return;

        editingId = id;
        els.deleteBtn.hidden = false;

        els.modalTitle.textContent = "Edit event";
        els.modalSub.textContent = "Update or delete this event.";

        els.idInput.value = id;
        els.titleInput.value = ev.title || "";
        els.dateInput.value = ev.date;
        els.endDateInput.value = ev.endDate || ev.date;

        els.startInput.value = ev.start || "";
        els.endInput.value = ev.end || "";

        els.descInput.value = ev.description || "";
        els.remindInput.value = ev.remindMode || "off";
        els.colorInput.value = ev.color || "default";

        updateConflictWarning(editingId);
        showModal();
    }

    function draftFromForm() {
        const id = els.idInput.value || editingId || safeUUID();
        return {
            id,
            title: els.titleInput.value.trim(),
            date: els.dateInput.value,
            endDate: els.endDateInput.value,
            start: els.startInput.value || null,
            end: els.endInput.value || null,
            description: els.descInput.value.trim(),
            remindMode: els.remindInput.value,
            color: els.colorInput.value
        };
    }

    function onSave() {
        const ev = draftFromForm();

        if (!ev.title || !ev.date) {
            toast("Please fill required fields");
            return;
        }

        if (ev.endDate && ev.endDate < ev.date) {
            toast("End date cannot be before start date");
            return;
        }

        if ((ev.start && !ev.end) || (!ev.start && ev.end)) {
            toast("If you set time, set both Start and End");
            return;
        }

        if (ev.date === ev.endDate && ev.start && ev.end && ev.end <= ev.start) {
            toast("End time must be after start time");
            return;
        }

        const conflicts = detectConflicts(ev, editingId);
        els.conflictBox.hidden = conflicts.length === 0;

        if (conflicts.length) {
            const sample = conflicts.slice(0, 2).map(e => `• ${e.title} (${e.date} ${e.start}-${e.end})`).join("\n");
            if (!confirm(`Conflict detected with:\n${sample}\n\nSave anyway?`)) return;
        }

        const idx = events.findIndex(e => e.id === ev.id);
        if (idx >= 0) events[idx] = ev;
        else events.push(ev);

        saveEvents(events);

        selectedDate = ev.date;
        selectedEventId = ev.id;
        viewDate = new Date(ev.date + "T00:00:00");

        render();
        renderDayPanel();
        closeModal();
        toast("Saved");

        checkPopupReminders();
    }

    function onDelete() {
        if (!editingId) return;
        if (!confirm("Delete this event?")) return;

        events = events.filter(e => e.id !== editingId);
        saveEvents(events);

        if (selectedEventId === editingId) selectedEventId = null;

        render();
        renderDayPanel();
        closeModal();
        toast("Deleted");
    }

    function showModal() {
        els.backdrop.hidden = false;
        els.modal.showModal();
    }

    function closeModal() {
        els.modal.close();
        els.backdrop.hidden = true;
    }

    // ---------- EXPORT EVENTS ----------
    function exportEvents() {
        if (events.length === 0) {
            toast("No events to export!");
            return;
        }

        const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

        const content = sorted.map((ev, i) => {
            let time = "All day";
            if (ev.start && ev.end) {
                if (ev.endDate && ev.endDate !== ev.date) {
                    time = `${ev.date} ${ev.start} – ${ev.endDate} ${ev.end}`;
                } else {
                    time = `${ev.start} – ${ev.end}`;
                }
            }
            const desc = ev.description ? `\n   Description: ${ev.description}` : "";
            const remind = ev.remindMode === "popup" ? "\n   🔔 Reminder enabled" : "";
            const color = (ev.color && ev.color !== "default") ? `\n   Color: ${ev.color}` : "";
            return `Event ${i + 1}:\n   Title: ${ev.title}\n   Date: ${ev.date}\n   Time: ${time}${desc}${remind}${color}`;
        }).join("\n\n---\n\n");

        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "my-calendar-events.txt";
        a.click();
        URL.revokeObjectURL(url);
        toast("Events exported!");
    }

    // ---------- SEARCH / CONFLICTS ----------
    function formatSearch(ev) {
        return (ev.title + " " + (ev.description || "")).toLowerCase();
    }

    function getEventsOnDate(dateKey) {
        const d = new Date(dateKey + "T00:00:00");
        return events.filter(ev => {
            const eventStart = new Date(ev.date + "T00:00:00");
            const eventEnd = ev.endDate ? new Date(ev.endDate + "T00:00:00") : eventStart;
            return d >= eventStart && d <= eventEnd;
        });
    }

    function detectConflicts(candidate, excludeId = null) {
        if (!candidate.start || !candidate.end) return [];
        const candidateStart = new Date(`${candidate.date}T${candidate.start}`);
        const candidateEnd = new Date(`${candidate.endDate || candidate.date}T${candidate.end}`);

        return events
            .filter(e => e.id !== excludeId && e.start && e.end)
            .filter(e => {
                const existingStart = new Date(`${e.date}T${e.start}`);
                const existingEnd = new Date(`${e.endDate || e.date}T${e.end}`);
                return candidateStart < existingEnd && existingStart < candidateEnd;
            });
    }

    function updateConflictWarning(excludeId = null) {
        const d = draftFromForm();
        if (!d.date || !d.start || !d.end) {
            els.conflictBox.hidden = true;
            return;
        }
        els.conflictBox.hidden = detectConflicts(d, excludeId).length === 0;
    }

    // ---------- SMART PATTERN ANALYSIS ----------
    function analyzeEventPatterns() {
        const titleFrequency = {};
        const weekdayTimePatterns = {};

        events.forEach(ev => {
            // Count title usage
            if (ev.title) {
                titleFrequency[ev.title] = (titleFrequency[ev.title] || 0) + 1;
            }

            // Track weekday + time pattern
            if (ev.start && ev.end) {
                const weekday = new Date(ev.date + "T00:00:00").getDay();

                if (!weekdayTimePatterns[weekday]) {
                    weekdayTimePatterns[weekday] = {};
                }

                const timeKey = `${ev.start}-${ev.end}`;
                weekdayTimePatterns[weekday][timeKey] =
                    (weekdayTimePatterns[weekday][timeKey] || 0) + 1;
            }
        });

        return { titleFrequency, weekdayTimePatterns };
    }

    // ---------- LOCAL STORAGE ----------
    function loadEvents() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const items = raw ? JSON.parse(raw) : [];
            return Array.isArray(items) ? items : [];
        } catch {
            return [];
        }
    }

    function saveEvents(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    // ---------- DATE HELPERS ----------
    function toDateKey(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function addMonths(d, n) {
        return new Date(d.getFullYear(), d.getMonth() + n, 1);
    }

    // ---------- POPUP REMINDERS ----------
    function checkPopupReminders() {
        const todayKey = toDateKey(new Date());

        let seen = {};
        try {
            seen = JSON.parse(localStorage.getItem(POPUP_SEEN_KEY) || "{}");
        } catch {
            seen = {};
        }

        if (seen[todayKey]) return;

        const today = new Date(todayKey + "T00:00:00");
        const tomorrowKey = toDateKey(new Date(today.getTime() + 24 * 60 * 60 * 1000));

        const todayEvents = getEventsOnDate(todayKey).filter(e => e.remindMode === "popup");
        const tomorrowEvents = getEventsOnDate(tomorrowKey).filter(e => e.remindMode === "popup");

        const list = [
            ...todayEvents.map(e => ({ e, when: "Today" })),
            ...tomorrowEvents.map(e => ({ e, when: "Tomorrow" }))
        ];

        if (!list.length) return;

        const lines = list.slice(0, 6).map(x => `• ${x.e.title} (${x.when})`);
        const msg =
            "🔔 Reminder\n\n" +
            lines.join("\n") +
            (list.length > 6 ? `\n+${list.length - 6} more` : "");

        alert(msg);

        seen[todayKey] = true;
        localStorage.setItem(POPUP_SEEN_KEY, JSON.stringify(seen));
    }

    // ---------- UTILS ----------
    function safeUUID() {
        return (crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
    }

    function escapeHtml(s = "") {
        return String(s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    let toastTimer = null;
    function toast(msg) {
        let el = document.getElementById("toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "toast";
            Object.assign(el.style, {
                position: "fixed",
                left: "50%",
                bottom: "18px",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,.78)",
                color: "#fff",
                padding: "10px 12px",
                borderRadius: "999px",
                fontWeight: "900",
                fontSize: "12px",
                zIndex: "100",
                maxWidth: "calc(100% - 24px)",
                textAlign: "center"
            });
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = "1";
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.style.opacity = "0";
        }, 1600);
    }

    function initTheme() {
        const btn = document.getElementById("themeToggle");

        const saved = localStorage.getItem("calendar_theme");
        if (saved === "dark") {
            document.body.classList.add("dark");
            btn.textContent = "☀️ Light";
        }

        btn.addEventListener("click", () => {
            document.body.classList.toggle("dark");
            const isDark = document.body.classList.contains("dark");
            btn.textContent = isDark ? "☀️ Light" : "🌙 Dark";
            localStorage.setItem("calendar_theme", isDark ? "dark" : "light");
        });
    }
})();
