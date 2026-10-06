const API_ROOT = (function () {
    const openedAsFile = location.protocol === "file:";
    const notApachePort = Boolean(location.port) && location.port !== "80" && location.port !== "";

    if (openedAsFile || notApachePort) {
        return "http://localhost/smart-light/api/";
    }

    if (location.pathname.toLowerCase().indexOf("/smart-light") === -1) {
        return "/smart-light/api/";
    }

    return "api/";
})();

const API = {
    status: API_ROOT + "get_status.php",
    command: API_ROOT + "send_command.php",
    history: API_ROOT + "get_history.php"
};

function showPage(page) {
    document.querySelectorAll(".page").forEach(function (element) {
        element.classList.remove("active");
    });

    document.querySelectorAll(".nav-item").forEach(function (button) {
        button.classList.remove("active");
    });

    document.getElementById(page).classList.add("active");

    const titles = {
        dashboard: ["Dashboard", "Monitor and control your IoT lighting system using voice commands."],
        voice: ["Voice Control", "Use your microphone to control the light with voice commands."],
        device: ["Device Status", "Monitor the ESP32 connection and real-time relay status."],
        history: ["Command History", "View the list of all voice and button commands sent to the system."]
    };

    const meta = titles[page] || titles.dashboard;
    document.getElementById("pageTitle").textContent = meta[0];
    document.getElementById("pageSubtitle").textContent = meta[1];

    if (page === "dashboard") {
        document.getElementById("dashboardBtn").classList.add("active");
    } else if (page === "voice") {
        document.getElementById("voiceBtn").classList.add("active");
        loadRecentVoice();
    } else if (page === "device") {
        document.getElementById("deviceBtn").classList.add("active");
    } else {
        document.getElementById("historyBtn").classList.add("active");
        loadHistory();
    }
}

let lastToast = "";
let lastToastIsError = false;
let toastKind = "";

function setToast(message, isError, kind) {
    if (!message) {
        return;
    }

    lastToast = message;
    lastToastIsError = Boolean(isError);
    toastKind = kind || (isError ? "sticky" : "info");

    const toast = document.getElementById("toast");
    const statusBox = document.getElementById("statusBox");

    toast.textContent = message;
    toast.classList.toggle("error", lastToastIsError);

    if (statusBox) {
        statusBox.classList.toggle("error", lastToastIsError);
    }
}

function applyTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("smartLightTheme", next);

    const toggle = document.getElementById("themeToggle");
    if (!toggle) {
        return;
    }

    const isLight = next === "light";
    toggle.title = isLight ? "Switch to Dark Mode" : "Switch to Light Mode";
    toggle.setAttribute("aria-label", isLight ? "Switch to Dark Mode" : "Switch to Light Mode");
}

function setupThemeToggle() {
    const current = localStorage.getItem("smartLightTheme") === "light" ? "light" : "dark";
    applyTheme(current);

    document.getElementById("themeToggle").addEventListener("click", function () {
        const now = document.documentElement.getAttribute("data-theme");
        applyTheme(now === "dark" ? "light" : "dark");
    });
}

