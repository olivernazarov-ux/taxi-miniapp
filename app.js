'use strict';
/* global ymaps */ // loaded from https://api-maps.yandex.ru/2.1/

// ── Telegram WebApp init ──────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  const root = document.documentElement;
  if (tg.themeParams) {
    const { bg_color, secondary_bg_color, text_color, hint_color, button_color } = tg.themeParams;
    if (bg_color)           root.style.setProperty('--bg',         bg_color);
    if (secondary_bg_color) root.style.setProperty('--surface',    secondary_bg_color);
    if (text_color)         root.style.setProperty('--text',       text_color);
    if (hint_color)         root.style.setProperty('--text-muted', hint_color);
    if (button_color)       root.style.setProperty('--accent',     button_color);
  }
}

// ── User greeting ─────────────────────────────────────────────────
const user = tg?.initDataUnsafe?.user;
const greeting = document.getElementById('user-greeting');
if (user?.first_name) greeting.textContent = `Assalomu alaykum, ${user.first_name}!`;

// ── State ─────────────────────────────────────────────────────────
const state = {
  pickup: '',
  destination: '',
  pickupCoords: null,
  destCoords: null,
  selectedRide: null,
  paymentMethod: 'Naqd pul',
  promoDiscount: 0,
  driver: null,
  tripStatus: 0,
  realDistance: null,
};

// ── Uzbekistan cities (quick places) ─────────────────────────────
const UZ_CITIES = [
  { name: 'Toshkent',    coords: [41.2995, 69.2401], icon: '🏙️' },
  { name: 'Samarqand',   coords: [39.6542, 66.9597], icon: '🕌' },
  { name: 'Buxoro',      coords: [39.7747, 64.4286], icon: '🏰' },
  { name: 'Namangan',    coords: [41.0011, 71.6725], icon: '🌿' },
  { name: 'Andijon',     coords: [40.7821, 72.3442], icon: '🏔️' },
  { name: 'Farg\'ona',   coords: [40.3864, 71.7864], icon: '🌾' },
  { name: 'Nukus',       coords: [42.4535, 59.6103], icon: '🏜️' },
  { name: 'Qarshi',      coords: [38.8603, 65.7903], icon: '🌅' },
];

// ── Ride types (межгород) ─────────────────────────────────────────
const rideTypes = [
  {
    id: 'econom',
    name: 'Econom',
    icon: '🚗',
    desc: 'Hamkor yolovchilar bilan',
    descRu: 'С попутчиками — дешевле',
    eta: '10 daq',
    pricePerKm: 800,
    base: 15000,
  },
  {
    id: 'comfort',
    name: 'Comfort',
    icon: '🚙',
    desc: 'Alohida salon, klimat',
    descRu: 'Отдельный салон, кондиционер',
    eta: '8 daq',
    pricePerKm: 1200,
    base: 25000,
  },
  {
    id: 'business',
    name: 'Business',
    icon: '🚐',
    desc: 'Premium avto, yuqori reyting',
    descRu: 'Премиум авто, высокий рейтинг',
    eta: '12 daq',
    pricePerKm: 1800,
    base: 40000,
  },
  {
    id: 'minivan',
    name: 'Miniven',
    icon: '🚌',
    desc: 'Guruh uchun, 6 kishigacha',
    descRu: 'Для группы до 6 человек',
    eta: '15 daq',
    pricePerKm: 1500,
    base: 35000,
  },
];

// ── Mock drivers (Uzbek names) ────────────────────────────────────
const mockDrivers = [
  { name: 'Jasur T.',    rating: 4.9, car: 'Chevrolet Nexia 3 • 01 A 123 BA', avatar: 'J' },
  { name: 'Bobur X.',    rating: 4.8, car: 'Chevrolet Cobalt • 10 B 456 BC',  avatar: 'B' },
  { name: 'Sherzod M.', rating: 5.0, car: 'Chevrolet Lacetti • 25 C 789 CD', avatar: 'S' },
  { name: 'Ulugbek R.', rating: 4.7, car: 'Chevrolet Damas • 30 D 012 DE',   avatar: 'U' },
  { name: 'Dilshod A.', rating: 4.9, car: 'Toyota Camry • 01 E 345 EF',      avatar: 'D' },
];

