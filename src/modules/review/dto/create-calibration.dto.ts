import { IsOptional, IsString } from "class-validator";


export class CreateCalibrationDto {
    @IsOptional()
    @IsString()
    departmentId?: string;
}