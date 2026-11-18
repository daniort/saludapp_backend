const {
  DEFAULT_INVITATION_PATH_PREFIX,
  androidConfiguration,
  iosConfiguration,
  storeConfiguration,
} = require('../config/mobile-links');
const {
  ProfileSharingError,
  getInvitation: getInvitationRecord,
} = require('../services/profile-sharing.service');

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function profileName(profile) {
  return [profile.givenNames, profile.paternalSurname, profile.maternalSurname]
    .filter(Boolean)
    .join(' ');
}

function availableStoreLinks(userAgent, stores) {
  const normalizedUserAgent = (userAgent || '').toLowerCase();
  const isAndroid = normalizedUserAgent.includes('android');
  const isIos = /iphone|ipad|ipod/.test(normalizedUserAgent);

  if (isAndroid) {
    return stores.playStoreUrl
      ? [{ className: 'android', href: stores.playStoreUrl, label: 'Descargar en Google Play' }]
      : [];
  }

  if (isIos) {
    return stores.appStoreUrl
      ? [{ className: 'ios', href: stores.appStoreUrl, label: 'Descargar en App Store' }]
      : [];
  }

  return [
    stores.playStoreUrl
      ? { className: 'android', href: stores.playStoreUrl, label: 'Descargar en Google Play' }
      : null,
    stores.appStoreUrl
      ? { className: 'ios', href: stores.appStoreUrl, label: 'Descargar en App Store' }
      : null,
  ].filter(Boolean);
}