// ── Yandex Map globals ────────────────────────────────────────────
let ymap = null;
let pickupMark = null;
let destMark   = null;
let driverMark = null;
let routeLine  = null;

// ── Init Yandex Map (centered on Uzbekistan) ──────────────────────
ymaps.ready(() => {
  ymap = new ymaps.Map('ymap', {
    center: [41.2995, 69.2401], // Toshkent
    zoom: 7,                    // country-level zoom for inter-city
    controls: ['zoomControl'],
  }, { suppressMapOpenBlock: true });

  ymap.events.add('click', e => {
    const coords = e.get('coords');
    reverseGeocode(coords).then(address => {
      if (!state.pickupCoords) setPickup(address, coords);
      else if (!state.destCoords) setDestination(address, coords);
    });
  });
});

// ── Geocode helpers ───────────────────────────────────────────────
function geocode(query) {
  return ymaps.geocode(query + ', O\'zbekiston', { results: 5 }).then(res => {
    const results = [];
    for (let i = 0; i < res.geoObjects.getLength(); i++) {
      const obj = res.geoObjects.get(i);
      results.push({
        name:   obj.getAddressLine(),
        address: obj.properties.get('text'),
        coords: obj.geometry.getCoordinates(),
      });
    }
    return results;
  });
}

function reverseGeocode(coords) {
  return ymaps.geocode(coords, { results: 1 }).then(res => {
    const obj = res.geoObjects.get(0);
    return obj ? obj.getAddressLine() : `${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`;
  });
}

// ── Set pickup / destination ──────────────────────────────────────
function setPickup(address, coords) {
  state.pickup = address;
  state.pickupCoords = coords;
  document.getElementById('pickup-input').value = address;
  document.getElementById('suggestions').style.display = 'none';

  if (pickupMark) ymap.geoObjects.remove(pickupMark);
  pickupMark = new ymaps.Placemark(coords, { balloonContent: 'Chiqish nuqtasi' }, {
    preset: 'islands#greenDotIconWithCaption',
  });
  ymap.geoObjects.add(pickupMark);
  checkSearchReady();
  if (state.destCoords) drawRoute();
  else ymap.setCenter(coords, 10, { duration: 500 });
}

function setDestination(address, coords) {
  state.destination = address;
  state.destCoords  = coords;
  document.getElementById('destination-input').value = address;
  document.getElementById('suggestions').style.display = 'none';

  if (destMark) ymap.geoObjects.remove(destMark);
  destMark = new ymaps.Placemark(coords, { balloonContent: 'Manzil' }, {
    preset: 'islands#redDotIconWithCaption',
  });
  ymap.geoObjects.add(destMark);
  checkSearchReady();
  if (state.pickupCoords) drawRoute();
}

// ── Draw route ────────────────────────────────────────────────────
function drawRoute() {
  if (routeLine) ymap.geoObjects.remove(routeLine);

  ymaps.route([state.pickupCoords, state.destCoords], { routingMode: 'auto' })
    .then(route => {
      routeLine = route.getPaths();
      routeLine.options.set({ strokeColor: '#f5a623', strokeWidth: 5, opacity: 0.85 });
      ymap.geoObjects.add(routeLine);

      state.realDistance = route.getLength() / 1000;
      ymap.setBounds(routeLine.getBounds(), { checkZoomRange: true, zoomMargin: 60 });

      cachedPrices = {};
      rideTypes.forEach(r => { cachedPrices[r.id] = calcPrice(r, state.realDistance); });

      // Show distance hint
      showToast(`Masofa: ${state.realDistance.toFixed(0)} km`);
    })
    .catch(() => {
      routeLine = new ymaps.Polyline([state.pickupCoords, state.destCoords], {}, {
        strokeColor: '#f5a623', strokeWidth: 4,
      });
      ymap.geoObjects.add(routeLine);
    });
}

// ── Autocomplete ──────────────────────────────────────────────────
let activeInput = null;
let cachedPrices = {};
let geocodeTimer = null;

