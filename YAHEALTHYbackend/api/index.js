// Vercel auto-builds any file under api/ as a serverless function; this just
// re-exports the actual Express app (see ../index.js) as that function.
module.exports = require('../index.js');
