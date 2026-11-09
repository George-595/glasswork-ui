import { type FormEvent, type ReactNode, useState } from 'react';
import { type ApiError, api, useApiAction } from '~/core/api';
import {
  Badge,
  Button,
  Cluster,
  CopyButton,
  FormField,
  Grid,
  NumberField,
  Panel,
  RadioGroup,
  Section,
  Stack,
  Text,
  Textarea,
} from '~/core/ui';

type LlmBody = Parameters<typeof api.llmComplete>[0];
type Provider = NonNullable<LlmBody['provider']>;

const PROVIDERS: readonly Provider[] = ['anthropic', 'gemini'];
const PROVIDER_LABEL: Record<Provider, string> = { anthropic: 'Anthropic', gemini: 'Gemini' };
const DEFAULT_PROMPT = 'Say hello in five words.';
const DEFAULT_MAX_TOKENS = 256;
const PROVIDER_OPTIONS = PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }));
const NOT_CONFIGURED =
  'No API key configured. Add ANTHROPIC_API_KEY or GEMINI_API_KEY to apps/base-app/.env and restart `npm run dev`.';

const pingDatabase = () => api.dbPing();
const complete = (body: LlmBody) => api.llmComplete(body);

function asProvider(value: string): Provider {
  return PROVIDERS.find((p) => p === value) ?? 'anthropic';
}

function DatabaseCard() {
  const ping = useApiAction(pingDatabase);
  const { state } = ping;
  const busy = state.status === 'loading';

  let view: ReactNode = null;
  if (state.status === 'loading') view = <Text>Testing…</Text>;
  if (state.status === 'success') {
    view = (
      <Text>
        <Badge variant="up">Connected</Badge> {state.data.driver} · {state.data.latencyMs} ms
      </Text>
    );
  }
  if (state.status === 'error') {
    view = (
      <Text>
        <Badge variant="down">Unavailable</Badge> {state.error.message}
      </Text>
    );
  }

  return (
    <Panel variant="sunken">
      <Section title="Database" level={3} titleSize={3} gap={3}>
        <Cluster>
          <Button variant="outline" disabled={busy} onClick={() => void ping.run()}>
            Test connection
          </Button>
        </Cluster>
        <div role="status">{view}</div>
      </Section>
    </Panel>
  );
}

function LanguageModelCard() {
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [maxTokens, setMaxTokens] = useState<number | null>(DEFAULT_MAX_TOKENS);
  const llm = useApiAction(complete);
  const { state } = llm;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void llm.run({ provider, prompt, maxTokens: maxTokens ?? DEFAULT_MAX_TOKENS });
  }

  let body = <Text>No response yet.</Text>;
  if (state.status === 'loading') body = <Text>Waiting for the model…</Text>;
  if (state.status === 'success') {
    body = (
      <>
        <Text preserveLines>{state.data.text}</Text>
        <Cluster justify="between">
          <Text tone="muted">
            {PROVIDER_LABEL[state.data.provider]} · {state.data.model}
          </Text>
          <CopyButton text={state.data.text} label="Copy response" />
        </Cluster>
      </>
    );
  }
  if (state.status === 'error') {
    const error: ApiError = state.error;
    body =
      error.code === 'llm_not_configured' ? (
        <Text>
          <Badge variant="warning">Not configured</Badge> {NOT_CONFIGURED}
        </Text>
      ) : (
        <Text>
          <Badge variant="down">Failed</Badge> {error.message}
        </Text>
      );
  }

  return (
    <Panel variant="sunken">
      <Section title="Language model" level={3} titleSize={3} gap={3}>
        <form onSubmit={handleSubmit}>
          <Stack gap={4}>
            <RadioGroup
              legend="Provider"
              orientation="horizontal"
              options={PROVIDER_OPTIONS}
              value={provider}
              onValueChange={(value) => setProvider(asProvider(value))}
            />
            <FormField label="Prompt">
              <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </FormField>
            <FormField
              label="Max response tokens"
              description="Longer answers cost more. Up to 4,096."
            >
              <NumberField
                value={maxTokens}
                onValueChange={setMaxTokens}
                min={16}
                max={4096}
                step={16}
                largeStep={256}
              />
            </FormField>
            <Cluster>
              <Button type="submit" disabled={state.status === 'loading'}>
                Send
              </Button>
            </Cluster>
          </Stack>
        </form>
        <Section title="Response" level={4} titleSize={4} gap={2} aria-live="polite">
          {body}
        </Section>
      </Section>
    </Panel>
  );
}

export function ConnectionsPanel() {
  return (
    <Grid cols={{ base: 1, lg: 2 }} gap={5} align="start">
      <DatabaseCard />
      <LanguageModelCard />
    </Grid>
  );
}
