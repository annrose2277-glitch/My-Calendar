(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);

    const els = {
        prevBtn:        $("prevBtn"),
        nextBtn:        $("nextBtn"),
        todayBtn:       $("todayBtn"),
        monthSelect:    $("monthSelect"),
        yearSelect:     $("yearSelect"),
        grid:           $("grid"),
        searchInput:    $("searchInput"),
        dayLabel:       $("dayLabel"),
        selectedEvents: $("selectedEvents"),
        upcomingEvents: $("upcomingEvents"),
        addBtn:         $("addBtn"),
        editBtn:        $("editBtn"),
        deleteSideBtn:  $("deleteSideBtn"),
        exportBtn:      $("exportBtn"),
        clearAllBtn:    $("clearAllBtn"),
        modal:          $("eventModal"),
        backdrop:       $("backdrop"),
        eventForm:      $("eventForm"),
        closeBtn:       $("closeBtn"),
        cancelBtn:      $("cancelBtn"),
        deleteBtn:      $("deleteBtn"),
        modalTitle:     $("modalTitle"),
        modalSub:       $("modalSub"),
        idInput:        $("idInput"),
        titleInput:     $("titleInput"),
        dateInput:      $("dateInput"),
        endDateInput:   $("endDateInput"),
        startInput:     $("startInput"),
        endInput:       $("endInput"),
        descInput:      $("descInput"),
        remindInput:    $("remindInput"),
        colorInput:     $("colorInput"),
        conflictBox:    $("conflictBox"),
        notifBanner:    $("notifBanner"),
        notifAllowBtn:  $("notifAllowBtn"),
        notifDismissBtn:$("notifDismissBtn"),
    };

    const STORAGE_KEY          = "calendra_lite_events_v2";
    const POPUP_SEEN_KEY       = "calendra_lite_popup_seen_v1";
    const NOTIF_SENT_KEY       = "calendra_notif_sent_v1";
    const BANNER_DISMISSED_KEY = "calendra_notif_banner_dismissed";

    let events          = loadEvents();
    let viewDate        = new Date();
    let selectedDate    = toDateKey(new Date());
    let editingId       = null;
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
        registerServiceWorker();
        initNotificationBanner();
        checkPassiveReminders();
        setInterval(checkPassiveReminders, 60_000);
    }

    // ─── SERVICE WORKER ──────────────────────────────────────────────────────
    function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;
        navigator.serviceWorker.register("sw.js")
            .then(reg => {
                navigator.serviceWorker.addEventListener("message", e => {
                    if (e.data && e.data.type === "SW_LOG") console.log("[SW → Page]", e.data.msg);
                });
            })
            .catch(err => console.error("[SW] Registration FAILED:", err));
    }

    // ─── NOTIFICATION BANNER ─────────────────────────────────────────────────
    function initNotificationBanner() {
        if (!("Notification" in window)) return;
        if (Notification.permission === "granted") { syncEventsToSW(); return; }
        if (Notification.permission === "denied") return;
        if (localStorage.getItem(BANNER_DISMISSED_KEY)) return;

        els.notifBanner.hidden = false;

        els.notifAllowBtn.addEventListener("click", () => {
            Notification.requestPermission().then(perm => {
                els.notifBanner.hidden = true;
                if (perm === "granted") {
                    toast("🔔 Notifications enabled!");
                    syncEventsToSW();
                    checkPassiveReminders();
                } else if (perm === "denied") {
                    toast("Notifications blocked. Enable them in browser settings.");
                }
            });
        });

        els.notifDismissBtn.addEventListener("click", () => {
            els.notifBanner.hidden = true;
            localStorage.setItem(BANNER_DISMISSED_KEY, "1");
        });
    }

    // ─── SYNC TO SW ──────────────────────────────────────────────────────────
    function syncEventsToSW() {
        if (!("caches" in window)) return;
        caches.open("calendar-data-v1").then(cache => {
            cache.put("events", new Response(JSON.stringify(events), { headers: { "Content-Type": "application/json" } }));
            cache.put("notif-sent", new Response(JSON.stringify(getNotifSent()), { headers: { "Content-Type": "application/json" } }));
        }).catch(err => console.error("[Cache] Failed:", err));
    }

    // ─── PASSIVE REMINDERS ───────────────────────────────────────────────────
    function getNotifSent() { try { return JSON.parse(localStorage.getItem(NOTIF_SENT_KEY) || "{}"); } catch { return {}; } }
    function setNotifSent(obj) { localStorage.setItem(NOTIF_SENT_KEY, JSON.stringify(obj)); }

    function checkPassiveReminders() {
        if (!("Notification" in window) || Notification.permission !== "granted") return;

        const now = new Date(), todayKey = toDateKey(now), nowMs = now.getTime();
        const sent = getNotifSent();
        let dirty = false;

        Object.keys(sent).forEach(k => { if (!k.startsWith(todayKey)) { delete sent[k]; dirty = true; } });

        getEventsOnDate(todayKey).forEach(ev => {
            const mins = parseInt(ev.remindMode, 10);
            if (!ev.start || isNaN(mins)) return;

            const eventMs = new Date(ev.date + "T" + ev.start).getTime();
            const diffMins = (eventMs - nowMs) / 60_000;
            const sentKey = todayKey + "_" + ev.id + "_" + mins;

            if (diffMins <= 0 || diffMins > mins || sent[sentKey]) return;

            const roundedMins = Math.round(diffMins);
            const timeLabel = roundedMins >= 60 ? "1 hour" : roundedMins + " minute" + (roundedMins !== 1 ? "s" : "");
            const notifTitle = "⏰ " + ev.title;
            const notifBody = "Starting in about " + timeLabel;

            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: "SHOW_NOTIFICATION", title: notifTitle, body: notifBody, tag: sentKey, icon: "images/android-chrome-512x512.png" });
            } else {
                try { new Notification(notifTitle, { body: notifBody, tag: sentKey, icon: "images/android-chrome-512x512.png" }); } catch (err) { console.error(err); }
            }

            sent[sentKey] = true;
            dirty = true;
            toast("🔔 " + ev.title + " in ~" + timeLabel);
        });

        if (dirty) { setNotifSent(sent); syncEventsToSW(); }
    }

    // ─── DROPDOWNS ───────────────────────────────────────────────────────────
    function initYearDropdown() {
        const cur = new Date().getFullYear();
        for (let y = cur - 50; y <= cur + 50; y++) {
            const opt = document.createElement("option"); opt.value = y; opt.textContent = y;
            els.yearSelect.appendChild(opt);
        }
        els.yearSelect.value = viewDate.getFullYear();
        els.yearSelect.addEventListener("change", function () { viewDate = new Date(parseInt(this.value), viewDate.getMonth(), 1); render(); });
    }

    function initMonthDropdown() {
        const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        els.monthSelect.innerHTML = "";
        months.forEach((m, i) => { const opt = document.createElement("option"); opt.value = i; opt.textContent = m; els.monthSelect.appendChild(opt); });
        els.monthSelect.value = viewDate.getMonth();
        els.monthSelect.addEventListener("change", function () { viewDate = new Date(viewDate.getFullYear(), parseInt(this.value), 1); render(); });
    }

    // ─── BINDINGS ────────────────────────────────────────────────────────────
    function bind() {
        els.prevBtn.addEventListener("click", () => { viewDate = addMonths(viewDate, -1); render(); });
        els.nextBtn.addEventListener("click", () => { viewDate = addMonths(viewDate, 1); render(); });
        els.todayBtn.addEventListener("click", () => { viewDate = new Date(); selectedDate = toDateKey(new Date()); selectedEventId = null; render(); renderDayPanel(); });
        els.searchInput.addEventListener("input", () => { render(); renderDayPanel(); });
        els.addBtn.addEventListener("click", () => openModalForDate(selectedDate));
        els.editBtn.addEventListener("click", () => { if (!selectedEventId) return toast("Select an event first"); openModalForEdit(selectedEventId); });
        els.deleteSideBtn.addEventListener("click", () => { if (!selectedEventId) return toast("Select an event first"); editingId = selectedEventId; onDelete(); });
        els.exportBtn.addEventListener("click", exportEvents);
        els.clearAllBtn.addEventListener("click", () => { if (!confirm("Are you sure you want to delete ALL events?")) return; events = []; saveEvents(events); selectedEventId = null; render(); renderDayPanel(); toast("All events cleared"); });
        els.closeBtn.addEventListener("click", closeModal);
        els.cancelBtn.addEventListener("click", closeModal);
        els.backdrop.addEventListener("click", closeModal);
        els.eventForm.addEventListener("submit", e => { e.preventDefault(); onSave(); });
        els.deleteBtn.addEventListener("click", onDelete);
        ["dateInput","endDateInput","startInput","endInput"].forEach(id => $(id).addEventListener("input", () => updateConflictWarning(editingId)));
    }

    // ─── RENDER CALENDAR ─────────────────────────────────────────────────────
    function render() {
        let anyMatch = false;
        const y = viewDate.getFullYear(), m = viewDate.getMonth();
        els.yearSelect.value = y; els.monthSelect.value = m;

        const startDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < startDay; i++) cells.push({ empty: true });
        for (let d = 1; d <= daysInMonth; d++) cells.push({ empty: false, date: new Date(y, m, d) });
        while (cells.length % 7 !== 0) cells.push({ empty: true });
        while (cells.length < 42) cells.push({ empty: true });

        const q = (els.searchInput.value || "").trim().toLowerCase();
        els.grid.innerHTML = "";

        cells.forEach(cellData => {
            const cell = document.createElement("div");
            if (cellData.empty) { cell.className = "cell empty"; cell.innerHTML = `<div class="date"><span></span><span></span></div>`; els.grid.appendChild(cell); return; }

            const date = cellData.date, key = toDateKey(date);
            const dayEvents = getEventsOnDate(key).filter(ev => !q || formatSearch(ev).includes(q)).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
            if (dayEvents.length > 0) anyMatch = true;
            if (q && dayEvents.length === 0) cell.style.display = "none";

            cell.className = "cell";
            if (key === toDateKey(new Date())) cell.classList.add("today");
            if (key === selectedDate) cell.classList.add("selected");
            cell.addEventListener("click", () => { selectedDate = key; selectedEventId = null; render(); renderDayPanel(); });

            const head = document.createElement("div"); head.className = "date";
            const left = document.createElement("span"); left.textContent = String(date.getDate());
            const right = document.createElement("span");
            if (dayEvents.length) { const pill = document.createElement("span"); pill.className = "pill"; pill.textContent = String(dayEvents.length); right.appendChild(pill); }
            head.appendChild(left); head.appendChild(right);

            const list = document.createElement("div"); list.className = "events";
            dayEvents.slice(0, 3).forEach(ev => {
                const item = document.createElement("div"); item.className = "event-chip";
                if (ev.color && ev.color !== "default") item.dataset.color = ev.color;
                const timeText = (ev.start && ev.end) ? " " + ev.start : "";
                const bell = (ev.remindMode && ev.remindMode !== "off") ? " 🔔" : "";
                item.innerHTML = `<div><b>${escapeHtml(ev.title)}</b><span class="t">${timeText}${bell}</span></div><div class="t"></div>`;
                item.addEventListener("click", e => { e.stopPropagation(); selectedEventId = ev.id; openModalForEdit(ev.id); });
                list.appendChild(item);
            });

            cell.appendChild(head); cell.appendChild(list); els.grid.appendChild(cell);
        });

        let noResultEl = document.getElementById("noResults");
        if (!noResultEl) { noResultEl = document.createElement("div"); noResultEl.id = "noResults"; Object.assign(noResultEl.style, { textAlign: "center", padding: "10px", fontWeight: "bold", color: "red" }); els.grid.parentNode.appendChild(noResultEl); }
        noResultEl.style.display = (q && !anyMatch) ? "block" : "none";
        if (q && !anyMatch) noResultEl.textContent = "No events found";
    }

    // ─── RENDER DAY PANEL (Selected + Upcoming) ─────────────────────────────
    function renderDayPanel() {
        const selectedContainer = els.selectedEvents;
        const upcomingContainer = els.upcomingEvents;
        selectedContainer.innerHTML = "";
        upcomingContainer.innerHTML = "";

        const selected = new Date(selectedDate + "T00:00:00");
        els.dayLabel.textContent = selected.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

        const q = (els.searchInput.value || "").trim().toLowerCase();

        // Selected day events
        const dayEvents = getEventsOnDate(selectedDate).filter(ev => !q || formatSearch(ev).includes(q)).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
        if (!dayEvents.length) {
            selectedContainer.innerHTML = `<div class="day-item">No events for this day.</div>`;
        } else {
            dayEvents.forEach(ev => selectedContainer.appendChild(createEventCard(ev)));
        }

        // Upcoming events
        const upcoming = events.filter(ev => ev.date > selectedDate).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
        if (!upcoming.length) {
            upcomingContainer.innerHTML = `<div class="day-item">No upcoming events.</div>`;
        } else {
            upcoming.forEach(ev => upcomingContainer.appendChild(createEventCard(ev, true)));
        }
    }

    function createEventCard(ev, showDate = false) {
        const item = document.createElement("div");
        item.className = "day-item";
        if (ev.color && ev.color !== "default") item.dataset.color = ev.color;

        let tag = "All day";
        if (ev.start && ev.end) tag = `${ev.start} – ${ev.end}`;

        const dateText = showDate ? `<div class="meta">${ev.date}</div>` : "";

        const remindLabel =
            ev.remindMode === "popup" ? "🔔 Day-of popup reminder<br/>" :
            ev.remindMode === "60"   ? "🔔 Notify 1 hour before<br/>" :
            ev.remindMode === "30"   ? "🔔 Notify 30 mins before<br/>" :
            ev.remindMode === "15"   ? "🔔 Notify 15 mins before<br/>" : "";

        item.innerHTML = `
            <div class="event-row">
                <div class="event-info">
                    <div class="title">${escapeHtml(ev.title)}</div>
                    ${dateText}
                    <div class="tag">${escapeHtml(tag)}</div>
                    <div class="meta">${remindLabel}${ev.description ? escapeHtml(ev.description) : ""}</div>
                </div>
                <div class="event-actions">
                    <button class="pill-btn edit-btn">Edit</button>
                    <button class="pill-btn delete-btn">Delete</button>
                </div>
            </div>
        `;

        item.querySelector(".edit-btn").addEventListener("click", (e) => { e.stopPropagation(); openModalForEdit(ev.id); });
        item.querySelector(".delete-btn").addEventListener("click", (e) => { e.stopPropagation(); editingId = ev.id; onDelete(); });

        return item;
    }

    // ─── MODAL ───────────────────────────────────────────────────────────────
    function openModalForDate(dateKey) {
        editingId = null; els.deleteBtn.hidden = true;
        els.modalTitle.textContent = "New event"; els.modalSub.textContent = "Fill details and click Save.";
        els.idInput.value = ""; els.titleInput.value = ""; els.dateInput.value = dateKey; els.endDateInput.value = dateKey;
        els.startInput.value = ""; els.endInput.value = ""; els.descInput.value = "";
        els.remindInput.value = "off"; els.colorInput.value = "default"; els.conflictBox.hidden = true;
        showModal();
    }

    function openModalForEdit(id) {
        const ev = events.find(e => e.id === id); if (!ev) return;
        editingId = id; els.deleteBtn.hidden = false;
        els.modalTitle.textContent = "Edit event"; els.modalSub.textContent = "Update or delete this event.";
        els.idInput.value = id; els.titleInput.value = ev.title || ""; els.dateInput.value = ev.date;
        els.endDateInput.value = ev.endDate || ev.date; els.startInput.value = ev.start || ""; els.endInput.value = ev.end || "";
        els.descInput.value = ev.description || ""; els.remindInput.value = ev.remindMode || "off"; els.colorInput.value = ev.color || "default";
        updateConflictWarning(editingId); showModal();
    }

    function draftFromForm() {
        return { id: els.idInput.value || editingId || safeUUID(), title: els.titleInput.value.trim(), date: els.dateInput.value, endDate: els.endDateInput.value, start: els.startInput.value || null, end: els.endInput.value || null, description: els.descInput.value.trim(), remindMode: els.remindInput.value, color: els.colorInput.value };
    }

    function onSave() {
        const ev = draftFromForm();
        if (!ev.title || !ev.date) return toast("Please fill required fields");
        if (ev.endDate && ev.endDate < ev.date) return toast("End date cannot be before start date");
        if ((ev.start && !ev.end) || (!ev.start && ev.end)) return toast("If you set time, set both Start and End");
        if (ev.date === ev.endDate && ev.start && ev.end && ev.end <= ev.start) return toast("End time must be after start time");

        const conflicts = detectConflicts(ev, editingId);
        els.conflictBox.hidden = conflicts.length === 0;
        if (conflicts.length) { const sample = conflicts.slice(0, 2).map(e => "• " + e.title + " (" + e.date + " " + e.start + "-" + e.end + ")").join("\n"); if (!confirm("Conflict detected with:\n" + sample + "\n\nSave anyway?")) return; }

        const idx = events.findIndex(e => e.id === ev.id);
        if (idx >= 0) events[idx] = ev; else events.push(ev);
        saveEvents(events);
        selectedDate = ev.date; selectedEventId = ev.id; viewDate = new Date(ev.date + "T00:00:00");
        render(); renderDayPanel(); closeModal(); toast("Saved"); checkPopupReminders();
        if (ev.remindMode !== "off" && ev.remindMode !== "popup") checkPassiveReminders();
    }

    function onDelete() {
        if (!editingId) return; if (!confirm("Delete this event?")) return;
        events = events.filter(e => e.id !== editingId); saveEvents(events);
        if (selectedEventId === editingId) selectedEventId = null;
        render(); renderDayPanel(); closeModal(); toast("Deleted");
    }

    function showModal() { els.backdrop.hidden = false; els.modal.showModal(); }
    function closeModal() { els.modal.close(); els.backdrop.hidden = true; }

    // ─── EXPORT ──────────────────────────────────────────────────────────────
    function exportEvents() {
        if (!events.length) return toast("No events to export!");
        const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
        const content = sorted.map((ev, i) => {
            let time = "All day";
            if (ev.start && ev.end) time = (ev.endDate && ev.endDate !== ev.date) ? ev.date + " " + ev.start + " – " + ev.endDate + " " + ev.end : ev.start + " – " + ev.end;
            const desc = ev.description ? "\n   Description: " + ev.description : "";
            const remind = ev.remindMode !== "off" ? "\n   🔔 Reminder: " + ev.remindMode : "";
            const color = (ev.color && ev.color !== "default") ? "\n   Color: " + ev.color : "";
            return "Event " + (i + 1) + ":\n   Title: " + ev.title + "\n   Date: " + ev.date + "\n   Time: " + time + desc + remind + color;
        }).join("\n\n---\n\n");
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" })); a.download = "my-calendar-events.txt"; a.click(); URL.revokeObjectURL(a.href);
        toast("Events exported!");
    }

    // ─── POPUP REMINDERS ─────────────────────────────────────────────────────
    function checkPopupReminders() {
        const todayKey = toDateKey(new Date());
        let seen = {}; try { seen = JSON.parse(localStorage.getItem(POPUP_SEEN_KEY) || "{}"); } catch { seen = {}; }
        if (seen[todayKey]) return;

        const tomorrowKey = toDateKey(new Date(new Date(todayKey + "T00:00:00").getTime() + 86_400_000));
        const list = [
            ...getEventsOnDate(todayKey).filter(e => e.remindMode === "popup").map(e => ({ e, when: "Today" })),
            ...getEventsOnDate(tomorrowKey).filter(e => e.remindMode === "popup").map(e => ({ e, when: "Tomorrow" }))
        ];
        if (!list.length) return;
        const lines = list.slice(0, 6).map(x => "• " + x.e.title + " (" + x.when + ")");
        alert("🔔 Reminder\n\n" + lines.join("\n") + (list.length > 6 ? "\n+" + (list.length - 6) + " more" : ""));
        seen[todayKey] = true; localStorage.setItem(POPUP_SEEN_KEY, JSON.stringify(seen));
    }

    // ─── HELPERS ─────────────────────────────────────────────────────────────
    function formatSearch(ev) { return (ev.title + " " + (ev.description || "")).toLowerCase(); }

    function getEventsOnDate(dateKey) {
        const d = new Date(dateKey + "T00:00:00");
        return events.filter(ev => { const s = new Date(ev.date + "T00:00:00"); const e = ev.endDate ? new Date(ev.endDate + "T00:00:00") : s; return d >= s && d <= e; });
    }

    function detectConflicts(candidate, excludeId = null) {
        if (!candidate.start || !candidate.end) return [];
        const cs = new Date(candidate.date + "T" + candidate.start), ce = new Date((candidate.endDate || candidate.date) + "T" + candidate.end);
        return events.filter(e => e.id !== excludeId && e.start && e.end).filter(e => { const es = new Date(e.date + "T" + e.start), ee = new Date((e.endDate || e.date) + "T" + e.end); return cs < ee && es < ce; });
    }

    function updateConflictWarning(excludeId = null) { const d = draftFromForm(); if (!d.date || !d.start || !d.end) { els.conflictBox.hidden = true; return; } els.conflictBox.hidden = detectConflicts(d, excludeId).length === 0; }

    function loadEvents() { try { const raw = localStorage.getItem(STORAGE_KEY); const items = raw ? JSON.parse(raw) : []; return Array.isArray(items) ? items : []; } catch { return []; } }
    function saveEvents(list) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); syncEventsToSW(); }

    function toDateKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
    function safeUUID() { return (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2); }
    function escapeHtml(s = "") { return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

    let toastTimer = null;
    function toast(msg) {
        let el = document.getElementById("toast");
        if (!el) { el = document.createElement("div"); el.id = "toast"; Object.assign(el.style, { position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", background: "rgba(0,0,0,.78)", color: "#fff", padding: "10px 12px", borderRadius: "999px", fontWeight: "900", fontSize: "12px", zIndex: "9999", maxWidth: "calc(100% - 24px)", textAlign: "center" }); document.body.appendChild(el); }
        el.textContent = msg; el.style.opacity = "1"; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 2400);
    }

    function initTheme() {
        const btn = document.getElementById("themeToggle");
        const saved = localStorage.getItem("calendar_theme");
        if (saved === "dark") { document.body.classList.add("dark"); btn.textContent = "☀️ Light"; }
        btn.addEventListener("click", () => { document.body.classList.toggle("dark"); const isDark = document.body.classList.contains("dark"); btn.textContent = isDark ? "☀️ Light" : "🌙 Dark"; localStorage.setItem("calendar_theme", isDark ? "dark" : "light"); });
    }
})();