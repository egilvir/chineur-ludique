import { loadSettings, saveSettings, timeAgo, POWERED_BY_BGG_LOGO } from './lib.js';

for (const img of document.querySelectorAll('img[data-bgg-logo]')) img.src = POWERED_BY_BGG_LOGO;

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);
let settings;

init();

async function init() {
  settings = await loadSettings();
  $('user').value = settings.username || '';
  $('pill').checked = !!settings.pill;
  showStatus(await send({ type: 'cl:info' }));

  $('save').addEventListener('click', async () => {
    settings.username = $('user').value.trim();
    await saveSettings(settings);
    await sync();
  });
  $('user').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('save').click();
  });
  $('sync').addEventListener('click', sync);
  $('pill').addEventListener('change', async () => {
    settings.pill = $('pill').checked;
    await saveSettings(settings);
  });
}

async function sync() {
  $('save').disabled = true;
  $('sync').disabled = true;
  showStatus(null, 'Synchronisation avec BGG… (BGG peut mettre quelques secondes à préparer la collection)');
  const info = await send({ type: 'cl:sync' });
  $('save').disabled = false;
  $('sync').disabled = false;
  showStatus(info);
}

function showStatus(info, pending) {
  const el = $('status');
  el.classList.remove('err');
  if (pending) {
    el.textContent = pending;
    return;
  }
  if (!info) {
    el.textContent = '';
    return;
  }
  if (info.error) {
    el.textContent = info.error;
    el.classList.add('err');
    return;
  }
  if (!info.configuredUser) {
    el.textContent = 'Aucune collection reliée.';
    return;
  }
  if (!info.count) {
    el.textContent = 'Pas encore synchronisée.';
    return;
  }
  el.textContent = `✓ ${info.count} jeux de ${info.username} : ${info.owned} possédés, ${info.wishlist} en liste d’envies · synchro ${timeAgo(info.syncedAt)}`;
}
