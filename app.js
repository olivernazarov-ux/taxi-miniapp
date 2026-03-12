'use strict';

// ── Telegram WebApp init ──────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  // Apply Telegram theme colors if available
  const root = document.documentElement;
  if (tg.themeParams) {
    const t = tg.themeParams;
    if (t.bg_color)          root.style.setProperty('--bg',      t.bg_color);
    if (t.secondary_bg_color) root.style.setProperty('--surface', t.secondary_bg_color);
    if (t.text_color)        root.style.setProperty('--text',    t.text_color);
    if (t.hint_color)        root.style.setProperty('--text-muted', t.hint_color);
    if (t.button_color)      root.style.setProperty('--accent',  t.button_color);
  }
}

// ── User greeting ─────────────────────────────────────────────────
const user = tg?.initDataUnsafe?.user;
const greeting = document.getElementById('user-greeting');
if (user?.first_name) {
  greeting.textContent = `Hi ${user.first_name}, where to?`;
}

// ── State ─────────────────────────────────────────────────────────
const state = {
  pickup: '',
  destination: '',
  selectedRide: null,
  paymentMethod: 'Cash',
  promoDiscount: 0,
  driver: null,
  tripStatus: 0, // 0-finding, 1-arriving, 2-trip, 3-done
};

// ── Mock location data ────────────────────────────────────────────
const mockPlaces = [
  { name: 'Central Park',       address: '59th to 110th St, Manhattan' },
  { name: 'Times Square',       address: 'Manhattan, NY 10036' },
  { name: 'Grand Central Station', address: '89 E 42nd St, New York' },
  { name: 'JFK Airport',        address: 'Queens, NY 11430' },
  { name: 'Brooklyn Bridge',    address: 'Brooklyn Bridge, New York' },
  { name: 'Empire State Building', address: '20 W 34th St, New York' },
  { name: 'Central Station',    address: '101 Station Rd' },
  { name: 'City Hospital',      address: '45 Health Ave' },
  { name: 'University Campus',  address: '1 Academic Blvd' },
  { name: 'Riverside Mall',     address: '200 River Dr' },
  { name: 'City Park',          address: 'Park Lane, Downtown' },
  { name: 'Sports Arena',       address: '55 Stadium Way' },
];

// ── Ride options ──────────────────────────────────────────────────
const rideTypes = [
  { id: 'economy',  name: 'Economy',  icon: '🚗', desc: 'Affordable everyday rides',   eta: '3 min',  pricePerKm: 1.2, base: 2.5  },
  { id: 'comfort',  name: 'Comfort',  icon: '🚙', desc: 'Newer cars, extra legroom',    eta: '5 min',  pricePerKm: 1.8, base: 4.0  },
  { id: 'business', name: 'Business', icon: '🚐', desc: 'Premium vehicles, top rated',  eta: '7 min',  pricePerKm: 2.8, base: 6.0  },
  { id: 'xl',       name: 'XL',       icon: '🚌', desc: 'For groups up to 6 people',    eta: '8 min',  pricePerKm: 2.2, base: 5.0  },
];

// ── Mock drivers ──────────────────────────────────────────────────
const mockDrivers = [
  { name: 'Michael R.', rating: 4.9, car: 'Toyota Camry • XYZ-4521',   avatar: 'M' },
  { name: 'Sarah K.',   rating: 4.8, car: 'Honda Accord • ABC-8833',   avatar: 'S' },
  { name: 'David L.',   rating: 5.0, car: 'BMW 5 Series • DEF-2210',   avatar: 'D' },
  { name: 'Anna P.',    rating: 4.7, car: 'Mercedes E-Class • GHI-991', avatar: 'A' },
];

// ── Helpers ───────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function calcPrice(rideType) {
  const distance = 3 + Math.random() * 12; // mock 3–15 km
  const price = rideType.base + rideType.pricePerKm * distance;
  return { price: price * (1 - state.promoDiscount), distance };
}

function formatPrice(p) {
  return '$' + p.toFixed(2);
}

// ── Autocomplete ──────────────────────────────────────────────────
let activeInput = null;
let cachedPrices = {};

