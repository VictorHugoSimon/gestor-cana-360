import app from './index';
import { registerEconomicsRoutes } from './economics';
import { registerOperationsRoutes } from './operations';
import { registerHarvestRoutes } from './harvest';

registerEconomicsRoutes(app as never);
registerOperationsRoutes(app as never);
registerHarvestRoutes(app as never);

export default app;
