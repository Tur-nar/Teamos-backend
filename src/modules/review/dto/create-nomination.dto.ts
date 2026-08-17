import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from "class-validator";

export class CreateNominationDto {
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    @ArrayMaxSize(3)
    nomineeIds: string[];
}