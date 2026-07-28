import { ROLE_RANK, outranks } from './role-rank';

describe('ROLE_RANK', () => {
    it('assigns increasing rank from member to owner', () => {
        expect(ROLE_RANK['member']).toBe(0);
        expect(ROLE_RANK['supervisor']).toBe(1);
        expect(ROLE_RANK['admin']).toBe(2);
        expect(ROLE_RANK['owner']).toBe(3);
    });

    it('returns undefined for unknown roles', () => {
        expect(ROLE_RANK['superadmin']).toBeUndefined();
        expect(ROLE_RANK['']).toBeUndefined();
    });
});

describe('outranks', () => {
    it('returns true when acting role outranks target', () => {
        expect(outranks('owner', 'admin')).toBe(true);
        expect(outranks('admin', 'supervisor')).toBe(true);
        expect(outranks('supervisor', 'member')).toBe(true);
        expect(outranks('owner', 'member')).toBe(true);
    });

    it('returns false when roles are equal', () => {
        expect(outranks('admin', 'admin')).toBe(false);
        expect(outranks('owner', 'owner')).toBe(false);
        expect(outranks('member', 'member')).toBe(false);
    });

    it('returns false when acting role is lower than target', () => {
        expect(outranks('member', 'supervisor')).toBe(false);
        expect(outranks('supervisor', 'admin')).toBe(false);
        expect(outranks('admin', 'owner')).toBe(false);
    });

    it('treats unknown acting role as rank -1, always below member', () => {
        expect(outranks('unknown', 'member')).toBe(false);
    });

    it('treats unknown target role as rank 0, equal to member', () => {
        // acting rank must be > 0 to outrank an unknown target (treated as member level)
        expect(outranks('supervisor', 'unknown')).toBe(true);
        expect(outranks('member', 'unknown')).toBe(false);
    });
});
