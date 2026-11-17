const crypto = require('node:crypto');

const pool = require('../config/db');

const INVITATION_TTL_DAYS = 7;
const INVITATION_CONTEXT = Object.freeze({
  flow: 'family_profile_invitation',
  version: 1,
  resourceType: 'profile',
  redirectPath: '/family/invitations/accept',
  requiresAuthentication: true,
});

class ProfileSharingError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'ProfileSharingError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function mapInvitation(row, token) {
  return {
    id: row.id,
    profile: {
      id: row.profile_id,
      givenNames: row.given_names,
      paternalSurname: row.paternal_surname,
      maternalSurname: row.maternal_surname,
    },
    invitedBy: {
      id: row.invited_by_user_id,
      displayName: row.invited_by_display_name,
    },
    accessRole: row.access_role,
    context: row.context,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    ...(token ? {
      token,
      sharePath: `${row.context.redirectPath}?token=${encodeURIComponent(token)}`,
    } : {}),
  };
}

function assertInvitationAvailable(row) {
  if (row.revoked_at) {
    throw new ProfileSharingError('INVITATION_REVOKED', 410);
  }

  if (row.accepted_at) {
    throw new ProfileSharingError('INVITATION_ALREADY_ACCEPTED', 409);
  }

  if (row.is_expired) {
    throw new ProfileSharingError('INVITATION_EXPIRED', 410);
  }
}

async function createInvitation(userId, profileId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const result = await pool.query(
    `
      INSERT INTO profile_invitations (
        profile_id,
        invited_by_user_id,
        token_hash,
        access_role,
        context,
        expires_at
      )
      SELECT
        p.id,
        $2,
        $3,
        'viewer',
        $4::jsonb,
        NOW() + ($5 * INTERVAL '1 day')
      FROM profiles p
      INNER JOIN user_profiles up ON up.profile_id = p.id
      WHERE p.id = $1
        AND p.deleted_at IS NULL
        AND up.user_id = $2
        AND up.access_role = 'owner'
        AND up.deleted_at IS NULL
      RETURNING
        id,
        profile_id,
        invited_by_user_id,
        access_role,
        context,
        expires_at,
        created_at
    `,
    [
      profileId,
      userId,
      tokenHash,
      JSON.stringify(INVITATION_CONTEXT),
      INVITATION_TTL_DAYS,
    ],
  );

  if (result.rowCount === 0) {
    throw new ProfileSharingError('PROFILE_NOT_FOUND', 404);
  }

  const detailsResult = await pool.query(
    `
      SELECT
        pi.*,
        p.given_names,
        p.paternal_surname,
        p.maternal_surname,
        u.display_name AS invited_by_display_name
      FROM profile_invitations pi
      INNER JOIN profiles p ON p.id = pi.profile_id
      INNER JOIN users u ON u.id = pi.invited_by_user_id
      WHERE pi.id = $1
    `,
    [result.rows[0].id],
  );

  return mapInvitation(detailsResult.rows[0], token);
}

async function getInvitation(token) {
  const result = await pool.query(
    `
      SELECT
        pi.*,
        pi.expires_at <= NOW() AS is_expired,
        p.given_names,
        p.paternal_surname,
        p.maternal_surname,
        u.display_name AS invited_by_display_name
      FROM profile_invitations pi
      INNER JOIN profiles p ON p.id = pi.profile_id
      INNER JOIN users u ON u.id = pi.invited_by_user_id
      WHERE pi.token_hash = $1
        AND p.deleted_at IS NULL
      LIMIT 1
    `,
    [hashToken(token)],
  );

  if (result.rowCount === 0) {
    throw new ProfileSharingError('INVITATION_NOT_FOUND', 404);
  }

  const invitation = result.rows[0];
  assertInvitationAvailable(invitation);
  return mapInvitation(invitation);
}

