/**
 * sw.js — My-Calendar Service Worker
 * Handles background passive reminder notifications.
 *
 * How it works:
 *  1. When the page is OPEN  → the page's own setInterval fires checkPassiveReminders()
 *     and posts SHOW_NOTIFICATION messages here. We just call showNotification().
 *
 *  2. When the page is CLOSED → the SW reads events from Cache Storage and fires
 *     notifications on its own via the "periodicsync" event (Chrome) or a
 *     self-triggered alarm approach as a fallback.
 
 * Console logs from the SW appear in DevTools → Application → Service Workers
 * → "Inspect" link, OR in the SW's own DevTools console.
 * We also forward logs to any open page client via postMessage.
 */

const CACHE_NAME   = "calendar-data-v1";
const SW_VERSION   = "1.0.0";

// ── Helper: log to SW console AND forward to page ────────────────────────────
function log(...args) {
    const msg = args.join(" ");
    console.log("[SW " + SW_VERSION + "]", msg);
    // Forward to any open page clients so devs can see SW logs in the page console
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(clients => {
        clients.forEach(c => c.postMessage({ type: "SW_LOG", msg: "[SW] " + msg }));
    });
}

function warn(...args) {
    const msg = args.join(" ");
    console.warn("[SW " + SW_VERSION + "]", msg);
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(clients => {
        clients.forEach(c => c.postMessage({ type: "SW_LOG", msg: "[SW WARN] " + msg }));
    });
}

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", event => {
    log("Installing SW version", SW_VERSION);
    self.skipWaiting(); // activate immediately without waiting for old SW to die
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", event => {
    log("Activating — claiming all clients");
    event.waitUntil(self.clients.claim());
});

// ── Message from the main page thread ─────────────────────────────────────────
// The page sends SHOW_NOTIFICATION when it wants to fire a notification through us.
// This works even when the tab is backgrounded, as long as the page is still open.
self.addEventListener("message", event => {
    const data = event.data;
    if (!data || !data.type) return;

    if (data.type === "SHOW_NOTIFICATION") {
        log("Received SHOW_NOTIFICATION from page — title:", data.title, "| tag:", data.tag);
        event.waitUntil(
            self.registration.showNotification(data.title, {
                body:             data.body  || "",
                icon:             data.icon  || "images/android-chrome-512x512.png",
                badge:            data.icon  || "images/android-chrome-512x512.png",
                tag:              data.tag   || "cal-notif",
                requireInteraction: false,
                silent:           false,
            }).then(() => {
                log("✅ Notification shown successfully:", data.title);
            }).catch(err => {
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
self.addEventListener("notificationclick", event => {
    log("Notification clicked:", event.notification.title);
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
            const existing = clients.find(c => c.url.includes(self.location.origin));
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
// Chrome on Android (and some desktop) fires this when the browser decides it is
// a good time to run background tasks. minInterval = 60 000 ms (1 minute).
self.addEventListener("periodicsync", event => {
    log("periodicsync fired — tag:", event.tag);
    if (event.tag === "calendar-reminders") {
        event.waitUntil(checkRemindersInBackground());
    }
});

// ── Core background check ─────────────────────────────────────────────────────
// Called when NO page client is open. Reads events from Cache Storage.
async function checkRemindersInBackground() {
    log("checkRemindersInBackground() running at", new Date().toLocaleTimeString());

    // If a page is open, let it handle the check (it has fresh localStorage state)
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (clients.length > 0) {
        log("Page is open — delegating check to page (", clients.length, "client(s))");
        return;
    }

    log("No page open — reading events from Cache Storage");

    let events, sent;
    try {
        const cache     = await caches.open(CACHE_NAME);
        const evRes     = await cache.match("events");
        const sentRes   = await cache.match("notif-sent");

        if (!evRes) {
            warn("No events found in Cache Storage — has the app been opened at least once?");
            return;
        }

        events = await evRes.json();
        sent   = sentRes ? await sentRes.json() : {};
        log("Loaded", events.length, "event(s) from cache");
    } catch (err) {
        warn("Failed to read from Cache Storage:", err.message);
        return;
    }

    const now      = new Date();
    const todayKey = toDateKey(now);
    const nowMs    = now.getTime();
    let   dirty    = false;

    // Prune stale sent-keys
    Object.keys(sent).forEach(k => {
        if (!k.startsWith(todayKey)) { delete sent[k]; dirty = true; }
    });

    // Filter events that fall on today
    const todayEvents = events.filter(ev => {
        const s = new Date(ev.date + "T00:00:00");
        const e = ev.endDate ? new Date(ev.endDate + "T00:00:00") : s;
        const t = new Date(todayKey + "T00:00:00");
        return t >= s && t <= e;
    });

    log("Events on today (" + todayKey + "):", todayEvents.length);

    for (const ev of todayEvents) {
        const mins = parseInt(ev.remindMode, 10);
        if (!ev.start || isNaN(mins)) {
            log("Skipping '" + ev.title + "' — remindMode='" + ev.remindMode + "' (not passive)");
            continue;
        }

        const eventMs  = new Date(ev.date + "T" + ev.start).getTime();
        const diffMins = (eventMs - nowMs) / 60_000;
        const sentKey  = todayKey + "_" + ev.id + "_" + mins;

        log("'" + ev.title + "' diff=" + diffMins.toFixed(1) + " min | threshold=" + mins + " | sent=" + !!sent[sentKey]);

        if (diffMins <= 0 || diffMins > mins || sent[sentKey]) continue;

        const roundedMins = Math.round(diffMins);
        const timeLabel   = roundedMins >= 60 ? "1 hour" : roundedMins + " minute" + (roundedMins !== 1 ? "s" : "");

        log("🔔 FIRING background notification for '" + ev.title + "' — in " + timeLabel);
        try {
            await self.registration.showNotification("⏰ " + ev.title, {
                body:             "Starting in about " + timeLabel,
                icon:             "images/android-chrome-512x512.png",
                badge:            "images/android-chrome-512x512.png",
                tag:              sentKey,
                requireInteraction: false,
            });
            log("✅ Background notification shown for '" + ev.title + "'");
        } catch (err) {
            warn("❌ showNotification() failed for '" + ev.title + "':", err.message);
        }

        sent[sentKey] = true;
        dirty = true;
    }

    if (dirty) {
        try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("notif-sent", new Response(JSON.stringify(sent), {
                headers: { "Content-Type": "application/json" }
            }));
            log("Updated notif-sent in cache");
        } catch (err) {
            warn("Failed to update notif-sent in cache:", err.message);
        }
    }
}

// ── Date helper (mirrors the one in app.js) ───────────────────────────────────
function toDateKey(d) {
    const y   = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + mo + "-" + day;
}
