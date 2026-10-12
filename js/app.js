/* ==========================================
   SHOHIN WEATHER V1
   SHOHIN BRAND COLORS — НЕ МЕНЯТЬ
   Local Tajikistan places + Open-Meteo
========================================== */

const PLACES_FILE = "./data/tajikistan-places.json";
const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_API = "https://api.open-meteo.com/v1/forecast";

const state = {
  places: [],
  placesLoaded: false,
  currentPlace: null,
  currentWeather: null,
  unit: localStorage.getItem("shw_unit") || "C",
  favorites: loadSavedFavorites(),
  requestNumber: 0,
  searchTimer: null
};

/* ==========================================
   ELEMENTS
========================================== */

const $ = (id) => document.getElementById(id);

const elements = {
  loader: $("appLoader"),
  refresh: $("refreshButton"),
  searchForm: $("searchForm"),
  searchInput: $("citySearch"),
  searchResults: $("searchResults"),
  status: $("status"),

  popularCities: $("popularCities"),

  weatherCard: $("weatherCard"),
  weatherCity: $("weatherCity"),
  weatherDate: $("weatherDate"),
  weatherIcon: $("weatherIcon"),
  temperature: $("temperature"),
  weatherDescription: $("weatherDescription"),

  humidity: $("humidity"),
  wind: $("wind"),
  feelsLike: $("feelsLike"),
  rain: $("rain"),

  celsiusButton: $("celsiusButton"),
  fahrenheitButton: $("fahrenheitButton"),

  favoriteButton: $("favoriteButton"),
  favoriteIcon: $("favoriteIcon"),
  favoriteText: $("favoriteText"),

  hourlySection: $("hourlySection"),
  hourlyForecast: $("hourlyForecast"),

  dailySection: $("dailySection"),
  dailyForecast: $("dailyForecast"),

  favoritesSection: $("favoritesSection"),
  favoritesList: $("favoritesList")
};

/* ==========================================
   SAFE STORAGE
========================================== */

function loadSavedFavorites() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("shw_favorites") || "[]"
    );

    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(
      "shw_favorites",
      JSON.stringify(state.favorites)
    );
  } catch (error) {
    console.warn("Не удалось сохранить избранное.");
  }
}

/* ==========================================
   TEXT HELPERS
========================================== */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[char];
  });
}

