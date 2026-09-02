(() => {
  'use strict';

  const SUPABASE_URL = window.SADEEQ_SUPABASE_URL || '';
  const SUPABASE_KEY = window.SADEEQ_SUPABASE_KEY || '';
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const $ = id => document.getElementById(id);
  const loader = $('loader');
  const transition = $('transition');
  const toastStack = $('toastStack');
  let bots = [];
  let models = [];
  let selectedBot = null;
  let verified = false;
  let closing = false;
  let navigating = false;

  const esc = value => {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  };

  const statusLabel = value => ({ active: 'Active', draft: 'Draft', disabled: 'Disabled' }[value] || value || 'Unknown');

  function showToast(title, message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<div class="toast-mark"></div><div><b></b><p></p></div>';
    toast.querySelector('.toast-mark').textContent = type === 'error' ? '!' : '✓';
    toast.querySelector('b').textContent = title;
    toast.querySelector('p').textContent = message;
    toastStack.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  function hideLoader() {
    loader.classList.add('hidden');
    loader.setAttribute('aria-hidden', 'true');
  }

  function login() {
    if (closing) return;
    closing = true;
    location.replace('./index.html?signed_out=1');
  }

  async function verifyOwner() {
    if (!client) throw Error('Authentication service is unavailable.');
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    if (!session) { login(); return null; }
    const { data: ok, error: ownerError } = await client.rpc('sadeeq_is_owner');
    if (ownerError) throw ownerError;
    if (ok !== true) {
      await client.auth.signOut({ scope: 'local' });
      login();
      return null;
    }
    verified = true;
    $('sessionState').textContent = 'Secure session';
    return session;
  }

  function modelName(bot) {
    if (bot.model_mode === 'custom' && bot.custom_model) {
      return bot.custom_model.display_name || bot.custom_model.model_key || 'Custom model';
    }
    return 'System Model';
  }

  function providerName(bot) {
    if (bot.model_mode === 'custom' && bot.custom_model?.provider) return bot.custom_model.provider.display_name || '';
    return 'Centralized';
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function filteredBots() {
    const query = $('search').value.trim().toLowerCase();
    const filter = $('statusFilter').value;
    return bots.filter(bot => {
      const matchesStatus = filter === 'all' || bot.status === filter;
      if (!matchesStatus) return false;
      if (!query) return true;
      return [bot.name, bot.description, bot.personality, bot.instructions, modelName(bot), providerName(bot)]
        .some(value => String(value || '').toLowerCase().includes(query));
    });
  }

  function render() {
    const list = filteredBots();
    const grid = $('botGrid');
    grid.innerHTML = '';
    $('resultCount').textContent = `${list.length} bot${list.length === 1 ? '' : 's'}`;
    $('headerCount').textContent = `${bots.length} bot${bots.length === 1 ? '' : 's'}`;
    const query = $('search').value.trim();
    const filter = $('statusFilter').value;
    $('resultNote').textContent = query || filter !== 'all' ? 'Filtered results' : 'All bots';

    if (!list.length) {
      $('emptyState').classList.remove('hidden');
      $('emptyTitle').textContent = bots.length ? 'No matching bots' : 'No bots yet';
      $('emptyText').textContent = bots.length
        ? 'Try a different search term or status filter.'
        : 'Create your first bot to see it here.';
      return;
    }

    $('emptyState').classList.add('hidden');
    list.forEach((bot, index) => {
      const card = document.createElement('article');
      card.className = 'bot-card';
      card.style.animationDelay = `${Math.min(index * 35, 280)}ms`;
      const initial = (bot.name || 'B').trim().charAt(0).toUpperCase() || 'B';
      card.innerHTML = `
        <div class="bot-top">
          <div class="bot-identity">
            <div class="bot-avatar" aria-hidden="true">${esc(initial)}</div>
            <div class="bot-name"><strong title="${esc(bot.name)}">${esc(bot.name)}</strong><span>${esc(providerName(bot))}</span></div>
          </div>
          <span class="bot-status ${esc(bot.status)}">${esc(statusLabel(bot.status))}</span>
        </div>
        <p class="bot-description">${esc(bot.description || 'No description provided.')}</p>
        <div class="bot-meta">
          <div class="meta-box"><span>Model</span><b title="${esc(modelName(bot))}">${esc(modelName(bot))}</b></div>
          <div class="meta-box"><span>Updated</span><b>${esc(formatDate(bot.updated_at))}</b></div>
        </div>
        <div class="bot-actions">
          <button class="bot-action" data-action="open" type="button">Open</button>
          <button class="bot-action" data-action="edit" type="button">Edit</button>
          <button class="bot-action danger" data-action="delete" type="button">Delete</button>
        </div>`;
      card.querySelector('[data-action="open"]').addEventListener('click', () => openDetails(bot));
      card.querySelector('[data-action="edit"]').addEventListener('click', () => openEdit(bot));
      card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteBot(bot));
      grid.appendChild(card);
    });
  }

  async function loadBots() {
    const session = await verifyOwner();
    if (!session) return;
    $('loadState').textContent = 'Loading…';
    const { data, error } = await client
      .from('sadeeq_bots')
      .select('id,created_by,name,description,instructions,personality,status,model_mode,custom_model_id,created_at,updated_at,custom_model:sadeeq_ai_models(id,model_key,display_name,enabled,status,provider:sadeeq_ai_providers(id,display_name,enabled,credential_secret_id))')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    bots = data || [];
    render();
    $('loadState').textContent = 'Up to date';
    hideLoader();
  }

  async function loadModels() {
    if (models.length) return;
    const { data, error } = await client
      .from('sadeeq_ai_models')
      .select('id,model_key,display_name,enabled,status,provider:sadeeq_ai_providers(id,display_name,enabled,credential_secret_id)')
      .order('display_name');
    if (error) throw error;
    models = data || [];
  }

  function readyModels() {
    return models.filter(model => model.enabled && model.status === 'ready' && model.provider?.enabled && model.provider?.credential_secret_id);
  }

  function openModal() {
    $('botModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('botModal').classList.add('hidden');
    document.body.style.overflow = '';
    selectedBot = null;
  }

  function showDetailMode() {
    $('detailView').classList.remove('hidden');
    $('editForm').classList.add('hidden');
  }

  function showEditMode() {
    $('detailView').classList.add('hidden');
    $('editForm').classList.remove('hidden');
  }

  function openDetails(bot) {
    selectedBot = bot;
    $('modalKicker').textContent = 'BOT DETAILS';
    $('modalTitle').textContent = bot.name;
    $('modalMeta').textContent = `Created ${formatDate(bot.created_at)}`;
    $('modalStatus').textContent = statusLabel(bot.status).toUpperCase();
    $('modalStatus').className = `bot-status ${bot.status}`;
    $('detailName').textContent = bot.name || '—';
    $('detailModel').textContent = `${modelName(bot)}${providerName(bot) && bot.model_mode === 'custom' ? ` · ${providerName(bot)}` : ''}`;
    $('detailCreated').textContent = formatDate(bot.created_at);
    $('detailUpdated').textContent = formatDate(bot.updated_at);
    $('detailDescription').textContent = bot.description || 'No description provided.';
    $('detailPersonality').textContent = bot.personality || 'No personality defined.';
    $('detailInstructions').textContent = bot.instructions || 'No instructions defined.';
    showDetailMode();
    openModal();
  }

  function populateCustomModels(selectedId = '') {
    const select = $('editCustomModel');
    const ready = readyModels();
    select.innerHTML = '<option value="">Select a custom model</option>' + ready.map(model => `<option value="${esc(model.id)}">${esc(model.display_name)} — ${esc(model.provider.display_name)}</option>`).join('');
    select.value = selectedId || '';
    $('editHint').textContent = ready.length
      ? `${ready.length} ready custom model${ready.length === 1 ? '' : 's'} available.`
      : 'No ready custom models are available. Use System Model or configure a ready model in AI Models.';
  }

  function updateEditMode() {
    const custom = $('editMode').value === 'custom';
    $('editCustomWrap').classList.toggle('hidden', !custom);
    $('editCustomModel').required = custom;
  }

  async function openEdit(bot) {
    selectedBot = bot;
    try {
      await loadModels();
      $('modalKicker').textContent = 'EDIT BOT';
      $('modalTitle').textContent = bot.name;
      $('modalMeta').textContent = 'Update this bot definition and model mode.';
      $('editName').value = bot.name || '';
      $('editDescription').value = bot.description || '';
      $('editPersonality').value = bot.personality || '';
      $('editInstructions').value = bot.instructions || '';
      $('editStatus').value = bot.status || 'active';
      $('editMode').value = bot.model_mode || 'system';
      populateCustomModels(bot.custom_model_id || '');
      updateEditMode();
      updateCounter();
      showEditMode();
      openModal();
    } catch (error) {
      showToast('Could not open editor', error?.message || 'Please try again.', 'error');
    }
  }

  function updateCounter() {
    $('editCounter').textContent = `${$('editInstructions').value.length} / 16000`;
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!selectedBot) return;
    const name = $('editName').value.trim();
    const description = $('editDescription').value.trim();
    const personality = $('editPersonality').value.trim();
    const instructions = $('editInstructions').value.trim();
    const status = $('editStatus').value;
    const modelMode = $('editMode').value;
    const customModelId = modelMode === 'custom' ? $('editCustomModel').value : null;

    if (!name) return showToast('Validation error', 'Bot name is required.', 'error');
    if (name.length > 100) return showToast('Validation error', 'Bot name must be 100 characters or fewer.', 'error');
    if (description.length > 4000) return showToast('Validation error', 'Description is too long.', 'error');
    if (personality.length > 4000) return showToast('Validation error', 'Personality is too long.', 'error');
    if (instructions.length > 16000) return showToast('Validation error', 'Instructions are too long.', 'error');
    if (modelMode === 'custom' && !customModelId) return showToast('Validation error', 'Choose a custom model.', 'error');

    const button = $('saveEdit');
    button.disabled = true;
    button.querySelector('span').textContent = '…';
    try {
      const session = await verifyOwner();
      if (!session) return;
      const { data, error } = await client.rpc('sadeeq_update_bot', {
        p_bot_id: selectedBot.id,
        p_name: name,
        p_description: description,
        p_instructions: instructions,
        p_personality: personality,
        p_status: status,
        p_model_mode: modelMode,
        p_custom_model_id: customModelId
      });
      if (error) throw error;
      const index = bots.findIndex(bot => bot.id === selectedBot.id);
      if (index >= 0) {
        bots[index] = { ...bots[index], ...data };
        if (modelMode === 'custom') {
          const chosen = models.find(model => model.id === customModelId);
          bots[index].custom_model = chosen || bots[index].custom_model;
        } else {
          bots[index].custom_model = null;
        }
        selectedBot = bots[index];
      }
      render();
      closeModal();
      showToast('Bot updated', `“${name}” has been updated successfully.`);
    } catch (error) {
      showToast('Update failed', error?.message || 'Could not update this bot.', 'error');
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = '→';
    }
  }

  async function deleteBot(bot) {
    const confirmed = window.confirm(`Delete “${bot.name}”?\n\nThis permanently removes the bot and cannot be undone.`);
    if (!confirmed) return;
    try {
      const session = await verifyOwner();
      if (!session) return;
      const { error } = await client.rpc('sadeeq_delete_bot', { p_bot_id: bot.id });
      if (error) throw error;
      bots = bots.filter(item => item.id !== bot.id);
      render();
      if (selectedBot?.id === bot.id) closeModal();
      showToast('Bot deleted', `“${bot.name}” was permanently deleted.`);
    } catch (error) {
      showToast('Delete failed', error?.message || 'Could not delete this bot.', 'error');
    }
  }

  function navigate(item, event) {
    const href = item.getAttribute('href');
    if (!href || href === '#') {
      event?.preventDefault();
      showToast('Module coming soon', `${item.dataset.nav || 'This module'} is reserved for its dedicated Sadeeq AI level.`);
      return;
    }
    if (navigating) { event?.preventDefault(); return; }
    event?.preventDefault();
    navigating = true;
    $('sidebar').classList.remove('open');
    $('scrim').classList.remove('open');
    if (transition) {
      document.body.classList.add('transitioning');
      transition.classList.add('active');
      transition.setAttribute('aria-hidden', 'false');
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => { location.href = href; }, reduced ? 60 : 620);
  }

  $('search').addEventListener('input', render);
  $('statusFilter').addEventListener('change', render);
  $('refresh').addEventListener('click', async () => {
    $('refresh').disabled = true;
    $('loadState').textContent = 'Refreshing…';
    try {
      await loadBots();
      showToast('Bots refreshed', 'The bot list is up to date.');
    } catch (error) {
      $('loadState').textContent = 'Refresh failed';
      showToast('Refresh failed', error?.message || 'Could not refresh bots.', 'error');
    } finally {
      $('refresh').disabled = false;
    }
  });

  $('modalClose').addEventListener('click', closeModal);
  $('botModal').addEventListener('click', event => { if (event.target === $('botModal')) closeModal(); });
  $('detailEdit').addEventListener('click', () => selectedBot && openEdit(selectedBot));
  $('detailDelete').addEventListener('click', () => selectedBot && deleteBot(selectedBot));
  $('cancelEdit').addEventListener('click', () => selectedBot ? openDetails(selectedBot) : closeModal());
  $('editForm').addEventListener('submit', saveEdit);
  $('editMode').addEventListener('change', updateEditMode);
  $('editInstructions').addEventListener('input', updateCounter);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('botModal').classList.contains('hidden')) closeModal(); });

  $('menu').addEventListener('click', () => {
    const open = $('sidebar').classList.toggle('open');
    $('scrim').classList.toggle('open', open);
    $('menu').setAttribute('aria-expanded', String(open));
  });
  $('scrim').addEventListener('click', () => {
    $('sidebar').classList.remove('open');
    $('scrim').classList.remove('open');
    $('menu').setAttribute('aria-expanded', 'false');
  });
  document.querySelectorAll('.nav [data-nav]').forEach(item => item.addEventListener('click', event => navigate(item, event)));
  document.querySelectorAll('.nav a[href]').forEach(item => item.addEventListener('click', event => navigate(item, event)));

  client?.auth.onAuthStateChange((event, session) => {
    if (!verified || closing) return;
    if (event === 'SIGNED_OUT' || !session) login();
  });

  window.addEventListener('pageshow', () => {
    if (!closing) verifyOwner().catch(error => showToast('Session verification failed', error?.message || 'Please log in again.', 'error'));
  });

  loadBots().catch(error => {
    hideLoader();
    $('loadState').textContent = 'Unable to load';
    showToast('Unable to load bots', error?.message || 'Please refresh or log in again.', 'error');
    window.setTimeout(login, 1800);
  });
})();
