/* ==========================================
   SHOHIN WEATHER
   APP CONTROLLER
========================================== */

const $ = (id) => document.getElementById(id);

const state = {
  currentPlace: null,
  currentWeather: null,
  unit: localStorage.getItem("shw_unit") || "C",
  favorites: loadFavorites(),
  requestNumber: 0
};

/* ==========================================
   LOCAL STORAGE
========================================== */

function loadFavorites() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("shw_favorites") || "[]"
    );

    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveFavorites() {
  localStorage.setItem(
    "shw_favorites",
    JSON.stringify(state.favorites)
  );
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

/* ==========================================
   STATUS
========================================== */

function showStatus(message, loading = false) {
  const box = $("status");
  if (!box) return;

  box.hidden = false;
  box.textContent = "";

  if (loading) {
    const spinner = document.createElement("span");
    spinner.className = "loader";
    spinner.setAttribute("aria-hidden", "true");

    box.appendChild(spinner);
  }

  box.appendChild(document.createTextNode(message));
}

function hideStatus() {
  const box = $("status");

  if (box) {
    box.hidden = true;
    box.textContent = "";
  }
}

/* ==========================================
   WEATHER DESCRIPTION
========================================== */

function getWeatherInfo(code, isDay = 1) {
  const descriptions = {
    0: ["Ясно", isDay ? "☀️" : "🌙"],
    1: ["Преимущественно ясно", isDay ? "🌤️" : "🌙"],
    2: ["Переменная облачность", "⛅"],
    3: ["Облачно", "☁️"],
    45: ["Туман", "🌫️"],
    48: ["Туман с изморозью", "🌫️"],
    51: ["Слабая морось", "🌦️"],
    53: ["Морось", "🌦️"],
    55: ["Сильная морось", "🌧️"],
    56: ["Ледяная морось", "🌧️"],
    57: ["Сильная ледяная морось", "🌧️"],
    61: ["Небольшой дождь", "🌦️"],
    63: ["Дождь", "🌧️"],
    65: ["Сильный дождь", "🌧️"],
    66: ["Ледяной дождь", "🌧️"],
    67: ["Сильный ледяной дождь", "🌧️"],
    71: ["Небольшой снег", "🌨️"],
    73: ["Снег", "🌨️"],
    75: ["Сильный снегопад", "❄️"],
    77: ["Снежные зёрна", "❄️"],
    80: ["Кратковременный дождь", "🌦️"],
    81: ["Ливень", "🌧️"],
    82: ["Сильный ливень", "⛈️"],
    85: ["Снегопад", "🌨️"],
    86: ["Сильный снегопад", "❄️"],
    95: ["Гроза", "⛈️"],
    96: ["Гроза с градом", "⛈️"],
    99: ["Сильная гроза с градом", "⛈️"]
  };

  return descriptions[code] || ["Неизвестные условия", "🌡️"];
}

/* ==========================================
   CITY SEARCH
========================================== */

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е")
    .replace(/ъ/g, "")
    .replace(/ь/g, "")
    .replace(/[ʻʼ']/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
}

async function searchCity(query) {
  const normalized = normalizeText(query);

  if (!normalized) {
    return null;
  }

  const url = new URL(
    "https://geocoding-api.open-meteo.com/v1/search"
  );

  url.searchParams.set("name", query.trim());
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "ru");
  url.searchParams.set("format", "json");
  url.searchParams.set("countryCode", "TJ");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error("Не удалось найти город.");
  }

  const data = await response.json();
  const results = data.results || [];

  if (!results.length) {
    return null;
  }

  const exact = results.find((place) =>
    normalizeText(place.name) === normalized &&
    place.country_code === "TJ"
  );

  return exact || results.find(
    (place) => place.country_code === "TJ"
  ) || null;
}

/* ==========================================
   LOAD WEATHER
========================================== */

