const express = require('express');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const bloodPressureRoutes = require('./routes/blood-pressure.routes');
const glucoseRoutes = require('./routes/glucose.routes');
const meRoutes = require('./routes/me.routes');
const mobileLinksRoutes = require('./routes/mobile-links.routes');
const oxygenSaturationRoutes = require('./routes/oxygen-saturation.routes');
const profileInvitationsRoutes = require('./routes/profile-invitations.routes');
const profilesRoutes = require('./routes/profiles.routes');
const temperatureRoutes = require('./routes/temperature.routes');
const weightRoutes = require('./routes/weight.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para que Express entienda formato JSON
app.use(express.json({ limit: '16kb' }));

app.use('/', mobileLinksRoutes);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/blood-pressure-readings', bloodPressureRoutes);
app.use('/api/v1/glucose-readings', glucoseRoutes);
app.use('/api/v1/me', meRoutes);
app.use('/api/v1/oxygen-saturation-readings', oxygenSaturationRoutes);
app.use('/api/v1/profile-invitations', profileInvitationsRoutes);
app.use('/api/v1/profiles', profilesRoutes);
app.use('/api/v1/temperature-readings', temperatureRoutes);
app.use('/api/v1/weight-readings', weightRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: '¡Servidor funcionando correctamente con Node.js y Express!' });
});

function startServer() {
  return app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
