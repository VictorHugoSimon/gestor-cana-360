import app from './index';
import { registerEconomicsRoutes } from './economics';
import { registerOperationsRoutes } from './operations';
import { registerHarvestRoutes } from './harvest';
import { registerAssetsRoutes } from './assets';

registerEconomicsRoutes(app as never);
registerOperationsRoutes(app as never);
registerHarvestRoutes(app as never);
registerAssetsRoutes(app as never);

export default app;
