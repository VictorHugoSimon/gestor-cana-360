import app from './index';
import { registerEconomicsRoutes } from './economics';
import { registerOperationsRoutes } from './operations';
import { registerHarvestRoutes } from './harvest';
import { registerAssetsRoutes } from './assets';
import { registerAgronomyRoutes } from './agronomy';

registerEconomicsRoutes(app as never);
registerOperationsRoutes(app as never);
registerHarvestRoutes(app as never);
registerAssetsRoutes(app as never);
registerAgronomyRoutes(app as never);

export default app;
