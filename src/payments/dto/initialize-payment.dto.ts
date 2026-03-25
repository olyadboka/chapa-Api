import {
  IsEmail,
  IsNotEmpty,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class InitializePaymentDto {
  @IsNumberString()
  @IsNotEmpty()
  amount: string;

  @IsOptional()
  @IsString()
  @Length(3, 8)
  currency?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(120)
  firstName: string;

  @IsString()
  @MaxLength(120)
  lastName: string;

  @IsOptional()
  @Matches(/^0[79]\d{8}$/, {
    message: 'phone_number must be 10 digits starting with 09 or 07',
  })
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  txRef?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  callbackUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  returnUrl?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  customization?: Record<string, unknown>;
}
