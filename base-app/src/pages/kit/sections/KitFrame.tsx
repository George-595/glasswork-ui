import { useState } from 'react';
import { Breadcrumbs, Button, Fab, Stack, Switch, Text, toast } from '~/core/ui';
import { KitBlock, KitSection } from '../KitParts';

/* The app frame: what every app gets from <AppShell> instead of building it. The switches here
   put real items into this page's own floating stack (bottom right), so the stacking can be
   seen and tried: they never overlap each other, the tab bar or a toast. */
export function FrameSection() {
  const [fab, setFab] = useState(false);
  const [jump, setJump] = useState(false);
  return (
    <KitSection
      id="frame"
      title="App frame"
      intro="AppShell carries the standing parts of every app: the sidebar (or none, for a one-page app), breadcrumbs, the way back to the hub, pull to refresh, a live pill, and one managed corner for everything that floats."
    >
      <KitBlock
        title="Floating stack"
        note="Back to top (scroll down this page), the main action and any page item share one column in the bottom-right corner. Turn these on, then raise a toast: it sits above them."
      >
        <Stack gap={3}>
          <Switch label="Main action (Fab)" checked={fab} onCheckedChange={setFab} />
          <Switch label="A page's own item (Floating)" checked={jump} onCheckedChange={setJump} />
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.success('Saved', { description: 'The toast stacks above the buttons.' })
              }
            >
              Raise a toast
            </Button>
          </div>
          {fab && <Fab label="Add item" onClick={() => toast('The page’s main action ran.')} />}
          {jump && (
            <Fab
              label="Jump to today"
              icon="calendar"
              tone="secondary"
              extended={false}
              order={5}
            />
          )}
        </Stack>
      </KitBlock>
      <KitBlock
        title="Breadcrumbs and the hub"
        note="Give AppShell `home` and `breadcrumbs`: the hub leads the trail and sits in the sidebar's foot."
      >
        <Breadcrumbs
          items={[
            { label: 'Hub', href: '#/' },
            { label: 'Stock', href: '#/kit' },
            { label: 'Oak table' },
          ]}
        />
        <Text tone="muted" size="small">
          With no trail, a plain “‹ Hub” link heads the page.
        </Text>
      </KitBlock>
    </KitSection>
  );
}
