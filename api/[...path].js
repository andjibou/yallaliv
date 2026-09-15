// Routeur attrape-tout : toute requête /api/* → fonction serverless → application Express.
// (api/index.js gère /api exact ; ce fichier gère /api/nimporte/quoi/chemin)
import app from '../server/index.js';

export default app;
