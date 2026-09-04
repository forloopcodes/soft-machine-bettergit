/**
 * Panel header (host chrome) actions: refresh. Plugin settings live in the
 * host's Settings → Plugins → bettergit page (declared on the module), and
 * everything else lives in the in-panel top bar.
 */

import { Icon, IconButton } from "@soft-machine/sdk";
import { useForge } from "../ForgeContext";

function RefreshAction() {
  const { isConnected, refresh } = useForge();
  return (
    <IconButton onClick={refresh} disabled={!isConnected} title="Refresh" aria-label="Refresh">
      <Icon name="RefreshCw" size={12} />
    </IconButton>
  );
}

export function ListHeaderActions() {
  return <RefreshAction />;
}

export function DetailHeaderActions() {
  return <RefreshAction />;
}
