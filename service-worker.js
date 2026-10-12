const CACHE_NAME = "shohin-weather-v1";

const APP_FILES = [
"./",
"./index.html",
"./css/style.css",
"./js/app.js",
"./manifest.json",
"./assets/icons/icon.svg"
];

// Насби барнома ва нигоҳ доштани файлҳои асосӣ
self.addEventListener("install", (event) => {
event.waitUntil(
caches.open(CACHE_NAME)
.then((cache) => cache.addAll(APP_FILES))
.then(() => self.skipWaiting())
);
});

// Тоза кардани кэши версияҳои кӯҳна
self.addEventListener("activate", (event) => {
event.waitUntil(
caches.keys()
.then((keys) => Promise.all(
keys
.filter((key) => key !== CACHE_NAME)
.map((key) => caches.delete(key))
))
.then(() => self.clients.claim())
);
});

// Кушодани файлҳои маҳаллӣ аз кэш ҳангоми набудани интернет
self.addEventListener("fetch", (event) => {
const request = event.request;

if (request.method !== "GET") return;

const url = new URL(request.url);

// API-и обу ҳаво аз интернет маълумот мегирад.
// Дар ин ҷо танҳо файлҳои худи барномаро идора мекунем.
if (url.origin !== self.location.origin) return;

if (request.mode === "navigate") {
event.respondWith(
fetch(request)
.then((response) => {
if (response.ok) {
const copy = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put("./index.html", copy);
        });
      }

      return response;
    })
    .catch(async () => {
      return (
        await caches.match(request) ||
        await caches.match("./index.html")
      );
    })
);

return;

}

event.respondWith(
caches.match(request).then(async (cachedResponse) => {
if (cachedResponse) return cachedResponse;

  try {
    const response = await fetch(request);

    if (response.ok) {
      const copy = response.clone();

      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, copy);
      });
    }

    return response;
  } catch (error) {
    return new Response("Ин файл ҳоло дастрас нест.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
})

);
});