async function acceptInvitation(userId, token) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const invitationResult = await client.query(
      `
        SELECT
          pi.*,
          pi.expires_at <= NOW() AS is_expired
        FROM profile_invitations pi
        INNER JOIN profiles p ON p.id = pi.profile_id
        WHERE pi.token_hash = $1
          AND p.deleted_at IS NULL
        FOR UPDATE OF pi
      `,
      [hashToken(token)],
    );

    if (invitationResult.rowCount === 0) {
      throw new ProfileSharingError('INVITATION_NOT_FOUND', 404);
    }

    const invitation = invitationResult.rows[0];

    if (invitation.accepted_at && invitation.accepted_by_user_id === userId) {
      const existingAccess = await client.query(
        `
          SELECT access_role
          FROM user_profiles
          WHERE user_id = $1
            AND profile_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [userId, invitation.profile_id],
      );

      if (existingAccess.rowCount === 0) {
        throw new ProfileSharingError('INVITATION_ALREADY_ACCEPTED', 409);
      }

      await client.query('COMMIT');
      return {
        profileId: invitation.profile_id,
        accessRole: existingAccess.rows[0].access_role,
        alreadyAccepted: true,
      };
    }

    assertInvitationAvailable(invitation);

    const ownershipResult = await client.query(
      `
        SELECT 1
        FROM user_profiles
        WHERE user_id = $1
          AND profile_id = $2
          AND access_role = 'owner'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [userId, invitation.profile_id],
    );

    if (ownershipResult.rowCount > 0) {
      throw new ProfileSharingError('OWN_PROFILE_INVITATION', 409);
    }

    const accessResult = await client.query(
      `
        INSERT INTO user_profiles (
          user_id,
          profile_id,
          is_owner,
          access_role
        )
        VALUES ($1, $2, FALSE, $3)
        ON CONFLICT (user_id, profile_id) WHERE deleted_at IS NULL
        DO UPDATE SET
          access_role = CASE
            WHEN user_profiles.access_role = 'editor' THEN 'editor'
            ELSE EXCLUDED.access_role
          END,
          updated_at = NOW()
        RETURNING access_role
      `,
      [userId, invitation.profile_id, invitation.access_role],
    );

    await client.query(
      `
        UPDATE profile_invitations
        SET
          accepted_by_user_id = $1,
          accepted_at = NOW()
        WHERE id = $2
      `,
      [userId, invitation.id],
    );

    await client.query('COMMIT');
    return {
      profileId: invitation.profile_id,
      accessRole: accessResult.rows[0].access_role,
      alreadyAccepted: false,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listProfileMembers(userId, profileId) {
  const ownerResult = await pool.query(
    `
      SELECT 1
      FROM user_profiles up
      INNER JOIN profiles p ON p.id = up.profile_id
      WHERE up.user_id = $1
        AND up.profile_id = $2
        AND up.access_role = 'owner'
        AND up.deleted_at IS NULL
        AND p.deleted_at IS NULL
      LIMIT 1
    `,
    [userId, profileId],
  );

  if (ownerResult.rowCount === 0) {
    throw new ProfileSharingError('PROFILE_NOT_FOUND', 404);
  }

  const result = await pool.query(
    `
      SELECT
        u.id AS user_id,
        u.email,
        u.display_name,
        up.access_role,
        up.created_at AS joined_at
      FROM user_profiles up
      INNER JOIN users u ON u.id = up.user_id
      WHERE up.profile_id = $1
        AND up.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND u.is_active = TRUE
      ORDER BY
        CASE up.access_role
          WHEN 'owner' THEN 0
          WHEN 'editor' THEN 1
          ELSE 2
        END,
        up.created_at ASC
    `,
    [profileId],
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    accessRole: row.access_role,
    joinedAt: row.joined_at,
  }));
}

async function removeProfileMember(ownerUserId, profileId, memberUserId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const ownerResult = await client.query(
      `
        SELECT 1
        FROM user_profiles up
        INNER JOIN profiles p ON p.id = up.profile_id
        WHERE up.user_id = $1
          AND up.profile_id = $2
          AND up.access_role = 'owner'
          AND up.deleted_at IS NULL
          AND p.deleted_at IS NULL
        LIMIT 1
      `,
      [ownerUserId, profileId],
    );

    if (ownerResult.rowCount === 0) {
      throw new ProfileSharingError('PROFILE_NOT_FOUND', 404);
    }

    const memberResult = await client.query(
      `
        SELECT id, access_role
        FROM user_profiles
        WHERE user_id = $1
          AND profile_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [memberUserId, profileId],
    );

    if (memberResult.rowCount === 0) {
      throw new ProfileSharingError('MEMBER_NOT_FOUND', 404);
    }

    if (memberResult.rows[0].access_role === 'owner') {
      throw new ProfileSharingError('OWNER_ACCESS_CANNOT_BE_REMOVED', 409);
    }

    await client.query(
      `
        UPDATE user_profiles
        SET deleted_at = NOW()
        WHERE id = $1
      `,
      [memberResult.rows[0].id],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ProfileSharingError,
  acceptInvitation,
  createInvitation,
  getInvitation,
  listProfileMembers,
  removeProfileMember,
};