function updateLightUI(action) {
    const isOn = action === "ON";

    document.getElementById("bulb").classList.toggle("on", isOn);
    document.getElementById("lightStatus").classList.toggle("on", isOn);
    document.getElementById("lightStatus").textContent = isOn ? "LIGHT ON" : "LIGHT OFF";
    document.getElementById("smallLightStatus").textContent = isOn ? "ON" : "OFF";

    const lightingCard = document.getElementById("lightingCard");
    if (lightingCard) {
        lightingCard.classList.toggle("is-on", isOn);
    }

    const currentTitle = document.getElementById("currentStatusTitle");
    const currentSub = document.getElementById("currentStatusSub");
    const currentIcon = document.getElementById("currentStatusIcon");
    const relayState = document.getElementById("relayState");
    const relayValue = document.getElementById("relayValue");

    if (currentTitle) {
        currentTitle.textContent = isOn ? "Light ON" : "Light OFF";
    }
    if (currentSub) {
        currentSub.textContent = isOn
            ? "The light is currently turned on."
            : "The light is currently turned off.";
    }
    if (currentIcon) {
        currentIcon.classList.toggle("on", isOn);
    }
    if (relayState) {
        relayState.textContent = isOn
            ? "The light is currently turned on."
            : "The light is currently turned off.";
    }
    if (relayValue) {
        relayValue.textContent = isOn ? "ON" : "OFF";
        relayValue.className = isOn ? "on-text" : "off-text";
    }

    const relayToggle = document.getElementById("relayToggle");
    if (relayToggle) {
        relayToggle.classList.toggle("on", isOn);
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatDate(value) {
    if (!value) {
        return "--";
    }
    return String(value).split(/[ T]/)[0] || "--";
}

function formatTime(value) {
    if (!value) {
        return "--";
    }

    const parts = String(value).trim().split(/[ T]/);
    if (parts.length < 2) {
        if (/[ap]m/i.test(String(value))) {
            return String(value);
        }
        return "--";
    }

    const timePart = parts[1];
    const match = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) {
        return timePart;
    }

    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const second = match[3] || "00";
    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) {
        hour = 12;
    }
    return hour + ":" + minute + ":" + second + " " + ampm;
}

function recordDate(record) {
    return record.command_date || formatDate(record.created_at);
}

function recordTime(record) {
    return record.command_time || formatTime(record.created_at);
}

function dash(value) {
    if (value === null || value === undefined || value === "") {
        return "--";
    }
    return String(value);
}

function formatUptime(seconds) {
    const total = parseInt(seconds, 10);
    if (Number.isNaN(total)) {
        return "--";
    }

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    if (hours <= 0 && minutes <= 0) {
        return "Just started";
    }

    const hourLabel = hours === 1 ? "hour" : "hours";
    const minuteLabel = minutes === 1 ? "minute" : "minutes";
    return hours + " " + hourLabel + ", " + minutes + " " + minuteLabel;
}

function formatSignal(rssi) {
    if (rssi === null || rssi === undefined || rssi === "") {
        return "--";
    }

    const value = parseInt(rssi, 10);
    let quality = "Weak";
    if (value >= -60) {
        quality = "Good";
    } else if (value >= -75) {
        quality = "Fair";
    }

    return quality + " (" + value + " dBm)";
}

function formatHeap(bytes) {
    const value = parseInt(bytes, 10);
    if (!value) {
        return "--";
    }

    if (value >= 1024) {
        return Math.round(value / 1024) + " KB";
    }

    return value + " bytes";
}

function setPill(id, online, onlineText, offlineText) {
    const pill = document.getElementById(id);
    if (!pill) {
        return;
    }

    pill.classList.toggle("online", online);
    const label = pill.querySelector("span:last-child");
    const dot = pill.querySelector(".dot");
    if (label) {
        label.textContent = online ? onlineText : offlineText;
    }
    if (dot) {
        dot.classList.toggle("online", online);
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

function updateDevicePage(data, online) {
    const device = data.device || {};
    const lastSeen = data.last_seen || device.last_seen || "--";

    setPill("esp32Pill", online, "Connected", "No Hardware");
    setPill("netPill", online, "Connected", "Offline");
    setPill("deviceResponse", online, "Online", "Offline");

    setText("esp32Ip", online ? dash(device.ip_address) : "--");
    setText("esp32Uptime", online ? formatUptime(device.uptime_seconds) : "--");
    setText("deviceLastSeen", dash(lastSeen));
    setText("esp32Firmware", device.firmware ? device.firmware : "1.0.0");
    setText("esp32Platform", "ESP32 (Wi-Fi)");
    setText("netSsid", online ? dash(device.ssid) : "--");
    setText("netSignal", online ? formatSignal(device.rssi) : "--");
    setText("netType", "Wi-Fi");
    setText("netMac", online ? dash(device.mac_address) : "--");
    setText("hardwareUpdate", dash(lastSeen));
    setText("sysUptime", online ? formatUptime(device.uptime_seconds) : "--");
    setText("sysLastSeen", dash(lastSeen));
    setText("sysHeap", online ? formatHeap(device.free_heap) : "--");
}

async function sendCommand(command, source) {
    setToast("Sending command...");

    try {
        const response = await fetch(API.command, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                command: command,
                source: source
            })
        });

        const data = await response.json();

        if (!data.success) {
            setToast(data.message || "Command failed.", true, "sticky");
            showVoiceResult(command, false, "", data.message || "Unknown command.");
            if (data.voice_command) {
                document.getElementById("latestCommand").textContent = data.voice_command;
            }
            if (data.saved) {
                loadHistory();
                loadRecentVoice();
            }
            return;
        }

        updateLightUI(data.light_action);
        document.getElementById("latestCommand").textContent = data.voice_command;
        setToast(data.message, false, "info");
        showVoiceResult(
            data.voice_command,
            true,
            data.light_action,
            data.light_action === "ON" ? "Light turned ON" : "Light turned OFF"
        );
        loadSystemData();
        loadHistory();
        loadRecentVoice();
    } catch (error) {
        setToast("Cannot reach PHP API. Start Apache in XAMPP.", true, "connection");
    }
}

