import { IsNumber, IsString, IsOptional } from "class-validator";

export class CreateEntryDto {
    @IsNumber()
    value: number;

    @IsString()
    @IsOptional()
    note?: string;
}