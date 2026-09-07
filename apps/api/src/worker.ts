import app from './index';
import { registerEconomicsRoutes } from './economics';

registerEconomicsRoutes(app as never);

export default app;