function invitationPage({
  title,
  heading,
  description,
  invitation = null,
  showStores = false,
  userAgent = '',
}) {
  const stores = storeConfiguration();
  const profile = invitation ? escapeHtml(profileName(invitation.profile)) : null;
  const inviter = invitation ? escapeHtml(
    invitation.invitedBy.displayName || 'Un familiar',
  ) : null;
  const storeLinks = showStores
    ? availableStoreLinks(userAgent, stores).map((store) => (
      `<a class="button primary ${store.className}" href="${escapeHtml(store.href)}" rel="noreferrer">${store.label}</a>`
    )).join('')
    : '';
  const downloadContent = showStores && !storeLinks
    ? '<p class="notice">SaludApp todavía no tiene configurados sus enlaces de descarga.</p>'
    : storeLinks;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta property="og:title" content="Invitación a SaludApp">
  <meta property="og:description" content="Consulta una invitación familiar en SaludApp.">
  <title>${escapeHtml(title)} · SaludApp</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f3f7f6; color: #17332d; }
    main { width: min(100%, 520px); padding: 32px; border: 1px solid #d9e7e3; border-radius: 24px; background: #fff; box-shadow: 0 18px 50px rgba(25, 71, 61, .10); }
    .brand { margin: 0 0 26px; color: #13745f; font-size: 18px; font-weight: 800; letter-spacing: .01em; }
    h1 { margin: 0 0 12px; font-size: clamp(26px, 6vw, 36px); line-height: 1.08; }
    p { margin: 0 0 18px; color: #526963; line-height: 1.55; }
    .summary { margin: 24px 0; padding: 18px; border-radius: 16px; background: #eef8f5; }
    .summary p { margin: 0; color: #294b43; }
    .summary p + p { margin-top: 8px; }
    .actions { display: grid; gap: 12px; margin-top: 24px; }
    .button { display: block; padding: 14px 18px; border-radius: 12px; text-align: center; text-decoration: none; font-weight: 750; }
    .primary { background: #13745f; color: white; }
    .notice { padding: 14px; border-radius: 12px; background: #f7f5e8; color: #665d24; }
    .help { margin-top: 22px; font-size: 14px; }
    @media (max-width: 420px) { main { padding: 24px; border-radius: 18px; } }
    @media (prefers-color-scheme: dark) {
      :root { color-scheme: dark; }
      body { background: #0f1c19; color: #effaf7; }
      main { background: #172824; border-color: #29443e; box-shadow: none; }
      p { color: #b4c8c2; }
      .summary { background: #203a34; }
      .summary p { color: #d6e9e4; }
      .notice { background: #3c3821; color: #e4dba1; }
    }
  </style>
</head>
<body>
  <main>
    <p class="brand">SaludApp</p>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(description)}</p>
    ${invitation ? `<section class="summary" aria-label="Resumen de la invitación">
      <p><strong>${inviter}</strong> compartió este perfil contigo.</p>
      <p>Perfil: <strong>${profile}</strong></p>
      <p>Acceso: <strong>solo lectura</strong></p>
    </section>` : ''}
    ${showStores ? `<div class="actions">${downloadContent}</div>
    <p class="help">Si instalas la aplicación ahora, regresa al mensaje de WhatsApp y toca nuevamente este enlace para continuar.</p>` : ''}
  </main>
</body>
</html>`;
}

function setPageSecurityHeaders(res) {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  });
}

function renderInvitationError(req, res, error) {
  const states = {
    INVITATION_NOT_FOUND: {
      status: 404,
      heading: 'Esta invitación no es válida',
      description: 'Revisa que el enlace esté completo o solicita una invitación nueva.',
    },
    INVITATION_EXPIRED: {
      status: 410,
      heading: 'Esta invitación expiró',
      description: 'Solicita al propietario del perfil que genere un enlace nuevo.',
    },
    INVITATION_REVOKED: {
      status: 410,
      heading: 'Esta invitación ya no está disponible',
      description: 'El propietario retiró esta invitación. Puedes solicitar una nueva.',
    },
    INVITATION_ALREADY_ACCEPTED: {
      status: 409,
      heading: 'Esta invitación ya fue utilizada',
      description: 'Abre SaludApp e inicia sesión para consultar tus perfiles compartidos.',
    },
  };
  const state = error instanceof ProfileSharingError ? states[error.code] : null;

  if (!state) {
    console.error('Invitation landing page error:', error.message);
  }

  const page = state || {
    status: 500,
    heading: 'No pudimos consultar la invitación',
    description: 'Inténtalo nuevamente en unos minutos.',
  };

  return res.status(page.status).type('html').send(invitationPage({
    title: page.heading,
    heading: page.heading,
    description: page.description,
    showStores: error?.code === 'INVITATION_ALREADY_ACCEPTED',
    userAgent: req.get('user-agent'),
  }));
}

async function invitationLanding(req, res) {
  setPageSecurityHeaders(res);
  const { token } = req.params;

  if (!OPAQUE_TOKEN_PATTERN.test(token || '')) {
    return renderInvitationError(
      req,
      res,
      new ProfileSharingError('INVITATION_NOT_FOUND', 404),
    );
  }

  try {
    const invitation = await getInvitationRecord(token);
    return res.status(200).type('html').send(invitationPage({
      title: 'Invitación familiar',
      heading: 'Te invitaron a SaludApp',
      description: 'Instala SaludApp para aceptar la invitación y consultar este perfil de salud.',
      invitation,
      showStores: true,
      userAgent: req.get('user-agent'),
    }));
  } catch (error) {
    return renderInvitationError(req, res, error);
  }
}

function androidAssetLinks(req, res) {
  const android = androidConfiguration();
  const document = android ? [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: android.packageName,
      sha256_cert_fingerprints: android.fingerprints,
    },
  }] : [];

  res.set('Cache-Control', 'public, max-age=300');
  return res.status(200).json(document);
}

function appleAppSiteAssociation(req, res) {
  const ios = iosConfiguration();
  const details = ios ? [{
    appID: `${ios.teamId}.${ios.bundleId}`,
    paths: [`${DEFAULT_INVITATION_PATH_PREFIX}/*`],
  }] : [];

  res.set('Cache-Control', 'public, max-age=300');
  return res.status(200).json({
    applinks: {
      apps: [],
      details,
    },
  });
}

module.exports = {
  androidAssetLinks,
  appleAppSiteAssociation,
  invitationLanding,
};
