import express from 'express';
import { errorHandler, unknownRoute } from './errors';
import { router } from './routes';

export const app = express();

app.use(express.json({ type: () => true })); // treat every body as JSON, whatever the Content-Type
app.use(router);
app.use(unknownRoute);
app.use(errorHandler);
