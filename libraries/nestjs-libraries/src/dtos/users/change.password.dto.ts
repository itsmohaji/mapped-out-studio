import { IsDefined, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsDefined()
  password: string; // current password

  @IsString()
  @IsDefined()
  @MinLength(3)
  newPassword: string;
}
