import { FormField, PasswordInput, PasswordStrength, Stack } from '@apps/ui';
import { forwardRef } from 'react';

/* NewPasswordField — a "choose a password" field: the labelled password input (Show / Hide,
   `new-password` so a password manager offers to generate one) with the strength meter under it.
   The meter informs; the server's policy (10 to 256 characters, not a common password, not
   containing the email) decides, and its refusal arrives as `error`. Used wherever a password is
   set: accepting an invitation, resetting, changing. */
export interface NewPasswordFieldProps {
  label?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  /** Help under the label; defaults to the length rule. */
  description?: string;
  /** The length the server asks for. */
  minLength?: number;
}

export const NewPasswordField = forwardRef<HTMLInputElement, NewPasswordFieldProps>(
  function NewPasswordField(
    {
      label = 'Password',
      name = 'new-password',
      value,
      onChange,
      error,
      description = 'At least 10 characters. A few random words make a strong password.',
      minLength = 10,
    },
    ref,
  ) {
    return (
      <Stack gap={2}>
        <FormField label={label} description={description} error={error}>
          <PasswordInput
            ref={ref}
            name={name}
            autoComplete="new-password"
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </FormField>
        <PasswordStrength value={value} minLength={minLength} />
      </Stack>
    );
  },
);
