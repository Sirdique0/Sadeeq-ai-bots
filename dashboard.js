(() => {
  'use strict';
  const SUPABASE_URL = window.SADEEQ_SUPABASE_URL || '';
  const SUPABASE_KEY = window.SADEEQ_SUPABASE_KEY || '';
  const $ = id => document.getElementById(id);
  const loader = $('appLoader');
  const toastStack = $('toastStack');
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  let verified = false;
  let closing = false;
  function showToast(title, message, type = 'success') { const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.setAttribute('role', 'status'); toast.innerHTML = `<div class="toast-mark">${type === 'error' ? '!' : '✓'}</div><div><b></b><p></p></div>`; toast.querySelector('b').textContent = title; toast.querySelector('p').textContent = message; toastStack.appendChild(toast); window.setTimeout(() => toast.remove(), 4200); }
  function setLoader(hidden) { if (loader) loader.classList.toggle('hidden', hidden); }
  function loginUrl() { return new URL('./index.html?signed_out=1', window.location.href).href; }
  async function forceLogin() { if (closing) return; closing = true; try { await client?.auth.signOut({ scope: 'local' }); } catch (_) {} window.location.replace(loginUrl()); }
  async function loadBotCount() { try { const { count, error } = await client.from('sadeeq_bots').select('id', { count: 'exact', head: true }); if (error) throw error; $('botCount').textContent = String(count ?? 0); } catch (error) { $('botCount').textContent = '—'; showToast('Bot count unavailable', error?.message || 'Could not load the bot count.', 'error'); } }
  async function verifyOwnerSession() { if (!client) throw Error('Authentication service is unavailable.'); const { data: { session }, error: sessionError } = await client.auth.getSession(); if (sessionError) throw sessionError; if (!session) { await forceLogin(); return false; } const { data: isOwner, error: ownerError } = await client.rpc('sadeeq_is_owner'); if (ownerError) throw ownerError; if (isOwner !== true) { await forceLogin(); return false; } verified = true; const email = session.user?.email || 'Owner'; $('ownerEmail').textContent = email; $('avatar').textContent = email.charAt(0).toUpperCase() || 'O'; $('sessionState').textContent = 'Secure session'; setLoader(true); loadBotCount(); return true; }
  function openDrawer() { $('sidebar').classList.add('open'); $('drawerScrim').classList.add('open'); $('menuButton').setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { $('sidebar').classList.remove('open'); $('drawerScrim').classList.remove('open'); $('menuButton').setAttribute('aria-expanded', 'false'); }
  $('menuButton').addEventListener('click', () => { $('sidebar').classList.contains('open') ? closeDrawer() : openDrawer(); });
  $('drawerScrim').addEventListener('click', closeDrawer);
  $('closeNotifications').addEventListener('click', () => showToast('Notifications', 'The notification center foundation is ready for system events.'));
  $('profileButton').addEventListener('click', () => showToast('Owner account', $('ownerEmail').textContent || 'Owner'));
  $('logoutButton').addEventListener('click', async () => { if (closing) return; closing = true; $('logoutButton').disabled = true; $('logoutButton').innerHTML = '<span>Signing out…</span>'; try { const { error } = await client.auth.signOut({ scope: 'global' }); if (error) throw error; const { data: { session } } = await client.auth.getSession(); if (session) throw Error('The session could not be cleared.'); window.location.replace(loginUrl()); } catch (error) { closing = false; $('logoutButton').disabled = false; $('logoutButton').innerHTML = '<span>Sign out</span><b>↗</b>'; showToast('Sign out failed', error?.message || 'Please try again.', 'error'); } });
  document.querySelectorAll('button[data-nav]').forEach(button => button.addEventListener('click', () => { closeDrawer(); showToast('Module coming soon', `${button.dataset.nav} is reserved for its dedicated Sadeeq AI level.`); }));
  // All real sidebar destinations, including API Keys, intentionally use native browser navigation.
  document.querySelectorAll('.sidebar a').forEach(link => link.addEventListener('click', closeDrawer));
  client?.auth.onAuthStateChange((event, session) => { if (!verified || closing) return; if (event === 'SIGNED_OUT' || !session) forceLogin(); });
  window.addEventListener('pageshow', () => { if (!closing) verifyOwnerSession().catch(error => { setLoader(true); showToast('Session verification failed', error?.message || 'Please log in again.', 'error'); window.setTimeout(forceLogin, 900); }); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
  verifyOwnerSession().catch(error => { setLoader(true); showToast('Unable to open dashboard', error?.message || 'Please try again.', 'error'); window.setTimeout(forceLogin, 900); });
})();