function showSuggestions(query, inputEl) {
  const box = document.getElementById('suggestions');
  if (!query || query.length < 2) { box.style.display = 'none'; return; }

  clearTimeout(geocodeTimer);
  geocodeTimer = setTimeout(() => {
    geocode(query).then(results => {
      if (!results.length) { box.style.display = 'none'; return; }
      box.innerHTML = results.map((p, i) => `
        <div class="suggestion-item" data-idx="${i}">
          <svg class="suggestion-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <div class="suggestion-text">
            <span class="suggestion-main">${p.name}</span>
            <span class="suggestion-sub">${p.address}</span>
          </div>
        </div>
      `).join('');
      box.style.display = 'block';
      activeInput = inputEl;

      box.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const r = results[+item.dataset.idx];
          if (activeInput === document.getElementById('pickup-input')) setPickup(r.name, r.coords);
          else setDestination(r.name, r.coords);
        });
      });
    });
  }, 350);
}

document.getElementById('pickup-input').addEventListener('input', e => {
  state.pickup = e.target.value;
  showSuggestions(e.target.value, e.target);
  checkSearchReady();
});
document.getElementById('destination-input').addEventListener('input', e => {
  state.destination = e.target.value;
  showSuggestions(e.target.value, e.target);
  checkSearchReady();
});
document.addEventListener('click', e => {
  if (!e.target.closest('.suggestions') && !e.target.closest('.input-wrapper'))
    document.getElementById('suggestions').style.display = 'none';
});

// ── Quick city buttons ────────────────────────────────────────────
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const city = UZ_CITIES.find(c => c.name === btn.dataset.place);
    if (!city) return;
    if (!state.pickupCoords) setPickup(city.name, city.coords);
    else setDestination(city.name, city.coords);
  });
});

// ── Locate me ─────────────────────────────────────────────────────
document.getElementById('locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) { showToast('Geolokatsiya mavjud emas'); return; }
  showToast('Joylashuv aniqlanmoqda...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const coords = [pos.coords.latitude, pos.coords.longitude];
      ymap.setCenter(coords, 13, { duration: 500 });
      reverseGeocode(coords).then(address => {
        setPickup(address, coords);
        showToast('Joylashuv aniqlandi!');
      });
    },
    () => showToast('Joylashuvni aniqlab bo\'lmadi')
  );
});

// ── Check form ready ──────────────────────────────────────────────
function checkSearchReady() {
  document.getElementById('search-rides-btn').disabled =
    !(state.pickup.trim() && state.destination.trim());
}

// ── Price calculation (UZS) ───────────────────────────────────────
function calcPrice(rideType, distanceKm) {
  const km = distanceKm ?? (50 + Math.random() * 300); // inter-city: 50–350 km
  const price = rideType.base + rideType.pricePerKm * km;
  return { price: Math.round(price * (1 - state.promoDiscount) / 1000) * 1000, distance: km };
}

function formatPrice(p) {
  return new Intl.NumberFormat('uz-UZ').format(p) + ' so\'m';
}

function truncate(str, n) { return str.length > n ? str.slice(0, n) + '…' : str; }

// ── Search rides ──────────────────────────────────────────────────
document.getElementById('search-rides-btn').addEventListener('click', () => {
  cachedPrices = {};
  rideTypes.forEach(r => { cachedPrices[r.id] = calcPrice(r, state.realDistance); });
  renderRideOptions();
  showScreen('screen-ride');

  const km = state.realDistance ? `${state.realDistance.toFixed(0)} km` : '';
  document.getElementById('trip-summary').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--green)"><circle cx="12" cy="12" r="6"/></svg>
    <span>${truncate(state.pickup, 18)}</span>
    <span style="color:var(--text-muted)">→</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--red)"><circle cx="12" cy="12" r="6"/></svg>
    <span>${truncate(state.destination, 18)}</span>
    ${km ? `<span style="color:var(--accent);margin-left:4px">${km}</span>` : ''}
  `;

  state.selectedRide = rideTypes[0].id;
  document.querySelector('.ride-card')?.classList.add('selected');
  updateMainButton();
});

// ── Render ride options ───────────────────────────────────────────
function renderRideOptions() {
  const container = document.getElementById('ride-options');
  container.innerHTML = rideTypes.map(r => {
    const { price, distance } = cachedPrices[r.id];
    return `
      <div class="ride-card ${state.selectedRide === r.id ? 'selected' : ''}" data-id="${r.id}">
        <div class="ride-icon">${r.icon}</div>
        <div class="ride-info">
          <div class="ride-name">${r.name}</div>
          <div class="ride-desc">${r.descRu}</div>
          <div class="ride-eta">${r.eta} • ${distance.toFixed(0)} km</div>
        </div>
        <div class="ride-price">${formatPrice(price)}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.ride-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.ride-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedRide = card.dataset.id;
      updateMainButton();
    });
  });
}