async function loadSystemData() {
    try {
        const response = await fetch(API.status + "?t=" + Date.now());
        const raw = await response.text();
        let data;

        try {
            data = JSON.parse(raw);
        } catch (parseError) {
            if (location.protocol === "file:") {
                setToast("Open this page at http://localhost/smart-light/ — do not double-click index.html.", true, "connection");
            } else {
                setToast("PHP did not return JSON. Open http://localhost/smart-light/ and start Apache + MySQL.", true, "connection");
            }
            return;
        }

        if (!data.success) {
            setToast(data.message || "PHP/MySQL returned an error.", true, "connection");
            return;
        }

        if (toastKind === "connection") {
            setToast("Database connected. Simulation is ready. Use Speak Command or LIGHT ON / LIGHT OFF.", false, "info");
        } else if (!lastToast) {
            setToast("System ready. No hardware connected yet. Commands will still turn the bulb on/off.", false, "info");
        }

        const online = Boolean(data.device_online);
        const deviceText = document.getElementById("deviceText");
        const deviceDot = document.getElementById("deviceDot");
        const modeText = document.getElementById("modeText");

        const statusPill = deviceText ? deviceText.closest(".status-pill") : null;

        if (deviceDot) {
            deviceDot.classList.toggle("online", online);
        }
        if (statusPill) {
            statusPill.classList.toggle("online", online);
        }
        if (deviceText) {
            deviceText.textContent = online ? "Connected" : "No Hardware";
        }
        if (modeText) {
            modeText.textContent = online ? "Light is active and ready." : "Waiting for ESP32";
        }

        const connectionLabel = document.getElementById("connectionLabel");
        const connectionSub = document.getElementById("connectionSub");
        const connectionDot = document.getElementById("connectionDot");
        const connectionPill = document.getElementById("connectionPill");

        if (connectionDot) {
            connectionDot.classList.toggle("online", online);
        }
        if (connectionPill) {
            connectionPill.classList.toggle("online", online);
        }
        if (connectionLabel) {
            connectionLabel.textContent = online ? "Wi-Fi" : "Offline";
        }
        if (connectionSub) {
            connectionSub.textContent = online ? "Connected to ESP32" : "Waiting for ESP32";
        }

        updateDevicePage(data, online);

        updateLightUI(data.light || "OFF");

        if (data.latest) {
            document.getElementById("latestCommand").textContent = data.latest.voice_command;
            document.getElementById("lastUpdated").textContent =
                recordDate(data.latest) + "  " + recordTime(data.latest);
            document.getElementById("latestSource").textContent = data.latest.source || "--";
        } else {
            document.getElementById("latestCommand").textContent = "Waiting for command...";
            document.getElementById("lastUpdated").textContent = "--";
            document.getElementById("latestSource").textContent = "--";
        }

        if (document.getElementById("history").classList.contains("active")) {
            loadHistory();
        }
        if (document.getElementById("voice").classList.contains("active")) {
            loadRecentVoice();
        }
    } catch (error) {
        if (location.protocol === "file:") {
            setToast("Open this page at http://localhost/smart-light/ — do not double-click index.html.", true, "connection");
        } else {
            setToast("Cannot reach PHP/MySQL. Start Apache + MySQL in XAMPP, then open http://localhost/smart-light/", true, "connection");
        }
    }
}