function normalizeText(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .replace(/ӣ/g, "и")
    .replace(/ӯ/g, "у")
    .replace(/қ/g, "к")
    .replace(/ғ/g, "г")
    .replace(/ҳ/g, "х")
    .replace(/ъ/g, "")
    .replace(/ь/g, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function showStatus(message, type = "info") {
  if (!elements.status) return;

  elements.status.textContent = message;
  elements.status.hidden = false;

  elements.status.classList.remove("error", "success");

  if (type === "error") {
    elements.status.classList.add("error");
  }

  if (type === "success") {
    elements.status.classList.add("success");
  }
}

function hideStatus() {
  if (elements.status) {
    elements.status.hidden = true;
    elements.status.textContent = "";
    elements.status.classList.remove("error", "success");
  }
}

function hideSearchResults() {
  if (!elements.searchResults) return;

  elements.searchResults.innerHTML = "";
  elements.searchResults.hidden = true;
}

/* ==========================================
   LOAD TAJIKISTAN PLACES
========================================== */

async function loadPlaces() {
  if (state.placesLoaded) {
    return state.places;
  }

  try {
    const response = await fetch(PLACES_FILE, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Неверный формат JSON");
    }

    state.places = data
      .filter((place) => {
        return (
          place &&
          place.name &&
          Number.isFinite(Number(place.lat)) &&
          Number.isFinite(Number(place.lon))
        );
      })
      .map((place) => ({
        id: String(place.id || place.name),
        name: String(place.name),
        aliases: Array.isArray(place.aliases)
          ? place.aliases.map(String)
          : [],
        region: String(place.region || "Таджикистан"),
        latitude: Number(place.lat),
        longitude: Number(place.lon),
        country: "Таджикистан",
        source: "local"
      }));

    state.placesLoaded = true;

    console.log(
      "SHOHIN WEATHER: загружено местных записей:",
      state.places.length
    );

    return state.places;
  } catch (error) {
    console.error("Ошибка загрузки списка мест:", error);

    state.places = [];
    state.placesLoaded = false;

    return [];
  }
}

/* ==========================================
   SEARCH LOCAL PLACES
========================================== */

function findLocalPlaces(query, limit = 8) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) return [];

  const results = [];

  for (const place of state.places) {
    const names = [
      place.name,
      ...place.aliases,
      place.region
    ];

    let bestScore = 0;

    for (const name of names) {
      const normalizedName = normalizeText(name);

      if (!normalizedName) continue;

      if (normalizedName === normalizedQuery) {
        bestScore = Math.max(bestScore, 100);
      } else if (
        normalizedName.startsWith(normalizedQuery)
      ) {
        bestScore = Math.max(bestScore, 70);
      } else if (
        normalizedName.includes(normalizedQuery)
      ) {
        bestScore = Math.max(bestScore, 40);
      }
    }

    if (bestScore > 0) {
      results.push({
        ...place,
        score: bestScore
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

/* ==========================================
   SEARCH INTERNET
========================================== */

async function searchOnline(query) {
  const params = new URLSearchParams({
    name: query,
    count: "10",
    language: "ru",
    format: "json",
    countryCode: "TJ"
  });

  const response = await fetch(
    `${GEOCODING_API}?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error("Ошибка поиска: " + response.status);
  }

  const data = await response.json();

  return (data.results || [])
    .filter((place) => {
      return (
        Number.isFinite(Number(place.latitude)) &&
        Number.isFinite(Number(place.longitude))
      );
    })
    .map((place) => ({
      id: String(place.id || place.name),
      name: place.name,
      aliases: [],
      region: place.admin1 || "Таджикистан",
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      country: place.country || "Таджикистан",
      source: "online"
    }));
}

/* ==========================================
   SHOW SEARCH SUGGESTIONS
========================================== */

function renderSearchResults(places, query) {
  if (!elements.searchResults) return;

  if (!places.length) {
    elements.searchResults.innerHTML = `
      <div class="search-result">
        <span>Маҳал ёфт нашуд</span>
      </div>
    `;

    elements.searchResults.hidden = false;
    return;
  }

  elements.searchResults.innerHTML = places
    .map((place, index) => {
      const region = place.region || "Таджикистан";

      return `
        <button
          type="button"
          class="search-result"
          data-place-index="${index}"
          aria-label="${escapeHTML(place.name)}"
        >
          <span class="search-result-icon" aria-hidden="true">
            📍
          </span>

          <span class="search-result-info">
            <strong>${escapeHTML(place.name)}</strong>
            <small>${escapeHTML(region)}</small>
          </span>
        </button>
      `;
    })
    .join("");

  elements.searchResults.hidden = false;

  elements.searchResults
    .querySelectorAll("[data-place-index]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.placeIndex);
        const place = places[index];

        if (!place) return;

        elements.searchInput.value = place.name;
        hideSearchResults();
        loadWeather(place);
      });
    });
}

/* ==========================================
   SEARCH WHILE TYPING
========================================== */

async function updateSearchSuggestions() {
  if (!elements.searchInput) return;

  const query = elements.searchInput.value.trim();

  if (query.length < 2) {
    hideSearchResults();
    return;
  }

  await loadPlaces();

  const localResults = findLocalPlaces(query, 8);

  if (localResults.length >= 5) {
    renderSearchResults(localResults, query);
    return;
  }

  try {
    const onlineResults = await searchOnline(query);

    const combined = [];
    const seen = new Set();

    for (const place of [...localResults, ...onlineResults]) {
      const key = normalizeText(place.name);

      if (!key || seen.has(key)) continue;

      seen.add(key);
      combined.push(place);
    }

    renderSearchResults(combined.slice(0, 8), query);
  } catch (error) {
    if (localResults.length) {
      renderSearchResults(localResults, query);
    } else {
      hideSearchResults();
    }
  }
}

/* ==========================================
   SEARCH A CITY
========================================== */

async function searchCity(query) {
  await loadPlaces();

  const localResults = findLocalPlaces(query, 10);

  if (localResults.length) {
    return localResults[0];
  }

  const onlineResults = await searchOnline(query);

  if (onlineResults.length) {
    return onlineResults[0];
  }

  throw new Error(
    "Маҳал ёфт нашуд. Номро бо забони дигар нависед."
  );
}

/* ==========================================
   WEATHER INFORMATION
========================================== */

function getWeatherInfo(code) {
  const weather = {
    0: ["Ясно", "☀️"],
    1: ["Преимущественно ясно", "🌤️"],
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
    75: ["Сильный снег", "❄️"],
    77: ["Снежные зёрна", "❄️"],
    80: ["Кратковременный дождь", "🌦️"],
    81: ["Ливень", "🌧️"],
    82: ["Сильный ливень", "⛈️"],
    85: ["Слабый снегопад", "🌨️"],
    86: ["Сильный снегопад", "❄️"],
    95: ["Гроза", "⛈️"],
    96: ["Гроза с градом", "⛈️"],
    99: ["Сильная гроза с градом", "⛈️"]
  };

  return weather[code] || ["Погода неизвестна", "🌡️"];
}

/* ==========================================
   LOAD WEATHER
========================================== */

async function loadWeather(placeOrName) {
  const requestNumber = ++state.requestNumber;

  hideStatus();
  hideSearchResults();

  if (elements.weatherCard) {
    elements.weatherCard.hidden = true;
  }

  if (elements.hourlySection) {
    elements.hourlySection.hidden = true;
  }

  if (elements.dailySection) {
    elements.dailySection.hidden = true;
  }

  const refreshText = elements.refresh
    ? elements.refresh.textContent
    : "";

  if (elements.refresh) {
    elements.refresh.disabled = true;
    elements.refresh.setAttribute("aria-busy", "true");
  }

  showStatus("Обу ҳаворо бор карда истодаем…");

  try {
    let place = placeOrName;

    if (typeof placeOrName === "string") {
      place = await searchCity(placeOrName);
    }

    if (!place) {
      throw new Error("Маҳал муайян нашуд.");
    }

    const latitude = Number(
      place.latitude ?? place.lat
    );

    const longitude = Number(
      place.longitude ?? place.lon
    );

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      throw new Error("Координатҳои маҳал нодурустанд.");
    }

    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
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
        "sunrise",
        "sunset"
      ].join(","),
      forecast_days: "7",
      timezone: "auto"
    });

    const response = await fetch(
      `${WEATHER_API}?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(
        "Хадамоти обу ҳаво ҷавоб надод: " + response.status
      );
    }

    const weather = await response.json();

    if (requestNumber !== state.requestNumber) {
      return;
    }

    if (!weather.current) {
      throw new Error("Маълумоти обу ҳаво дастрас нест.");
    }

    state.currentPlace = {
      ...place,
      latitude,
      longitude
    };

    state.currentWeather = weather;

    renderWeather();
    renderHourlyForecast();
    renderDailyForecast();
    updateFavoriteButton();
    renderFavorites();

    if (elements.weatherCard) {
      elements.weatherCard.hidden = false;
    }

    if (elements.hourlySection) {
      elements.hourlySection.hidden = false;
    }

    if (elements.dailySection) {
      elements.dailySection.hidden = false;
    }

    hideStatus();
  } catch (error) {
    if (requestNumber !== state.requestNumber) {
      return;
    }

    console.error("SHOHIN WEATHER:", error);

    showStatus(
      error.message ||
      "Хато шуд. Интернетро санҷед ва аз нав кӯшиш кунед.",
      "error"
    );
  } finally {
    if (requestNumber === state.requestNumber) {
      if (elements.refresh) {
        elements.refresh.disabled = false;
        elements.refresh.removeAttribute("aria-busy");
        elements.refresh.textContent = refreshText || "↻";
      }
    }
  }
}

/* ==========================================
   TEMPERATURE
========================================== */

function convertTemperature(celsius) {
  if (state.unit === "F") {
    return (celsius * 9) / 5 + 32;
  }

  return celsius;
}

function temperatureText(value) {
  if (!Number.isFinite(Number(value))) {
    return "—";
  }

  return Math.round(convertTemperature(Number(value))) + "°";
}

function updateUnitButtons() {
  if (elements.celsiusButton) {
    const active = state.unit === "C";

    elements.celsiusButton.classList.toggle("active", active);
    elements.celsiusButton.setAttribute(
      "aria-pressed",
      String(active)
    );
  }

  if (elements.fahrenheitButton) {
    const active = state.unit === "F";

    elements.fahrenheitButton.classList.toggle("active", active);
    elements.fahrenheitButton.setAttribute(
      "aria-pressed",
      String(active)
    );
  }
}

function changeUnit(unit) {
  if (unit !== "C" && unit !== "F") return;

  state.unit = unit;

  try {
    localStorage.setItem("shw_unit", unit);
  } catch (error) {
    // Продолжаем работу без сохранения настройки.
  }

  updateUnitButtons();

  if (state.currentWeather) {
    renderWeather();
    renderHourlyForecast();
    renderDailyForecast();
  }
}

/* ==========================================
   DATE
========================================== */

function formatDate(dateString, options = {}) {
  if (!dateString) return "";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("ru-RU", options).format(date);
}

/* ==========================================
   RENDER CURRENT WEATHER
========================================== */

function renderWeather() {
  if (!state.currentWeather || !state.currentPlace) {
    return;
  }

  const weather = state.currentWeather;
  const current = weather.current;
  const info = getWeatherInfo(current.weather_code);

  if (elements.weatherCity) {
    elements.weatherCity.textContent = state.currentPlace.name;
  }

  if (elements.weatherDate) {
    elements.weatherDate.textContent = formatDate(
      current.time,
      {
        weekday: "long",
        day: "numeric",
        month: "long"
      }
    );
  }

  if (elements.weatherIcon) {
    elements.weatherIcon.textContent = info[1];
  }

  if (elements.temperature) {
    elements.temperature.textContent = temperatureText(
      current.temperature_2m
    );
  }

  if (elements.weatherDescription) {
    elements.weatherDescription.textContent = info[0];
  }

  if (elements.humidity) {
    elements.humidity.textContent =
      current.relative_humidity_2m + "%";
  }

  if (elements.wind) {
    elements.wind.textContent =
      Math.round(current.wind_speed_10m) + " км/ч";
  }

  if (elements.feelsLike) {
    elements.feelsLike.textContent = temperatureText(
      current.apparent_temperature
    );
  }

  if (elements.rain) {
    elements.rain.textContent =
      current.precipitation + " мм";
  }

  updateUnitButtons();
}

/* ==========================================
   HOURLY FORECAST
========================================== */

function renderHourlyForecast() {
  if (
    !state.currentWeather ||
    !elements.hourlyForecast
  ) {
    return;
  }

  const weather = state.currentWeather;
  const hourly = weather.hourly;

  if (!hourly || !Array.isArray(hourly.time)) {
    elements.hourlyForecast.innerHTML = "";
    return;
  }

  const currentTime = weather.current.time;
  let startIndex = hourly.time.findIndex((time) => {
    return time >= currentTime;
  });

  if (startIndex < 0) {
    startIndex = 0;
  }

  const endIndex = Math.min(
    startIndex + 12,
    hourly.time.length
  );

  let html = "";

  for (let i = startIndex; i < endIndex; i++) {
    const info = getWeatherInfo(hourly.weather_code[i]);

    const hour = formatDate(
      hourly.time[i],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );

    const rainProbability =
      hourly.precipitation_probability?.[i];

    html += `
      <div class="hour-item">
        <span>${escapeHTML(hour)}</span>
        <span class="hour-icon">${info[1]}</span>
        <strong>${temperatureText(
          hourly.temperature_2m[i]
        )}</strong>
        <small>${
          Number.isFinite(Number(rainProbability))
            ? Math.round(rainProbability) + "%"
            : ""
        }</small>
      </div>
    `;
  }

  elements.hourlyForecast.innerHTML = html;
}

/* ==========================================
   SEVEN-DAY FORECAST
========================================== */

function renderDailyForecast() {
  if (
    !state.currentWeather ||
    !elements.dailyForecast
  ) {
    return;
  }

  const daily = state.currentWeather.daily;

  if (!daily || !Array.isArray(daily.time)) {
    elements.dailyForecast.innerHTML = "";
    return;
  }

  let html = "";

  for (let i = 0; i < daily.time.length; i++) {
    const info = getWeatherInfo(daily.weather_code[i]);

    const dayName = i === 0
      ? "Сегодня"
      : formatDate(
          daily.time[i],
          { weekday: "short" }
        );

    html += `
      <div class="daily-item">
        <span>${escapeHTML(dayName)}</span>
        <span class="daily-icon">${info[1]}</span>
        <strong>${temperatureText(
          daily.temperature_2m_max[i]
        )}</strong>
        <small>${temperatureText(
          daily.temperature_2m_min[i]
        )}</small>
      </div>
    `;
  }

  elements.dailyForecast.innerHTML = html;
}

/* ==========================================
   FAVORITES
========================================== */

function isFavorite(place) {
  if (!place) return false;

  return state.favorites.some((favorite) => {
    if (favorite.id && place.id) {
      return String(favorite.id) === String(place.id);
    }

    return (
      normalizeText(favorite.name) ===
      normalizeText(place.name)
    );
  });
}

function updateFavoriteButton() {
  if (
    !elements.favoriteButton ||
    !state.currentPlace
  ) {
    return;
  }

  const favorite = isFavorite(state.currentPlace);

  elements.favoriteButton.classList.toggle(
    "active",
    favorite
  );

  elements.favoriteButton.setAttribute(
    "aria-pressed",
    String(favorite)
  );

  if (elements.favoriteIcon) {
    elements.favoriteIcon.textContent = favorite
      ? "★"
      : "☆";
  }

  if (elements.favoriteText) {
    elements.favoriteText.textContent = favorite
      ? "В избранном"
      : "В избранное";
  }
}

function toggleFavorite() {
  if (!state.currentPlace) return;

  const place = state.currentPlace;
  const existingIndex = state.favorites.findIndex(
    (favorite) => {
      if (favorite.id && place.id) {
        return String(favorite.id) === String(place.id);
      }

      return (
        normalizeText(favorite.name) ===
        normalizeText(place.name)
      );
    }
  );

  if (existingIndex >= 0) {
    state.favorites.splice(existingIndex, 1);
  } else {
    state.favorites.push({
      id: String(place.id || place.name),
      name: place.name,
      region: place.region || "Таджикистан",
      latitude: Number(place.latitude),
      longitude: Number(place.longitude)
    });
  }

  saveFavorites();
  updateFavoriteButton();
  renderFavorites();
}

function renderFavorites() {
  if (!elements.favoritesList) return;

  if (elements.favoritesSection) {
    elements.favoritesSection.hidden =
      state.favorites.length === 0;
  }

  if (!state.favorites.length) {
    elements.favoritesList.innerHTML = "";
    return;
  }

  elements.favoritesList.innerHTML =
    state.favorites.map((place, index) => `
      <button
        type="button"
        class="favorite-city"
        data-favorite-index="${index}"
      >
        <span>📍</span>
        <span>
          <strong>${escapeHTML(place.name)}</strong>
          <small>${escapeHTML(place.region || "")}</small>
        </span>
      </button>
    `).join("");

  elements.favoritesList
    .querySelectorAll("[data-favorite-index]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.favoriteIndex);
        const place = state.favorites[index];

        if (place) {
          loadWeather(place);
        }
      });
    });
}

/* ==========================================
   EVENT LISTENERS
========================================== */

if (elements.searchForm) {
  elements.searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const query = elements.searchInput?.value.trim();

    if (!query) {
      showStatus("Номи шаҳр ё маҳалро нависед.", "error");
      return;
    }

    hideSearchResults();

    await loadWeather(query);
  });
}

