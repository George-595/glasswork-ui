import { Section, type SectionProps } from '../components/layout/Section';
import { Stack } from '../components/layout/Stack';

/* FormSection — a titled group of fields: a heading (h3 by default, so it sits under a page
   section), a line of help, and the fields spaced evenly. It is a named <section> landmark
   region group via Section. Put a FormGrid inside for two columns. */
export interface FormSectionProps extends Omit<SectionProps, 'gap'> {}

export function FormSection({ level = 3, titleSize = 4, children, ...props }: FormSectionProps) {
  return (
    <Section level={level} titleSize={titleSize} gap={3} {...props}>
      <Stack gap={4}>{children}</Stack>
    </Section>
  );
}