function showSuggestions(query, inputEl) {
  const box = document.getElementById('suggestions');
  const filtered = mockPlaces.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.address.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5);

  if (!query || filtered.length === 0) {
    box.style.display = 'none';
    return;
  }

  box.innerHTML = filtered.map(p => `
    <div class="suggestion-item" data-name="${p.name}" data-address="${p.address}">
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
      const val = item.dataset.name + ', ' + item.dataset.address;
      if (activeInput === document.getElementById('pickup-input')) {
        state.pickup = val;
        document.getElementById('pickup-input').value = val;
      } else {
        state.destination = val;
        document.getElementById('destination-input').value = val;
      }
      box.style.display = 'none';
      checkSearchReady();
    });
  });
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
  if (!e.target.closest('.suggestions') && !e.target.closest('.input-wrapper')) {
    document.getElementById('suggestions').style.display = 'none';
  }
});

// ── Quick places ──────────────────────────────────────────────────
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.place + ', ' + btn.dataset.address;
    if (!state.pickup) {
      state.pickup = val;
      document.getElementById('pickup-input').value = val;
    } else {
      state.destination = val;
      document.getElementById('destination-input').value = val;
    }
    checkSearchReady();
  });
});

// ── Locate me ────────────────────────────────────────────────────
document.getElementById('locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported');
    return;
  }
  showToast('Getting location...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      // In production, reverse-geocode pos.coords
      const mockAddr = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      state.pickup = 'My Location (' + mockAddr + ')';
      document.getElementById('pickup-input').value = state.pickup;
      checkSearchReady();
      showToast('Location set!');
    },
    () => {
      // Fallback to mock address
      state.pickup = 'Current Location';
      document.getElementById('pickup-input').value = state.pickup;
      checkSearchReady();
      showToast('Using approximate location');
    }
  );
});

// ── Check form ready ──────────────────────────────────────────────
function checkSearchReady() {
  const btn = document.getElementById('search-rides-btn');
  btn.disabled = !(state.pickup.trim() && state.destination.trim());
}

// ── Search rides ──────────────────────────────────────────────────
document.getElementById('search-rides-btn').addEventListener('click', () => {
  cachedPrices = {};
  rideTypes.forEach(r => { cachedPrices[r.id] = calcPrice(r); });
  renderRideOptions();
  showScreen('screen-ride');

  document.getElementById('trip-summary').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--green)"><circle cx="12" cy="12" r="6"/></svg>
    <span>${truncate(state.pickup, 22)}</span>
    <span style="color:var(--text-muted)">→</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--red)"><circle cx="12" cy="12" r="6"/></svg>
    <span>${truncate(state.destination, 22)}</span>
  `;

  // Auto-select first ride
  state.selectedRide = rideTypes[0].id;
  document.querySelector('.ride-card')?.classList.add('selected');
  updateMainButton();
});

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

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
          <div class="ride-desc">${r.desc}</div>
          <div class="ride-eta">${r.eta} away • ${distance.toFixed(1)} km</div>
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

// ── Promo code ────────────────────────────────────────────────────
document.getElementById('apply-promo').addEventListener('click', () => {
  const code = document.getElementById('promo-input').value.trim().toUpperCase();
  const codes = { 'SAVE10': .10, 'TAXI20': .20, 'FIRST': .30 };
  if (codes[code] !== undefined) {
    state.promoDiscount = codes[code];
    cachedPrices = {};
    rideTypes.forEach(r => { cachedPrices[r.id] = calcPrice(r); });
    renderRideOptions();
    showToast(`Promo applied! ${codes[code] * 100}% off`);
  } else if (code) {
    showToast('Invalid promo code');
  }
});

// ── Payment method ────────────────────────────────────────────────
const payments = ['Cash', 'Card •••• 4242', 'Apple Pay', 'Google Pay'];
let payIdx = 0;
document.getElementById('change-payment').addEventListener('click', () => {
  payIdx = (payIdx + 1) % payments.length;
  state.paymentMethod = payments[payIdx];
  document.getElementById('payment-method').textContent = state.paymentMethod;
  showToast(`Payment: ${state.paymentMethod}`);
});

// ── Telegram MainButton ───────────────────────────────────────────
function updateMainButton() {
  if (!tg?.MainButton) return;
  if (state.selectedRide) {
    const { price } = cachedPrices[state.selectedRide] || { price: 0 };
    tg.MainButton.setText(`Confirm Ride  •  ${formatPrice(price)}`);
    tg.MainButton.show();
    tg.MainButton.onClick(confirmRide);
  } else {
    tg.MainButton.hide();
  }
}

// ── Confirm ride ──────────────────────────────────────────────────
document.getElementById('confirm-ride-btn').addEventListener('click', confirmRide);

