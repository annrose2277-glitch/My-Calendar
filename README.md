![image](https://github.com/user-attachments/assets/60c8f362-3d60-4898-8c3a-c3519656325b)
# 🗓️ My-Calendar


🔗 **Live Demo:** [Click Here](https://nimamaria.github.io/My-Calendar/)


A lightweight calendar app for managing events. No bloat—just a clean calendar that works in your browser.

<img width="1877" height="909" alt="My-calendar-photo" src="https://github.com/user-attachments/assets/bbd3815d-f12e-48b8-b2cf-e2bcba1b1200" />


## ✨ Features

- **📅 Month Calendar** – Navigate months, view all events
- **🎯 Event Management** – Add, edit, delete events with modal interface
- **⏰ Time-based Events** – Optional start and end times
- **🔍 Search** – Filter events by title and description
- **🔔 Reminders** – Popup notifications for today and tomorrow
- **💾 Auto-Save** – Events saved locally (persists across sessions)

## 🚀 Getting Started

Open `index.html` in your browser. That's it!

### Adding an Event
1. Click a date or click "Add Event"
2. Fill in event name and date (required)
3. Optionally add times, description, and reminder
4. Click Save

### Editing/Deleting
- Select an event from the sidebar
- Click "Edit" to modify or "Delete" to remove

### Reminders
Enable "Popup" reminder when creating an event. You'll get a notification for today's and tomorrow's events (once per day).

## � Project Structure

```
├── index.html    # UI
├── style.css     # Styling
├── app.js        # Logic
└── README.md
```

## 🔧 Development

### How to run
Just open `index.html` in a browser, or run a local server:

Right click index.html - Open with Live Server

### Tech Stack
- **Vanilla JavaScript** – No frameworks
- **LocalStorage** – Events saved in browser (not cloud synced)
- **HTML5 + CSS3** – Pure markup and styling

### Key Functions
- `render()` – Update calendar grid
- `renderDayPanel()` – Update sidebar
- `onSave()` / `onDelete()` – Save or remove events
- `detectConflicts()` – Find overlapping events

## 🤝 Contributing

1. Fork/clone the repo
2. Make changes in a new branch
3. Test in multiple browsers
4. Submit a pull request

## 🌐 Browser Support

Chrome, Firefox, Safari, Edge (any modern browser with ES6 support)

---

**Questions?** Submit an issue or PR!
