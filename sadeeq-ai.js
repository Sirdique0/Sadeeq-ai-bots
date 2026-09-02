(() => {
  'use strict';

  const SUPABASE_URL = window.SADEEQ_SUPABASE_URL || '';
  const SUPABASE_KEY = window.SADEEQ_SUPABASE_KEY || '';
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  const $ = id => document.getElementById(id);
  const loader = $('loader');
  const status = (message, type = 'success') => {
    $('status').textContent = message;
    $('status').className = `ai-status show ${type}`;
  };
  const nav = [...document.querySelectorAll('[data-nav]')];
  let closing = false;
  let loaded = false;

  function hideLoader() {
    if (!loader) return;
    loader.classList.add('hidden');
    loader.setAttribute('aria-hidden', 'true');
  }

  function showLoader() {
    if (!loader) return;
    loader.classList.remove('hidden');
    loader.setAttribute('aria-hidden', 'false');
  }

  function login() {
    if (closing) return;
    closing = true;
    location.replace('./index.html?signed_out=1');
  }

  async function owner() {
    if (!client) throw Error('Authentication service is unavailable.');

    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;

    if (!session) {
      login();
      return null;
    }

    const { data: ok, error: ownerError } = await client.rpc('sadeeq_is_owner');
    if (ownerError) throw ownerError;

    if (ok !== true) {
      await client.auth.signOut({ scope: 'local' });
      login();
      return null;
    }

    return session;
  }

  function busy(on) {
    $('save').disabled = on;
    $('save').querySelector('span').textContent = on ? '…' : '→';
  }

  function fill(row) {
    $('enabled').checked = row.enabled;
    $('systemName').value = row.system_name;
    $('behavior').value = row.behavior;
    $('instructions').value = row.system_instructions;
    $('language').value = row.default_language;
    $('style').value = row.response_style;
    $('safety').value = row.safety_mode;
    $('counter').textContent = `${row.system_instructions.length} / 12000`;
    $('updated').textContent = row.updated_at
      ? `Last saved ${new Date(row.updated_at).toLocaleString()}`
      : 'Not saved yet';
    $('stateChip').innerHTML = `<span class="dot"></span>${row.enabled ? 'System enabled' : 'System disabled'}`;
  }

  function count() {
    $('counter').textContent = `${$('instructions').value.length} / 12000`;
  }

  async function load() {
    showLoader();

    const session = await owner();
    if (!session) return;

    const { data, error } = await client
      .from('sadeeq_system_config')
      .select('id,system_name,enabled,system_instructions,behavior,default_language,response_style,safety_mode,updated_at')
      .eq('id', true)
      .single();

    if (error) throw error;

    fill(data);
    loaded = true;
    hideLoader();
  }

  $('instructions').addEventListener('input', count);

  $('configForm').addEventListener('submit', async event => {
    event.preventDefault();
    status('');

    const name = $('systemName').value.trim();
    const behavior = $('behavior').value.trim();

    if (!name) return status('System name is required.', 'error');
    if (!behavior) return status('Behavior profile is required.', 'error');

    busy(true);

    try {
      const session = await owner();
      if (!session) return;

      const payload = {
        system_name: name,
        enabled: $('enabled').checked,
        system_instructions: $('instructions').value.trim(),
        behavior,
        default_language: $('language').value,
        response_style: $('style').value,
        safety_mode: $('safety').value
      };

      const { data, error } = await client
        .from('sadeeq_system_config')
        .update(payload)
        .eq('id', true)
        .select('id,system_name,enabled,system_instructions,behavior,default_language,response_style,safety_mode,updated_at')
        .single();

      if (error) throw error;

      fill(data);
      status('System configuration saved successfully.', 'success');
    } catch (error) {
      status(error?.message || 'Could not save system configuration.', 'error');
    } finally {
      busy(false);
    }
  });

  $('menu').addEventListener('click', () => {
    $('sidebar').classList.toggle('open');
    $('scrim').classList.toggle('open');
    $('menu').setAttribute('aria-expanded', $('sidebar').classList.contains('open'));
  });

  $('scrim').addEventListener('click', () => {
    $('sidebar').classList.remove('open');
    $('scrim').classList.remove('open');
    $('menu').setAttribute('aria-expanded', 'false');
  });

  nav.forEach(item => item.addEventListener('click', event => {
    if (item.tagName === 'BUTTON') {
      event.preventDefault();
      status(`${item.dataset.nav} is reserved for its dedicated Sadeeq AI level.`, 'success');
    }
  }));

  client?.auth.onAuthStateChange((event, session) => {
    if (closing) return;
    if (event === 'SIGNED_OUT' || !session) login();
  });

  // Never allow a network, CDN, or browser-cache problem to leave the page
  // trapped behind the loader forever. Normal success hides it much earlier.
  window.setTimeout(() => {
    if (!loaded && loader && !loader.classList.contains('hidden')) {
      hideLoader();
      status('System control is taking longer than expected. Please refresh once if the controls do not appear.', 'error');
    }
  }, 15000);

  load().catch(error => {
    hideLoader();
    status(error?.message || 'Unable to load system configuration.', 'error');
    window.setTimeout(login, 1200);
  });
})();
