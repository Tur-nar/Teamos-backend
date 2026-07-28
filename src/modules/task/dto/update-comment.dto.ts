import { MaxLength, IsString } from "class-validator"

export class UpdateCommentDto {
    @IsString()
    @MaxLength(2000)
    content: string;
}
