import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { resolveTheme, useTheme } from "@/shared/lib/theme";

function Toaster(props: ToasterProps) {
  const theme = resolveTheme(useTheme());
  return (
    <Sonner
      theme={theme}
      position="bottom-center"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