let historyPage = 1;
let historyPerPage = 10;
let lastPagerKey = "";

function renderHistoryRows(history) {
    const historyTable = document.getElementById("historyTable");
    historyTable.innerHTML = "";

    if (!history.length) {
        historyTable.innerHTML = '<tr><td class="empty-row" colspan="6">No matching commands.</td></tr>';
        return;
    }

    history.forEach(function (record) {
        const row = document.createElement("tr");
        const sourceKey = String(record.source || "voice").toLowerCase();
        const sourceLabel = sourceKey.charAt(0).toUpperCase() + sourceKey.slice(1);
        const sourceKind = sourceKey === "button" ? "button" : (sourceKey === "esp32" ? "esp32" : "voice");
        const action = record.light_action;
        const isOn = action === "ON";
        const isKnown = action === "ON" || action === "OFF";
        const statusText = record.status || "Successful (Simulated)";
        const statusKey = String(statusText).toLowerCase();
        const unknown = statusKey.indexOf("unknown") !== -1 || !isKnown;
        const failed = statusKey.indexOf("fail") !== -1 || unknown;
        const actionHtml = unknown
            ? "<span class=\"light-pill off\">OFF</span>"
            : "<span class=\"light-pill " + (isOn ? "on" : "off") + "\">" + escapeHtml(action) + "</span>";

        row.innerHTML =
            "<td>" + escapeHtml(recordDate(record)) + "</td>" +
            "<td>" + escapeHtml(recordTime(record)) + "</td>" +
            "<td>" + escapeHtml(record.voice_command) + "</td>" +
            "<td>" + actionHtml + "</td>" +
            "<td><span class=\"source-pill source-" + sourceKind + "\">" + escapeHtml(sourceLabel) + "</span></td>" +
            "<td>" + (failed
                ? "<span class=\"result-bad\">" + escapeHtml(statusText) + "</span>"
                : "<span class=\"result-ok\"><span class=\"material-symbols-outlined\">check_circle</span>" + escapeHtml(statusText) + "</span>") +
            "</td>";

        historyTable.appendChild(row);
    });
}

function renderHistoryPager(data) {
    const total = data.total;
    const page = data.page;
    const perPage = data.per_page;
    const pages = data.pages;
    const start = total === 0 ? 0 : (page - 1) * perPage + 1;
    const end = Math.min(page * perPage, total);

    document.getElementById("historySummary").textContent =
        total === 0
            ? "No commands yet."
            : "Showing " + start + "-" + end + " of " + total;

    const pagerKey = [page, pages, perPage, total].join(":");
    if (pagerKey === lastPagerKey) {
        return;
    }
    lastPagerKey = pagerKey;

    const pager = document.getElementById("historyPager");
    pager.innerHTML = "";

    if (total === 0) {
        return;
    }

    function addButton(label, targetPage, disabled, active) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.setAttribute("data-page", String(targetPage));
        button.disabled = Boolean(disabled);
        if (active) {
            button.classList.add("active");
        }
        pager.appendChild(button);
    }

    addButton("Prev", page - 1, page <= 1, false);

    let from = Math.max(1, page - 2);
    let to = Math.min(pages, from + 4);
    from = Math.max(1, to - 4);

    if (from > 1) {
        addButton("1", 1, false, page === 1);
        if (from > 2) {
            addButton("...", page, true, false);
        }
    }

    for (let i = from; i <= to; i++) {
        addButton(String(i), i, false, i === page);
    }

    if (to < pages) {
        if (to < pages - 1) {
            addButton("...", page, true, false);
        }
        addButton(String(pages), pages, false, page === pages);
    }

    addButton("Next", page + 1, page >= pages, false);
}

