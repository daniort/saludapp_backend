const pool = require('../config/db');
const { getFirebaseAdminMessaging } = require('../config/firebase-admin');

const INVALID_FID_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

async function sendProfileReadingNotification({ profileId, recordedByUserId, readingType }) {
  const installationsResult = await pool.query(
    `
      SELECT DISTINCT installation.installation_id
      FROM user_profiles recipient
      INNER JOIN user_push_installations installation
        ON installation.user_id = recipient.user_id
      INNER JOIN users u ON u.id = recipient.user_id
      INNER JOIN profiles p ON p.id = recipient.profile_id
      WHERE recipient.profile_id = $1
        AND recipient.user_id <> $2
        AND recipient.deleted_at IS NULL
        AND recipient.access_role IN ('owner', 'viewer', 'editor')
        AND installation.notifications_enabled = TRUE
        AND u.is_active = TRUE
        AND u.deleted_at IS NULL
        AND p.deleted_at IS NULL
    `,
    [profileId, recordedByUserId],
  );

  const fids = installationsResult.rows.map((row) => row.installation_id);
  if (fids.length === 0) return { sent: 0, failed: 0 };

  const messaging = getFirebaseAdminMessaging();
  const result = await messaging.sendEach(fids.map((fid) => ({
    fid,
    notification: {
      title: 'Nueva medición registrada',
      body: 'Hay una nueva medición de uno de tus familiares.',
    },
    data: {
      type: 'profile_reading_created',
      profileId,
      readingType,
    },
    android: { priority: 'high' },
    apns: {
      payload: {
        aps: { sound: 'default' },
      },
    },
  })));

  const invalidFids = result.responses.flatMap((response, index) => (
    !response.success && INVALID_FID_CODES.has(response.error?.code)
      ? [fids[index]]
      : []
  ));

  if (invalidFids.length > 0) {
    await pool.query(
      `DELETE FROM user_push_installations WHERE installation_id = ANY($1::text[])`,
      [invalidFids],
    );
  }

  return {
    sent: result.successCount,
    failed: result.failureCount,
  };
}

module.exports = { sendProfileReadingNotification };
