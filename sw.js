/**
 * sw.js — My-Calendar Service Worker
 * Handles background passive reminder notifications.
 */

var CACHE_NAME = "calendar-data-v1";
var SW_VERSION = "1.0.1";

// ── Helper: log to SW console AND forward to page ────────────────────────────
function log() {
    var args = Array.prototype.slice.call(arguments);
    var msg = args.join(" ");
    console.log("[SW " + SW_VERSION + "]", msg);
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(function(clients) {
        clients.forEach(function(c) {
            c.postMessage({ type: "SW_LOG", msg: "[SW] " + msg });
        });
    });
}

function warn() {
    var args = Array.prototype.slice.call(arguments);
    var msg = args.join(" ");
    console.warn("[SW " + SW_VERSION + "]", msg);
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(function(clients) {
        clients.forEach(function(c) {
            c.postMessage({ type: "SW_LOG", msg: "[SW WARN] " + msg });
        });
    });
}

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", function(event) {
    log("Installing SW version", SW_VERSION);
    self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", function(event) {
    log("Activating — claiming all clients");
    event.waitUntil(self.clients.claim());
});

// ── Message from the main page thread ─────────────────────────────────────────
self.addEventListener("message", function(event) {
    var data = event.data;
    if (!data || !data.type) return;

    if (data.type === "SHOW_NOTIFICATION") {
        log("Received SHOW_NOTIFICATION from page — title:", data.title, "| tag:", data.tag);
        event.waitUntil(
            self.registration.showNotification(data.title, {
                body: data.body || "",
                icon: data.icon || "images/android-chrome-512x512.png",
                badge: data.icon || "images/android-chrome-512x512.png",
                tag: data.tag || "cal-notif",
                requireInteraction: false,
                silent: false
            }).then(function() {
                log("✅ Notification shown successfully:", data.title);
            }).catch(function(err) {
                warn("❌ showNotification() failed:", err.message);
            })
        );
    }

    if (data.type === "CHECK_REMINDERS") {
        log("Received CHECK_REMINDERS from page — running background check");
        event.waitUntil(checkRemindersInBackground());
    }
});

// ── Notification click: focus or open the app ─────────────────────────────────
self.addEventListener("notificationclick", function(event) {
    log("Notification clicked:", event.notification.title);
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clients) {
            var existing = null;
            for (var i = 0; i < clients.length; i++) {
                if (clients[i].url.indexOf(self.location.origin) !== -1) {
                    existing = clients[i];
                    break;
                }
            }
            if (existing) {
                log("Focusing existing page client");
                return existing.focus();
            }
            log("No existing client — opening new window");
            return self.clients.openWindow(self.location.origin + "/");
        })
    );
});

// ── Background Periodic Sync ──────────────────────────────────────────────────
self.addEventListener("periodicsync", function(event) {
    log("periodicsync fired — tag:", event.tag);
    if (event.tag === "calendar-reminders") {
        event.waitUntil(checkRemindersInBackground());
    }
});

// ── Core background check ─────────────────────────────────────────────────────
function checkRemindersInBackground() {
    log("checkRemindersInBackground() running at", new Date().toLocaleTimeString());

    return self.clients.matchAll({ type: "window", includeUncontrolled: true })
        .then(function(clients) {
            if (clients.length > 0) {
                log("Page is open — delegating check to page (", clients.length, "client(s))");
                return;
            }

            log("No page open — reading events from Cache Storage");
            return caches.open(CACHE_NAME).then(function(cache) {
                return Promise.all([
                    cache.match("events"),
                    cache.match("notif-sent")
                ]).then(function(results) {
                    var evRes = results[0];
                    var sentRes = results[1];

                    if (!evRes) {
                        warn("No events found in Cache Storage — has the app been opened at least once?");
                        return;
                    }

                    return Promise.all([
                        evRes.json(),
                        sentRes ? sentRes.json() : {}
                    ]).then(function(data) {
                        var events = data[0];
                        var sent = data[1];

                        log("Loaded", events.length, "event(s) from cache");
                        return processReminders(events, sent, cache);
                    });
                });
            }).catch(function(err) {
                warn("Failed to read from Cache Storage:", err.message);
            });
        });
}

function processReminders(events, sent, cache) {
    var now = new Date();
    var todayKey = toDateKey(now);
    var nowMs = now.getTime();
    var dirty = false;

    // Prune stale sent-keys
    Object.keys(sent).forEach(function(k) {
        if (k.indexOf(todayKey) !== 0) {
            delete sent[k];
            dirty = true;
        }
    });

    // Filter events that fall on today
    var todayEvents = events.filter(function(ev) {
        var s = new Date(ev.date + "T00:00:00");
        var e = ev.endDate ? new Date(ev.endDate + "T00:00:00") : s;
        var t = new Date(todayKey + "T00:00:00");
        return t >= s && t <= e;
    });

    log("Events on today (" + todayKey + "):", todayEvents.length);

    var notificationPromises = [];

    todayEvents.forEach(function(ev) {
        var mins = parseInt(ev.remindMode, 10);
        if (!ev.start || isNaN(mins)) {
            log("Skipping '" + ev.title + "' — remindMode='" + ev.remindMode + "' (not passive)");
            return;
        }

        var eventMs = new Date(ev.date + "T" + ev.start).getTime();
        var diffMins = (eventMs - nowMs) / 60000;
        var sentKey = todayKey + "_" + ev.id + "_" + mins;

        log("'" + ev.title + "' diff=" + diffMins.toFixed(1) + " min | threshold=" + mins + " | sent=" + !!sent[sentKey]);

        if (diffMins <= 0 || diffMins > mins || sent[sentKey]) return;

        var roundedMins = Math.round(diffMins);
        var timeLabel = roundedMins >= 60 ? "1 hour" : roundedMins + " minute" + (roundedMins !== 1 ? "s" : "");

        log("🔔 FIRING background notification for '" + ev.title + "' — in " + timeLabel);

        var p = self.registration.showNotification("⏰ " + ev.title, {
            body: "Starting in about " + timeLabel,
            icon: "images/android-chrome-512x512.png",
            badge: "images/android-chrome-512x512.png",
            tag: sentKey,
            requireInteraction: false
        }).then(function() {
            log("✅ Background notification shown for '" + ev.title + "'");
        }).catch(function(err) {
            warn("❌ showNotification() failed for '" + ev.title + "':", err.message);
        });

        notificationPromises.push(p);
        sent[sentKey] = true;
        dirty = true;
    });

    return Promise.all(notificationPromises).then(function() {
        if (dirty) {
            return cache.put("notif-sent", new Response(JSON.stringify(sent), {
                headers: { "Content-Type": "application/json" }
            })).then(function() {
                log("Updated notif-sent in cache");
            }).catch(function(err) {
                warn("Failed to update notif-sent in cache:", err.message);
            });
        }
    });
}

// ── Date helper (mirrors the one in app.js) ───────────────────────────────────
function toDateKey(d) {
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + mo + "-" + day;
}