async function loadHistory() {
    try {
        const search = document.getElementById("historySearch");
        const action = document.getElementById("historyAction");
        const source = document.getElementById("historySource");
        const date = document.getElementById("historyDate");

        const params = new URLSearchParams({
            page: String(historyPage),
            per_page: String(historyPerPage),
            t: String(Date.now())
        });

        if (search && search.value.trim()) {
            params.set("q", search.value.trim());
        }
        if (action && action.value) {
            params.set("action", action.value);
        }
        if (source && source.value) {
            params.set("source", source.value);
        }
        if (date && date.value) {
            params.set("date", date.value);
        }

        const response = await fetch(API.history + "?" + params.toString());
        const data = await response.json();

        if (!data.success) {
            return;
        }

        historyPage = data.page;
        historyPerPage = data.per_page;
        renderHistoryRows(Array.isArray(data.history) ? data.history : []);
        renderHistoryPager(data);
    } catch (error) {
        document.getElementById("historySummary").textContent = "Cannot load command history.";
    }
}

function setupHistoryPager() {
    function resetAndLoad() {
        historyPage = 1;
        lastPagerKey = "";
        loadHistory();
    }

    document.getElementById("historyPageSize").addEventListener("change", function () {
        historyPerPage = parseInt(this.value, 10);
        resetAndLoad();
    });

    let searchTimer = null;
    document.getElementById("historySearch").addEventListener("input", function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(resetAndLoad, 250);
    });

    document.getElementById("historyAction").addEventListener("change", resetAndLoad);
    document.getElementById("historySource").addEventListener("change", resetAndLoad);
    document.getElementById("historyDate").addEventListener("change", resetAndLoad);

    document.getElementById("historyClearFilters").addEventListener("click", function () {
        document.getElementById("historySearch").value = "";
        document.getElementById("historyAction").value = "";
        document.getElementById("historySource").value = "";
        document.getElementById("historyDate").value = "";
        resetAndLoad();
    });

    document.getElementById("historyPager").addEventListener("click", function (event) {
        const button = event.target.closest("button");
        if (!button || button.disabled) {
            return;
        }

        const nextPage = parseInt(button.getAttribute("data-page"), 10);
        if (!nextPage || nextPage === historyPage) {
            return;
        }

        historyPage = nextPage;
        lastPagerKey = "";
        loadHistory();
    });
}

function setupVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micButtons = document.querySelectorAll(".mic-trigger");
    const micBtn = document.getElementById("micBtn");
    const voiceTitle = document.getElementById("voiceListenTitle");

    if (!SpeechRecognition) {
        micButtons.forEach(function (button) {
            button.disabled = true;
        });
        document.getElementById("voiceHint").textContent =
            "Voice works in Chrome or Edge. Use the ON/OFF buttons for now.";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    function startListening() {
        setToast("Listening... say LIGHT ON or LIGHT OFF", false, "info");
        micButtons.forEach(function (button) {
            button.classList.add("listening");
        });
        const micLabel = micBtn.querySelector(".btn-label");
        if (micLabel) {
            micLabel.textContent = "Listening...";
        } else {
            micBtn.textContent = "Listening...";
        }
        if (voiceTitle) {
            voiceTitle.textContent = "Listening...";
        }
        const hint = document.getElementById("voiceHintLine");
        if (hint) {
            hint.textContent = "Speak now. Try saying a command below.";
        }
        try {
            recognition.start();
        } catch (error) {
            setToast("Microphone is already listening.", false, "info");
        }
    }

    micButtons.forEach(function (button) {
        button.addEventListener("click", startListening);
    });

    recognition.addEventListener("result", function (event) {
        const transcript = event.results[0][0].transcript;
        document.getElementById("latestCommand").textContent = transcript;
        sendCommand(transcript, "voice");
    });

    recognition.addEventListener("error", function (event) {
        if (event.error === "not-allowed") {
            setToast("Microphone permission blocked. Allow mic access in the browser.", true, "sticky");
        } else {
            setToast("Voice error: " + event.error, true, "sticky");
        }
    });

    recognition.addEventListener("end", function () {
        micButtons.forEach(function (button) {
            button.classList.remove("listening");
        });
        const micLabel = micBtn.querySelector(".btn-label");
        if (micLabel) {
            micLabel.textContent = "Speak Command";
        } else {
            micBtn.textContent = "Speak Command";
        }
        if (voiceTitle) {
            voiceTitle.textContent = "Tap to speak";
        }
    });
}

