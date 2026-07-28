import { MaxLength, IsString, IsOptional, IsNumber } from "class-validator"

export class CreateSubTaskDto {
    @IsString()
    @MaxLength(200)
    title: string;

    @IsOptional()
    @IsNumber()
    order?: number;
}