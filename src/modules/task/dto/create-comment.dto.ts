import { MaxLength, IsString, IsOptional } from "class-validator"

export class CreateCommentDto {
    @IsString()
    @MaxLength(2000)
    content: string

    @IsOptional()
    @IsString()
    parentCommentId?: string;
}