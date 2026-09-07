import { z } from 'zod';
export const FieldStatus = z.enum(['planned','growing','ready','harvesting','harvested','closed']);
export const WorkOrderStatus = z.enum(['planned','scheduled','in_progress','done','cancelled','overdue']);
export const OrganizationScope = z.object({ organizationId: z.uuid(), seasonId: z.uuid().optional() });
export type OrganizationScope = z.infer<typeof OrganizationScope>;
