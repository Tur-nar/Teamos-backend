import { IsString, IsOptional, IsArray, IsNotEmpty, ValidateNested, IsBoolean } from "class-validator";
import { Type } from "class-transformer";

class TemplateQuestionDto {
    @IsString()
    @IsNotEmpty()
    id: string;

    @IsString()
    @IsNotEmpty()
    text: string;

    @IsString()
    @IsNotEmpty()
    type: 'rating_scale' | 'text' | 'multiple_choice';

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    options?: string[];
}

class TemplateSectionDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TemplateQuestionDto)
    questions: TemplateQuestionDto[];
}

export class CreateReviewTemplateDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TemplateSectionDto)
    sections: TemplateSectionDto[];

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean;
}