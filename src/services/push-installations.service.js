const pool = require('../config/db');

async function upsertPushInstallation(userId, installation) {
  const result = await pool.query(
    `
      INSERT INTO user_push_installations (
        user_id,
        installation_id,
        platform,
        notifications_enabled,
        last_seen_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (installation_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        notifications_enabled = EXCLUDED.notifications_enabled,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING id, installation_id, platform, notifications_enabled,
        last_seen_at, created_at, updated_at
    `,
    [
      userId,
      installation.installationId,
      installation.platform,
      installation.notificationsEnabled,
    ],
  );

  return result.rows[0];
}

async function removePushInstallation(userId, installationId) {
  const result = await pool.query(
    `
      DELETE FROM user_push_installations
      WHERE user_id = $1 AND installation_id = $2
      RETURNING id
    `,
    [userId, installationId],
  );

  return result.rowCount > 0;
}

module.exports = {
  removePushInstallation,
  upsertPushInstallation,
};
