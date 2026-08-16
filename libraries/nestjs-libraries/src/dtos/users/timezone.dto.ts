import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidTimezone } from '@gitroom/helpers/utils/timezone';

@ValidatorConstraint({ name: 'IsIanaTimezone', async: false })
export class IsIanaTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    return isValidTimezone(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Timezone must be an IANA timezone name, for example Asia/Bahrain';
  }
}

export function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsIanaTimezoneConstraint,
    });
  };
}

export class TimezoneDto {
  // Validated rather than coerced: a zone the runtime cannot compute in would
  // be stored, read back by every device, and throw wherever a date is
  // formatted. Reject it at the boundary instead.
  @IsIanaTimezone()
  timezone: string;
}
