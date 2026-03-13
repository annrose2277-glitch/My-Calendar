(function () {
    "use strict";

    var $ = function(id) { return document.getElementById(id); };

    var els = {
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
        importBtn:      $("importBtn"),
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
        importModal:    $("importModal"),
        importCloseBtn: $("importCloseBtn"),
        importCancelBtn:$("importCancelBtn"),
        importConfirmBtn:$("importConfirmBtn"),
        importFileInput:$("importFileInput"),
        importError:    $("importError")
    };

    var STORAGE_KEY          = "calendra_lite_events_v2";
    var POPUP_SEEN_KEY       = "calendra_lite_popup_seen_v1";
    var NOTIF_SENT_KEY       = "calendra_notif_sent_v1";
    var BANNER_DISMISSED_KEY = "calendra_notif_banner_dismissed";

    var events          = loadEvents();
    var viewDate        = new Date();
    var selectedDate    = toDateKey(new Date());
    var editingId       = null;
    var selectedEventId = null;
    var importParsed    = [];

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
        initImportModal();
        checkPassiveReminders();
        setInterval(checkPassiveReminders, 60000);
    }

    // ─── SERVICE WORKER ──────────────────────────────────────────────────────
    function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;

        navigator.serviceWorker.register("sw.js")
            .then(function(registration) {
                console.log("[App] SW registered");

                // Listen for messages from SW
                navigator.serviceWorker.addEventListener("message", function(e) {
                    if (e.data && e.data.type === "SW_LOG") {
                        console.log("[SW → Page]", e.data.msg);
                    }
                });

                // Register for periodic background sync (if supported)
                if ("periodicSync" in registration) {
                    registration.periodicSync.register("calendar-reminders", {
                        minInterval: 60000 // 1 minute minimum
                    }).then(function() {
                        console.log("[App] Periodic sync registered");
                    }).catch(function(err) {
                        console.log("[App] Periodic sync registration failed:", err.message);
                    });
                }
            })
            .catch(function(err) {
                console.error("[App] SW registration FAILED:", err);
            });
    }

    // ─── NOTIFICATION BANNER ─────────────────────────────────────────────────
    function initNotificationBanner() {
        if (!("Notification" in window)) return;
        if (Notification.permission === "granted") {
            syncEventsToSW();
            return;
        }
        if (Notification.permission === "denied") return;
        if (localStorage.getItem(BANNER_DISMISSED_KEY)) return;

        els.notifBanner.hidden = false;

        els.notifAllowBtn.addEventListener("click", function() {
            Notification.requestPermission().then(function(perm) {
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

        els.notifDismissBtn.addEventListener("click", function() {
            els.notifBanner.hidden = true;
            localStorage.setItem(BANNER_DISMISSED_KEY, "1");
        });
    }

    // ─── SYNC TO SW ──────────────────────────────────────────────────────────
    function syncEventsToSW() {
        if (!("caches" in window)) return;
        caches.open("calendar-data-v1").then(function(cache) {
            cache.put("events", new Response(JSON.stringify(events), {
                headers: { "Content-Type": "application/json" }
            }));
            cache.put("notif-sent", new Response(JSON.stringify(getNotifSent()), {
                headers: { "Content-Type": "application/json" }
            }));
        }).catch(function(err) {
            console.error("[Cache] Failed:", err);
        });
    }

    // ─── PASSIVE REMINDERS ───────────────────────────────────────────────────
    function getNotifSent() {
        try {
            return JSON.parse(localStorage.getItem(NOTIF_SENT_KEY) || "{}");
        } catch (e) {
            return {};
        }
    }

    function setNotifSent(obj) {
        localStorage.setItem(NOTIF_SENT_KEY, JSON.stringify(obj));
    }

    function checkPassiveReminders() {
        if (!("Notification" in window) || Notification.permission !== "granted") return;

        var now = new Date();
        var todayKey = toDateKey(now);
        var nowMs = now.getTime();
        var sent = getNotifSent();
        var dirty = false;

        // Prune old keys
        Object.keys(sent).forEach(function(k) {
            if (k.indexOf(todayKey) !== 0) {
                delete sent[k];
                dirty = true;
            }
        });

        getEventsOnDate(todayKey).forEach(function(ev) {
            var mins = parseInt(ev.remindMode, 10);
            if (!ev.start || isNaN(mins)) return;

            var eventMs = new Date(ev.date + "T" + ev.start).getTime();
            var diffMins = (eventMs - nowMs) / 60000;
            var sentKey = todayKey + "_" + ev.id + "_" + mins;

            if (diffMins <= 0 || diffMins > mins || sent[sentKey]) return;

            var roundedMins = Math.round(diffMins);
            var timeLabel = roundedMins >= 60 ? "1 hour" : roundedMins + " minute" + (roundedMins !== 1 ? "s" : "");
            var notifTitle = "⏰ " + ev.title;
            var notifBody = "Starting in about " + timeLabel;

            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: "SHOW_NOTIFICATION",
                    title: notifTitle,
                    body: notifBody,
                    tag: sentKey,
                    icon: "images/android-chrome-512x512.png"
                });
            } else {
                try {
                    new Notification(notifTitle, {
                        body: notifBody,
                        tag: sentKey,
                        icon: "images/android-chrome-512x512.png"
                    });
                } catch (err) {
                    console.error(err);
                }
            }

            sent[sentKey] = true;
            dirty = true;
            toast("🔔 " + ev.title + " in ~" + timeLabel);
        });

        if (dirty) {
            setNotifSent(sent);
            syncEventsToSW();
        }
    }

    // ─── DROPDOWNS ───────────────────────────────────────────────────────────
    function initYearDropdown() {
        var cur = new Date().getFullYear();
        els.yearSelect.innerHTML = "";
        for (var y = cur - 50; y <= cur + 50; y++) {
            var opt = document.createElement("option");
            opt.value = y;
            opt.textContent = y;
            els.yearSelect.appendChild(opt);
        }
        els.yearSelect.value = viewDate.getFullYear();
        els.yearSelect.addEventListener("change", function() {
            viewDate = new Date(parseInt(this.value), viewDate.getMonth(), 1);
            render();
        });
    }

    function initMonthDropdown() {
        els.monthSelect.value = viewDate.getMonth();
        els.monthSelect.addEventListener("change", function() {
            viewDate = new Date(viewDate.getFullYear(), parseInt(this.value), 1);
            render();
        });
    }

    // ─── BINDINGS ────────────────────────────────────────────────────────────
    function bind() {
        els.prevBtn.addEventListener("click", function() {
            viewDate = addMonths(viewDate, -1);
            render();
        });
        els.nextBtn.addEventListener("click", function() {
            viewDate = addMonths(viewDate, 1);
            render();
        });
        els.todayBtn.addEventListener("click", function() {
            viewDate = new Date();
            selectedDate = toDateKey(new Date());
            selectedEventId = null;
            render();
            renderDayPanel();
        });
        els.searchInput.addEventListener("input", function() {
            render();
            renderDayPanel();
        });
        els.addBtn.addEventListener("click", function() {
            openModalForDate(selectedDate);
        });
        els.editBtn.addEventListener("click", function() {
            if (!selectedEventId) return toast("Select an event first");
            openModalForEdit(selectedEventId);
        });
        els.deleteSideBtn.addEventListener("click", function() {
            if (!selectedEventId) return toast("Select an event first");
            editingId = selectedEventId;
            onDelete();
        });
        els.exportBtn.addEventListener("click", exportEvents);
        els.importBtn.addEventListener("click", function() {
            resetImportModal();
            els.importModal.showModal();
        });
        els.clearAllBtn.addEventListener("click", function() {
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
        els.eventForm.addEventListener("submit", function(e) {
            e.preventDefault();
            onSave();
        });
        els.deleteBtn.addEventListener("click", onDelete);

        ["dateInput", "endDateInput", "startInput", "endInput"].forEach(function(id) {
            $(id).addEventListener("input", function() {
                updateConflictWarning(editingId);
            });
        });
    }

    // ─── RENDER CALENDAR ─────────────────────────────────────────────────────
    function render() {
        var anyMatch = false;
        var y = viewDate.getFullYear();
        var m = viewDate.getMonth();
        els.yearSelect.value = y;
        els.monthSelect.value = m;

        var startDay = new Date(y, m, 1).getDay();
        var daysInMonth = new Date(y, m + 1, 0).getDate();
        var cells = [];
        var i, d;

        for (i = 0; i < startDay; i++) cells.push({ empty: true });
        for (d = 1; d <= daysInMonth; d++) cells.push({ empty: false, date: new Date(y, m, d) });
        while (cells.length % 7 !== 0) cells.push({ empty: true });
        while (cells.length < 42) cells.push({ empty: true });

        var q = (els.searchInput.value || "").trim().toLowerCase();
        els.grid.innerHTML = "";

        cells.forEach(function(cellData) {
            var cell = document.createElement("div");

            if (cellData.empty) {
                cell.className = "cell empty";
                cell.innerHTML = '<div class="date"><span></span><span></span></div>';
                els.grid.appendChild(cell);
                return;
            }

            var date = cellData.date;
            var key = toDateKey(date);
            var dayEvents = getEventsOnDate(key)
                .filter(function(ev) { return !q || formatSearch(ev).indexOf(q) !== -1; })
                .sort(function(a, b) { return (a.start || "").localeCompare(b.start || ""); });

            if (dayEvents.length > 0) anyMatch = true;
            if (q && dayEvents.length === 0) cell.style.display = "none";

            cell.className = "cell";
            if (key === toDateKey(new Date())) cell.classList.add("today");
            if (key === selectedDate) cell.classList.add("selected");

            (function(k) {
                cell.addEventListener("click", function() {
                    selectedDate = k;
                    selectedEventId = null;
                    render();
                    renderDayPanel();
                });
            })(key);

            var head = document.createElement("div");
            head.className = "date";
            var left = document.createElement("span");
            left.textContent = String(date.getDate());
            var right = document.createElement("span");
            if (dayEvents.length) {
                var pill = document.createElement("span");
                pill.className = "pill";
                pill.textContent = String(dayEvents.length);
                right.appendChild(pill);
            }
            head.appendChild(left);
            head.appendChild(right);

            var list = document.createElement("div");
            list.className = "events";
            dayEvents.slice(0, 3).forEach(function(ev) {
                var item = document.createElement("div");
                item.className = "event-chip";
                if (ev.color && ev.color !== "default") item.dataset.color = ev.color;
                var timeText = (ev.start && ev.end) ? " " + ev.start : "";
                var bell = (ev.remindMode && ev.remindMode !== "off") ? " 🔔" : "";
                item.innerHTML = '<div><b>' + escapeHtml(ev.title) + '</b>' +
                    '<span class="t">' + timeText + bell + '</span></div><div class="t"></div>';
                (function(evId) {
                    item.addEventListener("click", function(e) {
                        e.stopPropagation();
                        selectedEventId = evId;
                        openModalForEdit(evId);
                    });
                })(ev.id);
                list.appendChild(item);
            });

            cell.appendChild(head);
            cell.appendChild(list);
            els.grid.appendChild(cell);
        });

        supreme
        supreme

         master
        main
        // "No results" message for search
        els.noResults.hidden = !(q && !anyMatch);

        var noResultEl = document.getElementById("noResults");
        if (!noResultEl) {
            noResultEl = document.createElement("div");
            noResultEl.id = "noResults";
            noResultEl.style.textAlign = "center";
            noResultEl.style.padding = "10px";
            noResultEl.style.fontWeight = "bold";
            noResultEl.style.color = "red";
            els.grid.parentNode.appendChild(noResultEl);
        }
        noResultEl.style.display = (q && !anyMatch) ? "block" : "none";
        if (q && !anyMatch) noResultEl.textContent = "No events found";
        main
    }

    // ─── RENDER DAY PANEL ────────────────────────────────────────────────────
    function renderDayPanel() {
        var selectedContainer = els.selectedEvents;
        var upcomingContainer = els.upcomingEvents;
        selectedContainer.innerHTML = "";
        upcomingContainer.innerHTML = "";

        var selected = new Date(selectedDate + "T00:00:00");
        els.dayLabel.textContent = selected.toLocaleDateString(undefined, {
            weekday: "long", year: "numeric", month: "long", day: "numeric"
        });

        var q = (els.searchInput.value || "").trim().toLowerCase();

        var dayEvents = getEventsOnDate(selectedDate)
            .filter(function(ev) { return !q || formatSearch(ev).indexOf(q) !== -1; })
            .sort(function(a, b) { return (a.start || "").localeCompare(b.start || ""); });

        if (!dayEvents.length) {
            selectedContainer.innerHTML = '<div class="day-item">No events for this day.</div>';
        } else {
            dayEvents.forEach(function(ev) {
                selectedContainer.appendChild(createEventCard(ev, false));
            });
        }

        var upcoming = events
            .filter(function(ev) { return ev.date > selectedDate; })
            .sort(function(a, b) { return a.date.localeCompare(b.date); })
            .slice(0, 5);

        if (!upcoming.length) {
            upcomingContainer.innerHTML = '<div class="day-item">No upcoming events.</div>';
        } else {
            upcoming.forEach(function(ev) {
                upcomingContainer.appendChild(createEventCard(ev, true));
            });
        }
    }

    function createEventCard(ev, showDate) {
        var item = document.createElement("div");
        item.className = "day-item";
        if (ev.color && ev.color !== "default") item.dataset.color = ev.color;

        var tag = "All day";
        if (ev.start && ev.end) tag = ev.start + " – " + ev.end;

        var dateText = showDate ? '<div class="meta">' + ev.date + '</div>' : "";

        var remindLabel = "";
        if (ev.remindMode === "popup") remindLabel = "🔔 Day-of popup reminder<br/>";
        else if (ev.remindMode === "60") remindLabel = "🔔 Notify 1 hour before<br/>";
        else if (ev.remindMode === "30") remindLabel = "🔔 Notify 30 mins before<br/>";
        else if (ev.remindMode === "15") remindLabel = "🔔 Notify 15 mins before<br/>";

        item.innerHTML =
            '<div class="event-row">' +
                '<div class="event-info">' +
                    '<div class="title">' + escapeHtml(ev.title) + '</div>' +
                    dateText +
                    '<div class="tag">' + escapeHtml(tag) + '</div>' +
                    '<div class="meta">' + remindLabel +
                        (ev.description ? escapeHtml(ev.description) : "") +
                    '</div>' +
                '</div>' +
                '<div class="event-actions">' +
                    '<button class="pill-btn edit-btn" type="button">Edit</button>' +
                    '<button class="pill-btn delete-btn" type="button">Delete</button>' +
                '</div>' +
            '</div>';

        item.querySelector(".edit-btn").addEventListener("click", function(e) {
            e.stopPropagation();
            openModalForEdit(ev.id);
        });
        item.querySelector(".delete-btn").addEventListener("click", function(e) {
            e.stopPropagation();
            editingId = ev.id;
            onDelete();
        });

        return item;
    }

    // ─── MODAL ───────────────────────────────────────────────────────────────
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
        var ev = null;
        for (var i = 0; i < events.length; i++) {
            if (events[i].id === id) {
                ev = events[i];
                break;
            }
        }
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
        return {
            id: els.idInput.value || editingId || safeUUID(),
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
        var ev = draftFromForm();
        if (!ev.title || !ev.date) return toast("Please fill required fields");
        if (ev.endDate && ev.endDate < ev.date) return toast("End date cannot be before start date");
        if ((ev.start && !ev.end) || (!ev.start && ev.end)) {
            return toast("If you set time, set both Start and End");
        }
        if (ev.date === ev.endDate && ev.start && ev.end && ev.end <= ev.start) {
            return toast("End time must be after start time");
        }

        var conflicts = detectConflicts(ev, editingId);
        els.conflictBox.hidden = conflicts.length === 0;
        if (conflicts.length) {
            var sample = conflicts.slice(0, 2).map(function(e) {
                return "• " + e.title + " (" + e.date + " " + e.start + "-" + e.end + ")";
            }).join("\n");
            if (!confirm("Conflict detected with:\n" + sample + "\n\nSave anyway?")) return;
        }

        var idx = -1;
        for (var i = 0; i < events.length; i++) {
            if (events[i].id === ev.id) {
                idx = i;
                break;
            }
        }
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
        if (ev.remindMode !== "off" && ev.remindMode !== "popup") {
            checkPassiveReminders();
        }
    }

    function onDelete() {
        if (!editingId) return;
        if (!confirm("Delete this event?")) return;

        events = events.filter(function(e) { return e.id !== editingId; });
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
        if (els.modal.open) els.modal.close();
        els.backdrop.hidden = true;
    }

    // ─── EXPORT ──────────────────────────────────────────────────────────────
    function exportEvents() {
        if (!events.length) return toast("No events to export!");
        var sorted = events.slice().sort(function(a, b) {
            return a.date.localeCompare(b.date);
        });
        var content = sorted.map(function(ev, i) {
            var time = "All day";
            if (ev.start && ev.end) {
                time = (ev.endDate && ev.endDate !== ev.date)
                    ? ev.date + " " + ev.start + " – " + ev.endDate + " " + ev.end
                    : ev.start + " – " + ev.end;
            }
            var desc = ev.description ? "\n   Description: " + ev.description : "";
            var remind = ev.remindMode !== "off" ? "\n   🔔 Reminder: " + ev.remindMode : "";
            var color = (ev.color && ev.color !== "default") ? "\n   Color: " + ev.color : "";
            return "Event " + (i + 1) + ":\n   Title: " + ev.title +
                "\n   Date: " + ev.date + "\n   Time: " + time + desc + remind + color;
        }).join("\n\n---\n\n");

        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
        a.download = "my-calendar-events.txt";
        a.click();
        URL.revokeObjectURL(a.href);
        toast("Events exported!");
    }

    // ─── IMPORT ──────────────────────────────────────────────────────────────
    function initImportModal() {
        els.importCloseBtn.addEventListener("click", function() {
            els.importModal.close();
        });
        els.importCancelBtn.addEventListener("click", function() {
            els.importModal.close();
        });

        els.importFileInput.addEventListener("change", function(e) {
            var file = e.target.files[0];
            if (!file) return;
            els.importError.hidden = true;
            els.importConfirmBtn.disabled = true;

            var reader = new FileReader();
            reader.onload = function() {
                try {
                    var data = JSON.parse(reader.result);
                    if (!Array.isArray(data)) throw new Error("Not an array");

                    var valid = data.filter(function(item) {
                        return item &&
                            typeof item.title === "string" && item.title.trim() &&
                            typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date);
                    });

                    if (!valid.length) throw new Error("No valid events found");

                    valid.forEach(function(item) {
                        if (!item.id) item.id = safeUUID();
                        if (!item.endDate) item.endDate = item.date;
                        if (!item.remindMode) item.remindMode = "off";
                        if (!item.color) item.color = "default";
                    });

                    importParsed = valid;
                    els.importConfirmBtn.disabled = false;
                    els.importError.hidden = true;
                } catch (err) {
                    els.importError.hidden = false;
                    els.importError.textContent = "Invalid file: " + err.message;
                    importParsed = [];
                }
            };
            reader.readAsText(file);
        });

        els.importConfirmBtn.addEventListener("click", function() {
            if (!importParsed.length) return;
            var count = importParsed.length;
            events = events.concat(importParsed);
            saveEvents(events);
            els.importModal.close();
            importParsed = [];
            render();
            renderDayPanel();
            toast(count + " event" + (count !== 1 ? "s" : "") + " imported!");
        });
    }

    function resetImportModal() {
        els.importFileInput.value = "";
        els.importError.hidden = true;
        els.importConfirmBtn.disabled = true;
        importParsed = [];
    }

    // ─── POPUP REMINDERS ─────────────────────────────────────────────────────
    function checkPopupReminders() {
        var todayKey = toDateKey(new Date());
        var seen = {};
        try {
            seen = JSON.parse(localStorage.getItem(POPUP_SEEN_KEY) || "{}");
        } catch (e) {
            seen = {};
        }
        if (seen[todayKey]) return;

        var tomorrowMs = new Date(todayKey + "T00:00:00").getTime() + 86400000;
        var tomorrowKey = toDateKey(new Date(tomorrowMs));

        var todayPopups = getEventsOnDate(todayKey).filter(function(e) {
            return e.remindMode === "popup";
        }).map(function(e) { return { e: e, when: "Today" }; });

        var tomorrowPopups = getEventsOnDate(tomorrowKey).filter(function(e) {
            return e.remindMode === "popup";
        }).map(function(e) { return { e: e, when: "Tomorrow" }; });

        var list = todayPopups.concat(tomorrowPopups);

        if (!list.length) return;

        var lines = list.slice(0, 6).map(function(x) {
            return "• " + x.e.title + " (" + x.when + ")";
        });
        var extra = list.length > 6 ? "\n+" + (list.length - 6) + " more" : "";
        alert("🔔 Reminder\n\n" + lines.join("\n") + extra);

        seen[todayKey] = true;
        localStorage.setItem(POPUP_SEEN_KEY, JSON.stringify(seen));
    }

    // ─── HELPERS ─────────────────────────────────────────────────────────────
    function formatSearch(ev) {
        return (ev.title + " " + (ev.description || "")).toLowerCase();
    }

    function getEventsOnDate(dateKey) {
        var d = new Date(dateKey + "T00:00:00");
        return events.filter(function(ev) {
            var s = new Date(ev.date + "T00:00:00");
            var e = ev.endDate ? new Date(ev.endDate + "T00:00:00") : s;
            return d >= s && d <= e;
        });
    }

    function detectConflicts(candidate, excludeId) {
        if (!candidate.start || !candidate.end) return [];
        var cs = new Date(candidate.date + "T" + candidate.start);
        var ce = new Date((candidate.endDate || candidate.date) + "T" + candidate.end);

        return events.filter(function(e) {
            if (e.id === excludeId || !e.start || !e.end) return false;
            var es = new Date(e.date + "T" + e.start);
            var ee = new Date((e.endDate || e.date) + "T" + e.end);
            return cs < ee && es < ce;
        });
    }

    function updateConflictWarning(excludeId) {
        var d = draftFromForm();
        if (!d.date || !d.start || !d.end) {
            els.conflictBox.hidden = true;
            return;
        }
        els.conflictBox.hidden = detectConflicts(d, excludeId).length === 0;
    }

    function loadEvents() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            var items = raw ? JSON.parse(raw) : [];
            return Array.isArray(items) ? items : [];
        } catch (e) {
            return [];
        }
    }

    function saveEvents(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        syncEventsToSW();
    }

    function toDateKey(d) {
        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0");
    }

    function addMonths(d, n) {
        return new Date(d.getFullYear(), d.getMonth() + n, 1);
    }

    function safeUUID() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return String(Date.now()) + "_" + Math.random().toString(16).slice(2);
    }

    function escapeHtml(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    var toastTimer = null;
    function toast(msg) {
        var el = document.getElementById("toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "toast";
            el.style.position = "fixed";
            el.style.left = "50%";
            el.style.bottom = "18px";
            el.style.transform = "translateX(-50%)";
            el.style.background = "rgba(0,0,0,.78)";
            el.style.color = "#fff";
            el.style.padding = "10px 12px";
            el.style.borderRadius = "999px";
            el.style.fontWeight = "900";
            el.style.fontSize = "12px";
            el.style.zIndex = "9999";
            el.style.maxWidth = "calc(100% - 24px)";
            el.style.textAlign = "center";
            el.style.transition = "opacity 0.3s";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = "1";
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function() { el.style.opacity = "0"; }, 2400);
    }

    function initTheme() {
        var btn = document.getElementById("themeToggle");
        var saved = localStorage.getItem("calendar_theme");
        if (saved === "dark") {
            document.body.classList.add("dark");
            btn.textContent = "☀️ Light";
        }
        btn.addEventListener("click", function() {
            document.body.classList.toggle("dark");
            var isDark = document.body.classList.contains("dark");
            btn.textContent = isDark ? "☀️ Light" : "🌙 Dark";
            localStorage.setItem("calendar_theme", isDark ? "dark" : "light");
        });
    }
})();