function confirmRide() {
  if (!state.selectedRide) { showToast('Please select a ride'); return; }

  const ride = rideTypes.find(r => r.id === state.selectedRide);
  const { price, distance } = cachedPrices[state.selectedRide];
  state.driver = mockDrivers[Math.floor(Math.random() * mockDrivers.length)];
  state.tripStatus = 0;

  // Populate driver screen
  document.getElementById('driver-avatar').textContent = state.driver.avatar;
  document.getElementById('driver-name').textContent   = state.driver.name;
  document.getElementById('driver-rating-val').textContent = state.driver.rating;
  document.getElementById('driver-car').textContent    = state.driver.car;
  document.getElementById('final-fare').textContent    = formatPrice(price);
  document.getElementById('trip-distance').textContent = distance.toFixed(1) + ' km';
  document.getElementById('eta-minutes').textContent   = ride.eta;

  showScreen('screen-driver');
  tg?.MainButton?.hide();

  // Simulate trip progression
  simulateTripProgress();

  // Send data back to bot if in Telegram
  if (tg?.sendData) {
    tg.sendData(JSON.stringify({
      action: 'book_ride',
      pickup: state.pickup,
      destination: state.destination,
      rideType: ride.name,
      fare: price.toFixed(2),
      driver: state.driver.name,
      payment: state.paymentMethod,
    }));
  }
}

// ── Trip status simulation ────────────────────────────────────────
function simulateTripProgress() {
  const steps = ['step-finding', 'step-arriving', 'step-trip', 'step-done'];
  const delays = [0, 4000, 9000, 16000];
  const etaLabels = ['3 min', '1 min', 'On trip', 'Arrived'];

  delays.forEach((delay, i) => {
    setTimeout(() => {
      document.querySelectorAll('.status-step').forEach(s => s.classList.remove('active'));
      document.getElementById(steps[i]).classList.add('active');
      document.getElementById('eta-minutes').textContent = etaLabels[i];

      if (i === 3) {
        showToast('You have arrived! Have a great day!');
        setTimeout(() => {
          if (confirm('Rate your ride?')) {
            showToast(`Thanks! Rating sent for ${state.driver.name}`);
          }
          resetToBooking();
        }, 2000);
      }
    }, delay);
  });
}

// ── Cancel ride ───────────────────────────────────────────────────
document.getElementById('cancel-ride').addEventListener('click', () => {
  if (state.tripStatus > 1) {
    showToast('Cannot cancel — trip already started');
    return;
  }
  showToast('Ride cancelled');
  resetToBooking();
});

// ── Call / Chat ───────────────────────────────────────────────────
document.getElementById('call-driver').addEventListener('click', () => {
  showToast(`Calling ${state.driver?.name}...`);
  // In production: tg.openLink('tel:+1234567890') or bot-mediated call
});
document.getElementById('chat-driver').addEventListener('click', () => {
  showToast(`Opening chat with ${state.driver?.name}...`);
  // In production: open Telegram bot chat or inline chat
});

// ── Back button ───────────────────────────────────────────────────
document.getElementById('back-to-booking').addEventListener('click', () => {
  showScreen('screen-booking');
  tg?.MainButton?.hide();
});

tg?.BackButton?.onClick(() => {
  const active = document.querySelector('.screen.active');
  if (active?.id === 'screen-ride') {
    showScreen('screen-booking');
    tg.BackButton.hide();
  } else if (active?.id === 'screen-driver') {
    // Prevent accidental back during active trip
    showToast('Ride in progress');
  }
});

// ── Reset ─────────────────────────────────────────────────────────
function resetToBooking() {
  state.pickup = '';
  state.destination = '';
  state.selectedRide = null;
  state.promoDiscount = 0;
  state.tripStatus = 0;
  document.getElementById('pickup-input').value = '';
  document.getElementById('destination-input').value = '';
  document.getElementById('promo-input').value = '';
  document.getElementById('search-rides-btn').disabled = true;
  showScreen('screen-booking');
}

// ── Handle Telegram back button visibility ─────────────────────────
document.querySelectorAll('.screen').forEach(s => {
  const obs = new MutationObserver(() => {
    if (!tg?.BackButton) return;
    const activeId = document.querySelector('.screen.active')?.id;
    if (activeId === 'screen-booking') {
      tg.BackButton.hide();
    } else {
      tg.BackButton.show();
    }
  });
  obs.observe(s, { attributeFilter: ['class'] });
});
