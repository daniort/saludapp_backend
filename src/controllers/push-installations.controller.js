const {
  removePushInstallation: removePushInstallationRecord,
  upsertPushInstallation: upsertPushInstallationRecord,
} = require('../services/push-installations.service');

const INSTALLATION_ID_MAX_LENGTH = 512;
const PLATFORMS = new Set(['android', 'ios']);

function validInstallationId(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= INSTALLATION_ID_MAX_LENGTH;
}

function invalidRequest(res, code, message) {
  return res.status(400).json({ error: { code, message } });
}

async function registerPushInstallation(req, res) {
  const { installationId, platform } = req.body ?? {};
  const notificationsEnabled = req.body?.notificationsEnabled ?? true;

  if (!validInstallationId(installationId)) {
    return invalidRequest(
      res,
      'PUSH_INSTALLATION_ID_INVALID',
      `installationId debe ser un texto de 1 a ${INSTALLATION_ID_MAX_LENGTH} caracteres.`,
    );
  }

  if (!PLATFORMS.has(platform)) {
    return invalidRequest(
      res,
      'PUSH_PLATFORM_INVALID',
      'platform debe ser "android" o "ios".',
    );
  }

  if (typeof notificationsEnabled !== 'boolean') {
    return invalidRequest(
      res,
      'PUSH_NOTIFICATIONS_ENABLED_INVALID',
      'notificationsEnabled debe ser un valor booleano.',
    );
  }

  try {
    const installation = await upsertPushInstallationRecord(req.user.id, {
      installationId: installationId.trim(),
      platform,
      notificationsEnabled,
    });
    return res.status(200).json({ data: { installation } });
  } catch (error) {
    console.error('Push installation registration error:', error.message);
    return res.status(500).json({
      error: {
        code: 'PUSH_INSTALLATION_REGISTER_FAILED',
        message: 'No fue posible registrar esta instalación.',
      },
    });
  }
}

async function removePushInstallation(req, res) {
  const { installationId } = req.params;

  if (!validInstallationId(installationId)) {
    return invalidRequest(
      res,
      'PUSH_INSTALLATION_ID_INVALID',
      `installationId debe ser un texto de 1 a ${INSTALLATION_ID_MAX_LENGTH} caracteres.`,
    );
  }

  try {
    const removed = await removePushInstallationRecord(
      req.user.id,
      installationId,
    );
    if (!removed) {
      return res.status(404).json({
        error: {
          code: 'PUSH_INSTALLATION_NOT_FOUND',
          message: 'No se encontró una instalación registrada para este usuario.',
        },
      });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Push installation removal error:', error.message);
    return res.status(500).json({
      error: {
        code: 'PUSH_INSTALLATION_REMOVE_FAILED',
        message: 'No fue posible retirar esta instalación.',
      },
    });
  }
}

module.exports = {
  registerPushInstallation,
  removePushInstallation,
};
