const {
  ProfileSharingError,
  acceptInvitation: acceptInvitationRecord,
  createInvitation: createInvitationRecord,
  getInvitation: getInvitationRecord,
  listProfileMembers: listProfileMemberRecords,
  removeProfileMember: removeProfileMemberRecord,
} = require('../services/profile-sharing.service');
const { resolvePublicBaseUrl } = require('../config/mobile-links');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function sendSharingError(res, error, fallbackCode, fallbackMessage) {
  if (error instanceof ProfileSharingError) {
    const messages = {
      PROFILE_NOT_FOUND: 'El perfil no existe o el usuario no es su propietario.',
      INVITATION_NOT_FOUND: 'La invitación no existe.',
      INVITATION_EXPIRED: 'La invitación expiró.',
      INVITATION_REVOKED: 'La invitación fue revocada.',
      INVITATION_ALREADY_ACCEPTED: 'La invitación ya fue utilizada.',
      OWN_PROFILE_INVITATION: 'El propietario no puede aceptar su propia invitación.',
      MEMBER_NOT_FOUND: 'El usuario no tiene acceso activo al perfil.',
      OWNER_ACCESS_CANNOT_BE_REMOVED: 'No se puede retirar el acceso del propietario.',
    };

    return res.status(error.statusCode).json({
      error: { code: error.code, message: messages[error.code] },
    });
  }

  console.error('Profile sharing operation error:', error.message);
  return res.status(500).json({
    error: { code: fallbackCode, message: fallbackMessage },
  });
}

function validUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function validToken(value) {
  return typeof value === 'string' && OPAQUE_TOKEN_PATTERN.test(value);
}

async function createInvitation(req, res) {
  const { profileId } = req.params;

  if (!validUuid(profileId)) {
    return res.status(400).json({
      error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
    });
  }

  try {
    const invitation = await createInvitationRecord(
      req.user.id,
      profileId,
      resolvePublicBaseUrl(req),
    );
    return res.status(201).json({ data: { invitation } });
  } catch (error) {
    return sendSharingError(
      res,
      error,
      'INVITATION_CREATE_FAILED',
      'No fue posible crear la invitación.',
    );
  }
}

async function getInvitation(req, res) {
  const { token } = req.params;

  if (!validToken(token)) {
    return res.status(404).json({
      error: { code: 'INVITATION_NOT_FOUND', message: 'La invitación no existe.' },
    });
  }

  try {
    const invitation = await getInvitationRecord(token);
    return res.status(200).json({ data: { invitation } });
  } catch (error) {
    return sendSharingError(
      res,
      error,
      'INVITATION_GET_FAILED',
      'No fue posible consultar la invitación.',
    );
  }
}

async function acceptInvitation(req, res) {
  const { token } = req.params;

  if (!validToken(token)) {
    return res.status(404).json({
      error: { code: 'INVITATION_NOT_FOUND', message: 'La invitación no existe.' },
    });
  }

  try {
    const access = await acceptInvitationRecord(req.user.id, token);
    return res.status(200).json({ data: { access } });
  } catch (error) {
    return sendSharingError(
      res,
      error,
      'INVITATION_ACCEPT_FAILED',
      'No fue posible aceptar la invitación.',
    );
  }
}

async function listProfileMembers(req, res) {
  const { profileId } = req.params;

  if (!validUuid(profileId)) {
    return res.status(400).json({
      error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
    });
  }

  try {
    const members = await listProfileMemberRecords(req.user.id, profileId);
    return res.status(200).json({
      data: { members, count: members.length },
    });
  } catch (error) {
    return sendSharingError(
      res,
      error,
      'PROFILE_MEMBERS_LIST_FAILED',
      'No fue posible consultar los miembros del perfil.',
    );
  }
}

async function removeProfileMember(req, res) {
  const { profileId, userId } = req.params;

  if (!validUuid(profileId)) {
    return res.status(400).json({
      error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
    });
  }

  if (!validUuid(userId)) {
    return res.status(400).json({
      error: { code: 'USER_ID_INVALID', message: 'userId no es un UUID válido.' },
    });
  }

  try {
    await removeProfileMemberRecord(req.user.id, profileId, userId);
    return res.status(204).send();
  } catch (error) {
    return sendSharingError(
      res,
      error,
      'PROFILE_MEMBER_REMOVE_FAILED',
      'No fue posible retirar el acceso al perfil.',
    );
  }
}

module.exports = {
  acceptInvitation,
  createInvitation,
  getInvitation,
  listProfileMembers,
  removeProfileMember,
};