if (elements.searchInput) {
  elements.searchInput.addEventListener("input", () => {
    clearTimeout(state.searchTimer);

    state.searchTimer = setTimeout(() => {
      updateSearchSuggestions();
    }, 300);
  });

  elements.searchInput.addEventListener("focus", () => {
    if (elements.searchInput.value.trim().length >= 2) {
      updateSearchSuggestions();
    }
  });
}

document.addEventListener("click", (event) => {
  if (!elements.searchForm) return;

  if (!elements.searchForm.contains(event.target)) {
    hideSearchResults();
  }
});

if (elements.refresh) {
  elements.refresh.addEventListener("click", () => {
    if (state.currentPlace) {
      loadWeather(state.currentPlace);
    } else {
      loadWeather("Душанбе");
    }
  });
}

if (elements.celsiusButton) {
  elements.celsiusButton.addEventListener("click", () => {
    changeUnit("C");
  });
}

if (elements.fahrenheitButton) {
  elements.fahrenheitButton.addEventListener("click", () => {
    changeUnit("F");
  });
}

if (elements.favoriteButton) {
  elements.favoriteButton.addEventListener(
    "click",
    toggleFavorite
  );
}

/* ==========================================
   POPULAR CITIES
========================================== */

if (elements.popularCities) {
  elements.popularCities.addEventListener("click", (event) => {
    const button = event.target.closest("[data-city]");

    if (!button) return;

    const city = button.dataset.city;

    if (city) {
      loadWeather(city);
    }
  });
}

/* ==========================================
   START APP
========================================== */

async function startApp() {
  updateUnitButtons();
  renderFavorites();

  await loadPlaces();

  loadWeather("Душанбе");

  if (elements.loader) {
    setTimeout(() => {
      elements.loader.classList.add("loader-hidden");
    }, 450);
  }
}

startApp();