// ── Promo codes ───────────────────────────────────────────────────
document.getElementById('apply-promo').addEventListener('click', () => {
  const code = document.getElementById('promo-input').value.trim().toUpperCase();
  const codes = { 'BIRINCHI': .15, 'SAFAR10': .10, 'UZ20': .20 };
  if (codes[code] !== undefined) {
    state.promoDiscount = codes[code];
    cachedPrices = {};
    rideTypes.forEach(r => { cachedPrices[r.id] = calcPrice(r, state.realDistance); });
    renderRideOptions();
    showToast(`Promo qo'llandi! ${codes[code] * 100}% chegirma`);
  } else if (code) {
    showToast('Promo kod noto\'g\'ri');
  }
});

// ── Payment ───────────────────────────────────────────────────────
const payments = ['Naqd pul', 'Karta •••• 8600', 'Payme', 'Click'];
let payIdx = 0;
document.getElementById('change-payment').addEventListener('click', () => {
  payIdx = (payIdx + 1) % payments.length;
  state.paymentMethod = payments[payIdx];
  document.getElementById('payment-method').textContent = state.paymentMethod;
  showToast(`To\'lov: ${state.paymentMethod}`);
});

// ── Telegram MainButton ───────────────────────────────────────────
function updateMainButton() {
  if (!tg?.MainButton) return;
  if (state.selectedRide) {
    const { price } = cachedPrices[state.selectedRide] || { price: 0 };
    tg.MainButton.setText(`Buyurtma berish  •  ${formatPrice(price)}`);
    tg.MainButton.show();
    tg.MainButton.onClick(confirmRide);
  } else {
    tg.MainButton.hide();
  }
}

// ── Confirm ride ──────────────────────────────────────────────────
document.getElementById('confirm-ride-btn').addEventListener('click', confirmRide);

function confirmRide() {
  if (!state.selectedRide) { showToast('Taksi turini tanlang'); return; }

  const ride = rideTypes.find(r => r.id === state.selectedRide);
  const { price, distance } = cachedPrices[state.selectedRide];
  state.driver    = mockDrivers[Math.floor(Math.random() * mockDrivers.length)];
  state.tripStatus = 0;

  document.getElementById('driver-avatar').textContent     = state.driver.avatar;
  document.getElementById('driver-name').textContent       = state.driver.name;
  document.getElementById('driver-rating-val').textContent = state.driver.rating;
  document.getElementById('driver-car').textContent        = state.driver.car;
  document.getElementById('final-fare').textContent        = formatPrice(price);
  document.getElementById('trip-distance').textContent     = distance.toFixed(0) + ' km';
  document.getElementById('eta-minutes').textContent       = ride.eta;

  showScreen('screen-driver');
  tg?.MainButton?.hide();
  simulateDriverOnMap();
  simulateTripProgress();

  if (tg?.sendData) {
    tg.sendData(JSON.stringify({
      action: 'book_ride',
      pickup: state.pickup,
      destination: state.destination,
      rideType: ride.name,
      fare: price,
      distance: distance.toFixed(0) + ' km',
      driver: state.driver.name,
      payment: state.paymentMethod,
    }));
  }
}

