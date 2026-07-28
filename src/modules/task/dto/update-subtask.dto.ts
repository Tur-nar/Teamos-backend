import { IsOptional, IsString, IsBoolean, MaxLength, IsArray, ArrayMinSize } from "class-validator"

export class UpdateSubTaskDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    title?: string;

    @IsOptional()
    @IsBoolean()
    isCompleted?: boolean;
}