// Adaptateur Vercel — l'application Express existante (server/index.js) devient
// une fonction serverless. Aucune duplication de code : on importe, on exporte.
// Tout le métier (routes, DB Neon, emails Brevo, dispatch) reste dans server/index.js.
import app from '../server/index.js';

export default app;