async function loadWeather(cityName) {
  const query = String(cityName || "").trim();

  if (!query) {
    showStatus("Введи название города.");
    return;
  }

  const thisRequest = ++state.requestNumber;

  showStatus("Загружаем погоду...", true);

  const card = $("weatherCard");
  if (card) card.hidden = true;

  try {
    const place = await searchCity(query);

    if (thisRequest !== state.requestNumber) return;

    if (!place) {
      showStatus(
        "Город не найден. Проверь написание или попробуй другое название."
      );
      return;
    }

    const params = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "is_day",
        "precipitation",
        "weather_code",
        "wind_speed_10m"
      ].join(","),
      hourly: [
        "temperature_2m",
        "precipitation_probability",
        "weather_code"
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max"
      ].join(","),
      forecast_days: "7",
      timezone: "auto"
    });

    const response = await fetch(
      "https://api.open-meteo.com/v1/forecast?" +
      params.toString()
    );

    if (!response.ok) {
      throw new Error("Сервис погоды недоступен.");
    }

    const data = await response.json();

    if (thisRequest !== state.requestNumber) return;

    if (!data.current) {
      throw new Error("Нет данных о погоде.");
    }

    state.currentPlace = {
      id: String(place.id || place.name + "_" + place.latitude),
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      admin1: place.admin1 || "",
      country: place.country || "Таджикистан"
    };

    state.currentWeather = data;

    renderWeather();
    renderHourlyForecast();
    renderDailyForecast();
    updateFavoriteButton();
    renderFavorites();

    hideStatus();

    if (card) {
      card.hidden = false;
      card.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

  } catch (error) {
    if (thisRequest !== state.requestNumber) return;

    console.error("SHOHIN WEATHER:", error);

    showStatus(
      "Не удалось загрузить погоду. Проверь интернет и попробуй ещё раз."
    );
  }
}

/* ==========================================
   TEMPERATURE
========================================== */

function convertTemperature(celsius) {
  if (celsius === null || celsius === undefined) {
    return "--";
  }

  const value = state.unit === "F"
    ? celsius * 9 / 5 + 32
    : celsius;

  return Math.round(value);
}

function temperatureText(value) {
  return convertTemperature(value) + "°" + state.unit;
}

function changeUnit(unit) {
  state.unit = unit === "F" ? "F" : "C";

  localStorage.setItem("shw_unit", state.unit);

  $("celsiusButton")?.classList.toggle(
    "active",
    state.unit === "C"
  );

  $("fahrenheitButton")?.classList.toggle(
    "active",
    state.unit === "F"
  );

  $("celsiusButton")?.setAttribute(
    "aria-pressed",
    String(state.unit === "C")
  );

  $("fahrenheitButton")?.setAttribute(
    "aria-pressed",
    String(state.unit === "F")
  );

  if (state.currentWeather) {
    renderWeather();
    renderHourlyForecast();
    renderDailyForecast();
  }
}

/* ==========================================
   CURRENT WEATHER
========================================== */

function renderWeather() {
  const place = state.currentPlace;
  const data = state.currentWeather;

  if (!place || !data || !data.current) return;

  const current = data.current;
  const info = getWeatherInfo(
    current.weather_code,
    current.is_day
  );

  $("weatherCity").textContent = place.name;

  $("weatherDate").textContent =
    "Обновлено: " +
    new Date(current.time).toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit"
    });

  $("weatherIcon").textContent = info[1];
  $("temperature").textContent =
    temperatureText(current.temperature_2m);

  $("weatherDescription").textContent = info[0];

  $("humidity").textContent =
    current.relative_humidity_2m + "%";

  $("wind").textContent =
    Math.round(current.wind_speed_10m) + " км/ч";

  $("feelsLike").textContent =
    temperatureText(current.apparent_temperature);

  const hourly = data.hourly;
  const timeIndex = hourly?.time?.indexOf(current.time) ?? -1;

  const probability = timeIndex >= 0
    ? hourly.precipitation_probability[timeIndex]
    : null;

  $("rain").textContent =
    probability === null || probability === undefined
      ? "Нет данных"
      : probability + "%";
}

/* ==========================================
   HOURLY FORECAST
========================================== */

