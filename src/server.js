import 'dotenv/config';
import app from './index.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Financial Dashboard API on http://localhost:${PORT}`);
});
