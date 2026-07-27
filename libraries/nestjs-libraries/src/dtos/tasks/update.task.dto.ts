import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(['task', 'reminder']) type?: string;
  @IsOptional() @IsIn(['todo', 'doing', 'done']) status?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) priority?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsDateString() remindAt?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() customerId?: string;
}
