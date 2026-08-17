import { IsNotEmpty, IsNumber, IsString, Max, Min, MinLength } from "class-validator";

export class AdjustCalibrationDto {
    @IsString()
    @IsNotEmpty()
    userId: string;

    @IsNumber()
    @Min(1)
    @Max(5)
    calibrationScore: number;

    @IsString()
    @MinLength(1)
    note: string;
}