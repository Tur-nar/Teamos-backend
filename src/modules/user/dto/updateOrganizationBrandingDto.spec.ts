import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOrganizationBrandingDto } from './updateOrganizationBrandingDto';

describe('UpdateOrganizationBrandingDto', () => {
    const createDto = (plain: object): UpdateOrganizationBrandingDto => {
        return plainToInstance(UpdateOrganizationBrandingDto, plain);
    };

    describe('valid brand colors', () => {
        it('accepts a valid 6-character hex color', async () => {
            const dto = createDto({ brandColor: '#2563EB' });
            const errors = await validate(dto);
            expect(errors).toHaveLength(0);
        });

        it('accepts a valid lowercase 6-character hex color', async () => {
            const dto = createDto({ brandColor: '#1676f3' });
            const errors = await validate(dto);
            expect(errors).toHaveLength(0);
        });

        it('accepts a valid 3-character hex color', async () => {
            const dto = createDto({ brandColor: '#FFF' });
            const errors = await validate(dto);
            expect(errors).toHaveLength(0);
        });

        it('accepts a valid 8-character hex color with alpha channel', async () => {
            const dto = createDto({ brandColor: '#1676f3ff' });
            const errors = await validate(dto);
            expect(errors).toHaveLength(0);
        });

        it('accepts undefined since brandColor is optional', async () => {
            const dto = createDto({});
            const errors = await validate(dto);
            expect(errors).toHaveLength(0);
        });

        it('accepts null since brandColor is optional', async () => {
            const dto = createDto({ brandColor: null });
            const errors = await validate(dto);
            expect(errors).toHaveLength(0);
        });
    });

    describe('invalid brand colors', () => {
        it('rejects hex color without leading #', async () => {
            const dto = createDto({ brandColor: '2563EB' });
            const errors = await validate(dto);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].property).toBe('brandColor');
        });

        it('rejects invalid hex characters', async () => {
            const dto = createDto({ brandColor: '#ZZZZZZ' });
            const errors = await validate(dto);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].constraints?.matches).toBeDefined();
        });

        it('rejects invalid hex lengths (e.g. 5 or 7 characters)', async () => {
            const dto5 = createDto({ brandColor: '#12345' });
            const errors5 = await validate(dto5);
            expect(errors5.length).toBeGreaterThan(0);

            const dto7 = createDto({ brandColor: '#1234567' });
            const errors7 = await validate(dto7);
            expect(errors7.length).toBeGreaterThan(0);
        });

        it('rejects non-string values', async () => {
            const dto = createDto({ brandColor: 123456 });
            const errors = await validate(dto);
            expect(errors.length).toBeGreaterThan(0);
        });
    });
});
