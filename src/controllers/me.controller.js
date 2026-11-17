const { listProfiles } = require('../services/profile.service');

async function getMe(req, res) {
  try {
    const profiles = await listProfiles(req.user.id);

    return res.status(200).json({
      data: {
        user: req.user,
        profiles,
      },
    });
  } catch (error) {
    console.error('Get current user error:', error.message);
    return res.status(500).json({
      error: {
        code: 'CURRENT_USER_GET_FAILED',
        message: 'No fue posible consultar al usuario actual.',
      },
    });
  }
}

module.exports = { getMe };