function renderHourlyForecast() {
  const section = $("hourlySection");
  const container = $("hourlyForecast");
  const hourly = state.currentWeather?.hourly;

  if (!section || !container || !hourly) return;

  const currentTime = state.currentWeather.current.time;
  let startIndex = hourly.time.findIndex(
    (time) => time >= currentTime
  );

  if (startIndex < 0) startIndex = 0;

  const endIndex = Math.min(
    startIndex + 12,
    hourly.time.length
  );

  let html = "";

  for (let i = startIndex; i < endIndex; i++) {
    const date = new Date(hourly.time[i]);
    const info = getWeatherInfo(hourly.weather_code[i]);

    html += `
      <div class="hour-item">
        <div class="hour-time">
          ${escapeHTML(
            i === startIndex
              ? "Сейчас"
              : date.toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit"
                })
          )}
        </div>

        <div class="hour-icon">${info[1]}</div>

        <div class="hour-temperature">
          ${temperatureText(hourly.temperature_2m[i])}
        </div>

        <div class="hour-rain">
          ${hourly.precipitation_probability[i] ?? 0}%
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  section.hidden = false;
}

/* ==========================================
   DAILY FORECAST
========================================== */

function renderDailyForecast() {
  const section = $("dailySection");
  const container = $("dailyForecast");
  const daily = state.currentWeather?.daily;

  if (!section || !container || !daily) return;

  let html = "";

  for (let i = 0; i < daily.time.length; i++) {
    const date = new Date(daily.time[i] + "T12:00:00");
    const info = getWeatherInfo(daily.weather_code[i]);

    const dayName = i === 0
      ? "Сегодня"
      : date.toLocaleDateString("ru-RU", {
          weekday: "short"
        });

    const rain = daily.precipitation_probability_max[i];

    html += `
      <div class="daily-item">
        <div class="daily-day">
          ${escapeHTML(dayName)}
          <small>
            ${escapeHTML(
              date.toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "short"
              })
            )}
          </small>
        </div>

        <div class="daily-condition">
          <span>${info[1]}</span>
          <span>${escapeHTML(info[0])}</span>
        </div>

        <div class="daily-rain">
          ${rain ?? 0}%
        </div>

        <div class="daily-temperatures">
          <strong>
            ${temperatureText(daily.temperature_2m_max[i])}
          </strong>

          <span>
            ${temperatureText(daily.temperature_2m_min[i])}
          </span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  section.hidden = false;
}

/* ==========================================
   FAVORITES
========================================== */

function isFavorite(place) {
  return state.favorites.some(
    (item) => item.id === place.id
  );
}

function updateFavoriteButton() {
  const place = state.currentPlace;
  if (!place) return;

  const favorite = isFavorite(place);

  $("favoriteIcon").textContent = favorite ? "★" : "☆";

  $("favoriteText").textContent = favorite
    ? "Убрать из избранного"
    : "Добавить в избранное";

  $("favoriteButton").setAttribute(
    "aria-pressed",
    String(favorite)
  );
}

function toggleFavorite() {
  const place = state.currentPlace;

  if (!place) {
    showStatus("Сначала выбери город.");
    return;
  }

  if (isFavorite(place)) {
    state.favorites = state.favorites.filter(
      (item) => item.id !== place.id
    );
  } else {
    state.favorites.push(place);
  }

  saveFavorites();
  updateFavoriteButton();
  renderFavorites();
}

function renderFavorites() {
  const section = $("favoritesSection");
  const container = $("favoritesList");

  if (!section || !container) return;

  if (!state.favorites.length) {
    section.hidden = true;
    container.innerHTML = "";
    return;
  }

  section.hidden = false;

  container.innerHTML = state.favorites.map((place) => `
    <button
      class="favorite-city"
      type="button"
      data-favorite-id="${escapeHTML(place.id)}"
    >
      <span>📍</span>
      <span>${escapeHTML(place.name)}</span>
      <span>›</span>
    </button>
  `).join("");
}

/* ==========================================
   EVENTS
========================================== */

$("searchForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadWeather($("citySearch").value);
});

$("popularCities")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-city]");

  if (!button) return;

  $("citySearch").value = button.dataset.city;
  loadWeather(button.dataset.city);
});

$("refreshButton")?.addEventListener("click", () => {
  if (state.currentPlace) {
    loadWeather(state.currentPlace.name);
  } else {
    loadWeather("Душанбе");
  }
});

$("celsiusButton")?.addEventListener("click", () => {
  changeUnit("C");
});

$("fahrenheitButton")?.addEventListener("click", () => {
  changeUnit("F");
});

$("favoriteButton")?.addEventListener("click", toggleFavorite);

$("favoritesList")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-favorite-id]");

  if (!button) return;

  const place = state.favorites.find(
    (item) => item.id === button.dataset.favoriteId
  );

  if (place) {
    $("citySearch").value = place.name;
    loadWeather(place.name);
  }
});

/* ==========================================
   START APP
========================================== */

function startApp() {
  renderFavorites();
  changeUnit(state.unit);

  const loader = $("appLoader");

  if (loader) {
    setTimeout(() => {
      loader.classList.add("loader-hidden");

      setTimeout(() => loader.remove(), 350);
    }, 400);
  }

  loadWeather("Душанбе");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}