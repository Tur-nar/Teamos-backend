import { IsString, IsOptional, MaxLength } from "class-validator";

export class CreateDepartmentDto {
    @IsString()
    @MaxLength(100)
    name: string;

    @IsOptional()
    @MaxLength(500)
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    headId?: string;
}