// ── Simulate driver on map ────────────────────────────────────────
function simulateDriverOnMap() {
  if (!state.pickupCoords || !ymap) return;

  let driverPos = [
    state.pickupCoords[0] + (Math.random() - 0.5) * 0.05,
    state.pickupCoords[1] + (Math.random() - 0.5) * 0.05,
  ];

  if (driverMark) ymap.geoObjects.remove(driverMark);
  driverMark = new ymaps.Placemark(driverPos, {}, {
    iconLayout: 'default#image',
    iconImageHref: 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="11" fill="#f5a623" stroke="#fff" stroke-width="2"/>
        <path fill="#fff" d="M18.92 8.01C18.72 7.42 18.16 7 17.5 7h-11c-.66 0-1.21.42-1.42 1.01L3 14v4c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-4l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 12l1.5-4h11L19 12H5z"/>
      </svg>
    `),
    iconImageSize: [36, 36],
    iconImageOffset: [-18, -18],
  });
  ymap.geoObjects.add(driverMark);

  let step = 0;
  const interval = setInterval(() => {
    step++;
    driverPos = [
      driverPos[0] + (state.pickupCoords[0] - driverPos[0]) * 0.12,
      driverPos[1] + (state.pickupCoords[1] - driverPos[1]) * 0.12,
    ];
    driverMark.geometry.setCoordinates(driverPos);
    if (step >= 30) clearInterval(interval);
  }, 300);
}

// ── Trip progress ─────────────────────────────────────────────────
function simulateTripProgress() {
  const steps     = ['step-finding', 'step-arriving', 'step-trip', 'step-done'];
  const delays    = [0, 5000, 12000, 20000];
  const etaLabels = ['Haydovchi topildi', 'Yetib kelmoqda', 'Yo\'lda', 'Yetib keldingiz!'];

  delays.forEach((delay, i) => {
    setTimeout(() => {
      document.querySelectorAll('.status-step').forEach(s => s.classList.remove('active'));
      document.getElementById(steps[i]).classList.add('active');
      document.getElementById('eta-minutes').textContent = etaLabels[i];

      if (i === 3) {
        if (driverMark && state.destCoords)
          driverMark.geometry.setCoordinates(state.destCoords);
        showToast('Manzilga yetib keldingiz! Xayrli yo\'l!');
        setTimeout(() => {
          if (confirm('Haydovchini baholaysizmi?'))
            showToast(`Rahmat! ${state.driver.name} uchun baho yuborildi`);
          resetToBooking();
        }, 2000);
      }
    }, delay);
  });
}

// ── Cancel / Call / Chat ──────────────────────────────────────────
document.getElementById('cancel-ride').addEventListener('click', () => {
  if (state.tripStatus > 1) { showToast('Bekor qilib bo\'lmaydi — yo\'lda'); return; }
  showToast('Buyurtma bekor qilindi');
  resetToBooking();
});
document.getElementById('call-driver').addEventListener('click', () => {
  showToast(`${state.driver?.name} ga qo\'ng\'iroq qilinmoqda...`);
});
document.getElementById('chat-driver').addEventListener('click', () => {
  showToast(`${state.driver?.name} bilan chat ochilmoqda...`);
});

// ── Back button ───────────────────────────────────────────────────
document.getElementById('back-to-booking').addEventListener('click', () => {
  showScreen('screen-booking');
  tg?.MainButton?.hide();
  setTimeout(() => ymap?.container?.fitToViewport(), 100);
});

tg?.BackButton?.onClick(() => {
  const active = document.querySelector('.screen.active');
  if (active?.id === 'screen-ride') {
    showScreen('screen-booking');
    tg.BackButton.hide();
    setTimeout(() => ymap?.container?.fitToViewport(), 100);
  } else if (active?.id === 'screen-driver') {
    showToast('Safar davom etmoqda');
  }
});

// ── Helpers ───────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ── Reset ─────────────────────────────────────────────────────────
function resetToBooking() {
  Object.assign(state, {
    pickup: '', destination: '', pickupCoords: null, destCoords: null,
    selectedRide: null, promoDiscount: 0, tripStatus: 0, realDistance: null,
  });
  document.getElementById('pickup-input').value = '';
  document.getElementById('destination-input').value = '';
  document.getElementById('promo-input').value = '';
  document.getElementById('search-rides-btn').disabled = true;

  if (pickupMark) { ymap?.geoObjects.remove(pickupMark); pickupMark = null; }
  if (destMark)   { ymap?.geoObjects.remove(destMark);   destMark   = null; }
  if (driverMark) { ymap?.geoObjects.remove(driverMark); driverMark = null; }
  if (routeLine)  { ymap?.geoObjects.remove(routeLine);  routeLine  = null; }

  showScreen('screen-booking');
  setTimeout(() => {
    ymap?.setCenter([41.2995, 69.2401], 7, { duration: 500 });
    ymap?.container?.fitToViewport();
  }, 100);
}

// ── Telegram back button visibility ──────────────────────────────
document.querySelectorAll('.screen').forEach(s => {
  new MutationObserver(() => {
    if (!tg?.BackButton) return;
    document.querySelector('.screen.active')?.id === 'screen-booking'
      ? tg.BackButton.hide() : tg.BackButton.show();
  }).observe(s, { attributeFilter: ['class'] });
});
