import { createAccessControl } from 'better-auth/plugins/access';

/**
 * Resource-based permissions for the TeamOS organization plugin.
 *
 * Maps the old system's 4-tier hierarchy:
 *   super_admin → owner  |  admin → admin  |  supervisor → supervisor  |  staff → member
 *
 * @see {@link file:///docs/DOCUMENTATION.md#L49-L56} — original role definitions
 * @see {@link file:///docs/teamos-roadmap.md#L57-L62} — roadmap role mapping
 */
const statement = {
    organization: ['update', 'delete'],
    member: ['create', 'update', 'remove'],
    invitation: ['create', 'cancel'],
    department: ['create', 'update', 'delete'],
    task: ['create', 'update', 'delete', 'assign'],
    target: ['create', 'update', 'delete'],
    performance: ['view', 'recalculate'],
    complaint: ['review', 'resolve', 'dismiss'],
} as const;

export const ac = createAccessControl(statement);

/**
 * owner — Full control (maps from super_admin).
 */
export const owner = ac.newRole({
    organization: ['update', 'delete'],
    member: ['create', 'update', 'remove'],
    invitation: ['create', 'cancel'],
    department: ['create', 'update', 'delete'],
    task: ['create', 'update', 'delete', 'assign'],
    target: ['create', 'update', 'delete'],
    performance: ['view', 'recalculate'],
    complaint: ['review', 'resolve', 'dismiss'],
});

/**
 * admin — Everything except modifying other admins/owner.
 */
export const admin = ac.newRole({
    organization: ['update'],
    member: ['create', 'update', 'remove'],
    invitation: ['create', 'cancel'],
    department: ['create', 'update', 'delete'],
    task: ['create', 'update', 'delete', 'assign'],
    target: ['create', 'update', 'delete'],
    performance: ['view', 'recalculate'],
    complaint: ['review', 'resolve', 'dismiss'],
});

/**
 * supervisor — Team-scoped task/target creation, own team visibility.
 */
export const supervisor = ac.newRole({
    invitation: ['create'],
    department: ['update'],
    task: ['create', 'update', 'assign'],
    target: ['create', 'update'],
    performance: ['view'],
});

/**
 * member — Own tasks/targets only (maps from staff).
 */
export const member = ac.newRole({
    task: ['update'],
});

export const roles = { owner, admin, supervisor, member };
