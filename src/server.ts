import { app } from './app';
import { PORT } from './config';

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GymNation API listening on 0.0.0.0:${PORT}`);
});