function showVoiceResult(said, success, action, message) {
    const box = document.getElementById("voiceResult");
    if (!box) {
        return;
    }

    box.hidden = false;
    box.classList.toggle("error", !success);
    document.getElementById("voiceSaidText").textContent = '"' + said + '"';
    document.getElementById("voiceResultLabel").textContent = success
        ? "Command recognized"
        : (message || "Unknown command");
    document.getElementById("voiceResultAction").textContent = success
        ? (action === "ON" ? "Light turned ON" : "Light turned OFF")
        : "Try saying LIGHT ON or LIGHT OFF.";

    const icon = document.querySelector("#voiceResultStatus .material-symbols-outlined");
    if (icon) {
        icon.textContent = success ? "check_circle" : "error";
    }
}

async function loadRecentVoice() {
    const list = document.getElementById("recentVoiceList");
    if (!list) {
        return;
    }

    try {
        const response = await fetch(API.history + "?page=1&per_page=5&source=voice&t=" + Date.now());
        const data = await response.json();
        const rows = Array.isArray(data.history) ? data.history : [];

        if (!rows.length) {
            list.innerHTML = '<p class="empty-row">No voice commands yet. Tap the microphone and say LIGHT ON.</p>';
            return;
        }

        list.innerHTML = rows.map(function (record) {
            const statusKey = String(record.status).toLowerCase();
            const ok = statusKey.indexOf("fail") === -1 && statusKey.indexOf("unknown") === -1;
            return (
                '<div class="recent-voice-item">' +
                    "<div><strong>" + escapeHtml(record.voice_command) + "</strong></div>" +
                    "<time>" + escapeHtml(recordDate(record)) + " · " + escapeHtml(recordTime(record)) + "</time>" +
                    '<span class="' + (ok ? "badge-success" : "badge-fail") + '">' +
                        (ok ? "Success" : "Failed") +
                    "</span>" +
                "</div>"
            );
        }).join("");
    } catch (error) {
        list.innerHTML = '<p class="empty-row">Cannot load recent voice commands.</p>';
    }
}

function tickClock() {
    const clock = document.getElementById("liveClockText") || document.getElementById("liveClock");
    if (!clock) {
        return;
    }

    clock.textContent = new Date().toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}

document.getElementById("onBtn").addEventListener("click", function () {
    sendCommand("LIGHT ON", "button");
});

document.getElementById("offBtn").addEventListener("click", function () {
    sendCommand("LIGHT OFF", "button");
});

const relayToggle = document.getElementById("relayToggle");
if (relayToggle) {
    relayToggle.addEventListener("click", function () {
        const isOn = document.getElementById("relayValue").textContent === "ON";
        sendCommand(isOn ? "LIGHT OFF" : "LIGHT ON", "button");
    });
}

document.querySelectorAll(".example-cmd").forEach(function (button) {
    button.addEventListener("click", function () {
        sendCommand(
            button.getAttribute("data-command"),
            button.getAttribute("data-source") || "button"
        );
    });
});

setupThemeToggle();
setupHistoryPager();
setupVoice();
tickClock();
loadSystemData();
loadHistory();
loadRecentVoice();
setInterval(loadSystemData, 1000);
setInterval(tickClock, 1000);
