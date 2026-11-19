const path = require('path');

// All runtime data lives under one base directory. Locally that is the backend
// folder (so nothing changes in dev). In production, set DATA_DIR to a mounted
// persistent disk (e.g. /app/data on Render) so jobs and clips survive restarts.
const BASE = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..');

module.exports = {
  BASE,
  UPLOADS_DIR: path.join(BASE, 'uploads'),
  OUTPUTS_DIR: path.join(BASE, 'outputs'),
  TEMP_DIR: path.join(BASE, 'temp'),
  DATA_DIR: path.join(BASE, 'data'),
  BIN_DIR: path.join(BASE, 'bin'),
};
