import { Dialog } from "@nexus-ai/ui/dialog"
import { List } from "@nexus-ai/ui/list"
import { ProviderIcon } from "@nexus-ai/ui/provider-icon"
import { useDialog } from "@nexus-ai/ui/context/dialog"
import type { Component } from "solid-js"
import { DialogProviderKeys } from "./dialog-provider-keys"
import { NEXUS_API_KEY_PROVIDERS } from "./palette-api-key-providers"

export const DialogPaletteApiKeys: Component = () => {
  const dialog = useDialog()

  return (
    <Dialog title="Add API key">
      <div class="flex flex-col gap-3 px-2.5 pb-6">
        <p class="text-14-regular text-text-base">
          Select a provider. Keys stay local in the NEXUS vault and are shown only in masked form.
        </p>
        <List
          class="px-3"
          search={{ placeholder: "Search providers", autofocus: true }}
          emptyMessage="No supported API-key provider found."
          key={(provider) => provider?.id}
          items={() => NEXUS_API_KEY_PROVIDERS}
          filterKeys={["id", "name"]}
          onSelect={(provider) => {
            if (!provider) return
            void dialog.show(() => <DialogProviderKeys provider={provider.id} />)
          }}
        >
          {(provider) => (
            <div class="flex w-full items-center gap-3">
              <ProviderIcon id={provider.id} />
              <span>{provider.name}</span>
            </div>
          )}
        </List>
      </div>
    </Dialog>
  )
}
