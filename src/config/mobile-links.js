const DEFAULT_INVITATION_PATH_PREFIX = '/i';

function normalizeBaseUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function resolvePublicBaseUrl(req) {
  const configuredBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProtocol || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

function normalizeStoreUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function androidConfiguration() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim();
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || '')
    .split(',')
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter(Boolean);

  const validPackageName = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(
    packageName || '',
  );
  const validFingerprint = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

  if (!validPackageName || fingerprints.length === 0 || !fingerprints.every(
    (fingerprint) => validFingerprint.test(fingerprint),
  )) {
    return null;
  }

  return { packageName, fingerprints };
}

function iosConfiguration() {
  const teamId = process.env.IOS_TEAM_ID?.trim();
  const bundleId = process.env.IOS_BUNDLE_ID?.trim();

  if (
    !/^[A-Z0-9]{10}$/.test(teamId || '')
    || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId || '')
  ) {
    return null;
  }

  return { teamId, bundleId };
}

function storeConfiguration() {
  const android = androidConfiguration();
  const configuredPlayStoreUrl = normalizeStoreUrl(process.env.PLAY_STORE_URL);

  return {
    playStoreUrl: configuredPlayStoreUrl || (android
      ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(android.packageName)}`
      : null),
    appStoreUrl: normalizeStoreUrl(process.env.APP_STORE_URL),
  };
}

module.exports = {
  DEFAULT_INVITATION_PATH_PREFIX,
  androidConfiguration,
  iosConfiguration,
  resolvePublicBaseUrl,
  storeConfiguration,
};
