import { IsString, IsEnum, IsOptional, IsBoolean, ValidateIf, IsNotEmpty } from 'class-validator';
import { RecognitionCategory } from '@prisma/client';

export class CreateRecognitionDto {
    @IsString()
    @IsNotEmpty()
    toUserId: string;

    @IsString()
    @IsNotEmpty()
    message: string;

    @IsEnum(RecognitionCategory)
    category: RecognitionCategory;

    @ValidateIf((o) => o.category === RecognitionCategory.OTHER)
    @IsString()
    @IsNotEmpty()
    customCategory?: string;

    @IsOptional()
    @IsBoolean()
    isPublic?: boolean;
}