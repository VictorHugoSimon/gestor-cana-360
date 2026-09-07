import app from './index';
import { registerEconomicsRoutes } from './economics';
import { registerOperationsRoutes } from './operations';

registerEconomicsRoutes(app as never);
registerOperationsRoutes(app as never);

export default app;
