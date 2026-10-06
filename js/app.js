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

    document.querySelectorAll("nav button").forEach(function (button) {
        button.classList.remove("active");
    });

    document.getElementById(page).classList.add("active");

    if (page === "dashboard") {
        document.getElementById("dashboardBtn").classList.add("active");
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
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
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
            return;
        }

        updateLightUI(data.light_action);
        document.getElementById("latestCommand").textContent = data.voice_command;
        setToast(data.message, false, "info");
        loadSystemData();
        loadHistory();
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

        if (deviceDot) {
            deviceDot.classList.toggle("online", online);
        }
        if (deviceText) {
            deviceText.textContent = online ? "ESP32 Connected" : "No Hardware Connected";
        }
        if (modeText) {
            modeText.textContent = online
                ? "Hardware mode: commands go to the ESP32 and relay."
                : "Simulation mode: no ESP32 yet. Dashboard will still turn the bulb on/off.";
        }

        updateLightUI(data.light || "OFF");

        if (data.latest) {
            document.getElementById("latestCommand").textContent = data.latest.voice_command;
            document.getElementById("lastUpdated").textContent = data.latest.created_at;
            document.getElementById("latestSource").textContent = data.latest.source || "--";
        } else {
            document.getElementById("latestCommand").textContent = "Waiting for command...";
            document.getElementById("lastUpdated").textContent = "--";
            document.getElementById("latestSource").textContent = "--";
        }

        if (document.getElementById("history").classList.contains("active")) {
            loadHistory();
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
        historyTable.innerHTML = '<tr><td class="empty-row" colspan="5">No commands yet. Try LIGHT ON.</td></tr>';
        return;
    }

    history.forEach(function (record) {
        const row = document.createElement("tr");
        const actionClass = record.light_action === "ON" ? "on-text" : "off-text";

        row.innerHTML =
            "<td>" + escapeHtml(record.created_at) + "</td>" +
            "<td>" + escapeHtml(record.voice_command) + "</td>" +
            "<td class=\"" + actionClass + "\">" + escapeHtml(record.light_action) + "</td>" +
            "<td>" + escapeHtml(record.source || "dashboard") + "</td>" +
            "<td class=\"success\">" + escapeHtml(record.status) + "</td>";

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
        const response = await fetch(
            API.history +
                "?page=" + historyPage +
                "&per_page=" + historyPerPage +
                "&t=" + Date.now()
        );
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
    document.getElementById("historyPageSize").addEventListener("change", function () {
        historyPerPage = parseInt(this.value, 10);
        historyPage = 1;
        lastPagerKey = "";
        loadHistory();
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
    const micBtn = document.getElementById("micBtn");

    if (!SpeechRecognition) {
        micBtn.disabled = true;
        document.getElementById("voiceHint").textContent =
            "Voice works in Chrome or Edge. Use the ON/OFF buttons for now.";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    micBtn.addEventListener("click", function () {
        setToast("Listening... say LIGHT ON or LIGHT OFF", false, "info");
        micBtn.classList.add("listening");
        micBtn.textContent = "Listening...";
        recognition.start();
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
        micBtn.classList.remove("listening");
        micBtn.textContent = "Speak Command";
    });
}

document.getElementById("onBtn").addEventListener("click", function () {
    sendCommand("LIGHT ON", "button");
});

document.getElementById("offBtn").addEventListener("click", function () {
    sendCommand("LIGHT OFF", "button");
});

setupThemeToggle();
setupHistoryPager();
setupVoice();
loadSystemData();
loadHistory();
setInterval(loadSystemData, 1000);
