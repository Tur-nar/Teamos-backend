export const ROLE_RANK: Record<string, number> = {
    member: 0,
    supervisor: 1,
    admin: 2,
    owner: 3,
};

export function outranks(actingRole: string, targetRole: string): boolean {
    return (ROLE_RANK[actingRole] ?? -1) > (ROLE_RANK[targetRole] ?? 0);
}
