(() => {
  'use strict';

  const URL = window.SADEEQ_SUPABASE_URL || '';
  const KEY = window.SADEEQ_SUPABASE_KEY || '';
  const client = window.supabase?.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const $ = id => document.getElementById(id);
  const loader = $('loader');
  let closing = false;
  let loaded = false;
  let models = [];

  function status(message, type = 'success') {
    $('status').textContent = message;
    $('status').className = `create-status show ${type}`;
  }

  function hideLoader() {
    loader?.classList.add('hidden');
    loader?.setAttribute('aria-hidden', 'true');
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
    if (!session) { login(); return null; }
    const { data: ok, error: ownerError } = await client.rpc('sadeeq_is_owner');
    if (ownerError) throw ownerError;
    if (ok !== true) { await client.auth.signOut({ scope: 'local' }); login(); return null; }
    $('sessionState').textContent = 'Secure session';
    return session;
  }

  function readyModels(list) {
    return (list || []).filter(model => model.enabled && model.status === 'ready' && model.provider?.enabled && model.provider?.credential_secret_id);
  }

  function renderModels() {
    const select = $('customModel');
    const ready = readyModels(models);
    select.innerHTML = '<option value="">Select a custom model</option>' + ready.map(model => `<option value="${model.id}">${escapeHtml(model.display_name)} — ${escapeHtml(model.provider.display_name)}</option>`).join('');
    $('customHint').textContent = ready.length
      ? `${ready.length} ready custom model${ready.length === 1 ? '' : 's'} available.`
      : 'No ready custom models are available. Configure a provider credential and model in AI Models first.';
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }

  function currentMode() {
    return document.querySelector('input[name="modelMode"]:checked')?.value || 'system';
  }

  function updateMode() {
    const custom = currentMode() === 'custom';
    $('customModelWrap').classList.toggle('hidden', !custom);
    $('customModel').required = custom;
  }

  function count() {
    $('counter').textContent = `${$('instructions').value.length} / 16000`;
  }

  async function load() {
    const session = await owner();
    if (!session) return;

    const { data, error } = await client
      .from('sadeeq_ai_models')
      .select('id,provider_id,model_key,display_name,enabled,status,provider:sadeeq_ai_providers(id,display_name,enabled,credential_secret_id)')
      .order('display_name');
    if (error) throw error;

    models = data || [];
    renderModels();
    loaded = true;
    hideLoader();
  }

  document.querySelectorAll('input[name="modelMode"]').forEach(input => input.addEventListener('change', updateMode));
  $('instructions').addEventListener('input', count);

  $('botForm').addEventListener('submit', async event => {
    event.preventDefault();
    $('status').className = 'create-status';

    const name = $('name').value.trim();
    const description = $('description').value.trim();
    const instructions = $('instructions').value.trim();
    const personality = $('personality').value.trim();
    const botStatus = $('statusSelect').value;
    const modelMode = currentMode();
    const customModelId = modelMode === 'custom' ? $('customModel').value : null;

    if (!name) return status('Bot name is required.', 'error');
    if (name.length > 100) return status('Bot name must be 100 characters or fewer.', 'error');
    if (description.length > 4000) return status('Description is too long.', 'error');
    if (instructions.length > 16000) return status('Instructions are too long.', 'error');
    if (personality.length > 4000) return status('Personality is too long.', 'error');
    if (modelMode === 'custom' && !customModelId) return status('Choose a custom model.', 'error');

    const button = event.submitter;
    button.disabled = true;
    button.querySelector('span').textContent = '…';

    try {
      const session = await owner();
      if (!session) return;

      const { data, error } = await client.rpc('sadeeq_create_bot', {
        p_name: name,
        p_description: description,
        p_instructions: instructions,
        p_personality: personality,
        p_status: botStatus,
        p_model_mode: modelMode,
        p_custom_model_id: customModelId
      });
      if (error) throw error;

      status(`Bot “${data.name}” created successfully.`, 'success');
      $('stateChip').innerHTML = '<span class="dot"></span>Bot created';
      $('name').value = '';
      $('description').value = '';
      $('instructions').value = '';
      $('personality').value = '';
      $('statusSelect').value = 'active';
      document.querySelector('input[name="modelMode"][value="system"]').checked = true;
      $('customModel').value = '';
      updateMode();
      count();
    } catch (error) {
      status(error?.message || 'Could not create bot.', 'error');
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = '→';
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

  document.querySelectorAll('[data-nav]').forEach(item => item.addEventListener('click', event => {
    event.preventDefault();
    const label = item.dataset.nav;
    if (label === 'AI Models') location.href = './ai-models.html';
    else status(`${label} is reserved for its dedicated Sadeeq AI level.`, 'success');
  }));

  client?.auth.onAuthStateChange((event, session) => {
    if (closing) return;
    if (event === 'SIGNED_OUT' || !session) login();
  });

  window.setTimeout(() => {
    if (!loaded && loader && !loader.classList.contains('hidden')) {
      hideLoader();
      status('Bot workspace is taking longer than expected. Please refresh once.', 'error');
    }
  }, 15000);

  updateMode();
  count();
  load().catch(error => {
    hideLoader();
    status(error?.message || 'Unable to load bot workspace.', 'error');
    window.setTimeout(login, 1400);
  });
})();
