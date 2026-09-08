import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateOrganizationBrandingDto {
    @IsOptional()
    @IsString()
    @Matches(/^#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/, {
        message: 'brandColor must be a valid hex color (e.g. #2563EB or 2563EBFF)'
    })
    brandColor: string | null;
}